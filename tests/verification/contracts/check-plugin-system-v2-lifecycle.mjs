import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/common/plugin-runtime/core/src/index.ts')).href);
const stage = {
  id: 'verify',
  type: 'example.verify',
  dependsOn: ['implement'],
  config: {},
  input: {},
  execution: {
    maxAttempts: 3,
    maxRemediationCycles: 2,
    orchestratorAfterAttempt: 2,
    timeoutMs: 60000,
  },
  on: { request_fix: 'fix' },
};
const graph = new core.ExecutionGraph([
  { ...stage, id: 'implement', type: 'example.implement', dependsOn: [], on: undefined },
  { ...stage, id: 'fix', type: 'example.fix', dependsOn: [], on: undefined },
  stage,
]);
assert.deepEqual(graph.ready(new Set(), new Set()).map((entry) => entry.id), ['fix', 'implement']);
assert.deepEqual(graph.ready(new Set(['implement']), new Set()).map((entry) => entry.id), ['fix', 'verify']);
assert.throws(() => new core.ExecutionGraph([
  { ...stage, id: 'a', dependsOn: ['b'], on: undefined },
  { ...stage, id: 'b', dependsOn: ['a'], on: undefined },
]), /GRAPH_CYCLE/);

const running = {
  stageId: 'verify',
  status: 'running',
  attemptsUsed: 0,
  remediationCyclesUsed: 0,
};
const reason = { code: 'example.failure' };
assert.equal(core.applyStageResult(stage, running, {
  schemaVersion: 'stage-result.v2',
  outcome: 'passed',
  artifacts: [],
}).state.status, 'succeeded');
assert.equal(core.applyStageResult(stage, running, {
  schemaVersion: 'stage-result.v2',
  outcome: 'retry',
  reason,
  artifacts: [],
}).action.type, 'schedule_attempt');
const intervention = core.applyStageResult(stage, { ...running, attemptsUsed: 1 }, {
  schemaVersion: 'stage-result.v2',
  outcome: 'retry',
  reason,
  artifacts: [],
});
assert.deepEqual(intervention.action, { type: 'request_orchestrator', afterAttempt: 2 });
const exhausted = core.applyStageResult(stage, { ...running, attemptsUsed: 2 }, {
  schemaVersion: 'stage-result.v2',
  outcome: 'retry',
  reason,
  artifacts: [],
});
assert.equal(exhausted.state.status, 'blocked');
const remediation = core.applyStageResult(stage, running, {
  schemaVersion: 'stage-result.v2',
  outcome: 'request_fix',
  reason,
  artifacts: [],
});
assert.deepEqual(remediation.action, { type: 'schedule_remediation', stageId: 'fix' });

console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-lifecycle' }));
