import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { NativeWorkerOwnership, NativeWorkerOwnershipLease } from './native-worker-ownership.ts';
import type { WorkerOwnershipIdentity } from './ownership-store.ts';
import type { NativeWorkerResourceObservation } from './native-resource-observation.ts';
import type { NativeWorkerOutputCapture } from './native-output-spool.ts';
import { captureNativeWorkerOutput } from './native-process-output.ts';

export interface NativeWorkerProcessLimits {
  readonly cpuTimeMs: number;
  readonly memoryBytes: number;
  readonly tasks: number;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly maximumInputBytes: number;
  readonly maximumOutputBytes: number;
  readonly closeTimeoutMs: number;
}

export interface NativeWorkerProcessOptions {
  readonly owner: NativeWorkerOwnership;
  readonly identity: WorkerOwnershipIdentity;
  readonly limits: NativeWorkerProcessLimits;
  readonly command: Parameters<NativeWorkerOwnershipLease['launch']>[0];
  readonly input: Uint8Array;
  readonly signal?: AbortSignal;
  readonly outputCapture?: NativeWorkerOutputCapture;
}

export interface NativeWorkerProcessResult {
  readonly schemaVersion: 'worker-native-process-result.v1';
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly fault: string | null;
  readonly resources: NativeWorkerResourceObservation;
}

function validateLimits(limits: NativeWorkerProcessLimits): void {
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('WORKER_NATIVE_PROCESS_LIMIT_INVALID');
  }
  for (const value of [limits.timeoutMs, limits.pollIntervalMs, limits.closeTimeoutMs]) {
    if (value > 2_147_483_647) throw new Error('WORKER_NATIVE_PROCESS_TIMER_INVALID');
  }
}

function budgetFault(observation: NativeWorkerResourceObservation, limits: NativeWorkerProcessLimits): string | null {
  if (observation.oomKills || observation.maximumMemoryBytes > limits.memoryBytes) return 'WORKER_MEMORY_LIMIT';
  if (observation.taskLimitHits || observation.maximumTasks > limits.tasks) return 'WORKER_TASK_LIMIT';
  if (observation.cpuTimeMicroseconds / 1000 > limits.cpuTimeMs) return 'WORKER_CPU_LIMIT';
  return null;
}

/** Entire trusted attempt host, including its completion I/O and every descendant. */
export async function runNativeWorkerProcess(options: NativeWorkerProcessOptions): Promise<NativeWorkerProcessResult> {
  const limits = { ...options.limits };
  validateLimits(limits);
  if (options.input.byteLength > limits.maximumInputBytes) throw new Error('WORKER_NATIVE_INPUT_LIMIT');
  const input = Buffer.from(options.input);
  const command = structuredClone(options.command);
  options.signal?.throwIfAborted();
  const lease = await options.owner.allocate(options.identity, limits);
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    options.signal?.throwIfAborted();
    child = await lease.launch(command);
    return await collectProcess(child, lease, input, limits, options.signal, options.outputCapture);
  } finally {
    // Also stop a launcher interrupted before joining; it has no authority to start later.
    child?.kill('SIGKILL');
    await lease.finish();
  }
}

async function collectProcess(child: ChildProcessWithoutNullStreams, lease: NativeWorkerOwnershipLease,
  input: Buffer, limits: NativeWorkerProcessLimits, signal?: AbortSignal, outputCapture?: NativeWorkerOutputCapture): Promise<NativeWorkerProcessResult> {
  let fault: string | null = null;
  let closeTimer: NodeJS.Timeout | undefined;
  let closing: Promise<NativeWorkerResourceObservation> | undefined;
  let finish: () => void = () => {};
  const close = () => {
    child.kill('SIGKILL');
    closing ??= lease.finish();
    // The caller always observes this rejection after the child boundary settles.
    void closing.catch(() => {});
    closeTimer ??= setTimeout(() => {
      fault = 'WORKER_NATIVE_PROCESS_DRAIN_TIMEOUT';
      finish();
    }, limits.closeTimeoutMs);
  };
  const exited = new Promise<void>(resolve => { finish = resolve; });
  const stop = (code: string) => {
    fault ??= code;
    close();
  };
  const output = captureNativeWorkerOutput(child, limits.maximumOutputBytes, stop, outputCapture);
  const abort = () => stop('WORKER_ATTEMPT_CANCELLED');
  child.once('error', () => stop('WORKER_NATIVE_PROCESS_START_FAILED'));
  child.stdin.once('error', () => stop('WORKER_NATIVE_PROCESS_INPUT_FAILED'));
  child.once('exit', () => { close(); });
  child.once('close', finish);
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => stop('WORKER_ATTEMPT_TIMEOUT'), limits.timeoutMs);
  const poll = setInterval(() => {
    if (closing) return;
    try { const code = budgetFault(lease.observe(), limits); if (code) stop(code); }
    catch { stop('WORKER_RESOURCE_MEASUREMENT_UNAVAILABLE'); }
  }, limits.pollIntervalMs);
  try {
    if (signal?.aborted) abort();
    else child.stdin.end(input);
    await exited;
    close();
    const resources = await closing!;
    await output.flush();
    fault ??= budgetFault(resources, limits);
    if (child.exitCode !== 0 && fault === null) fault = 'WORKER_NATIVE_PROCESS_FAILED';
    return { schemaVersion: 'worker-native-process-result.v1', ...output.snapshot(),
      exitCode: child.exitCode, signal: child.signalCode, fault, resources };
  } finally {
    clearTimeout(deadline); clearInterval(poll); if (closeTimer) clearTimeout(closeTimer);
    signal?.removeEventListener('abort', abort);
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
  }
}
