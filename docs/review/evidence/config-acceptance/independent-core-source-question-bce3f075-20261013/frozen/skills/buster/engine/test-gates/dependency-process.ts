import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

export interface DependencyProcessOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
  readonly signal?: AbortSignal;
}
export interface DependencyProcessResult {
  readonly ok: boolean;
  readonly code: 'DEPENDENCY_OK' | 'DEPENDENCY_CANCELLED' | 'DEPENDENCY_TIMEOUT' | 'DEPENDENCY_OUTPUT_LIMIT' | 'DEPENDENCY_SPAWN_FAILED' | 'DEPENDENCY_EXIT_FAILED';
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly errno: string | null;
  readonly outputBytes: number;
  readonly outputDigest: string;
  readonly durationMs: number;
}

export function validateDependencyProcessLimits(options: Pick<DependencyProcessOptions, 'maximumExecutionMs' | 'maximumOutputBytes'>): void {
  for (const [value, maximum] of [[options.maximumExecutionMs, 30_000], [options.maximumOutputBytes, 1024 * 1024]] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('DEPENDENCY_PROCESS_LIMIT_INVALID');
  }
}

/** Wait for actual child closure after termination; never race against detached work. */
export async function runDependencyProcess(options: DependencyProcessOptions): Promise<DependencyProcessResult> {
  validateDependencyProcessLimits(options);
  const started = Date.now();
  if (options.signal?.aborted) return { ok: false, code: 'DEPENDENCY_CANCELLED', exitCode: null, signal: null, errno: null,
    outputBytes: 0, outputDigest: `sha256:${crypto.createHash('sha256').digest('hex')}`, durationMs: 0 };
  return await new Promise<DependencyProcessResult>((resolve) => {
    const child = spawn(options.executable, [...options.args], {
      detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    });
    let failure: DependencyProcessResult['code'] | undefined;
    let errno: string | null = null;
    let outputBytes = 0;
    const digest = crypto.createHash('sha256');
    const stop = (code: DependencyProcessResult['code']): void => {
      failure ??= code;
      if (!child.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ESRCH') { errno = 'TERMINATION_FAILED'; child.kill('SIGKILL'); }
      }
    };
    const cancel = (): void => stop('DEPENDENCY_CANCELLED');
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timer = setTimeout(() => stop('DEPENDENCY_TIMEOUT'), options.maximumExecutionMs);
    const output = (chunk: Buffer): void => {
      if (failure) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > options.maximumOutputBytes) { stop('DEPENDENCY_OUTPUT_LIMIT'); return; }
      digest.update(chunk);
    };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.once('error', (error: NodeJS.ErrnoException) => {
      failure ??= 'DEPENDENCY_SPAWN_FAILED';
      errno = typeof error.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code) ? error.code : 'UNKNOWN';
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      const code = failure ?? (exitCode === 0 ? 'DEPENDENCY_OK' : 'DEPENDENCY_EXIT_FAILED');
      resolve({ ok: code === 'DEPENDENCY_OK', code, exitCode, signal, errno, outputBytes,
        outputDigest: `sha256:${digest.digest('hex')}`, durationMs: Date.now() - started });
    });
  });
}
