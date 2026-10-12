import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { request, localApi, invoker } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';

for (const deleteFails of [false, true]) test(`real preparation rollback preserves errors; delete failure ${deleteFails}`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kube-cleanup-errors-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const primary = new Error('injected external GET failure');
  const secondary = new Error('injected external DELETE failure');
  const controller = new AbortController();
  const api = localApi({ primary, deleteError: deleteFails ? secondary : undefined, originalController: controller });
  const capability = invoker(root, api);
  let failure;
  try { await capability.invoke('kubernetes.fixture', request(root, 'retain'), controller.signal); }
  catch (error) { failure = error; }
  assert(failure);
  if (deleteFails) {
    assert(failure instanceof AggregateError);
    assert.equal(failure.message, 'KUBERNETES_FIXTURE_PREPARE_CLEANUP_FAILED');
    assert.equal(failure.cause, failure.errors[0]);
    assert.equal(failure.errors[0].cause, primary, 'existing cancelled wrapper retains exact primary cause');
    assert.equal(failure.errors[1].cause, secondary, 'existing kubectl wrapper retains exact delete cause');
  } else {
    assert.equal(failure.message, 'KUBERNETES_FIXTURE_CANCELLED');
    assert.equal(failure.cause, primary);
  }
  const deletes = api.calls.filter(row => row.args[0] === 'delete');
  assert.equal(deletes.length, 1);
  assert.notEqual(deletes[0].signal, controller.signal);
  assert.equal(deletes[0].signal.aborted, false, 'rollback uses independent bounded cancellation scope');
});
