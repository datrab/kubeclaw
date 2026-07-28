import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
const token = 'runtime-secret-that-must-not-be-journaled';
const environmentName = 'KUBECLAW_RUNTIME_DISPATCH_TEST_TOKEN';
process.env[environmentName] = token;
const received = [];
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    received.push({ headers: request.headers, body });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ result: { schemaVersion: 'stage-result.v2', outcome: 'passed' } }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const roots = [
  path.join(repository, 'skills/common/plugins'),
  path.join(repository, 'skills/nova/plugins'),
  path.join(repository, 'skills/buster/plugins'),
];
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: roots,
  trustPolicy: {
    trustedBuiltinRoots: roots,
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:runtime-dispatch',
  },
  now: () => new Date('2026-07-26T00:00:00Z'),
}));
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['kubeclaw.review:review']),
  providers: new Map([
    ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
    ['network.http', 'kubeclaw.network-http:http'],
    ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
  ]),
  grants: new Map([
    ['kubeclaw.review:review', new Map([
      ['runtime.dispatch', { allowedAgents: ['reviewer', 'unknown'] }],
    ])],
    ['kubeclaw.runtime-dispatch:runtime', new Map([
      ['network.http', { allowedOrigins: [origin] }],
      ['secrets.read', { allowedNames: ['runtime.agent'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(granted.snapshot, granted.enabledRegistrations);
const journal = new core.MemoryEffectJournal();
const adapters = new core.AdapterRuntime({
  granted,
  activated,
  configs: new Map([
    ['kubeclaw.runtime-dispatch:runtime', {
      targets: {
        reviewer: { endpoint: `${origin}/dispatch`, tokenSecret: 'runtime.agent', maxRequestBytes: 1024 },
      },
    }],
    ['kubeclaw.network-http:http', {
      allowedOrigins: [origin],
      allowedMethods: ['POST'],
      allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'],
      maxRequestBytes: 2048,
      maxResponseBytes: 2048,
      timeoutMs: 1000,
    }],
    ['kubeclaw.secret-resolver:secrets', { environment: { 'runtime.agent': environmentName } }],
  ]),
  effects: new core.EffectCoordinator(journal),
  shutdownTimeoutMs: 1000,
  async emitDomainEvent() {},
});
const attempt = { runId: 'run:test', stageId: 'stage:test', attemptId: 'attempt:test', attemptNumber: 1 };
try {
  await adapters.start();
  const payload = { task: 'Review the project.', evidence: { artifact: 'artifact:test' } };
  const result = await adapters.invoke(
    'runtime.dispatch',
    attempt,
    'runtime:stable',
    {
      operation: 'dispatch',
      resource: { type: 'runtime.agent', canonicalId: 'reviewer' },
      payload,
    },
    new AbortController().signal,
  );
  assert.equal(result.result.outcome, 'passed');
  assert.equal(received.length, 1);
  assert.equal(received[0].headers.authorization, undefined);
  const expected = crypto.createHmac('sha256', token)
    .update(`runtime:stable.${JSON.stringify(payload)}`, 'utf8')
    .digest('hex');
  assert.equal(received[0].headers['x-kubeclaw-signature'], `v1=${expected}`);
  assert.doesNotMatch(JSON.stringify(journal.entries()), new RegExp(token));
  const repeated = await adapters.invoke(
    'runtime.dispatch',
    attempt,
    'runtime:stable',
    {
      operation: 'dispatch',
      resource: { type: 'runtime.agent', canonicalId: 'reviewer' },
      payload,
    },
    new AbortController().signal,
  );
  assert.deepEqual(repeated, result);
  assert.equal(received.length, 1);
  await assert.rejects(adapters.invoke(
    'runtime.dispatch',
    attempt,
    'runtime:denied',
    {
      operation: 'dispatch',
      resource: { type: 'runtime.agent', canonicalId: 'unknown' },
      payload,
    },
    new AbortController().signal,
  ), /RUNTIME_TARGET_DENIED/);
} finally {
  await adapters.shutdown();
  delete process.env[environmentName];
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.runtime-dispatch', suite: 'live-function' }));
