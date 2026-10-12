import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../skills/nova/core/src/index.ts';
import { runnerExecutionPolicy } from './execution-policy.mts';

export function schedulerRunnerOptions(root, capabilityInvoker) {
  const plugins = path.join(root, 'plugins');
  const packageRoot = path.join(plugins, 'scheduler-drain');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'scheduler-drain', type: 'module' }));
  fs.writeFileSync(path.join(packageRoot, 'schema.json'), JSON.stringify({ type: 'object', additionalProperties: false }));
  fs.writeFileSync(path.join(packageRoot, 'provider.js'), `
export function provider() { return {
  async execute(invocation, context) {
    await context.invoke('test.barrier', { nodeId: invocation.nodeId });
    return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'actual provider finished',
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
      evidenceFiles: [], reports: [], outputs: [], exitCode: 0, signal: null, providerDetails: null };
  },
  async cleanup(invocation, context) {
    await context.invoke('test.barrier', { nodeId: invocation.nodeId, cleanup: true });
  }
}; }
`);
  const registration = kind => ({ id: kind, contractId: 'test.scheduler-' + kind + '@1', kind,
    module: 'provider.js', export: 'provider', configSchema: 'schema.json', inputs: [], outputs: [],
    requiredCapabilities: ['test.barrier'], retrySafe: true, matrixFields: [], reportFormats: [], evidenceTypes: [],
    evidenceDefaults: { onPass: [], onFail: [], onError: [] } });
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({ id: 'test.scheduler-drain',
    apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', stages: [], observers: [], adapters: [],
    testProviders: [registration('test'), registration('fixture')] }));
  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:scheduler-drain' } }));
  const limits = { cpuMillis: 10000, memoryBytes: 512 * 1024 * 1024, logBytes: 1048576,
    artifactBytes: 16777216, artifactFiles: 16, processes: 16 };
  const plan = resolveTestPlan({ planId: 'plan:scheduler-drain', runId: 'run:scheduler-drain', project: 'scheduler-proof',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-21T00:00:00.000Z',
    declaration: { tests: { a: { uses: 'test.scheduler-test@1', mode: 'blocking', retries: 0 },
      c: { uses: 'test.scheduler-test@1', mode: 'blocking', retries: 0 } },
      fixtures: { b: { uses: 'test.scheduler-fixture@1', retries: 0 } }, concurrencyLimits: {} },
    suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 10000, maximumTimeoutMs: 10000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 3, defaultConcurrencyLimit: 2,
      maximumConcurrencyLimits: {} } });
  const workspaceRoot = path.join(root, 'workspace');
  const repositoryRoot = path.join(workspaceRoot, 'repository');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  return { plan, registry, workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 2, executionPolicy: runnerExecutionPolicy,
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
    grants: new Map(['a', 'b', 'c'].map(id => [id, ['test.barrier']])), capabilityInvoker };
}
