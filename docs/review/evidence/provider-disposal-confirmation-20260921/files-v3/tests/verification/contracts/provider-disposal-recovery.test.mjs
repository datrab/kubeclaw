import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RegisteredTestProviderLoader } from '../../../skills/buster/engine/test-gates/provider-loader.ts';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { ownProviderChildren, failFirstDeployTermination } from '../../fixtures/test-gate/kubernetes-cleanup-children.mjs';
import { runnerOptions } from '../../fixtures/test-gate/kubernetes-cleanup-runner.mjs';

for (const signalFailure of [false, true]) for (const retention of ['retain', 'delete']) {
  test(`real Loader confirmed-disposal recovery: signal failure ${signalFailure}, ${retention}`, { timeout: 60000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-disposal-recovery-'));
    const ownership = ownProviderChildren(t, root);
    const injected = signalFailure ? failFirstDeployTermination(t, ownership) : null;
    const { api, options } = runnerOptions(root, retention, false);
    const loader = new RegisteredTestProviderLoader({ provider: options.executionPolicy.provider,
      observation: options.executionPolicy.observation });
    let oldChild;
    let cleanupCalls = 0;
    options.loader = { async load(...args) {
      const instance = await loader.load(...args);
      if (args[1].nodeId !== 'deploy') return instance;
      const cleanup = instance.cleanup.bind(instance);
      instance.cleanup = async (...cleanupArgs) => {
        cleanupCalls++;
        oldChild = ownership.owned.find(row => row.messages.some(message => message.kind === 'initialize'
          && message.invocation.attemptId === args[1].attemptId));
        assert(oldChild.responses.some(message => message.kind === 'result' && message.value.outcome === 'passed'));
        // Explicitly stop the real successful instance; ordinary success need not do this.
        if (signalFailure) {
          await assert.rejects(instance.terminate(), error => {
            assert.equal(error.message, 'TEST_PROVIDER_SIGNAL_FAILED');
            assert.equal(error.cause.cause.code, 'EPERM');
            return true;
          });
          assert.equal(injected(), oldChild);
        } else await instance.terminate();
        assert(oldChild.closed, 'actual close must precede recovery');
        assert.equal(oldChild.messages.filter(message => message.kind === 'cleanup').length, 0);
        return cleanup(...cleanupArgs);
      };
      return instance;
    } };
    const result = await new TestPlanRunner(options).run();
    const attempts = result.attempts.filter(attempt => attempt.nodeId === 'deploy');
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].executionState, 'completed');
    assert.equal(attempts[0].outcome, 'passed');
    assert.equal(result.cleanupErrors.length, 0);
    assert.equal(cleanupCalls, 1);
    const children = ownership.owned.filter(row => row.messages.some(message => message.kind === 'initialize'
      && message.invocation.attemptId === attempts[0].attemptId));
    assert.equal(children.length, 2, 'exactly one new cleanup child');
    const recovery = children.find(row => row !== oldChild);
    assert.notEqual(recovery.child.pid, oldChild.child.pid);
    assert(recovery.closed);
    assert.deepEqual(recovery.messages.filter(message => message.kind === 'cleanup').map(message => message.disposition),
      ['completed-fixture']);
    assert.equal(api.calls.filter(call => call.args[0] === 'delete').length, retention === 'retain' ? 0 : 1);
  });
}

