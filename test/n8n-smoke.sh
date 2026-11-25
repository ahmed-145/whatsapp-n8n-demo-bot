#!/usr/bin/env bash
set -euo pipefail
source .env.example
fixtures="$(mktemp -d)"
chmod 755 "$fixtures"
trap 'status=$?; if [ $status -ne 0 ]; then docker logs demo-n8n 2>&1 || true; fi; docker rm -f demo-n8n demo-mail >/dev/null 2>&1 || true; docker volume rm demo-n8n-data >/dev/null 2>&1 || true; docker network rm demo-smoke >/dev/null 2>&1 || true; rm -rf "$fixtures"' EXIT

node - "$fixtures" <<'JS'
const fs = require('node:fs');
const dir = process.argv[2];
const workflow = require('./workflow.json');
workflow.id = 'demoClinicSmoke1';
const credential = { id: 'demoClinicSmtp01', name: 'CI mailbox' };
workflow.nodes.find(node => node.name === 'Email clinic').credentials = { smtp: credential };
fs.writeFileSync(dir + '/workflow.json', JSON.stringify(workflow));
fs.writeFileSync(dir + '/credentials.json', JSON.stringify([{
  ...credential, type: 'smtp',
  data: { host: 'demo-mail', port: 1025, secure: false, disableStartTls: true },
}]));
JS

docker network create demo-smoke
docker volume create demo-n8n-data
docker run -d --name demo-mail --network demo-smoke -p 127.0.0.1:8025:8025 axllent/mailpit:v1.27.8
n8n_args=(--network demo-smoke -v demo-n8n-data:/home/node/.n8n -v "$fixtures:/fixtures:ro")
docker run --rm "${n8n_args[@]}" "$N8N_IMAGE" import:credentials --input=/fixtures/credentials.json
docker run --rm "${n8n_args[@]}" "$N8N_IMAGE" import:workflow --input=/fixtures/workflow.json
docker run --rm "${n8n_args[@]}" "$N8N_IMAGE" publish:workflow --id=demoClinicSmoke1
docker run -d --name demo-n8n "${n8n_args[@]}" -p 127.0.0.1:5678:5678 "$N8N_IMAGE"
curl -fsS --retry 30 --retry-connrefused --retry-delay 2 http://127.0.0.1:5678/healthz/readiness
node test/n8n-smoke.js
