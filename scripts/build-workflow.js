const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const source = readFileSync(resolve(root, 'conversation.js'), 'utf8').split('\nmodule.exports')[0];
const node = (id, name, type, typeVersion, position, parameters) =>
  ({ id, name, type: 'n8n-nodes-base.' + type, typeVersion, position, parameters });
const webhook = (id, name, path, y) => node(id, name, 'webhook', 2, [0, y], {
  httpMethod: 'POST', path, responseMode: 'lastNode', options: {},
});
const connect = name => ({ main: [[{ node: name, type: 'main', index: 0 }]] });
const workflow = {
  name: 'Nile Dental Care | WhatsApp demo',
  nodes: [
    webhook('ac6fa6ee-0aa5-4ff3-bfcd-6969d5a9c310', 'Incoming message', 'clinic-demo-message', 0),
    node('ac6fa6ee-0aa5-4ff3-bfcd-6969d5a9c311', 'Route conversation', 'code', 2, [250, 0], {
      jsCode: source + '\nreturn [{ json: conversation($input.first().json.body) }];',
    }),
    webhook('ac6fa6ee-0aa5-4ff3-bfcd-6969d5a9c312', 'Clinic notification', 'clinic-demo-notify', 240),
    node('ac6fa6ee-0aa5-4ff3-bfcd-6969d5a9c313', 'Email clinic', 'emailSend', 2.1, [250, 240], {
      fromEmail: '={{ $json.body.from }}', toEmail: '={{ $json.body.to }}',
      subject: '={{ $json.body.subject }}', emailFormat: 'text', text: '={{ $json.body.text }}', options: { appendAttribution: false },
    }),
  ],
  connections: {
    'Incoming message': connect('Route conversation'),
    'Clinic notification': connect('Email clinic'),
  },
  active: false,
  settings: { executionOrder: 'v1', saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none', saveManualExecutions: false },
};
for (const hook of workflow.nodes.filter(item => item.type.endsWith('.webhook'))) hook.webhookId = hook.id;
writeFileSync(resolve(root, 'workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
