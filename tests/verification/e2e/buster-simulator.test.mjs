import test from 'node:test';
import assert from 'node:assert/strict';

test('Buster simulator classifies Redis NOGROUP as queue-closed shutdown', async () => {
  process.env.AGENT_NAME ||= 'buster-real-e2e';
  process.env.SWARM_CONFIG ||= '/tmp/real-e2e-buster-simulator-test-config.json';

  const { isRedisNoGroupError } = await import('./buster-simulator.mjs');

  assert.equal(isRedisNoGroupError(new Error("NOGROUP No such key 'stream' or consumer group 'group'")), true);
  assert.equal(isRedisNoGroupError(new Error('ECONNREFUSED 127.0.0.1:6379')), false);
});

test('Buster invalid identity scenario corrupts only output artifact identity', async () => {
  const { buildInvalidBusterCompletionIdentityArtifact } = await import('./buster-simulator.mjs');

  const artifact = buildInvalidBusterCompletionIdentityArtifact({
    task_type: 'module_test',
    module_id: '01-nginx',
    run_id: 'run-1',
    attempt: 1,
    dispatch_id: 'dispatch-1',
    session_key: 'agent:session-1',
  });

  assert.equal(artifact.artifact_type, 'buster_output');
  assert.equal(artifact.module_id, '01-nginx');
  assert.equal(artifact.task_type, 'module_test');
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.run_id, 'run-1-real-e2e-identity-mismatch');
  assert.equal(artifact.attempt, 1);
  assert.equal(artifact.dispatch_id, 'dispatch-1');
  assert.match(artifact.completion_key, /^run-1-real-e2e-identity-mismatch:1:dispatch-1$/);
});
