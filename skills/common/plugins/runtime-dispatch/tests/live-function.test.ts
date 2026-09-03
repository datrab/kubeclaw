import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '@kubeclaw/plugin-sdk';
import { assertOpenClawOutputBudget, assertOpenClawPromptBudget, assertOpenClawSessionCompleted,
  prepareOpenClawTask } from '../src/openclaw.ts';
import { assertOpenClawToolAccepted, OpenClawToolRejectedError } from '../src/openclaw-response.ts';

assert.doesNotThrow(() => assertOpenClawToolAccepted({
  ok: true, output: { details: { status: 'accepted', childSessionKey: 'child' } },
}, 'sessions_spawn'));
assert.throws(() => assertOpenClawToolAccepted({
  ok: true, status: 'ok', output: { isError: true, details: {
    status: 'forbidden', governingCap: 'subagents.maxChildrenPerAgent',
  } },
}, 'sessions_spawn'), (error: unknown) => error instanceof OpenClawToolRejectedError
  && error.message === 'OPENCLAW_SESSIONS_SPAWN_REJECTED:forbidden:subagents.maxChildrenPerAgent'
  && error.governingCap === 'subagents.maxChildrenPerAgent');

for (const state of ['completed', 'complete', 'done', 'succeeded', 'idle', 'ended', 'closed']) {
  assert.doesNotThrow(() => assertOpenClawSessionCompleted({ terminal: true, state, model: 'declared' }, 'declared'));
}
for (const state of ['failed', 'error', 'cancelled', 'canceled', 'unknown']) {
  assert.throws(() => assertOpenClawSessionCompleted({ terminal: true, state, model: 'declared' }, 'declared'), /OPENCLAW_SESSION_FAILED/u);
}
assert.throws(() => assertOpenClawSessionCompleted(
  { terminal: true, state: 'done', model: 'fallback' }, 'declared'), /OPENCLAW_SESSION_MODEL_MISMATCH/u);
assert.throws(() => assertOpenClawSessionCompleted(
  { terminal: true, state: 'done' }, 'declared'), /OPENCLAW_SESSION_MODEL_MISMATCH/u);

assert.throws(() => assertOpenClawPromptBudget('oversized prompt', {
  tokenizerEncoding: 'o200k_base', maxPromptBytes: 1, maxInputTokens: 100,
  maxOutputTokens: 10, maxContextTokens: 110,
}), /OPENCLAW_PROMPT_BYTES_EXCEEDED/u);
assert.throws(() => assertOpenClawPromptBudget('one two three four', {
  tokenizerEncoding: 'o200k_base', maxPromptBytes: 1_000, maxInputTokens: 1,
  maxOutputTokens: 1, maxContextTokens: 2,
}), /OPENCLAW_PROMPT_TOKENS_EXCEEDED/u);

