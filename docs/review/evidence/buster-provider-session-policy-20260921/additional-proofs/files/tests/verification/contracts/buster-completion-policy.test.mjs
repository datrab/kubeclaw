import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { after } from 'node:test';
import { sha256Digest } from '@kubeclaw/worker-core';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { validateBusterExecutionSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { sessionOptions, temporary } from '../../fixtures/test-gate/session-policy.mjs';

after(async () => { await fs.promises.rm(temporary, { recursive: true, force: true }); });

for (const cleanupTimeoutMs of [50, 1000]) test(`actual default Runner provider cleanup consumes ${cleanupTimeoutMs}`, { timeout: 30000 }, async () => {
  const options = sessionOptions(`cleanup-budget-${cleanupTimeoutMs}`, { cleanupTimeoutMs }, 'const observed = "cleanup-policy";', `
    const root = context.workspaceRoot + '/' + invocation.workspace.scratch;
    fs.writeFileSync(root + '/cleanup-started', 'started');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { fs.writeFileSync(root + '/cleanup-completed', 'completed'); resolve(); }, 150);
      const abort = () => { clearTimeout(timer); fs.writeFileSync(root + '/cleanup-aborted', 'aborted'); reject(context.signal.reason); };
      context.signal.addEventListener('abort', abort, { once: true });
      if (context.signal.aborted) abort();
    });
  `);
  const result = await new TestPlanRunner(options).run();
  const names = fs.readdirSync(options.workspaceRoot + '/test-attempts', { recursive: true, encoding: 'utf8' });
  assert(names.some(name => name.endsWith('/cleanup-started')), 'actual cleanup must start');
  const stored = JSON.parse(fs.readFileSync(options.observabilityRoot + '/attempts/attempt-store.json', 'utf8'));
  assert.equal(stored.results.length, 1);
  if (cleanupTimeoutMs === 50) {
    assert.equal(result.attempts[0].executionState, 'errored');
    assert.equal(stored.results[0].result.cleanup.state, 'failed');
    assert.match(stored.results[0].result.cleanup.summary, /WORKER_CLEANUP_TIMEOUT/);
    assert(names.some(name => name.endsWith('/cleanup-aborted')));
    assert(!names.some(name => name.endsWith('/cleanup-completed')));
  } else {
    assert.equal(result.attempts[0].outcome, 'passed');
    assert.equal(stored.results[0].result.cleanup.state, 'completed');
    assert(names.some(name => name.endsWith('/cleanup-completed')));
  }
});

const providerResult = { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: JSON.stringify('wrapper-proof'),
  counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
  evidenceFiles: [], reports: [], outputs: [], exitCode: 0, signal: null, providerDetails: null };
const providerBytes = Buffer.byteLength(JSON.stringify(providerResult));
const specialist = { schemaId: 'kubeclaw.buster-provider-result.v1',
  schemaDigest: sha256Digest({ schemaId: 'kubeclaw.buster-provider-result.v1' }), values: { providerResult } };
const specialistBytes = Buffer.byteLength(JSON.stringify(specialist));
for (const workerResultWrapperBytes of [1, 4096]) test(`real Core specialist preflight consumes wrapper reserve ${workerResultWrapperBytes}`, { timeout: 30000 }, async () => {
  const options = sessionOptions(`wrapper-${workerResultWrapperBytes}`,
    { maximumResultBytes: providerBytes, workerResultWrapperBytes }, 'const observed = "wrapper-proof";');
  options.executionPolicy = validateBusterExecutionSettings({ ...options.executionPolicy,
    reports: { ...options.executionPolicy.reports, maximumAggregateResultBytes: 1 } });
  const bound = providerBytes + 1 + workerResultWrapperBytes;
  assert.equal(options.executionPolicy.provider.maximumResultBytes, providerBytes, 'the complete real provider result fits exactly');
  assert.equal(providerResult.reports.length, 0, 'no report normalization consumes or rejects its separate one-byte budget');
  if (workerResultWrapperBytes === 1) assert(specialistBytes > bound);
  else assert(specialistBytes <= bound);
  const result = await new TestPlanRunner(options).run();
  const stored = JSON.parse(fs.readFileSync(options.observabilityRoot + '/attempts/attempt-store.json', 'utf8'));
  assert.equal(stored.results.length, 1);
  if (workerResultWrapperBytes === 1) {
    assert.equal(result.attempts[0].executionState, 'errored');
    assert.match(result.attempts[0].summary, /WORKER_RESULT_BYTE_LIMIT/);
    assert.doesNotMatch(result.attempts[0].summary, /TEST_PROVIDER_RESULT_LIMIT|TEST_REPORT_RESULT_LIMIT/);
  } else {
    assert.equal(result.attempts[0].outcome, 'passed');
    assert.deepEqual(stored.results[0].result.specialistResult, specialist);
    assert.equal(Buffer.byteLength(JSON.stringify(stored.results[0].result.specialistResult.values.providerResult)), providerBytes);
  }
});
