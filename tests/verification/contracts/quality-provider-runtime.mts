import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import * as core from '@kubeclaw/nova-core';
import { resolvedTestPlanDigest, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';

/** Actual core, remote adapter, Buster service, isolated assertion and artifact store.
 * The local evaluator executes a source assertion; this does not claim LLM quality.
 */
export async function verifyQualityProviderRuntime(options: {
  repository: string; stateRoot: string; endpoint: string; token: string;
  privateKey: string; plan: ResolvedTestPlanV1; revision: string; expected: 'passed' | 'request_fix';
}) {
  // These are independent executions, not a replay of one logical attempt.
  // Reusing run/stage/attempt while changing source correctly causes a conflict.
  const runId = `${options.plan.runId}:quality:${options.expected}`;
  const { planDigest: _originalDigest, ...original } = options.plan;
  const unsigned = { ...original, runId };
  const plan = { ...unsigned, planDigest: resolvedTestPlanDigest(unsigned) };
  const repository = path.resolve('.');
  const temporary = options.repository;
  const endpoint = options.endpoint;
  const token = options.token;
  const secret = 'KUBECLAW_QUALITY_REAL_TOKEN';
  const sourceKeyEnvironment = 'KUBECLAW_QUALITY_REAL_SOURCE_KEY';
  process.env[secret] = token;
  process.env[sourceKeyEnvironment] = options.privateKey;
  let dispatches = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      dispatches += 1;
      try {
        const payload = JSON.parse(body);
        assert.equal(payload.identity.runId, runId);
        assert.equal(payload.identity.attempt, 1);
        assert.ok(payload.suiteEvidence.length > 1);
        assert.ok(payload.suiteEvidence.every((item: { passed: boolean }) => item.passed));
        assert.equal(fs.readFileSync(path.join(temporary, 'README.md'), 'utf8'), 'phase-7 real remote provider\n');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ result: { outcome: 'passed', summary: 'Source assertion and imported checks passed.', failureClass: 'none', findings: [] } }));
      } catch (error) {
        response.writeHead(500);
        response.end(String(error));
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('LISTEN_FAILED');
  const origin = `http://127.0.0.1:${address.port}`;
  const roots = ['common', 'nova'].map(role => path.join(repository, `skills/${role}/plugins`));
  fs.mkdirSync(options.stateRoot, { recursive: true });
  try {
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots,
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:buster-quality',
    },
    now: () => new Date('2026-09-06T00:00:00Z'),
  }));
  const enabled = new Set(['kubeclaw.buster-quality-gate:quality', 'kubeclaw.preflight-contract:validate']);
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: enabled,
    providers: new Map([
      ['test.plan.execute', 'kubeclaw.remote-test-gate:plan'],
      ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
      ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.preflight-contract:validate', new Map([
        ['git.repository.read', { allowedPrefixes: ['module/'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.preflight-contract'] }],
      ])],
      ['kubeclaw.buster-quality-gate:quality', new Map([
        ['test.plan.execute', { allowedRoots: [temporary] }],
        ['artifacts.read', { allowedNamespaces: ['kubeclaw.implementation-agent'] }],
        ['runtime.dispatch', { allowedAgents: ['gate'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.buster-quality-gate'] }],
      ])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['gate.agent'] }],
      ])],
      ['kubeclaw.remote-test-gate:plan', new Map([
        ['secrets.read', { allowedNames: ['buster.worker', 'buster.source-private-key'] }],
      ])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effectsPath = path.join(options.stateRoot, 'effects.jsonl');
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.repository-adapter:repository', { repositoryRoot: temporary }],
      ['kubeclaw.runtime-dispatch:runtime', {
        targets: { gate: { endpoint: `${origin}/dispatch`, tokenSecret: 'gate.agent' } },
      }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin],
        allowedMethods: ['POST', 'GET', 'DELETE'],
        allowedHeaders: [
          'authorization',
          'content-type',
          'idempotency-key',
          'x-kubeclaw-signature',
        ],
      }],
      ['kubeclaw.secret-resolver:secrets', {
        environment: { 'gate.agent': secret, 'buster.worker': secret,
          'buster.source-private-key': sourceKeyEnvironment },
      }],
      ['kubeclaw.artifact-store:artifact-store', {
        artifactRoot: path.join(options.stateRoot, 'artifacts'),
      }],
      ['kubeclaw.remote-test-gate:plan', {
        endpoint: endpoint,
        authentication: 'bearer',
        tokenSecret: 'buster.worker',
        sourcePrivateKeySecret: 'buster.source-private-key',
        sourceAuthority: 'nova:production',
        stateRoot: path.join(options.stateRoot, 'provider-state'),
        allowedRepositoryRoots: [temporary],
      }],
    ]),
    effects: new core.EffectCoordinator(
      new core.FileEffectJournal(effectsPath),
      undefined,
      undefined,
      new core.MemoryResourceLockManager(),
    ),
    shutdownTimeoutMs: 1_000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2', id: 'quality-real-provider', maxConcurrency: 1,
        stages: [{ id: 'preflight', type: 'kubeclaw.validate.preflight-contract', dependsOn: [], config: {},
          input: { moduleId: 'module', modulePath: 'module', ownedPaths: ['README.md'], serveDockerfile: 'README.md', apiSpecFile: null },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 } },
        { id: 'quality', type: 'kubeclaw.test.quality-evaluation', dependsOn: ['preflight'], on: { request_fix: 'preflight' },
          config: { agent: 'gate' }, input: { gateId: 'quality', task: 'Evaluate verified source checks.',
            providerPlan: { repositoryRoot: temporary, repositoryId: 'repository:phase7-real',
              plan, grants: { 'real-provider': [] }, maximumConcurrency: 1,
              submittedAt: options.plan.createdAt, timeoutMs: 30000, revision: options.revision } },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 45000 } }],
      }, registry: granted, activated, adapters,
      orchestratorIssuerId: 'quality-proof',
      journal: new core.FileJournal(path.join(options.stateRoot, 'events.jsonl')),
    });
    const result = await runner.run(runId);
    const events = fs.readFileSync(path.join(options.stateRoot, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).entry);
    const completed = events.filter(event => event.type === 'attempt.completed');
    assert.equal(result.status, options.expected === 'passed' ? 'succeeded' : 'blocked', JSON.stringify({ states: [...result.stages], completed }));
    assert.equal(completed.at(-1)?.payload.result?.outcome, options.expected, JSON.stringify({ result, completed }));
    assert.equal(dispatches, options.expected === 'passed' ? 1 : 0, 'failed provider must never reach evaluator');
    const artifacts = fs.readFileSync(path.join(options.stateRoot, 'artifacts', 'records', 'store.json'), 'utf8');
    assert.match(artifacts, /buster-quality:quality:decision:1/);
    assert.equal(fs.readFileSync(effectsPath, 'utf8').includes(token), false);
  } finally { await adapters.shutdown(); }
  } finally {
    delete process.env[secret]; delete process.env[sourceKeyEnvironment];
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
