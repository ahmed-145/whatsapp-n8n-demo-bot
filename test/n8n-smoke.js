const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { once } = require('node:events');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { buildGateway } = require('../gateway');

async function run() {
  const dataDir = await mkdtemp(join(tmpdir(), 'clinic-n8n-smoke-'));
  const config = {
    dataDir, n8nUrl: 'http://127.0.0.1:5678', appSecret: 'smoke-secret', verifyToken: 'smoke-verify',
    token: 'smoke-token', phoneId: '123', graphVersion: 'v1.0',
    mailFrom: 'bot@example.test', mailTo: 'clinic@example.test',
  };
  const replies = [];
  const { server, drain } = await buildGateway(config, (url, options) => {
    if (url.startsWith(config.n8nUrl + '/')) return fetch(url, options);
    assert.equal(url, 'https://graph.facebook.com/v1.0/123/messages');
    assert.equal(options.headers.authorization, 'Bearer smoke-token');
    replies.push(JSON.parse(options.body));
    return Response.json({ messages: [{ id: 'wamid.reply' }] });
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const callback = 'http://127.0.0.1:' + server.address().port + '/whatsapp';
    const handshake = await fetch(callback + '?hub.mode=subscribe&hub.verify_token=smoke-verify&hub.challenge=42');
    assert.equal(await handshake.text(), '42');

    const bookings = [
      { phone: '201000000001', messages: ['Hello', '3', 'Demo Patient', '+201000000001', '2 2099-06-01 14:00', '4'] },
      { phone: '201000000002', messages: ['مرحبا', '٣', 'مريض تجريبي', '+٢٠١٠٠٠٠٠٠٠٠٢', '٢ ٢٠٩٩-٠٦-٠١ ١٤:٠٠', '٤'] },
    ];
    const messages = bookings.flatMap(({ phone, messages }) => messages.map((body, index) => ({
      id: 'wamid.' + phone + '_' + index, from: phone, timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text', text: { body },
    })));
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{
      field: 'messages', value: { metadata: { phone_number_id: config.phoneId }, messages },
    }] }] });
    const signature = createHmac('sha256', config.appSecret).update(body).digest('hex');
    const response = await fetch(callback, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + signature } });
    assert.equal(await response.text(), 'EVENT_RECEIVED');
    await drain();

    const store = JSON.parse(await readFile(join(dataDir, 'leads.json'), 'utf8'));
    assert.deepEqual(store.inbox, [], 'Delivery queue should be empty');
    assert.deepEqual(store.bookings.map(row => row.language), ['en', 'ar']);
    assert.deepEqual(store.handoffs.map(row => row.language), ['en', 'ar']);
    assert.equal(replies.length, 12);
    assert.match(replies[4].text.body, /received your request/);
    assert.match(replies[10].text.body, /استلمنا طلب/);
    const mail = await fetch('http://127.0.0.1:8025/api/v1/messages').then(result => result.json());
    assert.equal(mail.messages.filter(row => row.Subject.includes('Appointment request')).length, 2);
    assert.equal(mail.messages.filter(row => row.Subject.includes('Human handoff')).length, 2);
    console.log('Published n8n workflow delivered four SMTP messages and handled both booking languages.');
  } finally {
    server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
