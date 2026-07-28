import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(
  path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts'),
).href);
const secretEnvironmentName = 'KUBECLAW_OPERATOR_MESSAGING_TEST_TOKEN';
const secretValue = 'operator-test-secret-that-must-not-be-journaled';
const previousSecret = process.env[secretEnvironmentName];
process.env[secretEnvironmentName] = secretValue;
const deliveries = [];
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    deliveries.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
    });
    if (request.url === '/slow') {
      request.once('close', () => {
        deliveries.at(-1).closed = true;
      });
      setTimeout(() => {
        if (!response.writableEnded) {
          response.writeHead(202, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ messageId: 'slow-message' }));
        }
      }, 5_000);
      return;
    }
    if (request.url === '/fail') {
      response.writeHead(503, { 'content-type': 'text/plain' });
      response.end('unavailable');
      return;
    }
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ messageId: `message-${deliveries.length}` }));
  });
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server address is unavailable');
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
    verifierId: 'test:operator-messaging-live-function',
  },
  now: () => new Date('2026-07-26T00:00:00Z'),
}));
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['kubeclaw.notification-observer:notifications']),
  providers: new Map([
    ['operator.request', 'kubeclaw.operator-messaging:operator'],
    ['network.http', 'kubeclaw.network-http:http'],
    ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
  ]),
  grants: new Map([
    ['kubeclaw.notification-observer:notifications', new Map([
      ['operator.request', {
        allowedTargets: ['operators', 'failing', 'unconfigured'],
      }],
    ])],
    ['kubeclaw.operator-messaging:operator', new Map([
      ['network.http', { allowedOrigins: [origin] }],
      ['secrets.read', { allowedNames: ['operator.webhook'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(granted.snapshot, granted.enabledRegistrations);
const effectJournal = new core.MemoryEffectJournal();
const adapters = new core.AdapterRuntime({
  granted,
  activated,
  configs: new Map([
    ['kubeclaw.operator-messaging:operator', {
      targets: {
        operators: {
          endpoint: `${origin}/messages`,
          tokenSecret: 'operator.webhook',
          maxPayloadBytes: 512,
        },
        failing: {
          endpoint: `${origin}/fail`,
          tokenSecret: 'operator.webhook',
          maxPayloadBytes: 512,
        },
        slow: {
          endpoint: `${origin}/slow`,
          tokenSecret: 'operator.webhook',
          maxPayloadBytes: 512,
        },
      },
    }],
    ['kubeclaw.network-http:http', {
      allowedOrigins: [origin],
      allowedMethods: ['POST'],
      allowedHeaders: [
        'content-type',
        'idempotency-key',
        'x-kubeclaw-signature',
      ],
      maxRequestBytes: 1_024,
      maxResponseBytes: 1_024,
      timeoutMs: 1_000,
    }],
    ['kubeclaw.secret-resolver:secrets', {
      environment: { 'operator.webhook': secretEnvironmentName },
    }],
  ]),
  effects: new core.EffectCoordinator(effectJournal, undefined, undefined, new core.MemoryResourceLockManager()),
  shutdownTimeoutMs: 1_000,
  async emitDomainEvent() {},
});

const attempt = {
  runId: 'run:operator-test',
  stageId: 'stage:operator-test',
  attemptId: 'attempt:operator-test',
  attemptNumber: 1,
};
let requestSequence = 0;
const publish = (
  target,
  payload,
  options = {},
) => {
  requestSequence += 1;
  const idempotencyKey = options.idempotencyKey ?? `operator:test:${requestSequence}`;
  return adapters.invoke(
    'operator.request',
    attempt,
    idempotencyKey,
    {
      operation: options.operation ?? 'publish',
      resource: {
        type: options.resourceType ?? 'operator.target',
        canonicalId: target,
      },
      payload,
    },
    options.signal ?? new AbortController().signal,
  );
};

try {
  await adapters.start();
  const payload = {
    type: 'approval.requested',
    approvalId: 'approval:run:test',
    summary: 'Approve the release.',
    signalType: 'approval.resolved',
    authorizedIssuer: { type: 'operator', id: 'operator:release' },
    expiresAt: '2026-07-26T17:00:00.000Z',
  };
  const accepted = await publish('operators', payload, {
    idempotencyKey: 'operator:stable-delivery',
  });
  assert.deepEqual(accepted, {
    accepted: true,
    target: 'operators',
    status: 202,
    messageId: 'message-1',
  });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].method, 'POST');
  assert.equal(deliveries[0].url, '/messages');
  assert.equal(deliveries[0].headers.authorization, undefined);
  assert.equal(deliveries[0].headers['idempotency-key'], 'operator:stable-delivery');
  assert.deepEqual(JSON.parse(deliveries[0].body), payload);
  const expectedSignature = crypto
    .createHmac('sha256', secretValue)
    .update(`operator:stable-delivery.${deliveries[0].body}`, 'utf8')
    .digest('hex');
  assert.equal(
    deliveries[0].headers['x-kubeclaw-signature'],
    `v1=${expectedSignature}`,
  );

  const repeated = await publish('operators', payload, {
    idempotencyKey: 'operator:stable-delivery',
  });
  assert.deepEqual(repeated, accepted);
  assert.equal(deliveries.length, 1, 'completed effect must be idempotent');

  const journalText = JSON.stringify(effectJournal.entries());
  assert.doesNotMatch(journalText, new RegExp(secretValue));
  assert.doesNotMatch(journalText, /authorization/i);
  assert.match(journalText, /operator:stable-delivery/);
  assert.match(journalText, /x-kubeclaw-signature/);

  await assert.rejects(
    publish('unconfigured', { type: 'test.notice', message: 'denied' }),
    /OPERATOR_TARGET_DENIED/,
  );

  await assert.rejects(
    publish('operators', { type: 'test.notice', unknown: true }),
    /OPERATOR_PAYLOAD_UNKNOWN_FIELD/,
  );
  await assert.rejects(
    publish('operators', { type: 'test.notice', message: 'x'.repeat(600) }),
    /OPERATOR_PAYLOAD_SIZE_EXCEEDED/,
  );
  await assert.rejects(
    publish('operators', { type: 'test.notice' }, { operation: 'delete' }),
    /OPERATOR_OPERATION_UNSUPPORTED/,
  );
  await assert.rejects(
    publish('operators', { type: 'test.notice' }, { resourceType: 'network.url' }),
    /OPERATOR_RESOURCE_TYPE_INVALID/,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    publish('operators', { type: 'test.notice' }, { signal: cancelled.signal }),
    /ADAPTER_CANCELLED/,
  );
  const midflight = new AbortController();
  const slow = publish('slow', { type: 'test.notice', message: 'cancel me' }, {
    signal: midflight.signal,
    idempotencyKey: 'operator:midflight-cancel',
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  midflight.abort();
  await assert.rejects(slow, /ADAPTER_CANCELLED|aborted/i);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(deliveries.find((delivery) => delivery.url === '/slow')?.closed, true);
  assert.equal(
    (await effectJournal.receipt('operator:midflight-cancel'))?.status,
    'failed',
    'cancelled outer invocation must not record a completed receipt',
  );
  await assert.rejects(
    publish('failing', { type: 'test.notice', message: 'must fail closed' }),
    /HTTP_503/,
  );
} finally {
  await adapters.shutdown().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env[secretEnvironmentName];
  else process.env[secretEnvironmentName] = previousSecret;
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.operator-messaging',
  suite: 'live-function',
  deliveries: deliveries.length,
}));
