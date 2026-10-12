import { spawn } from 'node:child_process';
import { ProcessTermination } from './process-termination.ts';

export interface ProcessOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  input?: string | undefined;
  signal?: AbortSignal | undefined;
  timeout: number;
  maxBuffer?: number;
}
export interface ProcessResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  error?: string;
}
export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error('LINT_CANCELLED', { cause: signal.reason }), { code: 'LINT_CANCELLED' });
}

/** One native lifecycle for lint tools and candidate Git. */
export async function runProcess(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  assertNotAborted(options.signal);
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let bytes = 0;
  const termination = new ProcessTermination(child);
  const closed = new Promise<number | null>((resolve) => child.once('close', resolve));
  const capture = (chunks: Buffer[], chunk: Buffer): void => {
    bytes += chunk.length;
    if (bytes > (options.maxBuffer ?? 10 * 1024 * 1024)) termination.stop('output limit exceeded');
    else chunks.push(chunk);
  };
  child.stdout.on('data', (chunk: Buffer) => capture(stdout, chunk));
  child.stderr.on('data', (chunk: Buffer) => capture(stderr, chunk));
  child.stdin.on('error', (error: NodeJS.ErrnoException) => { if (error.code !== 'EPIPE') termination.error = error; });
  child.once('error', (error) => { termination.error = error; });
  termination.capture();
  const aborted = (): void => termination.stop('cancelled');
  options.signal?.addEventListener('abort', aborted, { once: true });
  if (options.signal?.aborted) aborted();
  const timer = setTimeout(() => termination.stop('timeout'), options.timeout);
  child.stdin.end(options.input);
  let status: number | null;
  try {
    status = await termination.finish(closed);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', aborted);
  }
  assertNotAborted(options.signal);
  return processResult(status, termination.reason, termination.error, stdout, stderr, options.timeout);
}

function processResult(status: number | null, reason: string | undefined, startError: Error | undefined, stdout: Buffer[], stderr: Buffer[], timeout: number): ProcessResult {
  const timedOut = reason === 'timeout' || (startError as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  return {
    ok: status === 0 && !reason && !startError,
    stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
    exitCode: reason || startError ? -1 : status ?? -1,
    ...(timedOut ? { timedOut: true } : {}),
    ...(reason || startError ? { error: timedOut ? `timeout after ${timeout}ms` : reason ?? startError!.message } : {}),
  };
}
