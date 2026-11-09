import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixturePodIsReady } from '../../../skills/buster/engine/test-gates/kubernetes-pod-readiness.ts';

const job = { metadata: { ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', controller: true }] } };
test('completed migration Job is ready without a running service condition', () => {
  assert.equal(fixturePodIsReady({ ...job, status: { phase: 'Succeeded' } }), true);
});
test('failed or pending migration does not pass readiness', () => {
  for (const phase of ['Failed', 'Pending']) {
    assert.equal(fixturePodIsReady({ ...job, status: { phase } }), false);
  }
});
test('terminated service or standalone pod does not count as a completed Job', () => {
  assert.equal(fixturePodIsReady({ status: { phase: 'Succeeded' } }), false);
  assert.equal(fixturePodIsReady({ metadata: { ownerReferences: [{ kind: 'ReplicaSet', controller: true }] },
    status: { phase: 'Succeeded', conditions: [{ type: 'Ready', status: 'True' }] } }), false);
});
test('running services still require Ready and Failed overrides stale Ready', () => {
  const conditions = [{ type: 'Ready', status: 'True' }];
  assert.equal(fixturePodIsReady({ status: { phase: 'Running', conditions } }), true);
  assert.equal(fixturePodIsReady({ status: { phase: 'Failed', conditions } }), false);
  assert.equal(fixturePodIsReady({ status: { phase: 'Running' } }), false);
});
