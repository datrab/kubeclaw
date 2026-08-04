import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

type GitChild = ChildProcessByStdio<null, Readable, Readable>;
type EffectResult = Readonly<Record<string, unknown>>;
export interface RunnerOptions { readonly executable: string; readonly authorName: string; readonly authorEmail: string; readonly maxExecutionMs: number; readonly maxOutputBytes: number; readonly terminationGraceMs: number; }

export class GitRunner {
  readonly #children = new Set<GitChild>();
  readonly #options: RunnerOptions;
  readonly #settled = new Map<GitChild, Promise<void>>();
  #shuttingDown = false;
  constructor(options: RunnerOptions) { this.#options = options; }

  async run(cwd: string, args: readonly string[], signal: AbortSignal): Promise<EffectResult> {
    if (this.#shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    return new Promise((resolve, reject) => this.#start(cwd, args, signal, resolve, reject));
  }

  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    const pending = [...this.#settled.values()];
    for (const child of this.#children) if (child.exitCode === null) this.#kill(child, 'SIGTERM');
    const force = setTimeout(() => {
      for (const child of this.#children) if (child.exitCode === null) this.#kill(child, 'SIGKILL');
    }, this.#options.terminationGraceMs);
    await Promise.allSettled(pending);
    clearTimeout(force);
  }

  #start(cwd: string, args: readonly string[], signal: AbortSignal, resolve: (value: EffectResult) => void, reject: (error: Error) => void): void {
    const child = spawn(this.#options.executable, ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', `user.name=${this.#options.authorName}`, '-c', `user.email=${this.#options.authorEmail}`, ...args], { cwd, detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: {} });
    this.#children.add(child);
    const output = { stdout: '', stderr: '', bytes: 0 };
    let completed = false;
    let requestedError: Error | undefined;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveSettled!: () => void;
    this.#settled.set(child, new Promise<void>((done) => { resolveSettled = done; }));
    const finish = (callback: () => void): void => {
      if (completed) return;
      completed = true; clearTimeout(timeout); if (terminationTimer) clearTimeout(terminationTimer);
      signal.removeEventListener('abort', cancel); this.#children.delete(child); this.#settled.delete(child); resolveSettled(); callback();
    };
    const terminate = (): void => {
      if (child.exitCode !== null) return;
      this.#kill(child, 'SIGTERM');
      terminationTimer = setTimeout(() => { if (child.exitCode === null) this.#kill(child, 'SIGKILL'); }, this.#options.terminationGraceMs);
    };
    const fail = (error: Error): void => { if (!requestedError && !completed) { requestedError = error; terminate(); } };
    const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      output.bytes += chunk.byteLength;
      if (output.bytes > this.#options.maxOutputBytes) { fail(new Error(`GIT_OUTPUT_LIMIT_EXCEEDED:${this.#options.maxOutputBytes}`)); return; }
      output[stream] += chunk.toString('utf8');
    };
    const cancel = (): void => fail(new Error('ADAPTER_CANCELLED'));
    const timeout = setTimeout(() => fail(new Error(`GIT_TIMEOUT:${this.#options.maxExecutionMs}`)), this.#options.maxExecutionMs);
    signal.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk)); child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.once('error', (error) => finish(() => reject(requestedError ?? error)));
    child.once('close', (code, childSignal) => finish(() => {
      if (requestedError) reject(requestedError);
      else if (code !== 0) reject(new Error(`GIT_COMMAND_FAILED:${String(code)}:${String(childSignal)}:${output.stderr.slice(0, 4096)}`));
      else resolve({ exitCode: code, signal: childSignal, stdout: output.stdout, stderr: output.stderr });
    }));
  }

  #kill(child: GitChild, signal: NodeJS.Signals): void {
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, signal); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    }
    child.kill(signal);
  }
}
