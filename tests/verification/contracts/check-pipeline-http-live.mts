import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, loadPipelineTestScope, resolveTestPlan } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';
import { cleanupRealE2ERunWorkspace, createRealE2ERunWorkspace } from '../e2e/real-run-workspace.mjs';

if (process.env.KUBECLAW_HTTP_LIVE !== '1') throw new Error('KUBECLAW_HTTP_LIVE_REQUIRED');

const origin = process.env.KUBECLAW_HTTP_LIVE_ORIGIN;
if (!origin) throw new Error('KUBECLAW_HTTP_LIVE_ORIGIN_REQUIRED: supply an explicit in-cluster HTTP service');
const requestPath = process.env.KUBECLAW_HTTP_LIVE_PATH ?? '/v2/';
const target = new URL(requestPath, `${origin}/`);
assert.equal(target.hostname.endsWith('.svc.cluster.local'), true, 'live proof must use an in-cluster Service');

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'http-live',
} }));
const limits = { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 4, processes: 4 };
const workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
const scope = loadPipelineTestScope(path.join(workspace.swarmDir, 'pipeline.json'), { moduleId: null, gateId: 'final-buster' });
const generatedHealth = scope.declaration.tests?.health;
assert.equal(generatedHealth?.uses, 'kubeclaw.http@1');
const { inputs: _generatedInputs, ...generatedHealthWithoutInputs } = generatedHealth!;
const declaration = { tests: { 'in-cluster-service': { ...generatedHealthWithoutInputs, retries: 0,
  config: { ...generatedHealth?.config, url: origin, path: requestPath, expectedStatuses: [200], expectedText: '{}' } } } };
const plan = resolveTestPlan({ planId: 'plan:http:cluster-live', runId: `run:http:${Date.now()}`, project: scope.project,
  scope: { moduleId: null, gateId: 'final-buster' }, createdAt: new Date().toISOString(), declaration,
  suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits, maximumLimits: limits,
    maximumRetryCount: 2, maximumMatrixSize: 8, maximumNodes: 8, defaultConcurrencyLimit: 1,
    maximumConcurrencyLimits: { http: 8 } } });
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [], allowedHostSuffixes: ['.svc.cluster.local'],
  allowedPorts: [target.port ? Number(target.port) : 80], maximumResponseBytes: 1_048_576, maximumExecutionMs: 30_000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-http-cluster-live-'));
try {
  for (const directory of ['workspace/repository', 'artifacts', 'observability']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  const run = await new TestPlanRunner({ plan, registry, workspaceRoot: path.join(root, 'workspace'),
    repositoryRoot: path.join(root, 'workspace/repository'), artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    grants: new Map([['in-cluster-service', ['network.http']]]), capabilityInvoker: capability }).run();
  assert.equal(run.nodes[0]?.outcome, 'passed', JSON.stringify(run));
  assert.equal(run.attempts[0]?.providerDetails?.values.status, 200);
  assert.equal(run.attempts[0]?.providerDetails?.values.url, target.href);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  await cleanupRealE2ERunWorkspace(workspace);
}

process.stdout.write(`${JSON.stringify({ ok: true, phase: 'http-live', target: target.href,
  provider: 'kubeclaw.http@1', policy: 'production-in-cluster-service', mocks: 0, wrappers: 0 })}\n`);
