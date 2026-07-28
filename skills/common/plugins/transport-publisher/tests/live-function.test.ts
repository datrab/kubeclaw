import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const signingKey = 'transport-test-signing-key';
process.env.KUBECLAW_TRANSPORT_TEST_KEY = signingKey;

const received = [];
const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const target = String(request.headers['x-kubeclaw-target'] ?? '');
    const idempotencyKey = String(request.headers['idempotency-key'] ?? '');
    const expected = crypto
      .createHmac('sha256', signingKey)
      .update(`${target}\n${idempotencyKey}\n${rawBody}`)
      .digest('hex');
    received.push({
      url: request.url,
      method: request.method,
      target,
      idempotencyKey,
      signature: request.headers['x-kubeclaw-signature'],
      expected: `sha256=${expected}`,
      body: JSON.parse(rawBody),
    });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/rejected') {
      response.end(JSON.stringify({ accepted: false, publicationId: 'rejected' }));
    } else if (request.url === '/malformed') {
      response.end(JSON.stringify({ accepted: true, publicationId: 'ok', unexpected: true }));
    } else if (request.url === '/unavailable') {
      response.writeHead(503).end(JSON.stringify({ error: 'unavailable' }));
    } else {
      response.end(JSON.stringify({ accepted: true, publicationId: `publication:${received.length}` }));
    }
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind');
const origin = `http://127.0.0.1:${address.port}`;

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'transport-publisher-test-'));
const consumerRoot = path.join(temporary, 'plugins', 'consumer');
fs.mkdirSync(path.join(consumerRoot, 'dist'), { recursive: true });
fs.mkdirSync(path.join(consumerRoot, 'schemas'), { recursive: true });
fs.writeFileSync(path.join(consumerRoot, 'dist', 'stage.js'), `
  export async function execute() {
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] };
  }
`);
for (const name of ['config', 'input', 'result']) {
  fs.writeFileSync(path.join(consumerRoot, 'schemas', `${name}.json`), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
  }));
}
fs.writeFileSync(path.join(consumerRoot, 'plugin.json'), JSON.stringify({
  id: 'test.transport-consumer',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  stages: [{
    id: 'consumer',
    type: 'test.transport.consumer',
    module: 'dist/stage.js',
    export: 'execute',
    requiredCapabilities: ['transport.publish'],
    configSchema: 'schemas/config.json',
    inputSchema: 'schemas/input.json',
    resultSchema: 'schemas/result.json',
  }],
  observers: [],
  adapters: [],
}));

