import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeWorkerControlChannel } from '../../../skills/worker/core/worker/native-control-channel.ts';
import { FileBusterFixtureJournal } from '../../../skills/buster/engine/test-gates/native-fixture-journal.ts';
import { BusterFixtureControl } from '../../../skills/buster/engine/test-gates/native-fixture-control.ts';
import { admission, readiness } from '../../fixtures/buster-fixture-protocol.mts';

async function setup(t: TestContext, mode = 'exchange') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-control-'));
  const journal = new FileBusterFixtureJournal(path.join(root, 'journal'), {
    maximumRecords: 8, maximumStateBytes: 65536, maximumBlobBytes: 65536, maximumTotalBytes: 8388608,
  });
  const value = admission(); await journal.reserve(value);
  const vector = readiness(value);
  const controller = new BusterFixtureControl(value, journal);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/buster-fixture-control-child.mts', import.meta.url)), mode],
    { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit'); let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += String(bytes); }); child.stderr.on('data', bytes => { stderr += String(bytes); });
  const channel = new NativeWorkerControlChannel(child.stdio[3], { maximumMessageBytes: 65536, maximumSessionBytes: 262144 });
  t.after(async () => { channel.destroy(); child.kill('SIGKILL'); await exited; await fs.rm(root, { recursive: true, force: true }); });
  return { journal, value, vector, controller, child, channel, exited, stdout: () => stdout, stderr: () => stderr,
    send: () => child.stdin.end(JSON.stringify({ admission: value, readiness: vector })) };
}

test('real host readiness is persisted before dependents and teardown intent precedes host cleanup', { timeout: 15000 }, async t => {
  const f = await setup(t);
  const running = f.controller.run(f.channel, new AbortController().signal, f.vector.scope); f.send();
  const ready = await f.controller.ready;
  const before = (await f.journal.snapshot())[0]!;
  assert.deepEqual(before.readiness, ready); assert.equal(before.terminal, null);
  assert.equal(f.child.exitCode, null); assert.equal(f.stdout(), '');
  await f.controller.teardown('dependencies-finished');
  const intent = (await f.journal.snapshot())[0]!.state.teardown;
  await running; assert.deepEqual(await f.exited, [0, null], f.stderr());
  assert.deepEqual(JSON.parse(f.stdout()), intent);
  assert.equal((await f.journal.snapshot())[0]!.terminal, null, 'IPC never manufactures a native terminal receipt');
});

test('readiness for a different scope is rejected before journal write or dependency admission', { timeout: 15000 }, async t => {
  const f = await setup(t);
  const running = f.controller.run(f.channel, new AbortController().signal, { ...f.vector.scope, inode: f.vector.scope.inode + 1 });
  f.send();
  await assert.rejects(running, /SCOPE_BINDING_MISMATCH/);
  await assert.rejects(f.controller.ready, /SCOPE_BINDING_MISMATCH/);
  assert.equal((await f.journal.snapshot())[0]!.readiness, null);
});

test('teardown before setup completion fences a late readiness report', { timeout: 15000 }, async t => {
  const f = await setup(t);
  await f.controller.teardown('cancelled');
  const running = f.controller.run(f.channel, new AbortController().signal, f.vector.scope); f.send();
  await assert.rejects(running, /READINESS_FENCED/);
  await assert.rejects(f.controller.ready, /READINESS_FENCED/);
  const state = (await f.journal.snapshot())[0]!;
  assert.equal(state.readiness, null); assert.equal(state.state.teardown?.reason, 'cancelled');
});

test('repeated host readiness is a protocol failure, not another fixture admission', { timeout: 15000 }, async t => {
  const f = await setup(t, 'repeat');
  const running = f.controller.run(f.channel, new AbortController().signal, f.vector.scope); f.send();
  await assert.rejects(running, /READINESS_REPEATED/);
  assert.equal((await f.journal.snapshot()).length, 1);
  assert.equal((await f.journal.snapshot())[0]!.terminal, null);
});

test('host SIGKILL after readiness cannot become a successful lifetime', { timeout: 15000 }, async t => {
  const f = await setup(t);
  const running = f.controller.run(f.channel, new AbortController().signal, f.vector.scope); f.send();
  await f.controller.ready; f.child.kill('SIGKILL');
  await assert.rejects(running, /CLOSED_BEFORE_TEARDOWN/);
  assert.deepEqual(await f.exited, [null, 'SIGKILL']);
  assert.equal((await f.journal.snapshot())[0]!.terminal, null);
});

test('cancellation persists before forced termination without waiting for host cleanup', { timeout: 15000 }, async t => {
  const f = await setup(t);
  const running = f.controller.run(f.channel, new AbortController().signal, f.vector.scope); f.send();
  await f.controller.ready;
  await f.controller.cancel();
  assert.equal((await f.journal.snapshot())[0]!.state.teardown?.reason, 'cancelled');
  assert.equal(f.stdout(), ''); assert.equal(f.child.exitCode, null);
  f.child.kill('SIGKILL');
  await assert.rejects(running, /CLOSED_BEFORE_TEARDOWN/);
  assert.deepEqual(await f.exited, [null, 'SIGKILL']);
  assert.equal((await f.journal.snapshot())[0]!.terminal, null);
});

test('host refuses teardown without the original readiness acknowledgement', { timeout: 15000 }, async t => {
  const f = await setup(t); f.send();
  for await (const _bytes of f.channel.messages()) {
    await f.channel.send(Buffer.from(JSON.stringify({ schemaVersion: 'buster-fixture-teardown.v1' })));
  }
  assert.deepEqual(await f.exited, [1, null]); assert.match(f.stderr(), /CONTROL_INVALID|READY_ACK_INVALID/);
  assert.equal(f.stdout(), '');
});
