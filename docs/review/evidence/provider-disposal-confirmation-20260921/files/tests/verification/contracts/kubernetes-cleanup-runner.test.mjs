import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RegisteredTestProviderLoader } from '../../../skills/buster/engine/test-gates/provider-loader.ts';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { ownProviderChildren } from '../../fixtures/test-gate/kubernetes-cleanup-children.mjs';
import { runnerOptions } from '../../fixtures/test-gate/kubernetes-cleanup-runner.mjs';

for (const retention of ['retain', 'delete']) for (const failed of [true, false]) {
  test(`registered Kubernetes provider ${retention}, failed preparation ${failed}`, { timeout: 60000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kube-runner-cleanup-'));
    const ownership = ownProviderChildren(t, root); // before any fixture write or process
    const { api, options } = runnerOptions(root, retention, failed);
    const loader = new RegisteredTestProviderLoader({ provider: options.executionPolicy.provider, observation: options.executionPolicy.observation });
    const loaded = [];
    options.loader = { async load(...args) {
      const instance = await loader.load(...args);
      loaded.push({ instance, invocation: args[1] });
      return instance;
    } };
    const result = await new TestPlanRunner(options).run();
    const attempts = result.attempts.filter(row => row.nodeId === 'deploy');
    assert.equal(attempts.length, 1, 'failed cleanup blocks even explicitly accepted unsafe retry');
    const children = ownership.owned.filter(row => row.messages.some(message => message.kind === 'initialize'
      && message.invocation.nodeId === 'deploy'));
    const executed = children.find(row => row.messages.some(message => message.kind === 'execute'));
    const cleaned = children.find(row => row.messages.some(message => message.kind === 'cleanup'));
    assert(executed && cleaned);
    if (failed) assert.notEqual(executed.child.pid, cleaned.child.pid, 'failed execution requires recovery cleanup');
    else assert.equal(executed.child.pid, cleaned.child.pid, 'normal successful retained cleanup uses its original session');
    assert(executed.closed && cleaned.closed, 'both actual process closes observed');
    const cleanupMessage = cleaned.messages.find(message => message.kind === 'cleanup');
    assert.equal(cleanupMessage.schemaVersion, 'provider-cleanup.v1');
    assert.equal(cleanupMessage.disposition, failed ? 'incomplete' : 'completed-fixture');
    const deletes = api.calls.filter(row => row.args[0] === 'delete');
    if (failed) {
      assert(executed.responses.some(message => message.kind === 'error'
        && message.error.includes('KUBERNETES_FIXTURE_PREPARE_CLEANUP_FAILED')), 'real execution IPC must retain rollback marker');
      assert.match(attempts[0].summary, /external delete fault/);
      assert(result.cleanupErrors.some(error => error.message.includes('external delete fault')));
      assert.equal(deletes.length, 2, 'initial rollback plus independent provider cleanup');
      assert(result.cleanupErrors.some(error => error.nodeId === 'deploy'));
      assert.notEqual(attempts[0].executionState, 'completed');
    } else {
      assert.equal(attempts[0].executionState, 'completed');
      assert.equal(attempts[0].outcome, 'passed');
      assert.equal(deletes.length, retention === 'retain' ? 0 : 1);
      assert.equal(result.cleanupErrors.length, 0);
      const before = ownership.owned.length;
      const retained = loaded.find(row => row.invocation.nodeId === 'deploy');
      assert(retained);
      const context = { signal: new AbortController().signal, workspaceRoot: options.workspaceRoot,
        log() { throw new Error('UNEXPECTED_INVALID_CLEANUP_LOG'); },
        invoke() { throw new Error('UNEXPECTED_INVALID_CLEANUP_CAPABILITY'); } };
      for (const disposition of [undefined, null, 'passed', true, {}]) {
        await assert.rejects(retained.instance.cleanup(retained.invocation, context, disposition),
          { message: 'TEST_PROVIDER_CLEANUP_DISPOSITION_INVALID' });
      }
      assert.equal(ownership.owned.length, before, 'invalid authority rejected before fresh-session spawn');
    }
  });
}

test('post-passed Worker measurement fault uses incomplete cleanup then allows later retained success', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kube-faulted-retain-'));
  const ownership = ownProviderChildren(t, root);
  const { api, options } = runnerOptions(root, 'retain', false);
  const loader = new RegisteredTestProviderLoader({ provider: options.executionPolicy.provider, observation: options.executionPolicy.observation });
  const observationFailure = new Error('INJECTED_POST_PASSED_WORKER_MEASUREMENT');
  let injected;
  options.loader = { async load(...args) {
    const instance = await loader.load(...args);
    if (args[1].nodeId !== 'deploy' || args[1].attemptNumber !== 1) return instance;
    const execute = instance.execute.bind(instance);
    const resources = instance.resources.bind(instance);
    let passed = false;
    instance.execute = async (...values) => {
      const result = await execute(...values);
      assert.equal(result.outcome, 'passed');
      passed = true;
      return result;
    };
    instance.resources = () => {
      const measured = resources();
      const stack = new Error().stack;
      if (passed && !injected && /at .*measure .*runner-provider-operation\.ts:/u.test(stack)) {
        const child = ownership.owned.find(row => row.messages.some(message => message.kind === 'initialize'
          && message.invocation.attemptId === args[1].attemptId));
        assert(child.responses.some(message => message.kind === 'result' && message.value.outcome === 'passed'));
        injected = { child, attemptId: args[1].attemptId, failure: observationFailure, stack };
        throw observationFailure;
      }
      return measured;
    };
    return instance;
  } };
  const result = await new TestPlanRunner(options).run();
  assert(injected, 'must reach actual Worker measure after provider passed, not Loader termination measurement');
  assert.equal(injected.failure, observationFailure);
  const failed = result.attempts.find(attempt => attempt.attemptId === injected.attemptId);
  assert.equal(failed.executionState, 'errored');
  assert.match(failed.summary, /resource observation is missing or invalid/u);
  const cleanup = ownership.owned.find(row => row.messages.some(message => message.kind === 'initialize'
    && message.invocation.attemptId === injected.attemptId)
    && row.messages.some(message => message.kind === 'cleanup'));
  assert(cleanup && cleanup.closed);
  assert.equal(cleanup.messages.find(message => message.kind === 'cleanup').disposition, 'incomplete');
  const later = result.attempts.find(attempt => attempt.nodeId === 'deploy'
    && attempt.attemptId !== injected.attemptId && attempt.executionState === 'completed' && attempt.outcome === 'passed');
  assert(later);
  const retained = ownership.owned.find(row => row.messages.some(message => message.kind === 'initialize'
    && message.invocation.attemptId === later.attemptId)
    && row.messages.some(message => message.kind === 'cleanup' && message.disposition === 'completed-fixture'));
  assert(retained && retained.closed);
  assert.equal(api.calls.filter(row => row.args[0] === 'delete').length, 1);
  assert.equal(result.cleanupErrors.length, 0);
});
