import assert from 'node:assert/strict';
import test from 'node:test';
import { invocationInputs } from '../../../skills/buster/engine/test-gates/runner-attempt-preparation.ts';
import { RunnerScheduler } from '../../../skills/buster/engine/test-gates/runner-scheduler.ts';

const artifact = (id) => ({ artifactId: id, mediaType: 'application/octet-stream',
  contentDigest: `sha256:${id.repeat(64)}`, sizeBytes: 10, storageUrl: `file:///original/${id}`, type: 'build-output' });
const attempt = (id, outputs, executionState = 'completed') => ({ nodeId: 'producer',
  attemptId: id, executionState, outcome: executionState === 'completed' ? 'passed' : null,
  receipt: { receiptId: `receipt:${id}`, receiptDigest: `original:${id}` }, outputs });
const plan = { links: [{ kind: 'artifact', from: { nodeId: 'producer', output: 'build' },
  to: { nodeId: 'consumer', input: 'build-input' } }] };
const node = { id: 'consumer' };
const output = id => ({ name: 'build', kind: 'artifact', artifact: artifact(id) });

test('artifact receiving uses final original producer result and copies exact metadata', () => {
  const old = attempt('old', [output('a')]), current = attempt('current', [output('b')]);
  const unrelated = { ...attempt('other', [output('c')]), nodeId: 'unrelated' };
  const inputs = invocationInputs(plan, node, [old, current, unrelated]);
  assert.deepEqual(inputs, [{ name: 'build-input', kind: 'artifact', artifact: artifact('b') }]);
  current.outputs[0].artifact.storageUrl = 'file:///substituted';
  assert.equal(inputs[0].artifact.storageUrl, 'file:///original/b');
  assert(Object.isFrozen(inputs[0].artifact));
});

for (const state of ['errored', 'cancelled', 'timed_out']) {
  test(`final ${state} producer cannot resurrect previous attempt output`, () => {
    assert.throws(() => invocationInputs(plan, node,
      [attempt('old', [output('a')]), attempt('current', [output('b')], state)]),
    /TEST_PLAN_LINK_OUTPUT_MISSING:producer:build/);
  });
}

test('missing final output cannot be refilled from earlier successful producer', () => {
  assert.throws(() => invocationInputs(plan, node,
    [attempt('old', [output('a')]), attempt('current', [])]), /TEST_PLAN_LINK_OUTPUT_MISSING/);
});

test('value inputs preserve original schema and clone original producer value', () => {
  const value = { rows: [1] };
  const valuePlan = { links: [{ ...plan.links[0], kind: 'value', schemaId: 'original-schema' }] };
  const inputs = invocationInputs(valuePlan, node,
    [attempt('current', [{ name: 'build', kind: 'value', value }])]);
  value.rows.push(2);
  assert.deepEqual(inputs, [{ name: 'build-input', kind: 'value', schemaId: 'original-schema', value: { rows: [1] } }]);
});

test('actual scheduler hands original attempt receipts to preparation, never side-channel output projection', async () => {
  const original = attempt('current', [output('a')]);
  const producer = { id: 'producer', skipReason: null, dependencies: [], concurrencyGroup: null };
  const consumer = { ...producer, id: 'consumer', dependencies: [{ nodeId: 'producer', acceptedResults: ['passed'] }] };
  let received;
  const scheduler = new RunnerScheduler({ options: { plan: { ...plan, planId: 'p', runId: 'r',
    concurrencyLimits: {}, nodes: [producer, consumer] }, maximumConcurrency: 1 },
    authorityId: 'original-authority', id: () => 'nonce', cleanupErrors: [],
    async executeNode(next, originalAttempts) {
      if (next.id === 'consumer') {
        assert(Object.isFrozen(originalAttempts));
        assert.equal(originalAttempts[0], original);
        assert.equal(originalAttempts[0].receipt, original.receipt);
        received = invocationInputs(plan, next, originalAttempts);
      } else assert.deepEqual(originalAttempts, []);
      return { result: { nodeId: next.id, state: 'completed', outcome: 'passed' },
        attempts: next.id === 'producer' ? [original] : [],
        outputs: [output('b')], retainedFixture: null };
    }, retainFixture() {}, async cleanupFixtures() {} });
  const result = await scheduler.run();
  assert.equal(received[0].artifact.storageUrl, 'file:///original/a');
  assert.equal(result.attempts[0], original);
});
