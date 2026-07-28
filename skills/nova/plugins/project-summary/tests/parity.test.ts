import assert from 'node:assert/strict';
import { buildSummary, type SummaryInput } from '../src/summary.ts';

const base: SummaryInput = {
  projectId: 'project',
  runId: 'run-1',
  status: 'succeeded',
  metrics: {
    modulesTotal: 4,
    modulesPassed: 3,
    testsPassed: 9,
    testsFailed: 1,
    agentInvocations: 2,
  },
  diagnostics: ['one warning'],
};

const summary = buildSummary(base);
assert.equal(summary.deliveryPercent, 75);
assert.equal(summary.testPassPercent, 90);
assert.match(summary.markdown, /3\/4 \(75%\)/u);
assert.match(summary.markdown, /9 passed, 1 failed \(90%\)/u);

const empty = buildSummary({
  ...base,
  metrics: { modulesTotal: 0, modulesPassed: 0, testsPassed: 0, testsFailed: 0, agentInvocations: 0 },
  diagnostics: [],
});
assert.equal(empty.deliveryPercent, 100);
assert.equal(empty.testPassPercent, 100);
assert.match(empty.markdown, /- None$/u);

for (const [field, value] of [
  ['modulesTotal', -1],
  ['modulesPassed', 1.5],
  ['testsPassed', Number.NaN],
  ['testsFailed', Number.POSITIVE_INFINITY],
  ['agentInvocations', -1],
] as const) {
  assert.throws(() => buildSummary({
    ...base,
    metrics: { ...base.metrics, [field]: value },
  }));
}
assert.throws(() => buildSummary({ ...base, projectId: '\0\r' }));
assert.throws(() => buildSummary({ ...base, runId: ' ' }));

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.project-summary', suite: 'behavior-parity' }));
