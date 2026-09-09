import assert from 'node:assert/strict';
import { runProcessInput } from '../process-input.ts';
const options = { prefix: 'PIPE_TEST', timeoutMs: 2_000, maximumOutputBytes: 1024 };
await assert.rejects(runProcessInput(process.execPath, ['-e', 'process.stdin.destroy();process.exit(0)'], {
  ...options, input: Buffer.alloc(8 * 1024 * 1024),
}), (error: Error & { cause?: NodeJS.ErrnoException }) => error.message === 'PIPE_TEST_STDIN_FAILED' && ['EPIPE', 'ECONNRESET'].includes(error.cause?.code ?? ''));
const after = await runProcessInput(process.execPath, ['-e', 'process.stdout.write("host-survived")'], options);
assert.equal(after.stdout.toString(), 'host-survived');
await assert.rejects(runProcessInput(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
  ...options, timeoutMs: 50,
}), /PIPE_TEST_TIMEOUT/);
const controller = new AbortController();
const cause = new Error('original-abort');
const operation = runProcessInput(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { ...options, signal: controller.signal });
controller.abort(cause);
await assert.rejects(operation, (error: Error & { cause?: unknown }) => error.message === 'PIPE_TEST_CANCELLED' && error.cause === cause);
await assert.rejects(runProcessInput(process.execPath, ['-e', 'process.stdout.write("x".repeat(2048))'], options), /PIPE_TEST_OUTPUT_LIMIT/);
console.log(JSON.stringify({ ok: true, suite: 'process-input', transport: 'native-process', checks: 5 }));
