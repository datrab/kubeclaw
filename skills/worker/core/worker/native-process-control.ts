import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { NativeWorkerControlChannel, type NativeWorkerControlLimits } from './native-control-channel.ts';

export interface NativeWorkerProcessControl {
  readonly limits: NativeWorkerControlLimits;
  readonly run: (channel: NativeWorkerControlChannel, signal: AbortSignal) => Promise<void>;
}

/** The optional fourth pipe carries role-owned phases, not a second completion boundary. */
export function startNativeProcessControl(child: ChildProcessWithoutNullStreams, options: NativeWorkerProcessControl | undefined,
  stop: (code: string) => void, closeTimeoutMs: number): { finish: () => Promise<void> } {
  if (!options) return { finish: async () => {} };
  const channel = new NativeWorkerControlChannel(child.stdio[3], options.limits);
  const controller = new AbortController();
  const work = Promise.resolve().then(() => options.run(channel, controller.signal)).catch(() => {
    stop('WORKER_NATIVE_CONTROL_FAILED');
    channel.destroy();
  });
  let completion: Promise<void> | undefined;
  const finish = async () => {
    controller.abort(new Error('WORKER_NATIVE_CONTROL_PROCESS_CLOSED')); channel.destroy();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([work, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('WORKER_NATIVE_CONTROL_UNSETTLED')), closeTimeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  };
  return { finish: () => completion ??= finish() };
}
