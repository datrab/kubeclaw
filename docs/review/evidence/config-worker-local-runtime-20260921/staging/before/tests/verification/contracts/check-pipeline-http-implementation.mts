import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'http-implementation',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.http@1');
assert.ok(entry);
assert.equal(entry.registration.kind, 'test');
assert.deepEqual(entry.registration.capabilities, ['network.http']);
assert.equal(entry.registration.retrySafe, true);
assert.equal(entry.registration.inputs[0]?.schemaId, 'kubeclaw.kubernetes-deployment-fixture@1');
assert.deepEqual(entry.registration.outputs, []);

const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/http.v1.json', 'utf8'));
const declaration: any = { suites: { web: { uses: 'kubeclaw.http-suite@1' } }, tests: {
  health: { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 2, concurrencyGroup: 'http',
    config: { url: 'http://127.0.0.1:3000', path: '/health', expectedStatuses: [200] } },
}, concurrencyLimits: { http: 4 } };
const limits = { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 4, processes: 4 };
const plan = resolveTestPlan({ planId: 'plan:http', runId: 'run:http', project: 'proof',
  scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-22T07:00:00.000Z', declaration,
  suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits, maximumLimits: limits,
    maximumRetryCount: 2, maximumMatrixSize: 8, maximumNodes: 8, defaultConcurrencyLimit: 1,
    maximumConcurrencyLimits: { http: 8 } } });
assert.equal(plan.nodes.length, 1);
assert.equal(plan.nodes[0].provider.contractId, 'kubeclaw.http@1');
assert.equal(plan.nodes[0].retryCount, 2);
assert.equal(plan.nodes[0].concurrencyGroup, 'http');

const server = http.createServer((_request, response) => {
  response.setHeader('content-type', 'text/plain');
  response.end('ready');
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('HTTP_IMPLEMENTATION_SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
try {
  const liveDeclaration: any = { tests: { health: { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 0,
    config: { url: origin, path: '/health', expectedStatuses: [200], expectedText: 'ready' } } } };
  const livePlan = resolveTestPlan({ planId: 'plan:http:live', runId: 'run:http:live', project: 'proof',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-22T07:00:00.000Z', declaration: liveDeclaration,
    suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 2, maximumMatrixSize: 8, maximumNodes: 8, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: { http: 8 } } });
  const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [address.port], maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 30_000 });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-http-implementation-'));
  for (const directory of ['workspace/repository', 'artifacts', 'observability']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  const run = await new TestPlanRunner({ plan: livePlan, registry, workspaceRoot: path.join(root, 'workspace'),
    repositoryRoot: path.join(root, 'workspace/repository'), artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    grants: new Map([['health', ['network.http']]]), capabilityInvoker: capability }).run();
  assert.equal(run.nodes[0].outcome, 'passed', JSON.stringify(run));
  assert.equal(run.attempts[0].providerDetails?.values.status, 200);
  fs.rmSync(root, { recursive: true, force: true });
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); }

console.log(JSON.stringify({ ok: true, phase: 'http-implementation', realHttp: true, capability: 'network.http', mocks: 0, wrappers: 0 }));
