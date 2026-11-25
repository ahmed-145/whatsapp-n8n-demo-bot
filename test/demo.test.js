const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { conversation } = require('../conversation');
const { buildGateway } = require('../gateway');
const clinic = require('../clinic.json');
const faq = require('../faq.json');
const workflow = require('../workflow.json');

const codeNode = workflow.nodes.find(node => node.name === 'Route conversation');
const runWorkflow = new Function('$input', codeNode.parameters.jsCode);
const execute = body => runWorkflow({ first: () => ({ json: { body } }) })[0].json;
const timestamp = '2026-11-25T12:00:00.000Z';

function chat() {
  let previous;
  return text => {
    const input = { message: { text, timestamp }, previous, clinic, faq };
    const result = execute(input);
    assert.deepEqual(result, conversation(input));
    previous = result.state;
    return result;
  };
}

test('English FAQ, fallback, handoff and validated booking', () => {
  const send = chat();
  assert.match(send('Hello').reply, /Nile Dental Care/);
  assert.match(send('1').reply, /EGP 650/);
  assert.match(send('2').reply, /Nasr City/);
  assert.match(send('Can I pay by card?').reply, /cash and card/);
  assert.match(send('How can I reach your team?').reply, /didn’t catch/);
  assert.deepEqual(send('4').event, { type: 'handoff', message: 'How can I reach your team?' });
  assert.equal(send('3').state.step, 'name');
  assert.equal(send('123').state.step, 'name');
  assert.equal(send('Pat Example').state.step, 'phone');
  assert.equal(send('100').state.step, 'phone');
  assert.equal(send('+20 100-000-0000').state.step, 'slot');
  for (const slot of ['2 2026-11-27 14:00', '2 2026-11-26 20:00', '2 2026-11-25 13:00', '2 2026-11-31 14:00', '99 2026-11-26 14:00']) {
    assert.equal(send(slot).state.step, 'slot');
  }
  const result = send('2 2026-11-26 14:00');
  assert.match(result.reply, /contact you to confirm/);
  assert.deepEqual(result.event, { type: 'booking', name: 'Pat Example', phone: '+201000000000',
    service: 'cleaning', slot: '2026-11-26 14:00', timeZone: 'Africa/Cairo' });
  assert.equal(result.state.step, undefined);
});

test('Arabic menu, FAQ, booking, cancellation and English switch', () => {
  const send = chat();
  assert.match(send('مرحبا').reply, /نايل دنتال/);
  assert.match(send('١').reply, /٦٥٠/);
  assert.match(send('٢').reply, /مدينة نصر/);
  assert.match(send('٣').reply, /ما اسمك/);
  assert.match(send('إلغاء').reply, /اختر رقماً/);
  send('٣');
  send('علي حسن');
  send('+٢٠١٠٠٠٠٠٠٠٠٠');
  const result = send('٢ ٢٠٢٦-١١-٢٦ ١٤:٠٠');
  assert.match(result.reply, /استلمنا طلب تنظيف الأسنان/);
  assert.equal(result.event.phone, '+201000000000');
  assert.match(send('٤').reply, /فريق العيادة/);
  assert.match(send('hello').reply, /Welcome/);
});

test('signed webhook acknowledges batches, persists and deduplicates leads across restart', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'clinic-demo-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const config = { dataDir, n8nUrl: 'http://n8n', verifyToken: 'verify', token: 'token',
    appSecret: 'secret', phoneId: '123', graphVersion: 'v1.0', mailFrom: 'from@example.test', mailTo: 'to@example.test' };
  const outgoing = [];
  let failReply = false;
  const mockFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith('clinic-demo-message')) return Response.json(execute(body));
    outgoing.push({ url, body, headers: options.headers });
    if (failReply && url.includes('graph.facebook.com')) return new Response('', { status: 503 });
    return Response.json({ ok: true });
  };
  const start = () => buildGateway(config, mockFetch);
  const receive = (gateway, url, { method = 'GET', body, headers = {} } = {}) => new Promise(resolve => {
    const request = Object.assign(Readable.from(body == null ? [] : [Buffer.from(body)]), { url, method, headers });
    gateway.server.emit('request', request, {
      writeHead(status) { this.status = status; return this; },
      end(text) { resolve({ status: this.status, text }); },
    });
  });
  const payload = (texts, phoneId = '123') => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{
    field: 'messages', value: { metadata: { phone_number_id: phoneId },
      messages: texts.map((body, i) => ({ id: 'wamid.' + i, from: '201000000000', type: 'text',
        text: { body }, timestamp: String(Date.parse(timestamp) / 1000) })) },
  }] }] });
  const signed = (gateway, body, key = config.appSecret) => receive(gateway, '/whatsapp', {
    method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', key).update(body).digest('hex') },
  });
  const gateway = await start();
  const challenge = await receive(gateway, '/whatsapp?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=1234');
  assert.equal(challenge.text, '1234');
  assert.equal((await receive(gateway, '/whatsapp?hub.mode=subscribe&hub.verify_token=no&hub.challenge=1234')).status, 403);
  const batch = payload(['مرحبا', '٣', 'علي حسن', '+٢٠١٠٠٠٠٠٠٠٠٠', '٢ ٢٠٢٦-١١-٢٦ ١٤:٠٠', '٤']);
  assert.equal((await signed(gateway, batch, 'wrong')).status, 401);
  assert.equal((await signed(gateway, '{')).status, 400);
  assert.equal((await signed(gateway, payload(['ignored'], '456'))).status, 200);
  assert.equal((await signed(gateway, batch)).status, 200);
  assert.equal((await signed(gateway, batch)).status, 200);
  await gateway.drain();
  const file = join(dataDir, 'leads.json');
  const store = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(Object.keys(store.contacts).length, 1);
  assert.equal(store.bookings.length, 1);
  assert.equal(store.handoffs.length, 1);
  assert.equal(store.bookings[0].language, 'ar');
  assert.deepEqual(store.inbox, []);
  const emails = outgoing.filter(item => item.url.endsWith('notify'));
  assert.equal(emails.length, 2);
  assert.match(emails[0].body.text, /علي حسن/);
  assert.match(emails[1].body.subject, /Human handoff/);
  const replies = outgoing.filter(item => item.url.includes('graph.facebook.com'));
  assert.equal(replies.length, 6);
  assert.equal(replies[0].headers.authorization, 'Bearer token');
  assert.match(replies[4].body.text.body, /استلمنا طلب/);
  const restarted = await start();
  assert.equal((await signed(restarted, batch)).status, 200);
  await restarted.drain();
  assert.equal(outgoing.length, 8);

  const extra = batch.replace('wamid.0', 'wamid.new');
  failReply = true;
  assert.equal((await signed(restarted, extra)).status, 200);
  await restarted.drain();
  const pending = JSON.parse(await readFile(file, 'utf8')).inbox;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 1);
  assert.match(pending[0].reply, /نايل دنتال/);
});