const promptTarget = {
  endpoint: 'http://127.0.0.1', tokenSecret: 'secret', runtime: 'subagent', agentId: 'reviewer',
  agentRole: 'reviewer', model: 'gpt-5.6-terra', thinking: 'high', cwd: '/work', repositoryRoot: '/work',
  pollMs: 1, maxPollMs: 1, maxPolls: 1, sessionTimeoutMs: 1, resultPathPrefix: '.results',
  tokenizerEncoding: 'o200k_base', maxPromptBytes: 100_000, maxInputTokens: 10_000,
  maxOutputTokens: 1_000, maxContextTokens: 11_000,
};
const controlledPayload = { protocol: 'review', task: 'review', runtimePromptBudget: {
  schemaVersion: 'runtime-prompt-budget.v1', tokenizerEncoding: 'o200k_base',
  reservedPromptBytes: 20_000, reservedInputTokens: 2_000,
  maxPromptBytes: 20_000, maxInputTokens: 2_000, maxOutputTokens: 1_000, maxContextTokens: 3_000,
} };
const preparedTask = prepareOpenClawTask(controlledPayload, '/work/.results/result.json', promptTarget);
assert.equal(preparedTask.includes('runtimePromptBudget'), false);
assert.match(preparedTask, /return exactly ANNOUNCE_SKIP as your final response/u);
assert.doesNotMatch(preparedTask, /return the same raw JSON as your final response/u);
assert.throws(() => prepareOpenClawTask({ ...controlledPayload, runtimePromptBudget: {
  ...controlledPayload.runtimePromptBudget, tokenizerEncoding: 'cl100k_base',
} }, '/work/.results/result.json', promptTarget), /OPENCLAW_PROMPT_TOKENIZER_MISMATCH/u);
assert.throws(() => prepareOpenClawTask({ ...controlledPayload, runtimePromptBudget: {
  ...controlledPayload.runtimePromptBudget, reservedInputTokens: 1,
} }, '/work/.results/result.json', promptTarget), /OPENCLAW_DECLARED_PROMPT_TOKENS_EXCEEDED/u);
assert.throws(() => prepareOpenClawTask({ ...controlledPayload, runtimePromptBudget: {
  ...controlledPayload.runtimePromptBudget, maxOutputTokens: 1_001,
} }, '/work/.results/result.json', promptTarget), /OPENCLAW_OUTPUT_TOKEN_CAP_MISMATCH/u);
assert.throws(() => prepareOpenClawTask({ ...controlledPayload, runtimePromptBudget: {
  ...controlledPayload.runtimePromptBudget, maxOutputTokens: 999,
} }, '/work/.results/result.json', promptTarget), /OPENCLAW_OUTPUT_TOKEN_CAP_MISMATCH/u);
assert.throws(() => assertOpenClawOutputBudget('one two three', promptTarget, 1),
  /OPENCLAW_OUTPUT_TOKENS_EXCEEDED/u);

