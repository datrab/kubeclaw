import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../skills/nova/core/src/index.ts';
import { temporary, packageRoot, limits } from './runner-contract-fixture.mts';
import { runnerExecutionPolicy } from './execution-policy.mts';
import { validateBusterExecutionSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';

export { temporary };
export function sessionOptions(name, providerPolicy, body) {
  const root = path.join(temporary, `session-policy-${name}`);
  const plugins = path.join(root, 'plugins');
  const target = path.join(plugins, 'provider');
  fs.cpSync(packageRoot, target, { recursive: true, dereference: true });
  const providerFile = path.join(target, 'dist/provider.js');
  const sourceFile = path.join(packageRoot, 'dist/provider.js');
  const physicalRoot = fs.realpathSync(root);
  const physicalProvider = fs.realpathSync(providerFile);
  const copied = fs.lstatSync(providerFile);
  const source = fs.statSync(sourceFile);
  assert(copied.isFile() && !copied.isSymbolicLink());
  assert(physicalProvider.startsWith(`${physicalRoot}${path.sep}`));
  assert.notEqual(physicalProvider, fs.realpathSync(sourceFile));
  assert(copied.dev !== source.dev || copied.ino !== source.ino, 'provider write must not alias original fixture');
  fs.writeFileSync(providerFile, `
    import fs from 'node:fs';
import assert from 'node:assert/strict';
    import v8 from 'node:v8';
    export function provider() { return { async execute(invocation, context) {
      ${body}
      return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: JSON.stringify(observed),
        counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
        evidenceFiles: [], reports: [], outputs: [], exitCode: 0, signal: null, providerDetails: null };
    }, async cleanup() {} }; }
  `);
  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:session-policy' }, now: () => new Date('2026-08-05T17:00:00Z') }));
  const plan = resolveTestPlan({ planId: `plan:${name}`, runId: `run:${name}`, project: 'session-policy',
    scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-05T17:00:00Z',
    declaration: { tests: { real: { uses: 'example.generic@1', retries: 0 } }, fixtures: {}, concurrencyLimits: {} },
    suiteTemplates: [], registry, facts: { changedPaths: ['src/app.ts'], moduleType: 'web', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 1000, maximumTimeoutMs: 10000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 3, maximumMatrixSize: 16, maximumNodes: 100, defaultConcurrencyLimit: 4,
      maximumConcurrencyLimits: { serial: 1 } } });
  const workspaceRoot = path.join(root, 'workspace');
  const repositoryRoot = path.join(workspaceRoot, 'repository');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
    provider: { ...runnerExecutionPolicy.provider, ...providerPolicy } });
  return { plan, registry, workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 }, executionPolicy };
}
