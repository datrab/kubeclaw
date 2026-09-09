import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-messaging-test-'));
const core = await import(pathToFileURL(
  path.join(repository, 'skills/nova/core/src/index.ts'),
).href);
const secretEnvironmentName = 'KUBECLAW_OPERATOR_MESSAGING_TEST_TOKEN';
const endpointEnvironmentName = 'KUBECLAW_OPERATOR_MESSAGING_TEST_ENDPOINT';
const secretValue = 'operator-test-secret-that-must-not-be-journaled';
const previousSecret = process.env[secretEnvironmentName];
const previousEndpoint = process.env[endpointEnvironmentName];
process.env[secretEnvironmentName] = secretValue;
const deliveries = [];
const slowReceived = Promise.withResolvers();
const slowClosed = Promise.withResolvers();
async function beforeDeadline(operation, message) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 5000);
    })]);
  } finally { clearTimeout(timer); }
}
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
      const delivery = deliveries.at(-1);
      const timeout = setTimeout(() => {
        if (!response.writableEnded) {
          response.writeHead(202, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ messageId: 'slow-message' }));
        }
      }, 10000);
      response.once('close', () => {
        clearTimeout(timeout);
        delivery.closed = !response.writableEnded;
        slowClosed.resolve();
      });
      slowReceived.resolve();
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
const confidentialEndpoint = `${origin}/confidential-discord`;
process.env[endpointEnvironmentName] = confidentialEndpoint;

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
        allowedTargets: ['operators', 'discord', 'confidential-discord', 'failing', 'slow', 'unconfigured'],
      }],
    ])],
    ['kubeclaw.operator-messaging:operator', new Map([
      ['network.http', { allowedOrigins: [origin] }],
      ['secrets.read', { allowedNames: ['operator.webhook', 'operator.endpoint'] }],
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
      deliveryRoot: path.join(temporary, 'deliveries'),
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
        discord: {
          endpoint: `${origin}/discord`,
          tokenSecret: 'operator.webhook',
          format: 'discord_webhook',
          maxPayloadBytes: 4_096,
        },
        'confidential-discord': {
          endpointOrigin: origin,
          endpointSecret: 'operator.endpoint',
          format: 'discord_webhook',
          maxPayloadBytes: 4_096,
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
      environment: {
        'operator.webhook': secretEnvironmentName,
        'operator.endpoint': endpointEnvironmentName,
      },
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

  const discordAccepted = await publish('discord', {
    type: 'stage.succeeded',
    runId: 'run:discord',
    stageId: 'architecture',
    severity: 'success',
    title: 'Architecture Validator passed',
    summary: 'Architecture validation passed.',
    fields: [{ name: 'Model', value: 'gpt-5.3-codex-spark', inline: true }],
    footer: 'KubeClaw Pipeline · run:discord',
    occurredAt: '2026-07-29T07:00:00.000Z',
  }, {
    idempotencyKey: 'operator:discord-delivery',
  });
  assert.equal(discordAccepted.accepted, true);
  const discordBody = JSON.parse(deliveries.at(-1).body);
  assert.equal(discordBody.embeds[0].title, '✅ Architecture Validator passed');
  assert.equal(discordBody.embeds[0].fields[0].value, 'gpt-5.3-codex-spark');
  assert.equal(discordBody.embeds[0].footer.text, 'KubeClaw Pipeline · run:discord');

  const confidentialAccepted = await publish('confidential-discord', {
    type: 'run.started',
    runId: 'run:confidential',
    severity: 'info',
    title: 'Pipeline started',
    summary: 'Confidential endpoint delivery.',
  }, {
    idempotencyKey: 'operator:confidential-discord-delivery',
  });
  assert.equal(confidentialAccepted.accepted, true);
  assert.equal(deliveries.at(-1).url, '/confidential-discord');

  const repeated = await publish('operators', payload, {
    idempotencyKey: 'operator:stable-delivery',
  });
  assert.deepEqual(repeated, accepted);
  assert.equal(deliveries.length, 3, 'completed effect must be idempotent');

  const journalText = JSON.stringify(effectJournal.entries());
  assert.equal(
    effectJournal.entries().every((request) =>
      request.attempt.runId === attempt.runId
      && request.attempt.stageId === attempt.stageId
      && request.attempt.attemptId === attempt.attemptId),
    true,
    'nested adapter effects retain the originating invocation identity',
  );
  assert.doesNotMatch(journalText, new RegExp(secretValue));
  assert.doesNotMatch(journalText, new RegExp(confidentialEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
    /ADAPTER_CANCELLED|EFFECT_RESOURCE_WAIT_CANCELLED/,
  );
  const midflight = new AbortController();
  const slow = publish('slow', { type: 'test.notice', message: 'cancel me' }, {
    signal: midflight.signal,
    idempotencyKey: 'operator:midflight-cancel',
  });
  const cancelledDelivery = assert.rejects(slow, /ADAPTER_CANCELLED|aborted/i);
  await beforeDeadline(slowReceived.promise, 'slow delivery never reached the real server');
  midflight.abort();
  await cancelledDelivery;
  await beforeDeadline(slowClosed.promise, 'cancellation did not close the response connection');
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

  const { activate: activateDirect } = await import(pathToFileURL(path.resolve('src/adapter.ts')).href);
  let directSends = 0;
  const direct = activateDirect({
    registration: {},
    config: {
      deliveryRoot: path.join(temporary, 'direct-deliveries'),
      targets: {
        retry: {
          endpoint: `${origin}/direct-retry`,
          tokenSecret: 'operator.webhook',
          maxPayloadBytes: 512,
        },
      },
    },
    async emit() {},
    async invoke(capability) {
      if (capability === 'secrets.read') return { value: secretValue };
      if (capability === 'network.http') {
        directSends += 1;
        if (directSends === 1) throw new Error('HTTP_503');
        return { status: 202, body: { messageId: 'direct-retry-success' } };
      }
      throw new Error(`unexpected dependency:${capability}`);
    },
  });
  const directPayload = { type: 'test.notice', message: 'retry across attempts' };
  const directInvoke = (
    retryAttempt,
    idempotencyKey = 'operator:retry-across-attempts',
    message = directPayload,
  ) => direct.invoke({
    request: {
      requestId: `request:${retryAttempt.attemptNumber}`,
      idempotencyKey,
      attempt: retryAttempt,
      capability: 'operator.request',
      operation: 'publish',
      resource: { type: 'operator.target', canonicalId: 'retry' },
      payload: message,
    },
    signal: new AbortController().signal,
    fence: { assertCurrent() {} },
  });
  await assert.rejects(directInvoke(attempt), /HTTP_503/);
  await assert.rejects(directInvoke({
    ...attempt,
    attemptId: 'attempt:operator-retry',
    attemptNumber: 2,
  }), /OPERATOR_DELIVERY_UNRESOLVED/);
  assert.equal(directSends, 1, 'an unverified receiver must not be blindly retried');
  await assert.rejects(
    directInvoke(attempt, 'operator:retry-across-attempts', { ...directPayload, message: 'changed' }),
    /DURABLE_RECORD_IDEMPOTENCY_CONFLICT/,
  );
  assert.equal((await directInvoke(attempt, 'a'.repeat(256))).accepted, true);
  assert.equal(directSends, 2, 'a distinct delivery key must not reuse an unrelated receipt');
  await direct.shutdown();

  let capacitySends = 0;
  const capacity = activateDirect({
    registration: {},
    config: {
      deliveryRoot: path.join(temporary, 'capacity-deliveries'),
      maximumDeliveryRecords: 1,
      targets: {
        retry: {
          endpoint: `${origin}/capacity`,
          tokenSecret: 'operator.webhook',
          maxPayloadBytes: 512,
        },
      },
    },
    async emit() {},
    async invoke(capability) {
      if (capability === 'secrets.read') return { value: secretValue };
      if (capability === 'network.http') {
        capacitySends += 1;
        return { status: 202, body: { messageId: 'must-not-send' } };
      }
      throw new Error(`unexpected dependency:${capability}`);
    },
  });
  await assert.rejects(capacity.invoke({
    request: {
      requestId: 'request:capacity',
      idempotencyKey: 'operator:capacity',
      attempt,
      capability: 'operator.request',
      operation: 'publish',
      resource: { type: 'operator.target', canonicalId: 'retry' },
      payload: directPayload,
    },
    signal: new AbortController().signal,
    fence: { assertCurrent() {} },
  }), /DURABLE_RECORD_STORE_FULL/);
  assert.equal(capacitySends, 0, 'terminal capacity must be reserved before network delivery');
  await capacity.shutdown();

  let concurrentSends = 0;
  const concurrent = activateDirect({
    registration: {},
    config: {
      deliveryRoot: path.join(temporary, 'concurrent-deliveries'),
      targets: {
        retry: {
          endpoint: `${origin}/concurrent`,
          tokenSecret: 'operator.webhook',
          maxPayloadBytes: 512,
        },
      },
    },
    async emit() {},
    async invoke(capability) {
      if (capability === 'secrets.read') return { value: secretValue };
      if (capability === 'network.http') {
        concurrentSends += 1;
        const call = concurrentSends;
        await new Promise((resolve) => setTimeout(resolve, call === 1 ? 10 : 30));
        if (call === 1) throw new Error('HTTP_503');
        return { status: 202, body: { messageId: 'concurrent-success' } };
      }
      throw new Error(`unexpected dependency:${capability}`);
    },
  });
  const concurrentInvoke = () => concurrent.invoke({
    request: {
      requestId: `request:concurrent:${crypto.randomUUID()}`,
      idempotencyKey: 'operator:concurrent',
      attempt,
      capability: 'operator.request',
      operation: 'publish',
      resource: { type: 'operator.target', canonicalId: 'retry' },
      payload: directPayload,
    },
    signal: new AbortController().signal,
    fence: { assertCurrent() {} },
  });
  const concurrentResults = await Promise.allSettled([concurrentInvoke(), concurrentInvoke()]);
  assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await concurrentInvoke()).accepted, true);
  assert.equal(concurrentSends, 2, 'the durable success must win over a concurrent failure');
  await concurrent.shutdown();
} finally {
  await adapters.shutdown().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env[secretEnvironmentName];
  else process.env[secretEnvironmentName] = previousSecret;
  if (previousEndpoint === undefined) delete process.env[endpointEnvironmentName];
  else process.env[endpointEnvironmentName] = previousEndpoint;
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.operator-messaging',
  suite: 'live-function',
  deliveries: deliveries.length,
}));