const repository = path.resolve('../../../..');
const gatewayCwd = path.join(repository, '.swarm', 'runtime-dispatch-test', 'work');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const token = 'runtime-secret-that-must-not-be-journaled';
const environmentName = 'KUBECLAW_RUNTIME_DISPATCH_TEST_TOKEN';
process.env[environmentName] = token;
const received = [];
let spawnedLabel = '';
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
      if (String(parsed.args.task).includes('Trigger admission refusal.')) {
        response.end(JSON.stringify({
          ok: true,
          toolName: 'sessions_spawn',
          output: { content: [{ type: 'text', text: 'Spawn refused by configured child capacity.' }],
            details: { status: 'forbidden', governingCap: 'subagents.maxChildrenPerAgent' } },
          isError: true,
          source: 'core',
        }));
        return;
      }
      const resultFile = String(parsed.args.task).match(/atomically to (.+\.json)\./u)?.[1];
      assert.ok(resultFile);
      spawnedLabel = String(parsed.args.label);
      fs.mkdirSync(path.dirname(resultFile), { recursive: true });
      fs.writeFileSync(resultFile, '{"status":"PASS","summary":"Reviewed"}\n');
      response.end(JSON.stringify({
        ok: true,
        toolName: 'sessions_spawn',
        output: {
          content: [],
          details: { status: 'accepted', childSessionKey: 'session:gateway-test', runId: 'run:gateway-test',
            resolvedModel: 'openai/gpt-5.6-sol' },
        },
        source: 'core',
      }));
    } else if (parsed.tool === 'subagents') {
      const poll = received.filter((entry) => JSON.parse(entry.body).tool === 'subagents').length;
      response.end(JSON.stringify({
        ok: true,
        toolName: 'subagents',
        output: { content: [], details: {
          tasks: [{ status: 'failed', label: 'unrelated-task-without-id' },
            { taskId: 'task:gateway-test', label: spawnedLabel,
            status: poll === 1 ? 'running' : 'completed' }],
          active: poll === 1 ? [{ taskId: 'task:gateway-test', runId: 'run:gateway-test',
            sessionKey: 'session:gateway-test', status: 'running' }] : [],
          recent: poll === 1 ? [] : [{ taskId: 'task:gateway-test', runId: 'run:gateway-test',
            sessionKey: 'session:gateway-test', status: 'done', model: 'openai/gpt-5.6-sol' }],
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
    ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
        ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
        ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ['network.http', 'kubeclaw.network-http:http'],
    ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
  ]),
  grants: new Map([
    ['kubeclaw.review:review', new Map([
      ['runtime.dispatch', { allowedAgents: ['reviewer', 'gateway', 'unknown'] }],
      ['git.repository.read', { allowedPrefixes: ['src'] }],
          ['artifacts.read', { allowedNamespaces: ['kubeclaw.review'] }],
          ['artifacts.write', { allowedNamespaces: ['kubeclaw.review'] }],
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
    ['kubeclaw.repository-adapter:repository', {
      repositoryRoot: repository,
      maxFileBytes: 2048,
    }],
    ['kubeclaw.artifact-store:artifact-store', {
      artifactRoot: path.join(repository, '.swarm', 'runtime-dispatch-test', 'artifacts'),
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
        ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
        ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
    ]),
    grants: new Map([
      ['kubeclaw.review:review', new Map([
        ['runtime.dispatch', { allowedAgents: ['gateway'] }],
        ['git.repository.read', { allowedPrefixes: ['src'] }],
          ['artifacts.read', { allowedNamespaces: ['kubeclaw.review'] }],
          ['artifacts.write', { allowedNamespaces: ['kubeclaw.review'] }],
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
            controllerSessionKey: 'agent:codex:nova-review-controller',
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
      ['kubeclaw.artifact-store:artifact-store', {
        artifactRoot: path.join(repository, '.swarm', 'runtime-dispatch-test', 'gateway-artifacts'),
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
    const runtimeIdentity = { targetId: 'gateway', runtime: 'subagent', agentId: 'codex',
      model: 'openai/gpt-5.6-sol', thinking: 'high' };
    assert.deepEqual(gateway, { result: { status: 'PASS', summary: 'Reviewed' },
      runtimeEvidence: { schemaVersion: 'runtime-agent-attestation.v1', ...runtimeIdentity,
        identityDigest: `sha256:${crypto.createHash('sha256').update(canonicalJson(runtimeIdentity)).digest('hex')}` } });
    const spawnRequests = received.filter((entry) => JSON.parse(entry.body).tool === 'sessions_spawn');
    assert.equal(spawnRequests.length, 1);
    const spawnArgs = JSON.parse(spawnRequests[0].body).args;
    assert.equal(JSON.parse(spawnRequests[0].body).sessionKey, 'agent:codex:nova-review-controller');
    assert.equal(JSON.parse(spawnRequests[0].body).idempotencyKey, 'spawn:runtime:gateway');
    assert.equal(spawnArgs.cwd, gatewayCwd);
    assert.equal(String(spawnArgs.task).split('Review gateway behavior.').length - 1, 1,
      'the adapter must serialize the assignment once');
    assert.match(String(spawnArgs.task), /return exactly ANNOUNCE_SKIP as your final response/u);
    const durableResult = String(spawnArgs.task).match(/atomically to (.+\.json)\./u)?.[1];
    assert.ok(durableResult);
    assert.equal(
      path.dirname(durableResult),
      path.join(gatewayCwd, 'results'),
    );
    assert.equal(received.filter((entry) => JSON.parse(entry.body).tool === 'subagents').length, 2);
    assert.equal(received.filter((entry) => JSON.parse(entry.body).tool === 'subagents')
      .every((entry) => JSON.parse(entry.body).idempotencyKey === undefined), true);
    assert.equal(received.filter((entry) => JSON.parse(entry.body).tool === 'sessions_history').length, 0);
    await assert.rejects(gatewayAdapters.invoke(
      'runtime.dispatch',
      attempt,
      'runtime:gateway-refused',
      {
        operation: 'dispatch',
        resource: { type: 'runtime.agent', canonicalId: 'gateway' },
        payload: { protocol: 'kubeclaw.review.v2', task: 'Trigger admission refusal.' },
      },
      new AbortController().signal,
    ), (error: unknown) => error instanceof Error
      && error.message.includes('OPENCLAW_SESSIONS_SPAWN_REJECTED:forbidden:subagents.maxChildrenPerAgent')
      && !error.message.includes('SESSION_KEY_INVALID'));
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
