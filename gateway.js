const { createHmac, timingSafeEqual } = require('node:crypto');
const { createServer } = require('node:http');
const { mkdir, open, readFile, rename } = require('node:fs/promises');
const path = require('node:path');
const clinic = require('./clinic.json');
const faq = require('./faq.json');

const empty = () => ({ contacts: {}, inbox: [], seen: {}, bookings: [], handoffs: [] });
const equals = (left, right) => {
  const a = Buffer.from(left ?? '');
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

function messages(payload, phoneId) {
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return [];
  const result = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== 'messages' || value?.metadata?.phone_number_id !== phoneId) continue;
      for (const item of value.messages ?? []) {
        if (!/^wamid\.[A-Za-z0-9_+/=-]+$/.test(item.id) || !/^\d{7,15}$/.test(item.from)) continue;
        const timestamp = new Date(Number(item.timestamp) * 1000);
        if (!Number.isFinite(timestamp.valueOf())) continue;
        const text = item.type === 'text' && typeof item.text?.body === 'string' ? item.text.body.slice(0, 4096) : '';
        result.push({ id: item.id, from: item.from, timestamp: timestamp.toISOString(), text });
      }
    }
  }
  return result;
}

async function buildGateway(config, request = fetch) {
  const file = path.join(config.dataDir, 'leads.json');
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = empty();
  }
  let lock = Promise.resolve();
  function transact(update) {
    const operation = lock.then(async () => {
      const draft = structuredClone(data);
      if (update(draft) === false) return;
      const temp = await open(file + '.tmp', 'w', 0o600);
      try {
        await temp.writeFile(JSON.stringify(draft, null, 2) + '\n');
        await temp.sync();
      } finally {
        await temp.close();
      }
      await rename(file + '.tmp', file);
      data = draft;
    });
    lock = operation.catch(() => {});
    return operation;
  }

  async function post(url, payload, label, headers = {}) {
    const response = await request(url, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${label} returned HTTP ${response.status}`);
    }
    return response;
  }
  const n8n = (endpoint, payload) => post(config.n8nUrl + '/webhook/clinic-demo-' + endpoint, payload, 'n8n ' + endpoint);

  let working = false;
  async function drain() {
    if (working) return;
    working = true;
    try {
      // Preserve the order of each conversation while allowing other senders to make progress.
      const blocked = new Set();
      for (const queued of data.inbox.slice()) {
        const { id, from, timestamp } = queued.message;
        if (blocked.has(from)) continue;
        try {
          if (queued.nextAttempt > Date.now()) {
            blocked.add(from);
            continue;
          }
          let job = queued;
          if (!job.reply) {
            const contact = data.contacts[from];
            const response = await n8n('message', { message: job.message, previous: contact?.state, clinic, faq });
            const result = await response.json();
            if (!result.state || !['en', 'ar'].includes(result.state.language) ||
                typeof result.reply !== 'string' || !result.reply || result.reply.length > 4096 ||
                (result.event && !['booking', 'handoff'].includes(result.event.type))) {
              throw new Error('Invalid n8n conversation response');
            }
            await transact(draft => {
              const row = { id, from, timestamp, language: result.state.language };
              draft.contacts[from] = { ...row, timestamp: contact?.timestamp ?? timestamp, state: result.state };
              const target = draft.inbox.find(item => item.message.id === id);
              target.reply = result.reply;
              if (result.event) {
                const event = { ...row, ...result.event };
                const table = event.type === 'booking' ? draft.bookings : draft.handoffs;
                table.push(event);
                target.notification = event;
              }
            });
            job = data.inbox.find(item => item.message.id === id);
          }
          if (job.notification && !job.notified) {
            const event = job.notification;
            const details = event.type === 'booking'
              ? [event.name, event.phone, event.service, event.slot + ' ' + event.timeZone]
              : [event.message];
            const response = await n8n('notify', {
              from: config.mailFrom, to: config.mailTo,
              subject: event.type === 'booking' ? 'Demo clinic | Appointment request' : 'Demo clinic | Human handoff',
              text: ['WhatsApp: +' + from, 'Language: ' + event.language, 'Received: ' + timestamp, ...details].join('\n'),
            });
            await response.body?.cancel();
            await transact(draft => { draft.inbox.find(item => item.message.id === id).notified = true; });
          }
          const response = await post(`https://graph.facebook.com/${config.graphVersion}/${config.phoneId}/messages`, {
            messaging_product: 'whatsapp', to: from, type: 'text', text: { body: job.reply },
          }, 'WhatsApp', { authorization: 'Bearer ' + config.token });
          await response.body?.cancel();
          await transact(draft => { draft.inbox = draft.inbox.filter(item => item.message.id !== id); });
        } catch (error) {
          blocked.add(from);
          console.error('Delivery postponed:', error.message);
          await transact(draft => {
            const target = draft.inbox.find(item => item.message.id === id);
            target.attempts = (target.attempts ?? 0) + 1;
            target.nextAttempt = Date.now() + Math.min(300_000, 1000 * 2 ** target.attempts);
          });
        }
      }
    } finally {
      working = false;
    }
  }

  const server = createServer(async (req, res) => {
    const reply = (status, body = '') => res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(body);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/whatsapp') return reply(404);
      if (req.method === 'GET') {
        const q = url.searchParams;
        const challenge = q.get('hub.challenge');
        return q.get('hub.mode') === 'subscribe' && /^\d+$/.test(challenge ?? '')
          && equals(q.get('hub.verify_token'), config.verifyToken) ? reply(200, challenge) : reply(403);
      }
      if (req.method !== 'POST') return reply(405);
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_048_576) return reply(413);
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      const signature = 'sha256=' + createHmac('sha256', config.appSecret).update(raw).digest('hex');
      if (!equals(req.headers['x-hub-signature-256'], signature)) return reply(401);
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { return reply(400); }
      const inbound = messages(payload, config.phoneId);
      if (inbound.length) {
        await transact(draft => {
          let changed = false;
          for (const message of inbound) {
            if (Object.hasOwn(draft.seen, message.id)) continue;
            draft.seen[message.id] = message.timestamp;
            draft.inbox.push({ message });
            changed = true;
          }
          return changed;
        });
      }
      reply(200, 'EVENT_RECEIVED');
    } catch {
      if (!res.headersSent) reply(503);
    }
  });
  return { server, drain };
}

async function main() {
  const env = process.env;
  const required = ['META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_ACCESS_TOKEN', 'META_PHONE_NUMBER_ID',
    'META_GRAPH_VERSION', 'CLINIC_EMAIL_FROM', 'CLINIC_EMAIL_TO'];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error('Missing environment variables: ' + missing.join(', '));
  if (!/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION) || !/^\d+$/.test(env.META_PHONE_NUMBER_ID)) {
    throw new Error('Invalid Graph API version or Phone Number ID');
  }
  const { server, drain } = await buildGateway({
    dataDir: env.DATA_DIR || './data', n8nUrl: env.N8N_INTERNAL_URL || 'http://127.0.0.1:5678',
    appSecret: env.META_APP_SECRET, verifyToken: env.META_VERIFY_TOKEN, token: env.META_ACCESS_TOKEN,
    phoneId: env.META_PHONE_NUMBER_ID, graphVersion: env.META_GRAPH_VERSION,
    mailFrom: env.CLINIC_EMAIL_FROM, mailTo: env.CLINIC_EMAIL_TO,
  });
  server.listen(Number(env.PORT || 8080), '0.0.0.0');
  const timer = setInterval(() => drain().catch(() => console.error('Unable to update delivery queue')), 1000);
  timer.unref();
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildGateway };
