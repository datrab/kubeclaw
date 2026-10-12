import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateBusterExecutionSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { TestPlanRunner, type TestPlanRunnerOptions } from '../../../skills/buster/engine/test-gates/runner.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { temporary, workspace, repository, registry, plan } from '../../fixtures/test-gate/runner-contract-fixture.mts';

function leaves(value: Record<string, unknown>, prefix: string[] = []): string[][] {
  return Object.entries(value).flatMap(([key, child]) => child !== null && typeof child === 'object'
    ? leaves(child as Record<string, unknown>, [...prefix, key]) : [[...prefix, key]]);
}
function changed(keys: readonly string[], value: unknown): unknown {
  const candidate = structuredClone(runnerExecutionPolicy) as unknown as Record<string, unknown>;
  let parent = candidate;
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  const final = keys.at(-1)!;
  if (value === undefined) delete parent[final]; else parent[final] = value;
  return candidate;
}

for (const keys of leaves(runnerExecutionPolicy as unknown as Record<string, unknown>)) {
  test(`execution policy requires actual numeric owner ${keys.join('.')}`, () => {
    for (const value of [undefined, null, false, true, '1', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => validateBusterExecutionSettings(changed(keys, value)), /SWARM_CONFIG_BUSTER_EXECUTION/,
        `${keys.join('.')}=${String(value)}`);
    }
  });
}

test('validated execution snapshot is immutable and caller changes do not change it', () => {
  const authored = { ...structuredClone(runnerExecutionPolicy), provider: { ...runnerExecutionPolicy.provider } };
  const snapshot = validateBusterExecutionSettings(authored);
  authored.provider.cleanupTimeoutMs += 1;
  assert.equal(snapshot.provider.cleanupTimeoutMs, runnerExecutionPolicy.provider.cleanupTimeoutMs);
  for (const value of [snapshot, snapshot.provider, snapshot.reports, snapshot.observation,
    snapshot.stores, snapshot.stores.attempts, snapshot.stores.admission]) assert.equal(Object.isFrozen(value), true);
});

function options(name: string): TestPlanRunnerOptions {
  const root = path.join(temporary, `execution-policy-${name}`);
  return { plan: plan({ real: { uses: 'example.generic@1', retries: 0 } }), registry,
    workspaceRoot: workspace, repositoryRoot: repository, artifactRoot: path.join(root, 'artifacts'),
    observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
    workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
    executionPolicy: runnerExecutionPolicy };
}

test('real Runner rejects missing policy and equal retired authors before creating paths', () => {
  for (const [name, change, code] of [
    ['missing', { executionPolicy: undefined }, /SWARM_CONFIG_BUSTER_EXECUTION_INVALID/],
    ['equal-cleanup', { cleanupTimeoutMs: runnerExecutionPolicy.provider.cleanupTimeoutMs }, /TEST_RUNNER_LEGACY_POLICY:cleanupTimeoutMs/],
    ['equal-result', { maximumProviderResultBytes: runnerExecutionPolicy.provider.maximumResultBytes }, /TEST_RUNNER_LEGACY_POLICY:maximumProviderResultBytes/],
  ] as const) {
    const selected = options(name);
    const missingRoot = path.join(temporary, `not-created-${name}`);
    const candidate = { ...selected, workspaceRoot: missingRoot, ...change };
    assert.equal(fs.existsSync(missingRoot), false);
    assert.throws(() => new TestPlanRunner(candidate as unknown as TestPlanRunnerOptions), code);
    assert.equal(fs.existsSync(missingRoot), false);
    assert.equal(fs.existsSync(selected.artifactRoot), false);
    assert.equal(fs.existsSync(selected.observabilityRoot), false);
  }
});

for (const maximumResultBytes of [100, 4096]) {
  test(`real default provider consumes selected result capacity ${maximumResultBytes}`, { timeout: 30000 }, async () => {
    const selected = options(`provider-${maximumResultBytes}`);
    const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
      provider: { ...runnerExecutionPolicy.provider, maximumResultBytes } });
    const result = await new TestPlanRunner({ ...selected, executionPolicy }).run();
    assert.equal(result.attempts.length, 1);
    const attempt = result.attempts[0]!;
    if (maximumResultBytes === 100) {
      assert.equal(attempt.executionState, 'errored');
      assert.match(attempt.summary ?? '', /TEST_PROVIDER_RESULT_LIMIT/);
    } else {
      assert.equal(attempt.executionState, 'completed');
      assert.equal(attempt.outcome, 'passed');
      assert.equal(attempt.summary, 'dependency loaded');
    }
    const durable = JSON.parse(fs.readFileSync(path.join(selected.observabilityRoot, 'attempts', 'attempt-store.json'), 'utf8'));
    assert(durable.results.some((row: { result: { attemptId: string } }) => row.result.attemptId === attempt.attemptId));
  });
}

