import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fixtureDiagnosisAgent } from '../../../skills/buster/engine/test-gates/fixture-diagnosis-agent.ts';

const token = 'diagnosis-test-token-never-in-payload';
function config(endpoint: string, root: string) {
  return { targetId: 'fixture-diagnosis', tokenEnvironmentVariable: 'DIAGNOSIS_GATEWAY_TOKEN', timeoutMs: 1000,
    readOnlyPolicyReference: 'operator-policy:fixture-namespace-read-only',
    target: { endpoint, tokenSecret: 'diagnosis.gateway', runtime: 'subagent', agentId: 'fixture-diagnosis',
      agentRole: 'buster-diagnosis', model: 'openai/gpt-6.1-sol', cwd: root, repositoryRoot: root,
      resultPathPrefix: 'results', spawnIntervalMs: 0, pollMs: 10, maxPollMs: 10, maxPolls: 2 } };
}

test('operator diagnosis config is optional and rejects writable/non-dedicated targets and missing credentials', () => {
  assert.equal(fixtureDiagnosisAgent(undefined, {}), undefined);
  const valid = config('http://127.0.0.1:1234/tools/invoke', '/tmp');
  assert.ok(fixtureDiagnosisAgent(valid, { DIAGNOSIS_GATEWAY_TOKEN: token }));
  for (const candidate of [null, [], { ...valid, timeoutMs: 0 }, { ...valid, arbitrary: true },
    { ...valid, readOnlyPolicyReference: '' }, { ...valid, tokenEnvironmentVariable: 'bad-var' },
    { ...valid, target: { ...valid.target, runtime: 'acp' } },
    { ...valid, target: { ...valid.target, endpoint: 'http://external.example/tools/invoke' } },
    { ...valid, target: { ...valid.target, agentRole: 'forge' } },
    { ...valid, target: { ...valid.target, workspaceRoot: '/tmp' } },
    { ...valid, target: { ...valid.target, controllerSessionKey: 'agent:fixture-diagnosis:controller' } }]) {
    assert.throws(() => fixtureDiagnosisAgent(candidate, { DIAGNOSIS_GATEWAY_TOKEN: token }));
  }
  assert.throws(() => fixtureDiagnosisAgent(valid, {}), /TOKEN_MISSING/);
});

