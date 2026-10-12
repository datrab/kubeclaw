import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { RunnerScheduler } from '../../../skills/buster/engine/test-gates/runner-scheduler.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function execution(id, retainedFixture = null) {
  return { result: { nodeId: id }, attempts: [], outputs: [], retainedFixture };
}

function fixture(ids, executeNode, cleanupFixtures) {
  const retained = [];
  const started = [];
  const owner = {
    options: { plan: { planId: 'plan:drain', runId: 'run:drain', concurrencyLimits: {},
      nodes: ids.map(id => ({ id, skipReason: null, dependencies: [], concurrencyGroup: null })) },
    maximumConcurrency: 2 },
    authorityId: 'authority:drain', id: () => 'nonce:drain', cleanupErrors: [],
    executeNode(node, outputs) { started.push(node.id); return executeNode(node, outputs); },
    retainFixture(node, value) { retained.push({ nodeId: node.id, value }); },
    cleanupFixtures,
  };
  return { owner, retained, started, scheduler: new RunnerScheduler(owner) };
}

for (const lateFailure of [false, true]) {
  test(`scheduler settles started peer before cleanup; late failure ${lateFailure}`, { timeout: 2000 }, async () => {
    const first = deferred(), peer = deferred();
    const primary = new Error('first execution failed');
    const secondary = new Error('peer execution failed');
    const retainedFixture = { identity: 'actual late execution value' };
    let cleanupCalls = 0;
    const state = fixture(['a', 'b', 'c'], node => node.id === 'a' ? first.promise : peer.promise,
      async () => {
        assert.deepEqual(state.retained, lateFailure ? [] : [{ nodeId: 'b', value: retainedFixture }]);
        cleanupCalls++;
      });
    let settled = false;
    const outcome = state.scheduler.run().then(() => { throw new Error('unexpected success'); }, error => {
      settled = true; return error;
    });
    assert.deepEqual(state.started, ['a', 'b']);
    first.reject(primary);
    await setImmediate();
    assert.equal(settled, false);
    assert.equal(cleanupCalls, 0);
    assert.deepEqual(state.started, ['a', 'b']);
    if (lateFailure) peer.reject(secondary);
    else peer.resolve(execution('b', retainedFixture));
    const error = await outcome;
    assert.equal(cleanupCalls, 1);
    assert.deepEqual(state.started, ['a', 'b']);
    if (lateFailure) {
      assert(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, secondary]);
      assert.deepEqual(state.retained, []);
    } else {
      assert.equal(error, primary);
      assert.deepEqual(state.retained, [{ nodeId: 'b', value: retainedFixture }]);
    }
  });
}

test('scheduler drains a started peer after synchronous reservation failure', { timeout: 2000 }, async () => {
  const peer = deferred();
  let cleanupCalls = 0;
  const state = fixture(['a', 'b'], () => peer.promise, async () => { cleanupCalls++; });
  state.owner.options.plan.nodes[1].concurrencyGroup = 'missing';
  const outcome = state.scheduler.run().catch(error => error);
  await setImmediate();
  assert.deepEqual(state.started, ['a']);
  assert.equal(cleanupCalls, 0);
  peer.resolve(execution('a'));
  const error = await outcome;
  assert.equal(error.message, 'TEST_RUNNER_CONCURRENCY_GROUP_MISSING:missing');
  assert.equal(cleanupCalls, 1);
});

test('scheduler preserves execution and cleanup errors', { timeout: 2000 }, async () => {
  const executionError = new Error('execution failure');
  const cleanupError = new Error('fixture cleanup failure');
  const state = fixture(['a'], async () => { throw executionError; }, async () => { throw cleanupError; });
  await assert.rejects(state.scheduler.run(), error => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [executionError, cleanupError]);
    return true;
  });
});

test('scheduler preserves cleanup-only error identity', { timeout: 2000 }, async () => {
  const cleanupError = new Error('fixture cleanup failure');
  const state = fixture(['a'], async () => execution('a'), async () => { throw cleanupError; });
  await assert.rejects(state.scheduler.run(), error => error === cleanupError);
});
