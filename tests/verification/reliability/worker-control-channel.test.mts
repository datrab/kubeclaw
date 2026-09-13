import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { NativeWorkerControlChannel } from '../../../skills/worker/core/worker/native-control-channel.ts';
import { startNativeProcessControl } from '../../../skills/worker/core/worker/native-process-control.ts';

function child(mode: string) {
  const process = spawn(globalThis.process.execPath, [fileURLToPath(new URL('../../fixtures/worker-control-child.mts', import.meta.url)), mode], {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
  const exited = once(process, 'exit');
  let stdout = '', stderr = '';
  process.stdout.on('data', bytes => { stdout += String(bytes); }); process.stderr.on('data', bytes => { stderr += String(bytes); });
  return { process, exited, stdout: () => stdout, stderr: () => stderr };
}

test('actual fourth pipe carries readiness and teardown while original stdin/stdout stay independent', { timeout: 10000 }, async () => {
  const worker = child('exchange'); const channel = new NativeWorkerControlChannel(worker.process.stdio[3], {
    maximumMessageBytes: 1024, maximumSessionBytes: 8192,
  });
  try {
    worker.process.stdin.end('original envelope'); let received = 0;
    for await (const message of channel.messages()) {
      assert.equal(message.toString(), 'ready'); assert.equal(++received, 1);
      assert.equal(worker.stdout(), ''); assert.equal(worker.process.exitCode, null);
      await channel.send(Buffer.from('teardown')); await channel.end();
    }
    assert.equal(received, 1); assert.deepEqual(await worker.exited, [0, null], worker.stderr());
    assert.equal(worker.stdout(), 'completed after teardown');
  } finally { channel.destroy(); worker.process.kill('SIGKILL'); await worker.exited; }
});

for (const [mode, expected] of [['oversized', 'MESSAGE_LIMIT'], ['truncated', 'TRUNCATED'], ['cumulative', 'INPUT_LIMIT']]) {
  test(`actual child ${mode} framing is rejected before phase acceptance`, { timeout: 10000 }, async () => {
    const worker = child(mode!); const channel = new NativeWorkerControlChannel(worker.process.stdio[3], {
      maximumMessageBytes: 16, maximumSessionBytes: 32,
    });
    try {
      await assert.rejects(async () => { for await (const _message of channel.messages()) { /* validate the complete transport */ } },
        new RegExp(`WORKER_NATIVE_CONTROL_${expected}`));
    } finally { channel.destroy(); worker.process.kill('SIGKILL'); await worker.exited; }
  });
}

test('real host death after readiness cannot produce completion or keep its control channel alive', { timeout: 10000 }, async () => {
  const worker = child('exchange'); const channel = new NativeWorkerControlChannel(worker.process.stdio[3], {
    maximumMessageBytes: 1024, maximumSessionBytes: 8192,
  });
  try {
    worker.process.stdin.end('original envelope');
    for await (const message of channel.messages()) { assert.equal(message.toString(), 'ready'); worker.process.kill('SIGKILL'); }
    assert.deepEqual(await worker.exited, [null, 'SIGKILL']); assert.equal(worker.stdout(), '');
  } finally { channel.destroy(); worker.process.kill('SIGKILL'); await worker.exited; }
});

test('phase persistence failure stops the actual child and is not hidden by subsequent close', { timeout: 10000 }, async () => {
  const worker = child('exchange'); const faults: string[] = [];
  const control = startNativeProcessControl(worker.process, { limits: { maximumMessageBytes: 1024, maximumSessionBytes: 8192 },
    run: async channel => { for await (const _message of channel.messages()) throw new Error('phase commit rejected'); },
  }, code => { faults.push(code); worker.process.kill('SIGKILL'); }, 1000);
  try {
    worker.process.stdin.end('original envelope'); await worker.exited; await control.finish(); await control.finish();
    assert.deepEqual(faults, ['WORKER_NATIVE_CONTROL_FAILED']); assert.equal(worker.stdout(), '');
  } finally { worker.process.kill('SIGKILL'); await worker.exited; await control.finish(); }
});
