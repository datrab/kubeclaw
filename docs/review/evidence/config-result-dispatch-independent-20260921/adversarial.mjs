// Actual loaders and HTTP transport. Local HTTP peer; no native host or receipt claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { loadControlServerConfig } from '../../../../skills/prism/server/control-config.ts';
import { loadWorkerConfig } from '../../../../skills/prism/server/worker-config.ts';
import { requestWorkerResult } from '../../../../skills/prism/control/worker-operation-transport.ts';
import { prismNativeAttempt } from '../../../../skills/prism/engine/worker-envelope.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-result-stream-'));
const file = path.join(root, 'swarm.config.json');
const source = JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/swarm.config.json', 'utf8'));
source.operator.prism.native = { maximumResultBytes: 8, dispatchTimeoutMs: 3000 };
fs.writeFileSync(file, JSON.stringify(source));
const env = { SWARM_CONFIG: file, PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test',
  PRISM_INGESTION_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test', DATABASE_URL: 'postgresql://not-opened' };
let resolveClosed;
const closed = new Promise(resolve => { resolveClosed = resolve; });
const server = createServer((request, response) => {
  request.resume(); response.on('close', resolveClosed);
  response.writeHead(200, { 'content-type': 'application/json' });
  response.write('"€€ "'); // 9 bytes, intentionally never ends; must be cancelled on limit.
});
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  env.PRISM_WORKER_URL = `http://127.0.0.1:${server.address().port}`;
  const config = loadControlServerConfig(env), worker = loadWorkerConfig(env);
  for (const key of ['PRISM_NATIVE_MAXIMUM_RESULT_BYTES', 'PRISM_NATIVE_DISPATCH_TIMEOUT_MS']) {
    for (const load of [loadControlServerConfig, loadWorkerConfig]) {
      assert.throws(() => load({ ...env, [key]: '' }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
    }
  }
  source.operator.prism.native.maximumResultBytes = null;
  fs.writeFileSync(file, JSON.stringify(source));
  assert.throws(() => loadControlServerConfig(env), /SWARM_CONFIG_INVALID/);
  assert.equal(config.maximumWorkerResponseBytes, 8);
  assert.equal(worker.native.maximumResultBytes, 8);
  const attempt = prismNativeAttempt('render', { artifactId: 'input:independent', type: 'prism-engine-input',
    mediaType: 'application/json', contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2,
    storageUrl: 'https://control.example/input' }, 'independent-stream');
  await assert.rejects(requestWorkerResult(config, attempt), /PRISM_NATIVE_RESULT_BODY_LIMIT/);
  const timeout = setTimeout(() => resolveClosed('timeout'), 1000);
  assert.notEqual(await closed, 'timeout', 'actual oversized response is cancelled, not left open');
  clearTimeout(timeout);
  console.log('PASS: four empty legacy overrides rejected; invalid later author bytes reject new load but preserve both loaded snapshots; oversized unterminated real stream rejected and closed by client');
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
