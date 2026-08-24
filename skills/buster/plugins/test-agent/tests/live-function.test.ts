import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/nova/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-test-agent-'));
fs.writeFileSync(path.join(temporary, 'fixture.txt'), 'fixture\n');
fs.mkdirSync(path.join(temporary, 'dist'));
fs.writeFileSync(path.join(temporary, 'dist', 'index.js'), 'export const fixture = true;\n');
execFileSync('git', ['init', '-q'], { cwd: temporary });
execFileSync('git', ['config', 'user.name', 'KubeClaw Test'], { cwd: temporary });
execFileSync('git', ['config', 'user.email', 'test@kubeclaw.invalid'], { cwd: temporary });
execFileSync('git', ['add', '.'], { cwd: temporary });
execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: temporary });
const transcript = 'start buster\nexecute security\ncollect exit=0\njudge PASS\nterminate\n';
const transcriptDigest = crypto.createHash('sha256').update(transcript).digest('hex');
const server = http.createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    const payload = body ? JSON.parse(body) : {};
    if (request.method === 'POST' && request.url === '/v2/jobs') {
      response.writeHead(202, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jobId: payload.jobId, state: 'accepted' }));
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/v2/jobs/')) {
      const jobId = request.url.slice('/v2/jobs/'.length);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        schemaVersion: 'buster-suite-status.v2',
        jobId,
        state: 'completed',
        result: {
          schemaVersion: 'buster-suite-result.v2',
          jobId,
          results: [{ suite: 'security', status: 'PASS' }],
          suiteSummary: 'security passed',
          suiteDetailSummary: 'security passed',
          criticalFailed: false,
          completedAt: '2026-07-28T00:00:00.000Z',
        },
      }));
      return;
    }
    assert.equal(request.url, '/dispatch');
    assert.equal(payload.suiteEvidence.some((suite) => suite.suite === 'real-unit' && suite.passed === true), true);
    assert.equal(payload.suiteEvidence.some((suite) => suite.suite === 'security' && suite.passed === true), true);
    fs.writeFileSync(path.join(temporary, 'transcript.log'), transcript);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ result: {
      verdict: 'PASS',
      summary: 'All supplied suites passed.',
      findings: [],
      session: {
        sessionId: 'session:buster:run-1:task-1:1',
        startedAt: '2026-07-28T00:00:00.000Z',
        completedAt: '2026-07-28T00:00:01.000Z',
        transcriptDigest,
        termination: 'completed',
      },
    } }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secret = 'KUBECLAW_TEST_AGENT_TOKEN';
const token = `test-${'a'.repeat(48)}`;
process.env[secret] = token;
const nodeExecutable = fs.realpathSync(process.execPath);
const roots = ['common', 'nova', 'buster'].map((role) => path.join(repository, `skills/${role}/plugins`));

try {
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots,
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:test-agent',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  const enabled = new Set(['kubeclaw.test-agent:test']);
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: enabled,
    providers: new Map([
      ['command.execute', 'kubeclaw.command-runner:command'],
      ['test.suite.execute', 'kubeclaw.buster-suite-runtime:suite'],
      ['test.plan.execute', 'kubeclaw.remote-test-gate:plan'],
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.test-agent:test', new Map([
        ['command.execute', { allowedExecutables: [nodeExecutable], allowedWorkingRoots: [temporary] }],
        ['test.suite.execute', { allowedSuites: ['security'], allowedRoots: [temporary] }],
        ['test.plan.execute', { allowedRoots: [temporary] }],
        ['runtime.dispatch', { allowedAgents: ['buster'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.test-agent'] }],
      ])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['buster.agent'] }],
      ])],
      ['kubeclaw.buster-suite-runtime:suite', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['buster.worker'] }],
      ])],
      ['kubeclaw.remote-test-gate:plan', new Map([
        ['secrets.read', { allowedNames: ['buster.worker', 'buster.source-private-key'] }],
      ])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsPath = path.join(temporary, 'effects.jsonl');
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.command-runner:command', {
        allowedExecutables: [nodeExecutable],
        allowedWorkingRoots: [temporary],
        maxOutputBytes: 65_536,
        maxExecutionMs: 5_000,
        terminationGraceMs: 100,
      }],
      ['kubeclaw.buster-suite-runtime:suite', {
        endpoint: origin,
        tokenSecret: 'buster.worker',
        allowedRepositoryRoots: [temporary],
        unmigratedSuites: ['security'],
        suiteCapabilities: ['image_build'],
        gitExecutable: fs.realpathSync(execFileSync('sh', ['-lc', 'command -v git'], { encoding: 'utf8' }).trim()),
        maxArchiveBytes: 8_388_608,
        maxSuiteTimeoutMs: 5_000,
        pollMs: 100,
      }],
      ['kubeclaw.remote-test-gate:plan', {
        endpoint: origin,
        tokenSecret: 'buster.worker',
        sourcePrivateKeySecret: 'buster.source-private-key',
        sourceAuthority: 'nova:production',
        stateRoot: path.join(temporary, 'provider-state'),
        allowedRepositoryRoots: [temporary],
        legacyLedgerPath: path.join(repository, 'contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'),
      }],
      ['kubeclaw.runtime-dispatch:runtime', { targets: { buster: { endpoint: `${origin}/dispatch`, tokenSecret: 'buster.agent' } } }],
      ['kubeclaw.network-http:http', { allowedOrigins: [origin], allowedMethods: ['POST', 'GET', 'DELETE'], allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-kubeclaw-signature'] }],
      ['kubeclaw.secret-resolver:secrets', { environment: { 'buster.agent': secret, 'buster.worker': secret,
        'buster.source-private-key': secret } }],
      ['kubeclaw.artifact-store:artifact-store', { artifactRoot: path.join(temporary, 'artifacts') }],
    ]),
    effects: new core.EffectCoordinator(new core.FileEffectJournal(effectsPath), undefined, undefined, new core.MemoryResourceLockManager()),
    shutdownTimeoutMs: 1_000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: 'pipeline:test-agent',
        maxConcurrency: 1,
        stages: [{
          id: 'test',
          type: 'kubeclaw.test.execution',
          dependsOn: [],
          config: { agent: 'buster' },
          input: {
            runId: 'run-1',
            taskId: 'task-1',
            attempt: 1,
            task: 'Assess.',
            suiteEvidence: [],
            suitePlan: {
              repositoryRoot: temporary,
              suites: ['security'],
              testConfig: { suite_timeout_ms: 5_000,
                serve: { type: 'local', port: address.port },
                security: { paths: ['/'] } },
              task: {},
            },
            commandSuites: [{
              suite: 'real-unit',
              executable: nodeExecutable,
              args: ['-e', 'process.stdout.write("unit ok")'],
              workingDirectory: temporary,
            }],
          },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5_000 },
        }],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(path.join(temporary, 'events.jsonl')),
    });
    assert.equal((await runner.run('run:test-agent')).status, 'succeeded');
    assert.match(fs.readFileSync(path.join(temporary, 'artifacts', 'records', 'store.json'), 'utf8'), /test-verdict:task-1:1/u);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(temporary, 'transcript.log'))).digest('hex'), transcriptDigest);
    assert.equal(fs.readFileSync(effectsPath, 'utf8').includes(token), false);
  } finally {
    await adapters.shutdown();
  }
} finally {
  delete process.env[secret];
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.test-agent', suite: 'live-function' }));
