import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;

export interface CommandRunnerOptions {
  readonly maxOutputBytes: number;
  readonly maxExecutionMs: number;
  readonly terminationGraceMs: number;
}

export class CommandRunner {
  readonly #active = new Set<ManagedChild>();
  readonly #options: CommandRunnerOptions;
  #stopping = false;

  constructor(options: CommandRunnerOptions) { this.#options = options; }
  get stopping(): boolean { return this.#stopping; }

  async run(executable: string, args: readonly string[], cwd: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: {} });
      this.#active.add(child);
      const output = { stdout: '', stderr: '', bytes: 0 };
      let settled = false;
      const rejectOnce = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        output.bytes += chunk.byteLength;
        if (output.bytes > this.#options.maxOutputBytes) {
          this.#terminate(child);
          rejectOnce(new Error('COMMAND_OUTPUT_LIMIT_EXCEEDED'));
          return;
        }
        output[stream] += chunk.toString('utf8');
      };
      const abort = (): void => { this.#terminate(child); rejectOnce(new Error('ADAPTER_CANCELLED')); };
      const timeout = setTimeout(() => { this.#terminate(child); rejectOnce(new Error('COMMAND_TIMEOUT')); }, this.#options.maxExecutionMs);
      timeout.unref();
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      child.once('error', rejectOnce);
      child.once('close', (code, terminationSignal) => {
        this.#active.delete(child);
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (settled) return;
        settled = true;
        resolve({ exitCode: code, signal: terminationSignal, stdout: output.stdout, stderr: output.stderr });
      });
    });
  }

  async shutdown(): Promise<void> {
    this.#stopping = true;
    await Promise.all([...this.#active].map((child) => new Promise<void>((resolve) => {
      child.once('close', resolve);
      this.#terminate(child);
    })));
  }

  #terminate(child: ManagedChild): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, this.#options.terminationGraceMs);
    force.unref();
    child.once('close', () => clearTimeout(force));
  }
}