for (const maximumAggregateResultBytes of [100, 4096]) {
  test(`actual registered report adapter consumes aggregate budget ${maximumAggregateResultBytes}`, { timeout: 30000 }, async () => {
    const selected = options(`report-${maximumAggregateResultBytes}`);
    const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
      reports: { ...runnerExecutionPolicy.reports, maximumAggregateResultBytes,
        maximumSourceBytes: 4096, memoryBytes: 128 * 1024 * 1024 } });
    const result = await new TestPlanRunner({ ...selected, executionPolicy,
      plan: plan({}, { isolatedProducer: { uses: 'example.report@1', retries: 0 } }) }).run();
    const attempt = result.attempts[0]!;
    assert.equal(attempt.nodeId, 'isolatedProducer');
    const source = attempt.evidence.find(item => item.evidenceId === 'junit');
    assert(source, 'real provider report source remains retained even if report output is rejected');
    assert.match(fs.readFileSync(new URL(source.artifact.storageUrl), 'utf8'), /<testsuite tests="1"\/>/);
    if (maximumAggregateResultBytes === 100) {
      assert.equal(attempt.executionState, 'errored');
      assert.match(attempt.summary ?? '', /REPORT_ADAPTER_RESULT_LIMIT/);
    } else {
      assert.equal(attempt.executionState, 'completed');
      assert.equal(attempt.reports.length, 1);
      assert.equal(attempt.reports[0]!.sourceArtifact.contentDigest, source.artifact.contentDigest);
      assert.equal(attempt.reports[0]!.sourceArtifact.sizeBytes, source.artifact.sizeBytes);
      assert.equal(fs.readFileSync(new URL(attempt.reports[0]!.sourceArtifact.storageUrl), 'utf8'),
        fs.readFileSync(new URL(source.artifact.storageUrl), 'utf8'));
      assert.deepEqual(attempt.reports[0]!.counts, { total: 1, passed: 0, failed: 1, errored: 0, skipped: 0 });
    }
  });
}

for (const maximumResults of [1, 2]) {
  test(`real durable result quota consumes selected ${maximumResults}`, { timeout: 30000 }, async () => {
    const selected = options(`store-${maximumResults}`);
    const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
      stores: { ...runnerExecutionPolicy.stores,
        attempts: { ...runnerExecutionPolicy.stores.attempts, maximumResults } } });
    const result = await new TestPlanRunner({ ...selected, executionPolicy,
      plan: plan({ first: { uses: 'example.generic@1', retries: 0 }, second: { uses: 'example.generic@1', retries: 0 } }) }).run();
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts.find(attempt => attempt.nodeId === 'first')!.outcome, 'passed');
    const second = result.attempts.find(attempt => attempt.nodeId === 'second')!;
    if (maximumResults === 1) {
      assert.equal(second.executionState, 'errored');
      assert.match(second.summary ?? '', /OBSERVABILITY_RESULT_STORE_FULL/);
    } else assert.equal(second.outcome, 'passed');
    const stored = JSON.parse(fs.readFileSync(path.join(selected.observabilityRoot, 'attempts', 'attempt-store.json'), 'utf8'));
    assert.equal(stored.results.length, maximumResults);
  });
}

for (const maximumRecords of [1, 2]) {
  test(`admission quota ${maximumRecords} retains both results and bounds completed admission`, { timeout: 30000 }, async () => {
    const selected = options(`admission-${maximumRecords}`);
    const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
      stores: { ...runnerExecutionPolicy.stores,
        admission: { ...runnerExecutionPolicy.stores.admission, maximumRecords } } });
    const result = await new TestPlanRunner({ ...selected, executionPolicy,
      plan: plan({ first: { uses: 'example.generic@1', retries: 0 }, second: { uses: 'example.generic@1', retries: 0 } }) }).run();
    assert.equal(result.attempts.length, 2);
    assert(result.attempts.every(attempt => attempt.outcome === 'passed'));
    const stored = JSON.parse(fs.readFileSync(path.join(selected.observabilityRoot, 'attempts', 'attempt-store.json'), 'utf8'));
    const admission = JSON.parse(fs.readFileSync(path.join(selected.observabilityRoot, 'admission', 'admission.json'), 'utf8'));
    assert.equal(stored.results.length, 2);
    assert.equal(stored.closures.length, maximumRecords);
    assert.equal(admission.entries.length, maximumRecords);
    assert(stored.results.every((row: { completionIntent: unknown }) => row.completionIntent !== null));
  });
}

for (const field of ['queueTimeoutMs', 'claimGraceMs'] as const) {
  for (const value of [50, 5000]) {
    test(`actual Core admission consumes ${field}=${value}`, { timeout: 30000 }, async () => {
      const selected = options(`${field}-${value}`);
      const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
        provider: { ...runnerExecutionPolicy.provider, queueTimeoutMs: 5000, claimGraceMs: 5000, [field]: value } });
      // Controlled time is the only model here: real default Core, operation, provider and durable stores.
      // Every clock observation advances; no assumptions about an exact constructor call count are needed.
      let time = Date.parse('2026-09-21T00:00:00Z');
      const now = () => new Date(time += 100);
      const snapshots = path.join(workspace, 'test-provider-snapshots');
      const before = fs.existsSync(snapshots) ? fs.readdirSync(snapshots).sort() : [];
      const result = await new TestPlanRunner({ ...selected, executionPolicy, now }).run();
      const attempt = result.attempts[0]!;
      if (value === 50) {
        assert.equal(attempt.executionState, 'errored');
        assert.match(attempt.summary ?? '', field === 'queueTimeoutMs'
          ? /WORKER_LOCAL_QUEUE_DEADLINE_EXPIRED/ : /WORKER_CLAIM_WINDOW_INSUFFICIENT/);
        assert.deepEqual(fs.existsSync(snapshots) ? fs.readdirSync(snapshots).sort() : [], before);
        assert.deepEqual(attempt.evidence, []);
      } else {
        assert.equal(attempt.executionState, 'completed');
        assert.equal(attempt.summary, 'dependency loaded');
      }
    });
  }
}
