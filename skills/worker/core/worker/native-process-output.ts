import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { NativeWorkerOutputCapture, NativeWorkerOutputChannel } from './native-output-spool.ts';

/** Backpressure reaches the real host pipes while durable output is being synced. */
export function captureNativeWorkerOutput(child: ChildProcessWithoutNullStreams, maximumBytes: number,
  stop: (code: string) => void, capture?: NativeWorkerOutputCapture) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('WORKER_NATIVE_OUTPUT_LIMIT_INVALID');
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  let totalBytes = 0;
  const receive = (channel: NativeWorkerOutputChannel, target: Buffer[], bytes: Buffer) => {
    totalBytes += bytes.byteLength;
    if (totalBytes > maximumBytes) { stop('WORKER_NATIVE_OUTPUT_LIMIT'); return; }
    target.push(Buffer.from(bytes));
    if (!capture) return;
    child[channel].pause();
    void capture.append(channel, bytes).then(() => { child[channel].resume(); }, () => {
      stop('WORKER_NATIVE_OUTPUT_PERSISTENCE_FAILED');
      child.stdout.destroy(); child.stderr.destroy();
    });
  };
  child.stdout.on('data', (bytes: Buffer) => receive('stdout', stdout, bytes));
  child.stderr.on('data', (bytes: Buffer) => receive('stderr', stderr, bytes));
  return {
    snapshot: () => ({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }),
    flush: () => capture ? capture.flush() : Promise.resolve(),
  };
}
