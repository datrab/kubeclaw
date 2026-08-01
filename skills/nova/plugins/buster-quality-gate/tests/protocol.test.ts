import assert from 'node:assert/strict';
import { buildRequest, parseVerdict } from '../src/protocol.ts';

const input = {
  runId: 'run-1',
  gateId: 'quality',
  attempt: 1,
  task: 'Evaluate.',
  suiteEvidence: [{ suite: 'unit', passed: true, summary: 'ok' }],
  suitePlan: {
    repositoryRoot: '/repo',
    suites: ['unit'],
    testConfig: {},
    task: {},
  },
};
assert.equal(buildRequest('gate', input).protocol, 'kubeclaw.buster-quality-gate.v2');
const valid = { outcome: 'passed' as const, summary: 'Passed.', failureClass: 'none' as const, findings: [] };
assert.deepEqual(parseVerdict(valid, input), { ...valid, runId: 'run-1', gateId: 'quality', attempt: 1 });
for (const bad of [
  { ...valid, identity: { runId: 'run-1', gateId: 'quality', attempt: 1 } },
  { ...valid, failureClass: 'test_failure' },
  { ...valid, findings: ['bad'] },
  { ...valid, outcome: 'request_fix' },
]) assert.throws(() => parseVerdict(bad, input));

for (const failureClass of ['test_failure', 'contract', 'configuration', 'infrastructure', 'rate_limit', 'timeout'] as const) {
  const outcome = failureClass === 'test_failure' ? 'request_fix' as const : 'blocked' as const;
  const failed = { ...valid, outcome, failureClass, findings: [`Actionable ${failureClass}`] };
  assert.deepEqual(parseVerdict(failed, input), { ...failed, runId: 'run-1', gateId: 'quality', attempt: 1 });
}
assert.throws(() => parseVerdict(valid, { ...input, suiteEvidence: [{ suite: 'unit', passed: false, summary: 'failed' }] }));
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.buster-quality-gate', suite: 'protocol' }));
