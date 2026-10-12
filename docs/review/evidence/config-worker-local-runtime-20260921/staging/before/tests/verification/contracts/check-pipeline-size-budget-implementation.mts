import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { DirectCommandCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'size-budget-implementation-'));
const workspace = path.join(temporary, 'workspace');
const repository = path.join(workspace, 'repository-source');
const artifacts = path.join(temporary, 'artifacts');

try {
  fs.mkdirSync(path.join(repository, 'dist', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'dist', 'index.html'), 'x'.repeat(100));
  fs.writeFileSync(path.join(repository, 'dist', 'assets', 'app.js'), 'y'.repeat(300));
  fs.writeFileSync(path.join(repository, 'dist', 'assets', 'style.css'), 'z'.repeat(200));
  fs.mkdirSync(workspace, { recursive: true });
  const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'size-budget-implementation' } }));
  const entry = registry.testProviderContracts.get('kubeclaw.size-budget@1');
  assert.ok(entry); assert.deepEqual(entry.registration.capabilities, []);
  assert.equal(entry.registration.inputs.find((item) => item.name === 'build-output')?.required, true);
  assert.equal(entry.registration.outputs.find((item) => item.name === 'baseline')?.required, true);
  const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/size-budget.v1.json', 'utf8'));
  const declaration: any = { suites: { size: { uses: 'kubeclaw.size-budget-suite@1', add: {
    artifact: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0, concurrencyGroup: 'size-budget',
      config: { executable: 'tar', args: ['--format=ustar', '-cf', 'build-output.tar', '-C', 'dist', 'assets', 'index.html'],
        workingDirectory: '.', resultMode: 'exit-code', artifacts: [
          { id: 'build-output', path: 'build-output.tar', mediaType: 'application/vnd.kubeclaw.build-output.tar' },
        ] } },
    budget: { uses: 'kubeclaw.size-budget@1', mode: 'blocking', retries: 0, concurrencyGroup: 'size-budget',
      config: { maximumTotalBytes: 600, maximumFileCount: 3, matchingFiles: [
        { id: 'javascript', pattern: 'assets/**/*.js', maximumBytes: 300 },
      ], largestFiles: 5 }, inputs: { 'build-output': { from: 'artifact', output: 'artifact-1' } } },
  } } }, concurrencyLimits: { 'size-budget': 2 } };
  const limits = { cpuMillis: 30_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
    artifactBytes: 8 * 1024 * 1024, artifactFiles: 16, processes: 16 };
  const plan = resolveTestPlan({ planId: 'plan:size-budget', runId: 'run:size-budget', project: 'proof',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-21T05:00:00.000Z', declaration,
    suiteTemplates: [suite], registry, facts: { changedPaths: ['dist/index.html'], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8, defaultConcurrencyLimit: 2,
      maximumConcurrencyLimits: { 'size-budget': 4 } } });
  assert.deepEqual(plan.nodes.map((node) => node.id), ['size/artifact', 'size/budget']);
  assert.equal(plan.links[0]?.from.nodeId, 'size/artifact'); assert.equal(plan.links[0]?.to.nodeId, 'size/budget');
  const examplePolicy = { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits,
    maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
    defaultConcurrencyLimit: 2, maximumConcurrencyLimits: { 'size-budget': 4 } };
  const resolveExample = (file: string, suffix: string) => resolveTestPlan({ planId: `plan:example:${suffix}`,
    runId: `run:example:${suffix}`, project: 'proof', scope: { moduleId: 'app', gateId: null },
    createdAt: '2026-08-21T05:00:00.000Z', declaration: JSON.parse(fs.readFileSync(file, 'utf8')),
    suiteTemplates: [suite], registry, facts: { changedPaths: ['dist/index.html'], moduleType: 'service',
      pipelineStage: 'test' }, policy: examplePolicy });
  const tarExample = resolveExample('contracts/pipeline-test-gate/v1/examples/size-budget-tar.json', 'tar');
  assert.deepEqual(tarExample.nodes.map((node) => node.id), ['size-budget/build-artifact', 'size-budget/web-assets']);
  const growthExample = resolveExample('contracts/pipeline-test-gate/v1/examples/size-budget-growth.json', 'growth');
  assert.deepEqual(growthExample.nodes.map((node) => node.id),
    ['size-budget-growth/baseline-artifact', 'size-budget-growth/build-artifact', 'size-budget-growth/growth']);
  assert.equal(growthExample.links.length, 2);
  const capability = new DirectCommandCapabilityInvoker({ workspaceRoot: workspace,
    executableCatalog: new Map([['tar', '/usr/bin/tar']]), executableSearchPath: ['/usr/bin'],
    runtimeReadRoots: ['/usr/bin', '/usr/lib/x86_64-linux-gnu', '/usr/lib64'], maximumOutputBytes: 1024 * 1024,
    maximumExecutionMs: 60_000, maximumProcesses: 16, maximumMemoryBytes: 512 * 1024 * 1024,
    maximumCpuMillis: 30_000, terminationGraceMs: 100, allowSampledProcessLimit: true });
  const runner = new TestPlanRunner({ plan, registry, workspaceRoot: workspace, repositoryRoot: repository,
    artifactRoot: artifacts, observabilityRoot: path.join(temporary, 'observability'), maximumConcurrency: 2,
    grants: new Map(plan.nodes.map((node) => [node.id, node.id.endsWith('/artifact') ? ['command.execute'] : []])),
    capabilityInvoker: capability });
  const result = await runner.run();
  assert.deepEqual(result.nodes.map((node) => node.outcome), ['passed', 'passed'], JSON.stringify(result));
  const budget = result.attempts.find((attempt) => attempt.nodeId === 'size/budget'); assert.ok(budget);
  assert.equal(budget.providerDetails?.values.totalBytes, 600);
  assert.equal(budget.providerDetails?.values.fileCount, 3);
  assert.equal(budget.outputs[0]?.name, 'baseline');
  const producer = result.attempts.find((attempt) => attempt.nodeId === 'size/artifact'); assert.ok(producer);
  assert.equal(producer.outputs[0]?.name, 'artifact-1');
  assert.equal(producer.outputs[0]?.kind, 'artifact');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, phase: 'size-budget-implementation', boundary: 'real-contained',
  realComponents: ['tar', 'provider-process', 'command-sandbox', 'typed-artifact-link', 'runner'], mocks: 0 }));
