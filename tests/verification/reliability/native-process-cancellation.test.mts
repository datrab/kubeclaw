import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancelNativeProcess } from '../../../skills/worker/core/worker/native-process-cancellation.ts';
import { validateNativeWorkerControlLimits } from '../../../skills/worker/core/worker/native-control-channel.ts';

for (const mode of ['cooperative', 'unresponsive']) {
  test(`actual ${mode} host gets bounded cancellation with no invented cleanup receipt`, { timeout: 5000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-cancellation-'));
    const target = path.join(directory, 'effect');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/native-cancellation-child.mts', import.meta.url)), mode, target], { stdio: 'pipe' });
    const exited = once(child, 'exit'); let dispose: (() => void) | undefined;
    try {
      await once(child.stdout, 'data');
      for (const invalid of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
        assert.throws(() => cancelNativeProcess(child, invalid, () => child.kill('SIGKILL')), /CANCELLATION_DEADLINE_INVALID/);
      }
      assert.equal(child.exitCode, null);
      let forced = false;
      dispose = cancelNativeProcess(child, 300, () => { forced = true; child.kill('SIGKILL'); });
      const exit = await exited;
      assert.equal(forced, mode === 'unresponsive');
      assert.deepEqual(exit, mode === 'cooperative' ? [0, null] : [null, 'SIGKILL']);
      assert.equal(await fs.readFile(target, 'utf8'), mode === 'cooperative' ? 'cleanup-complete' : '');
    } finally { dispose?.(); child.kill('SIGKILL'); await exited; await fs.rm(directory, { recursive: true, force: true }); }
  });
}

test('missing or invalid control limits cannot create an unbounded channel', () => {
  for (const value of [{}, { maximumMessageBytes: 1024 }, { maximumSessionBytes: 4096 },
    { maximumMessageBytes: 0, maximumSessionBytes: 4096 }, { maximumMessageBytes: 8192, maximumSessionBytes: 4096 }]) {
    assert.throws(() => validateNativeWorkerControlLimits(value as Parameters<typeof validateNativeWorkerControlLimits>[0]), /CONTROL_CONFIG_INVALID/);
  }
});
