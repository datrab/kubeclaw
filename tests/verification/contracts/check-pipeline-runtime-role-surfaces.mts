import assert from 'node:assert/strict';
import * as nova from '../../../skills/nova/core/src/index.ts';
import * as worker from '../../../skills/worker/core/src/index.ts';
import * as buster from '../../../skills/buster/engine/src/index.ts';
import * as novaRole from '../../../skills/nova/pipeline.ts';
import * as busterRole from '../../../skills/buster/runtime.ts';

assert.equal(typeof nova.PipelineRunner, 'function');
assert.equal(typeof nova.resolveTestPlan, 'function');
assert.equal('WorkerAttemptExecutor' in nova, false, 'Nova does not expose worker execution authority');
assert.equal('TestPlanRunner' in nova, false, 'Nova does not expose the Buster engine');

assert.equal(typeof worker.WorkerAttemptExecutor, 'function');
assert.equal(typeof worker.LocalWorkerRuntime, 'function');
assert.equal('PipelineRunner' in worker, false, 'the neutral worker does not expose Nova orchestration authority');
assert.equal('TestPlanRunner' in worker, false, 'the neutral worker does not expose a specialist engine');

assert.equal(typeof buster.WorkerAttemptExecutor, 'function');
assert.equal(typeof buster.TestPlanRunner, 'function');
assert.equal('PipelineRunner' in buster, false, 'Buster does not expose Nova orchestration authority');

assert.equal(typeof novaRole.PipelineRunner, 'function');
assert.equal('WorkerAttemptExecutor' in novaRole, false);
assert.equal(typeof busterRole.TestPlanRunner, 'function');
assert.equal('PipelineRunner' in busterRole, false);

console.log(JSON.stringify({ ok: true, phase: '5.5-F', surfaces: ['nova', 'worker', 'buster'] }));
