import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const gatewayCwd = path.join(repository, '.swarm', 'runtime-dispatch-test', 'work');
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
    if (request.method === 'GET' && request.url?.startsWith('/results/')) {
      received.push({ headers: request.headers, body: '{"tool":"remote_result"}' });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ schemaVersion: 'runtime-agent-result-file.v2', content: '{"status":"PASS","summary":"Reviewed"}' }));
      return;
    }
    received.push({ headers: request.headers, body });
    response.writeHead(200, { 'content-type': 'application/json' });
    const parsed = JSON.parse(body);
    if (parsed.tool === 'sessions_spawn') {
      const resultFile = String(parsed.args.task).match(/atomically to (.+\.json)\./u)?.[1];
      assert.ok(resultFile);
      fs.mkdirSync(path.dirname(resultFile), { recursive: true });
      fs.writeFileSync(resultFile, '{"status":"PASS","summary":"Reviewed"}\n');
      response.end(JSON.stringify({
        ok: true,
        toolName: 'sessions_spawn',
        output: {
          content: [],
          details: { childSessionKey: null, sessionKey: 'session:gateway-test' },
        },
        source: 'core',
      }));
    } else if (parsed.tool === 'subagents') {
      const poll = received.filter((entry) => JSON.parse(entry.body).tool === 'subagents').length;
      response.end(JSON.stringify({
        ok: true,
        toolName: 'subagents',
        output: { content: [], details: {
          active: poll === 1 ? [{ sessionKey: 'session:gateway-test', status: 'running' }] : [],
          recent: poll === 1 ? [] : [{ sessionKey: 'session:gateway-test', status: 'done' }],
        } },
        source: 'core',
      }));
    } else {
      response.end(JSON.stringify({ result: { schemaVersion: 'stage-result.v2', outcome: 'passed' } }));
    }
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
      ['runtime.dispatch', { allowedAgents: ['reviewer', 'gateway', 'unknown'] }],
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
      allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-kubeclaw-signature'],
      maxRequestBytes: 2048,
      maxResponseBytes: 2048,
      timeoutMs: 1000,
    }],
    ['kubeclaw.secret-resolver:secrets', { environment: { 'runtime.agent': environmentName } }],
  ]),
  effects: new core.EffectCoordinator(journal, undefined, undefined, new core.MemoryResourceLockManager()),
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
  await adapters.shutdown();

  const gatewayGranted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set(['kubeclaw.review:review']),
    providers: new Map([
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:openclaw'],
      ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
    ]),
    grants: new Map([
      ['kubeclaw.review:review', new Map([
        ['runtime.dispatch', { allowedAgents: ['gateway'] }],
      ])],
      ['kubeclaw.runtime-dispatch:openclaw', new Map([
        ['git.repository.read', { allowedPrefixes: ['.swarm/runtime-dispatch-test/results/'] }],
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['runtime.agent'] }],
      ])],
    ]),
  });
  const gatewayActivated = await core.activateRegistry(
    gatewayGranted.snapshot,
    gatewayGranted.enabledRegistrations,
  );
  const gatewayJournal = new core.MemoryEffectJournal();
  const gatewayAdapters = new core.AdapterRuntime({
    granted: gatewayGranted,
    activated: gatewayActivated,
    configs: new Map([
      ['kubeclaw.runtime-dispatch:openclaw', {
        targets: {
          gateway: {
            endpoint: `${origin}/tools/invoke`,
            tokenSecret: 'runtime.agent',
            runtime: 'subagent',
            agentId: 'codex',
            model: 'openai/gpt-5.6-sol',
            thinking: 'high',
            cwd: gatewayCwd,
            repositoryRoot: repository,
            pollMs: 10,
            maxPollMs: 20,
            maxPolls: 2,
            sessionTimeoutMs: 1_000,
            resultPathPrefix: '.swarm/runtime-dispatch-test/work/results',
            resultEndpoint: `${origin}/results`,
            resultTokenSecret: 'runtime.agent',
          },
        },
      }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin],
        allowedMethods: ['GET', 'POST'],
        allowedHeaders: ['authorization', 'content-type'],
        maxRequestBytes: 16_384,
        maxResponseBytes: 16_384,
        timeoutMs: 1000,
      }],
      ['kubeclaw.repository-adapter:repository', {
        repositoryRoot: repository,
        maxFileBytes: 2048,
      }],
      ['kubeclaw.secret-resolver:secrets', { environment: { 'runtime.agent': environmentName } }],
    ]),
    effects: new core.EffectCoordinator(
      gatewayJournal,
      undefined,
      undefined,
      new core.MemoryResourceLockManager(),
    ),
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  try {
    await gatewayAdapters.start();
    const gateway = await gatewayAdapters.invoke(
      'runtime.dispatch',
      attempt,
      'runtime:gateway',
      {
        operation: 'dispatch',
        resource: { type: 'runtime.agent', canonicalId: 'gateway' },
        payload: { protocol: 'kubeclaw.review.v2', task: 'Review gateway behavior.' },
      },
      new AbortController().signal,
    );
    assert.deepEqual(gateway, { result: { status: 'PASS', summary: 'Reviewed' } });
    const spawnRequests = received.filter((entry) => JSON.parse(entry.body).tool === 'sessions_spawn');
    assert.equal(spawnRequests.length, 1);
    const spawnArgs = JSON.parse(spawnRequests[0].body).args;
    assert.equal(spawnArgs.cwd, gatewayCwd);
    const durableResult = String(spawnArgs.task).match(/atomically to (.+\.json)\./u)?.[1];
    assert.ok(durableResult);
    assert.equal(
      path.dirname(durableResult),
      path.join(gatewayCwd, 'results'),
    );
    assert.equal(received.filter((entry) => JSON.parse(entry.body).tool === 'subagents').length, 2);
    assert.equal(received.filter((entry) => JSON.parse(entry.body).tool === 'sessions_history').length, 0);
    assert.equal(received.every((entry) => !entry.body.includes(token)), true);
    const journalText = JSON.stringify(gatewayJournal.entries());
    assert.doesNotMatch(journalText, /gateway-test|tools\/invoke|runtime-secret-that-must-not-be-journaled/);
  } finally {
    await gatewayAdapters.shutdown();
    fs.rmSync(path.join(repository, '.swarm', 'runtime-dispatch-test'), { recursive: true, force: true });
  }
} finally {
  await adapters.shutdown();
  delete process.env[environmentName];
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.runtime-dispatch', suite: 'live-function' }));
