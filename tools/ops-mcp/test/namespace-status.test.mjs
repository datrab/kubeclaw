import test from 'node:test';
import assert from 'node:assert/strict';
import { getNamespaceStatus } from '../src/namespace-status.mjs';

test('namespace lookup reads the object and preserves Active and Terminating existence', async () => {
  for (const phase of ['Active', 'Terminating']) {
    const deletionTimestamp = phase === 'Terminating' ? '2026-10-22T12:00:00Z' : null;
    const result = await getNamespaceStatus(async path => {
      assert.equal(path, '/api/v1/namespaces/test-example');
      return { metadata: { creationTimestamp: '2026-10-21T12:00:00Z', deletionTimestamp },
        status: { phase }, spec: { finalizers: ['kubernetes'] } };
    }, 'test-example');
    assert.deepEqual(result, { namespace: 'test-example', status: 'present', exists: true, source: 'kubernetes',
      phase, creationTimestamp: '2026-10-21T12:00:00Z', deletionTimestamp, finalizers: ['kubernetes'] });
  }
});

test('only namespace GET 404 proves absence; 403 leaves existence unknown', async () => {
  for (const [status, expected, exists] of [[404, 'not_found', false], [403, 'forbidden', null]]) {
    const result = await getNamespaceStatus(async () => { throw Object.assign(new Error('fixture'), { status }); }, 'test-example');
    assert.deepEqual(result, { namespace: 'test-example', status: expected, exists, source: 'kubernetes' });
  }
});

test('authentication, transport and server failures never become an absence result', async () => {
  for (const error of [Object.assign(new Error('unauthorized'), { status: 401 }),
    Object.assign(new Error('unavailable'), { status: 503 }), new Error('Kubernetes API request timed out'),
    new Error('Invalid Kubernetes JSON response'), new Error('TLS failure')]) {
    await assert.rejects(getNamespaceStatus(async () => { throw error; }, 'test-example'), actual => actual === error);
  }
});
