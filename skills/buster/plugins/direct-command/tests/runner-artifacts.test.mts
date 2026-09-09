import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { TestPlanRunner } from '../../../engine/test-gates/runner.ts';
import { DirectCommandCapabilityInvoker } from '../../../engine/test-gates/direct-command-runtime.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-command-runner-artifacts-'));
const workspace = path.join(temporary, 'workspace');
const repository = path.join(workspace, 'repository');
fs.mkdirSync(repository, { recursive: true });
const plugins = path.resolve(import.meta.dirname, '../..');
const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
  trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'runner-artifacts',
} }));
const limits = { cpuMillis: 5000, memoryBytes: 512 * 1024 * 1024, logBytes: 65536, artifactBytes: 4096, artifactFiles: 16, processes: 8 };
const invoker = new DirectCommandCapabilityInvoker({ workspaceRoot: workspace,
  executableCatalog: new Map([['node', process.execPath]]), executableSearchPath: [path.dirname(process.execPath)],
  runtimeReadRoots: [path.dirname(process.execPath), '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'],
  maximumOutputBytes: 65536, maximumExecutionMs: 5000, maximumProcesses: 8,
  maximumMemoryBytes: limits.memoryBytes, maximumCpuMillis: 5000, terminationGraceMs: 50, allowSampledProcessLimit: true });
try {
  for (const [index, mediaType] of ['application/vnd.kubeclaw.checked-kubernetes-yaml', 'application/vnd.kubeclaw.size-budget-baseline+json'].entries()) {
    const plan = resolveTestPlan({ planId: `plan:runner-artifacts:${index}`, runId: `run:runner-artifacts:${index}`, project: 'runner-artifacts',
      scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-09T00:00:00Z',
      declaration: { tests: { command: { uses: 'kubeclaw.direct-command@1', retries: 0,
        config: { executable: 'node', args: ['-e', "require('node:fs').writeFileSync('first.bin','first');require('node:fs').writeFileSync('second.bin','second')"], resultMode: 'exit-code',
          artifacts: [{ id: 'first', path: 'first.bin', mediaType: 'application/octet-stream' }, { id: 'second', path: 'second.bin', mediaType }] } } } },
      suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'web', pipelineStage: 'test' },
      policy: { defaultTimeoutMs: 5000, maximumTimeoutMs: 5000, defaultLimits: limits, maximumLimits: limits,
        maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
    const artifactRoot = path.join(temporary, `artifacts-${index}`);
    const result = await new TestPlanRunner({ plan, registry, workspaceRoot: workspace, repositoryRoot: repository,
      artifactRoot, observabilityRoot: path.join(artifactRoot, 'observability'), maximumConcurrency: 1,
      grants: new Map([[plan.nodes[0]!.id, ['command.execute']]]), capabilityInvoker: invoker }).run();
    const diagnostics = result.attempts.flatMap((attempt) => attempt.evidence.filter((item) => item.type === 'log')
      .map((item) => fs.readFileSync(new URL(item.artifact.storageUrl), 'utf8'))).join('\n');
    assert.equal(result.attempts[0]?.executionState, 'completed', `${JSON.stringify(result.attempts)}\n${diagnostics}`);
    assert.equal(result.attempts[0]?.outcome, 'passed', JSON.stringify(result.attempts));
    const second = result.attempts[0]?.outputs.find((item) => item.name === 'artifact-2');
    assert(second?.kind === 'artifact');
    assert.equal(second.artifact.mediaType, mediaType);
  }
} finally { await invoker.shutdown(); fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, suite: 'direct-command-runner-artifacts', executor: 'native-command-runner' }));