const core = await import(pathToFileURL(path.resolve('../../plugin-runtime/core/src/index.ts')).href);
const packages = core.discoverPackages({
  installationRoots: ['../../plugins', path.join(temporary, 'plugins')],
  trustPolicy: {
    trustedBuiltinRoots: ['../../plugins', path.join(temporary, 'plugins')],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:transport-publisher',
  },
  now: () => new Date('2026-07-26T16:00:00Z'),
});
const snapshot = core.buildRegistry(packages);
const publisherId = 'kubeclaw.transport-publisher:publisher';
const secretId = 'kubeclaw.secret-resolver:secrets';
const networkId = 'kubeclaw.network-http:http';
const consumerId = 'test.transport-consumer:consumer';
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set([consumerId]),
  providers: new Map([
    ['transport.publish', publisherId],
    ['secrets.read', secretId],
    ['network.http', networkId],
  ]),
  grants: new Map([
    [consumerId, new Map([
      ['transport.publish', { allowedTargets: ['audit', 'rejected', 'malformed', 'unavailable'] }],
    ])],
    [publisherId, new Map([
      ['secrets.read', { allowedNames: ['transport.signing'] }],
      ['network.http', { allowedOrigins: [origin] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(snapshot, new Set(granted.grants.keys()));
const journal = new core.MemoryEffectJournal();
const adapters = new core.AdapterRuntime({
  granted,
  activated,
  configs: new Map([
    [publisherId, {
      targets: {
        audit: {
          endpoint: `${origin}/publish`,
          signingSecret: 'transport.signing',
          maxPayloadBytes: 128,
        },
        rejected: {
          endpoint: `${origin}/rejected`,
          signingSecret: 'transport.signing',
        },
        malformed: {
          endpoint: `${origin}/malformed`,
          signingSecret: 'transport.signing',
        },
        unavailable: {
          endpoint: `${origin}/unavailable`,
          signingSecret: 'transport.signing',
        },
      },
    }],
    [secretId, {
      environment: {
        'transport.signing': 'KUBECLAW_TRANSPORT_TEST_KEY',
      },
    }],
    [networkId, {
      allowedOrigins: [origin],
      allowedMethods: ['POST'],
      allowedHeaders: [
        'content-type',
        'idempotency-key',
        'x-kubeclaw-target',
        'x-kubeclaw-signature',
      ],
      maxRequestBytes: 1024,
      maxResponseBytes: 1024,
      timeoutMs: 1000,
    }],
  ]),
  effects: new core.EffectCoordinator(journal, undefined, undefined, new core.MemoryResourceLockManager()),
  shutdownTimeoutMs: 1000,
  async emitDomainEvent() {},
});

const attempt = {
  runId: 'run:transport',
  stageId: 'stage:transport',
  attemptId: 'attempt:transport',
  attemptNumber: 1,
};
let sequence = 0;
const publish = (target, payload, options = {}) => {
  sequence += 1;
  return adapters.invoke(
    'transport.publish',
    attempt,
    options.idempotencyKey ?? `transport:${sequence}`,
    {
      operation: options.operation ?? 'publish',
      resource: { type: options.resourceType ?? 'transport.target', canonicalId: target },
      payload,
    },
    options.signal ?? new AbortController().signal,
  );
};

try {
  await adapters.start();

  const first = await publish('audit', { message: { event: 'completed', sequence: 7 } }, {
    idempotencyKey: 'transport:stable',
  });
  assert.deepEqual(first, {
    accepted: true,
    target: 'audit',
    publicationId: 'publication:1',
    status: 200,
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'POST');
  assert.equal(received[0].target, 'audit');
  assert.equal(received[0].idempotencyKey, 'transport:stable');
  assert.equal(received[0].signature, received[0].expected);
  assert.deepEqual(received[0].body, { message: { event: 'completed', sequence: 7 } });

  const replay = await publish('audit', { message: { event: 'completed', sequence: 7 } }, {
    idempotencyKey: 'transport:stable',
  });
  assert.deepEqual(replay, first);
  assert.equal(received.length, 1, 'outer effect receipt must make publication idempotent');

  await assert.rejects(publish('missing', { message: {} }), /TRANSPORT_TARGET_UNKNOWN/);
  await assert.rejects(publish('audit', { message: {}, extra: true }), /TRANSPORT_PAYLOAD_UNKNOWN_FIELD/);
  await assert.rejects(
    publish('audit', { message: { content: 'x'.repeat(256) } }),
    /TRANSPORT_PAYLOAD_SIZE_EXCEEDED/,
  );
  await assert.rejects(publish('rejected', { message: {} }), /TRANSPORT_PUBLICATION_REJECTED/);
  await assert.rejects(publish('malformed', { message: {} }), /TRANSPORT_RESPONSE_BODY_INVALID/);
  await assert.rejects(publish('unavailable', { message: {} }), /HTTP_503/);
  await assert.rejects(
    publish('audit', { message: {} }, { operation: 'read' }),
    /TRANSPORT_OPERATION_UNSUPPORTED/,
  );
  await assert.rejects(
    publish('audit', { message: {} }, { resourceType: 'network.url' }),
    /TRANSPORT_RESOURCE_TYPE_INVALID/,
  );

  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    publish('audit', { message: {} }, { signal: cancelled.signal }),
    /ADAPTER_CANCELLED/,
  );

  const persisted = JSON.stringify(journal.entries());
  assert.doesNotMatch(persisted, new RegExp(signingKey), 'secret must never enter durable effect requests');
  assert.match(persisted, /sha256=[a-f0-9]{64}/, 'auditable request retains only the HMAC');
} finally {
  await adapters.shutdown();
  await assert.rejects(
    publish('audit', { message: {} }),
    /ADAPTER_RUNTIME_STOPPING/,
  );
  delete process.env.KUBECLAW_TRANSPORT_TEST_KEY;
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.transport-publisher',
  suite: 'live-function',
  publications: received.length,
}));
