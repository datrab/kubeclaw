import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { validateBusterExecutionSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';
import { temporary, registry, plan, waitForNamedFile } from '../../fixtures/test-gate/runner-contract-fixture.mts';

// Run this module in its own serial test process. The suite hook runs after
// all Runner promises settle; sampling also aborts and awaits its run in finally.
after(async () => {
  await fs.promises.rm(temporary, { recursive: true, force: true });
});

// Observe actual /proc scans without replacing timers, process facts, provider,
// Core or filesystem return values. This proves scheduling consumption only;
// it does not claim every possible resource spike is detected.
for (const processSampleIntervalMs of [10, 60000]) {
  test(`actual parent process sampling consumes ${processSampleIntervalMs}ms`, { timeout: 30000 }, async (t) => {
    const root = path.join(temporary, `sampling-${processSampleIntervalMs}`);
    const workspaceRoot = path.join(root, 'workspace');
    const repositoryRoot = path.join(workspaceRoot, 'repository');
    fs.mkdirSync(repositoryRoot, { recursive: true });
    const controller = new AbortController();
    let observing = false;
    const sampleTimes = [];
    const original = fs.readdirSync;
    t.mock.method(fs, 'readdirSync', function (...args) {
      if (observing && args[0] === '/proc' && new Error().stack?.includes('processFacts')) {
        sampleTimes.push(performance.now());
      }
      return Reflect.apply(original, fs, args);
    });
    const executionPolicy = validateBusterExecutionSettings({ ...runnerExecutionPolicy,
      observation: { ...runnerExecutionPolicy.observation, processSampleIntervalMs } });
    const running = new TestPlanRunner({
      plan: plan({ cooperative: { uses: 'example.generic@1', config: { waitForAbort: true }, retries: 0 } }),
      registry, workspaceRoot, repositoryRoot, artifactRoot: path.join(root, 'artifacts'),
      observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
      workerLocalRuntime: { drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536 },
      executionPolicy, signal: controller.signal,
    }).run();
    try {
      await waitForNamedFile(path.join(workspaceRoot, 'test-attempts'), 'ready.txt');
      observing = true;
      await delay(250);
      observing = false;
      if (processSampleIntervalMs === 10) assert(sampleTimes.length >= 2, `actual scans=${sampleTimes.length}`);
      else assert.equal(sampleTimes.length, 0);
    } finally {
      observing = false;
      controller.abort(new Error('sampling observation finished'));
      const result = await running;
      assert.equal(result.nodes[0]?.state, 'cancelled');
      const names = fs.readdirSync(path.join(workspaceRoot, 'test-attempts'), { recursive: true, encoding: 'utf8' });
      assert(names.some(name => path.basename(name) === 'aborted.txt'));
    }
  });
}
