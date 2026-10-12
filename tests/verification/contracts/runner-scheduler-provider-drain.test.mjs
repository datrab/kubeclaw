import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { TestPlanRunner } from '../../../skills/buster/engine/test-gates/runner.ts';
import { ownProviderChildren } from '../../fixtures/test-gate/kubernetes-cleanup-children.mjs';
import { schedulerRunnerOptions } from '../../fixtures/test-gate/scheduler-drain.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

test('actual Runner drains its active provider and cleans a late fixture after a preparation rejection',
  { timeout: 60000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-provider-drain-'));
    const ownership = ownProviderChildren(t, root);
    const peerStarted = deferred(), releasePeer = deferred(), preparationFailed = deferred();
    const cleanups = [];
    const options = schedulerRunnerOptions(root, { async invoke(capability, request) {
      assert.equal(capability, 'test.barrier');
      if (request.cleanup) { cleanups.push(request.nodeId); return {}; }
      if (request.nodeId === 'b') {
        peerStarted.resolve();
        await releasePeer.promise;
      } else {
        assert.equal(request.nodeId, 'a');
        await peerStarted.promise;
      }
      return {};
    } });
    const failure = new Error('INJECTED_THIRD_ATTEMPT_COPY_FAILURE');
    const originalCopy = fs.cpSync;
    let copies = 0;
    t.mock.method(fs, 'cpSync', function (source, destination, ...args) {
      if (source === options.repositoryRoot) {
        copies++;
        if (copies === 3) { preparationFailed.resolve(); throw failure; }
      }
      return Reflect.apply(originalCopy, fs, [source, destination, ...args]);
    });
    let settled = false;
    const outcome = new TestPlanRunner(options).run().then(value => {
      settled = true; return { value };
    }, error => { settled = true; return { error }; });
    try {
      await Promise.race([preparationFailed.promise, outcome.then(result => {
        throw result.error ?? new Error('Runner ended before the intended preparation fault');
      })]);
      await setImmediate();
      assert.equal(copies, 3, 'fault must reach real preparation after the first completed node');
      assert.equal(settled, false, 'outer Runner must wait for its already-started peer');
      assert(!cleanups.includes('b'), 'fixture cannot be cleaned while still executing');
      releasePeer.resolve();
      const result = await outcome;
      assert.equal(result.error, failure, 'original actual preparation rejection remains unchanged');
      assert.deepEqual(cleanups.filter(id => id === 'b'), ['b']);
      const peer = ownership.owned.find(row => row.messages.some(message => message.kind === 'initialize'
        && message.invocation.nodeId === 'b'));
      assert(peer && peer.closed, 'late fixture provider must actually close before Runner rejects');
      assert(peer.responses.some(message => message.kind === 'result' && message.value.outcome === 'passed'));
      assert.deepEqual(peer.messages.filter(message => message.kind === 'cleanup').map(message => message.disposition),
        ['completed-fixture']);
      assert(!ownership.owned.some(row => row.messages.some(message => message.kind === 'initialize'
        && message.invocation.nodeId === 'c')), 'failed preparation must not spawn a third provider');
    } finally {
      peerStarted.resolve();
      releasePeer.resolve();
      await outcome;
    }
  });
