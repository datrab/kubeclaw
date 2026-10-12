import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RegisteredTestProviderLoader } from '../../../skills/buster/engine/test-gates/provider-loader.ts';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { ownProviderChildren } from '../../fixtures/test-gate/kubernetes-cleanup-children.mjs';
import { runnerOptions } from '../../fixtures/test-gate/kubernetes-cleanup-runner.mjs';
import { invoker, localApi } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function guardUnconfirmedCleanup(instance, { attemptId, ownership, options, replacement, failure,
  entered, release, settled, verified }) {
const cleanup = instance.cleanup.bind(instance);
instance.cleanup = async (...values) => {
  if (replacement) await instance.terminate();
  const first = cleanup(...values).then(value => ({ value }), error => ({ error }));
  await entered.promise;
  const children = ownership.owned.filter(row => row.messages.some(message => message.kind === 'initialize'
    && message.invocation.attemptId === attemptId));
  assert.equal(children.length, replacement ? 2 : 1);
  const child = children.at(-1).child;
  const emit = child.emit;
  const actualClose = deferred();
  let held;
  if (failure === 'close') {
    child.emit = function (event, ...eventArgs) {
      if (event === 'close') { held = eventArgs; actualClose.resolve(); return false; }
      return Reflect.apply(emit, this, [event, ...eventArgs]);
    };
    release.resolve();
  }
  const expected = failure === 'close' ? 'TEST_PROVIDER_TERMINATION_TIMEOUT' : 'TEST_PROVIDER_CAPABILITY_DRAIN_TIMEOUT';
  try {
    await assert.rejects(instance.terminate(), { message: expected });
    if (failure === 'close') await actualClose.promise;
    else assert(children.at(-1).closed, 'drain failure follows actual close');
    const before = ownership.owned.length;
    await assert.rejects(cleanup(...values));
    assert.equal(ownership.owned.length, before, 'unconfirmed current session must block every new recovery');
    assert(fs.readdirSync(path.join(options.workspaceRoot, 'test-provider-snapshots')).length > 0);
    const result = await first;
    assert(result.error, 'unconfirmed disposal cannot report cleanup success');
    verified();
    throw result.error;
  } finally {
    release.resolve();
    child.emit = emit;
    if (held) Reflect.apply(emit, child, ['close', ...held]);
    await settled.promise;
  }
};
}

for (const replacement of [false, true]) for (const failure of ['close', 'drain']) {
  test(`Loaded ${replacement ? 'replacement' : 'current'} ${failure} timeout cannot start another child`,
    { timeout: 60000 }, async t => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-unconfirmed-'));
      const ownership = ownProviderChildren(t, root);
      const { options } = runnerOptions(root, 'delete', false);
      const entered = deferred();
      const release = deferred();
      const settled = deferred();
      const api = localApi();
      const execute = api.execute.bind(api);
      api.execute = async (...args) => {
        if (args[1][0] !== 'delete') return execute(...args);
        entered.resolve();
        try { await release.promise; return await execute(...args); }
        finally { settled.resolve(); }
      };
      options.capabilityInvoker = invoker(root, api);
      const loader = new RegisteredTestProviderLoader({ provider: options.executionPolicy.provider,
        observation: options.executionPolicy.observation });
      let verified = false;
      options.loader = { async load(...args) {
        const instance = await loader.load(...args);
        if (args[1].nodeId !== 'deploy') return instance;
        guardUnconfirmedCleanup(instance, { attemptId: args[1].attemptId, ownership, options, replacement,
          failure, entered, release, settled, verified: () => { verified = true; } });
        return instance;
      } };
      await assert.rejects(new TestPlanRunner(options).run());
      assert(verified, 'negative must reach actual Loaded gating assertions');
    });
}