for (const recovery of [false, true]) {
  test(`real Loader retains cleanup and stop failures in ${recovery ? 'recovery' : 'current'} session`, { timeout: 60000 }, async t => {
    const { ProviderProcessSession } = await import('../../../skills/buster/engine/test-gates/provider-process-session.ts');
    const { invoker, localApi } = await import('../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-disposal-errors-'));
    const ownership = ownProviderChildren(t, root);
    const { options } = runnerOptions(root, 'delete', false);
    const api = localApi({ deleteError: new Error('EXPLICIT_DELETE_FAILURE') });
    options.capabilityInvoker = invoker(root, api);
    const stopFailure = new Error('INJECTED_STOP_DIAGNOSTIC_AFTER_ACTUAL_DISPOSAL');
    const originalTerminate = ProviderProcessSession.prototype.terminate;
    let inject = false;
    let observed;
    t.mock.method(ProviderProcessSession.prototype, 'terminate', async function () {
      await Reflect.apply(originalTerminate, this, []);
      if (inject) {
        assert.equal(this.disposalConfirmed, true);
        throw stopFailure;
      }
    });
    const loader = new RegisteredTestProviderLoader({ provider: options.executionPolicy.provider,
      observation: options.executionPolicy.observation });
    options.loader = { async load(...args) {
      const instance = await loader.load(...args);
      if (args[1].nodeId !== 'deploy') return instance;
      const cleanup = instance.cleanup.bind(instance);
      instance.cleanup = async (...values) => {
        if (recovery) await instance.terminate();
        inject = true;
        try { return await cleanup(...values); }
        catch (error) {
          assert(error instanceof AggregateError);
          assert.match(error.message, /^TEST_PROVIDER_CLEANUP_AND_TERMINATION_FAILED:/u);
          assert.match(error.errors[0].message, /EXPLICIT_DELETE_FAILURE/u);
          assert.equal(error.errors[1], stopFailure);
          assert.equal(error.cause, error.errors[0]);
          observed = error;
          throw error;
        } finally { inject = false; }
      };
      return instance;
    } };
    const result = await new TestPlanRunner(options).run();
    assert(observed);
    assert(result.cleanupErrors.some(error => error.message.includes('TEST_PROVIDER_CLEANUP_AND_TERMINATION_FAILED')
      && error.message.includes('EXPLICIT_DELETE_FAILURE')
      && error.message.includes('INJECTED_STOP_DIAGNOSTIC_AFTER_ACTUAL_DISPOSAL')));
    assert.equal(api.calls.filter(call => call.args[0] === 'delete').length, 1);
    const children = ownership.owned.filter(row => row.messages.some(message => message.kind === 'initialize'
      && message.invocation.nodeId === 'deploy'));
    assert.equal(children.length, recovery ? 2 : 1);
    assert(children.every(row => row.closed));
    assert(fs.readdirSync(path.join(options.workspaceRoot, 'test-provider-snapshots')).length > 0,
      'failed termination diagnostic must preserve the existing snapshot-retention boundary');
  });
}

test('overlapping real Loaded terminate calls account one confirmed session exactly once', { timeout: 60000 }, async t => {
  const { ProviderProcessSession } = await import('../../../skills/buster/engine/test-gates/provider-process-session.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-overlapping-stop-'));
  const ownership = ownProviderChildren(t, root);
  const { options } = runnerOptions(root, 'retain', false);
  const loader = new RegisteredTestProviderLoader({ provider: options.executionPolicy.provider,
    observation: options.executionPolicy.observation });
  const originalTerminate = ProviderProcessSession.prototype.terminate;
  const sessions = new Set();
  let observing = false;
  let checked = false;
  t.mock.method(ProviderProcessSession.prototype, 'terminate', function () {
    if (observing) sessions.add(this);
    return Reflect.apply(originalTerminate, this, []);
  });
  options.loader = { async load(...args) {
    const instance = await loader.load(...args);
    if (args[1].nodeId !== 'deploy') return instance;
    const cleanup = instance.cleanup.bind(instance);
    instance.cleanup = async (...values) => {
      const child = ownership.owned.find(row => row.messages.some(message => message.kind === 'initialize'
        && message.invocation.attemptId === args[1].attemptId));
      assert(child.responses.some(message => message.kind === 'result' && message.value.outcome === 'passed'));
      observing = true;
      try { await Promise.all([instance.terminate(), instance.terminate()]); }
      finally { observing = false; }
      assert.equal(sessions.size, 1);
      const session = [...sessions][0];
      assert(session.disposalConfirmed && child.closed);
      const actual = session.resources();
      assert(actual.cpuTimeMs > 0, 'nonzero CPU must distinguish duplicate accounting');
      assert.deepEqual(instance.resources(), actual, 'sum one session once, preserve actual peaks');
      checked = true;
      return cleanup(...values);
    };
    return instance;
  } };
  const result = await new TestPlanRunner(options).run();
  assert(checked);
  assert.equal(result.cleanupErrors.length, 0);
  assert(result.attempts.some(attempt => attempt.nodeId === 'deploy' && attempt.outcome === 'passed'));
});
