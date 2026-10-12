import { spawn } from 'node:child_process';
import { ProcessInputLifecycle } from './process-input-lifecycle.ts';

export class ProcessInputCleanupError extends AggregateError {
  constructor(prefix: string, failure: Error | undefined, cleanup: unknown) {
    super([...(failure ? [failure] : []), cleanup], `${prefix}_CLEANUP_FAILED`, { cause: failure ?? cleanup });
    this.name = 'ProcessInputCleanupError';
  }
}

export interface ProcessInputOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly maximumOutputBytes: number;
  readonly prefix: string;
  readonly outputLimitError?: string;
  readonly input?: string | Buffer | null;
}
export interface ProcessInputResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

// Attach every stream error handler before sending input. Failures settle only
// after close and process-group acknowledgement, with a bounded failure on incomplete disposal.
export function runProcessInput(command: string, args: readonly string[], options: ProcessInputOptions): Promise<ProcessInputResult> {
  if (options.signal?.aborted) return Promise.reject(new Error(`${options.prefix}_CANCELLED`, { cause: options.signal.reason }));
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: options.env } : {}), detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const output = { stdout: [] as Buffer[], stderr: [] as Buffer[], stdoutBytes: 0, stderrBytes: 0 };
    let failure: Error | undefined;
    let finishing = false;
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolveClose) => { resolveClosed = resolveClose; });
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let lifecycle: ProcessInputLifecycle;
    const settle = (cleanup?: unknown): void => {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      const stdout = Buffer.concat(output.stdout, output.stdoutBytes);
      const stderr = Buffer.concat(output.stderr, output.stderrBytes);
      const error = cleanup ? new ProcessInputCleanupError(options.prefix, failure, cleanup) : failure;
      if (error) reject(Object.assign(error, { stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') }));
      else resolve({ code: exitCode, signal: exitSignal, stdout, stderr });
    };
    const finish = (): void => {
      if (finishing) return;
      finishing = true;
      void lifecycle.cleanup().then(() => settle(), (error) => settle(error));
    };
    const fail = (error: Error): void => {
      failure ??= error;
      child.stdin.destroy();
      finish();
    };
    const collect = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      if (failure) return;
      const key = stream === 'stdout' ? 'stdoutBytes' : 'stderrBytes';
      if (chunk.byteLength > options.maximumOutputBytes - output[key]) {
        fail(new Error(options.outputLimitError ?? `${options.prefix}_OUTPUT_LIMIT`)); return;
      }
      output[key] += chunk.byteLength; output[stream].push(chunk);
    };
    const abort = (): void => fail(new Error(`${options.prefix}_CANCELLED`, { cause: options.signal?.reason }));
    const timer = setTimeout(() => fail(new Error(`${options.prefix}_TIMEOUT`)), options.timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdin.on('error', (error) => fail(new Error(`${options.prefix}_STDIN_FAILED`, { cause: error })));
    child.stdout.on('error', (error) => fail(new Error(`${options.prefix}_STDOUT_FAILED`, { cause: error })));
    child.stderr.on('error', (error) => fail(new Error(`${options.prefix}_STDERR_FAILED`, { cause: error })));
    child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
    child.once('error', fail);
    child.once('exit', (code, signal) => { exitCode = code; exitSignal = signal; finish(); });
    child.once('close', (code, signal) => {
      exitCode = code; exitSignal = signal; resolveClosed(); finish();
    });
    lifecycle = new ProcessInputLifecycle(child, closed);
    if (options.signal?.aborted) { abort(); return; }
    try { child.stdin.end(options.input ?? undefined); }
    catch (error) { fail(new Error(`${options.prefix}_STDIN_FAILED`, { cause: error })); }
  });
}
