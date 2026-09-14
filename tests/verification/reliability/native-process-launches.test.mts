import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { NativeProcessLaunches } from '../../../skills/worker/core/worker/native-process-launches.ts';

test('drain owns concurrent real launchers before readiness and permanently fences new starts', async () => {
  const launches = new NativeProcessLaunches();
  const children = Array.from({ length: 4 }, () => launches.spawn(process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'], {}));
  const exits = children.map(child => once(child, 'exit'));
  try {
    const drained = launches.drain(5000);
    assert.equal(launches.drain(5000), drained);
    assert.throws(() => launches.spawn(process.execPath, ['-e', ''], {}), /LAUNCH_FENCED/);
    await drained;
    for (const exited of await Promise.all(exits)) assert.equal(exited[1], 'SIGKILL');
    for (const child of children) assert.throws(() => process.kill(child.pid!, 0), { code: 'ESRCH' });
  } finally { await launches.drain(5000); }
});

test('failed exec is reaped even when drain begins before the error event', async () => {
  const launches = new NativeProcessLaunches();
  const child = launches.spawn('/nonexistent/kubeclaw-native-launcher', [], {});
  const failure = once(child, 'error');
  await launches.drain(5000);
  assert.equal((await failure)[0].code, 'ENOENT');
});

test('completed real children need no further signals and empty drain also fences admission', async () => {
  const launches = new NativeProcessLaunches();
  const child = launches.spawn(process.execPath, ['-e', 'process.exit(7)'], {});
  assert.equal((await once(child, 'exit'))[0], 7);
  await launches.drain(5000);
  const empty = new NativeProcessLaunches();
  await empty.drain(5000);
  assert.throws(() => empty.spawn(process.execPath, [], {}), /LAUNCH_FENCED/);
});

test('control descriptor exists only for the explicitly requested host', async () => {
  for (const control of [false, true]) {
    const launches = new NativeProcessLaunches();
    const child = launches.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {}, control);
    try {
      assert.equal(child.stdio.length, control ? 4 : 3);
      if (control) assert.ok(child.stdio[3]);
    } finally { await launches.drain(5000); }
  }
});

test('invalid drain timeout cannot disable admission or overflow a Node timer', async () => {
  const launches = new NativeProcessLaunches();
  for (const timeout of [0, -1, 1.5, Infinity, 2_147_483_648]) {
    await assert.rejects(launches.drain(timeout), /DRAIN_LIMIT_INVALID/);
  }
  const child = launches.spawn(process.execPath, ['-e', ''], {});
  await once(child, 'exit');
  await launches.drain(5000);
});
