import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-notifications-'));
const messages = [];
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    messages.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ messageId: `message:${messages.length}` }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secretName = 'KUBECLAW_NOTIFICATION_TEST_TOKEN';
const secret = 'notification-secret';
process.env[secretName] = secret;
const roots = [
  path.join(repository, 'skills/common/plugins'), path.join(repository, 'skills/nova/plugins'),
  path.join(repository, 'skills/buster/plugins'),
];
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: roots,
  trustPolicy: {
    trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:notification-observer',
  },
  now: () => new Date('2026-07-26T00:00:00Z'),
}));
const enabled = new Set([
  'kubeclaw.notification-observer:notifications',
  'kubeclaw.notification-observer:preview-delivery',
]);
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: enabled,
  providers: new Map([
    ['operator.request', 'kubeclaw.operator-messaging:operator'],
    ['network.http', 'kubeclaw.network-http:http'],
    ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
  ]),
  grants: new Map([
    ['kubeclaw.notification-observer:notifications', new Map([
      ['operator.request', { allowedTargets: ['operators'] }],
    ])],
    ['kubeclaw.notification-observer:preview-delivery', new Map([
      ['operator.request', { allowedTargets: ['operators'] }],
    ])],
    ['kubeclaw.operator-messaging:operator', new Map([
      ['network.http', { allowedOrigins: [origin] }],
      ['secrets.read', { allowedNames: ['notification.webhook'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
const effectsPath = path.join(temporary, 'effects.jsonl');
const adapters = new core.AdapterRuntime({
  granted, activated,
  configs: new Map([
    ['kubeclaw.notification-observer:notifications', { target: 'operators' }],
    ['kubeclaw.notification-observer:preview-delivery', { target: 'operators' }],
    ['kubeclaw.operator-messaging:operator', {
      deliveryRoot: path.join(temporary, 'notification-deliveries'),
      targets: { operators: { endpoint: `${origin}/messages`, tokenSecret: 'notification.webhook' } },
    }],
    ['kubeclaw.network-http:http', {
      allowedOrigins: [origin], allowedMethods: ['POST'],
      allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'],
    }],
    ['kubeclaw.secret-resolver:secrets', { environment: { 'notification.webhook': secretName } }],

  ]),
  effects: new core.EffectCoordinator(new core.FileEffectJournal(effectsPath), undefined, undefined, new core.MemoryResourceLockManager()),
  shutdownTimeoutMs: 1000, async emitDomainEvent() {},
});
const events = new core.FileJournal(path.join(temporary, 'events.jsonl'));
const producer = snapshot.observers.get('kubeclaw.notification-observer:notifications').provenance;
events.append({
  schemaVersion: 'lifecycle-event.v2', eventId: 'event:failed', sequence: 1, type: 'run.failed',
  identity: { runId: 'run:1' }, occurredAt: '2026-07-26T00:00:00Z', causationId: null,
  payload: { summary: 'Tests failed.' },
});
events.append({
  schemaVersion: 'lifecycle-event.v2', eventId: 'event:artifact', sequence: 2, type: 'artifact.created',
  identity: { runId: 'run:1', artifactId: 'artifact:preview' },
  occurredAt: '2026-07-26T00:00:01Z', causationId: 'event:failed',
  payload: { artifact: { artifactId: 'artifact:preview', digest: 'sha256:abc', mediaType: 'text/html', secret } },
});
void producer;
const checkpoints = new core.FileJournal(path.join(temporary, 'checkpoints.jsonl'));
try {
  await adapters.start();
  const observers = new core.ObserverRuntime({
    registry: granted, activated, adapters, events, checkpoints,
    deliveries: new core.FileJournal(path.join(temporary, 'deliveries.jsonl')),
    configs: new Map([
      ['kubeclaw.notification-observer:notifications', { target: 'operators' }],
      ['kubeclaw.notification-observer:preview-delivery', { target: 'operators' }],
      ]),
    wait: async () => {},
  });
  assert.deepEqual(await observers.drain(), { delivered: 2, failures: [] });
  assert.deepEqual(await observers.drain(), { delivered: 0, failures: [] });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].type, 'run.failed');
  assert.equal(messages[0].severity, 'error');
  assert.equal(messages[1].type, 'preview.artifact.available');
  assert.equal(messages[1].artifact.secret, undefined);
  assert.equal(checkpoints.records().length, 2);
  const audit = core.readPipelineAudit(temporary, 'run:1');
  assert.deepEqual(audit.events.map(event => event.eventId), ['event:failed', 'event:artifact']);
  assert.doesNotMatch(JSON.stringify(audit), new RegExp(secret));
  assert.equal(fs.existsSync(path.join(temporary, 'artifacts')), false);
  assert.doesNotMatch(fs.readFileSync(effectsPath, 'utf8'), new RegExp(secret));
} finally {
  await adapters.shutdown();
  delete process.env[secretName];
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.notification-observer', suite: 'live-function' }));