test('production bridge uses ordinary native terminal history without exposing credentials or writing results', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-agent-'));
  const requests: any[] = [];
  let spawned = false;
  const diagnosis = { status: 'diagnosed', component: 'postgresql', errorMessage: 'TLS key permissions are invalid.',
    cause: 'Incorrect projected file mode; password=private-diagnostic-canary.', evidence: ['postgres FATAL: invalid TLS key permissions'], nextStep: 'Correct file mode.' };
  const server = http.createServer(async (req, res) => {
    let bytes = ''; for await (const chunk of req) bytes += chunk;
    const request = JSON.parse(bytes); requests.push(request);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    let details: any;
    if (request.tool === 'subagents') details = { active: [], recent: spawned ? [{ runId: 'diagnosis-run',
      sessionKey: 'agent:fixture-diagnosis:child', status: 'done', model: 'openai/gpt-6.1-sol' }] : [] };
    else if (request.tool === 'sessions_spawn') { spawned = true; details = { status: 'accepted', runId: 'diagnosis-run',
      childSessionKey: 'agent:fixture-diagnosis:child', resolvedModel: 'openai/gpt-6.1-sol' }; }
    else if (request.tool === 'sessions_history') details = { sessionKey: 'agent:fixture-diagnosis:child', messages: [{
      role: 'assistant', __openclaw: { runTerminal: true, runId: 'diagnosis-run' },
      content: [{ type: 'text', text: JSON.stringify(diagnosis) }] }] };
    else { res.writeHead(500); res.end('{}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, toolName: request.tool, output: { content: [], details }, source: 'core' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}/tools/invoke`;
  try {
    const agent = fixtureDiagnosisAgent(config(endpoint, root), { DIAGNOSIS_GATEWAY_TOKEN: token })!;
    const result = await agent.diagnose({ namespace: 'test-namespace', leaseName: 'test-lease', errorCode: 'READINESS_TIMEOUT',
      failureEvidence: { pods: [] }, signal: AbortSignal.timeout(2000) });
    assert.equal((result as any).status, 'diagnosed');
    assert.equal((result as any).component, 'postgresql');
    assert.doesNotMatch(JSON.stringify(result), /private-diagnostic-canary/);
    assert.match((result as any).cause, /Incorrect projected file mode/);
    const spawn = requests.find(request => request.tool === 'sessions_spawn');
    assert.ok(spawn); assert.equal(spawn.args.agentId, 'fixture-diagnosis'); assert.equal(spawn.args.collect, false); assert.equal(spawn.args.expectsCompletionMessage, false);
    assert.ok(spawn.idempotencyKey); assert.doesNotMatch(spawn.args.task, new RegExp(token));
    assert.match(spawn.args.task, /namespace test-namespace/);
    assert.match(spawn.args.task, /Do not repair/);
    assert.equal(requests.filter(request => request.tool === 'sessions_spawn').length, 1);
    assert.ok(requests.some(request => request.tool === 'sessions_history'));
    assert.equal(requests.some(request => request.tool === 'agents_wait'), false);
    assert.doesNotMatch(spawn.args.task, /atomically to|Create the parent directory/);
    assert.equal(fs.existsSync(path.join(root, 'results')), false);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('production Helm target and persisted gateway reconciliation agree', async () => {
  const { execFileSync } = await import('node:child_process');
  const { parseAllDocuments } = await import('yaml');
  const rendered = execFileSync('helm', ['template', 'agent-buster', 'charts/kubeclaw', '-f',
    'my-values/buster-values.yaml', '--set', 'runtimeInfrastructure.registry.endpoint=http://registry.example:5000',
    '--set', 'runtimeInfrastructure.registry.transport=http-lab'], { encoding: 'utf8' });
  const documents = parseAllDocuments(rendered).map(document => document.toJSON());
  const desired = JSON.parse(documents.find(document => document?.data?.['openclaw.json']).data['openclaw.json']);
  assert.equal(desired.agents.ownership, 'explicit');
  const policy = desired.agents.entries['buster-diagnosis'].tools;
  assert.deepEqual(policy.allow, ['ops__namespace_overview', 'ops__get_pod', 'ops__get_events', 'ops__get_pod_logs']);
  assert.ok(policy.deny.includes('ops__exec_pod'));
  const deployment = documents.find(document => document?.kind === 'Deployment' && document.metadata.name === 'agent-buster');
  const environment = deployment.spec.template.spec.containers.find(container => container.name === 'buster-v2-runtime').env;
  const configuration = JSON.parse(environment.find(variable => variable.name === 'BUSTER_FIXTURE_FAILURE_DIAGNOSIS').value);
  assert.equal(configuration.target.agentId, 'buster-diagnosis');
  assert.ok(fixtureDiagnosisAgent(configuration, { BUSTER_DIAGNOSIS_GATEWAY_TOKEN: token }));
  assert.equal(environment.find(variable => variable.name === 'BUSTER_DIAGNOSIS_GATEWAY_TOKEN').valueFrom.secretKeyRef.key, 'gatewayToken-buster');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnosis-policy-'));
  try {
    const current = path.join(root, 'current.json'); const wanted = path.join(root, 'desired.json');
    fs.writeFileSync(current, JSON.stringify({ agents: { entries: { main: { skills: ['preserved'] } } } }));
    fs.writeFileSync(wanted, JSON.stringify(desired));
    execFileSync(process.execPath, ['charts/kubeclaw/files/sync-ops-mcp-config.mjs', current, wanted]);
    const reconciled = JSON.parse(fs.readFileSync(current, 'utf8'));
    assert.equal(reconciled.agents.ownership, 'explicit');
    assert.deepEqual(reconciled.agents.entries['buster-diagnosis'], desired.agents.entries['buster-diagnosis']);
    assert.deepEqual(reconciled.agents.entries.main, { skills: ['preserved'] });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('terminal-only history binds the exact native run and session, never reading or persisting a repository file', async () => {
  const { readOpenClawResult } = await import('../../../skills/common/plugins/runtime-dispatch/src/openclaw-result.ts');
  const target: any = { terminalOnly: true, endpoint: 'http://127.0.0.1/tools/invoke', repositoryRoot: '/must-not-exist' };
  const message = { role: 'assistant', __openclaw: { runTerminal: true, runId: 'owned-run' }, content: [{ type: 'text', text: '{"status":"inconclusive"}' }] };
  for (const history of [
    { sessionKey: 'foreign-session', messages: [message] },
    { sessionKey: 'owned-session', messages: [{ ...message, __openclaw: { runTerminal: true, runId: 'foreign-run' } }] },
    { sessionKey: 'owned-session', messages: [{ ...message, __openclaw: { runTerminal: false, runId: 'owned-run' } }] },
    { sessionKey: 'owned-session', messages: [message, message] },
  ]) {
    const context: any = { invokeConfidential: async (capability: string, request: any) => {
      assert.equal(capability, 'network.http'); assert.equal(request.payload.body.tool, 'sessions_history');
      return { status: 200, body: { ok: true, result: { details: history } } };
    } };
    await assert.rejects(readOpenClawResult(context, target, { payload: {}, relative: 'result.json', key: 'owned-session',
      runId: 'owned-run', token, startedAt: new Date().toISOString(), state: { terminal: true, state: 'done' } }), /IDENTITY_MISMATCH|TERMINAL_OUTPUT_AMBIGUOUS/);
  }
});

test('abort cancels the current native runId and confirms killed terminal state without a legacy taskId', async () => {
  const controller = new AbortController(); const requests: any[] = []; let spawned = false; let cancelled = false;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk; const request = JSON.parse(body); requests.push(request);
    let details: any;
    if (request.tool === 'sessions_spawn') {
      spawned = true; details = { status: 'accepted', runId: 'current-run', childSessionKey: 'agent:fixture-diagnosis:child', resolvedModel: 'openai/gpt-6.1-sol' };
      setTimeout(() => controller.abort(), 30);
    } else if (request.tool === 'subagents' && request.args.action === 'cancel') {
      assert.equal(request.args.runId, 'current-run'); assert.equal(request.args.taskId, undefined); cancelled = true; details = { found: true, killed: true };
    } else if (request.tool === 'subagents') {
      const entries = spawned ? [{ runId: 'current-run', sessionKey: 'agent:fixture-diagnosis:child', model: 'openai/gpt-6.1-sol', status: cancelled ? 'killed' : 'running' }] : [];
      details = { active: cancelled ? [] : entries, recent: cancelled ? entries : [] };
    } else { res.writeHead(500); res.end('{}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: { details } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as any).port}/tools/invoke`;
    const c = config(endpoint, '/must-not-exist'); c.target.maxPolls = 100;
    await assert.rejects(fixtureDiagnosisAgent(c, { DIAGNOSIS_GATEWAY_TOKEN: token })!.diagnose({ namespace: 'test-owned', leaseName: 'test-owned', errorCode: 'READINESS_TIMEOUT', failureEvidence: {}, signal: controller.signal }), /OPENCLAW_SESSION_TERMINAL_CONFIRMED:current-run/);
    assert.equal(requests.filter(request => request.tool === 'sessions_spawn').length, 1); assert.equal(cancelled, true);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
