/** Test-only read observation at the real executor boundary. No ownership or kernel proof. */
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

export const observedProcessLimits: unknown[] = [];
export function observeProcessLimits(value: unknown): void {
  observedProcessLimits.push(structuredClone(value));
}

export function observeNativeProcessBoundary() {
  const target = fileURLToPath(new URL('../../../worker/core/worker/native-attempt-executor.ts', import.meta.url));
  const observer = import.meta.url;
  const anchor = 'export async function executeNativeWorkerAttempt(options: NativeWorkerAttemptExecutorOptions): Promise<WorkerAttemptResultV3> {';
  return registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.startsWith('file:') || fileURLToPath(url) !== target) return result;
      const source = typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source!);
      if (source.split(anchor).length !== 2) throw new Error('TEST_EXECUTOR_OBSERVATION_ANCHOR_CHANGED');
      return { ...result, source: `import { observeProcessLimits } from ${JSON.stringify(observer)};\n`
        + source.replace(anchor, `${anchor}\n  observeProcessLimits(options.process.limits);`) };
    },
  });
}
