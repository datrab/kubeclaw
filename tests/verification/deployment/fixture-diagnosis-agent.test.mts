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

test('production bridge uses shared session dispatch and collector result without exposing gateway token', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-agent-'));
  const requests: any[] = [];
  const diagnosis = { status: 'diagnosed', component: 'postgresql', errorMessage: 'TLS key permissions are invalid.',
    cause: 'Incorrect projected file mode; password=private-diagnostic-canary.', evidence: ['postgres FATAL: invalid TLS key permissions'], nextStep: 'Correct file mode.' };
  const server = http.createServer(async (req, res) => {
    let bytes = ''; for await (const chunk of req) bytes += chunk;
    const request = JSON.parse(bytes); requests.push(request);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    let details: any;
    if (request.tool === 'subagents') details = { tasks: [], active: [], recent: [] };
    else if (request.tool === 'sessions_spawn') details = { status: 'accepted', runId: 'diagnosis-run',
      childSessionKey: 'agent:fixture-diagnosis:child', resolvedModel: 'openai/gpt-6.1-sol' };
    else if (request.tool === 'agents_wait') details = { completed: [{ runId: 'diagnosis-run', status: 'done',
      sessionKey: 'agent:fixture-diagnosis:child', structured: diagnosis, result: JSON.stringify(diagnosis) }], pending: [] };
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
    assert.ok(spawn); assert.equal(spawn.args.agentId, 'fixture-diagnosis'); assert.equal(spawn.args.collect, true);
    assert.ok(spawn.idempotencyKey); assert.doesNotMatch(spawn.args.task, new RegExp(token));
    assert.match(spawn.args.task, /namespace test-namespace/);
    assert.match(spawn.args.task, /Do not repair/);
    assert.equal(requests.filter(request => request.tool === 'sessions_spawn').length, 1);
    assert.ok(requests.some(request => request.tool === 'agents_wait'));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
