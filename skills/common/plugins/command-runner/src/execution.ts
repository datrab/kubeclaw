import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { CommandProcessGroup } from './process-group.ts';
import { cleanupCgroup } from './cgroup.ts';
import { processFacts } from './process-facts.ts';
import { CommandRunError, type CommandOutputRecord } from './types.ts';

type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;
export interface ExecutionLimits {
  readonly maxOutputBytes: number;
  readonly maxExecutionMs: number;
  readonly maximumProcesses: number;
  readonly memoryBytes: number;
  readonly cpuMillis: number;
  readonly openFiles: number;
}
interface ExecutionOptions {
  readonly child: ManagedChild;
  readonly signal: AbortSignal;
  readonly limits: ExecutionLimits;
  readonly graceMs: number;
  readonly sandboxed: boolean;
  readonly cgroup: string | undefined;
}
const MAXIMUM_OUTPUT_RECORDS = 4096;

export class CommandExecution {
  readonly result: Promise<Readonly<Record<string, unknown>>>;
  readonly finished: Promise<void>;
  readonly #options: ExecutionOptions;
  readonly #group: CommandProcessGroup;
  readonly #output = { stdout: '', stderr: '', bytes: 0, sequence: 0, records: [] as CommandOutputRecord[] };
  readonly #resources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 1 };
  readonly #timeout: NodeJS.Timeout;
  readonly #sampleTimer: NodeJS.Timeout;
  #pendingError: Error | undefined;
  #settled = false;
  #resolve!: (result: Readonly<Record<string, unknown>>) => void;
  #reject!: (error: Error) => void;
  #finishActive!: () => void;
  readonly #abort = (): void => this.#fail(new Error('ADAPTER_CANCELLED', { cause: this.#options.signal.reason }));

  constructor(options: ExecutionOptions) {
    this.#options = options;
    this.#group = new CommandProcessGroup(options.child, options.graceMs, options.cgroup);
    this.result = new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    this.finished = new Promise((resolve) => { this.#finishActive = resolve; });
    this.#timeout = setTimeout(() => this.#fail(new Error('COMMAND_TIMEOUT')), options.limits.maxExecutionMs);
    this.#timeout.unref();
    this.#sampleTimer = setInterval(() => this.#sample(), 25);
    this.#sampleTimer.unref();
    options.signal.addEventListener('abort', this.#abort, { once: true });
    options.child.stdout.on('data', (chunk: Buffer) => this.#append('stdout', chunk));
    options.child.stderr.on('data', (chunk: Buffer) => this.#append('stderr', chunk));
    options.child.once('error', (error) => this.#settle(error));
    options.child.once('close', (code, signal) => { void this.#close(code, signal); });
  }

  terminate(): void { this.#group.terminate(); }

  #fail(error: Error): void {
    this.#pendingError ??= error;
    this.terminate();
  }

  #stopMonitoring(): void {
    clearTimeout(this.#timeout);
    clearInterval(this.#sampleTimer);
    this.#options.signal.removeEventListener('abort', this.#abort);
  }

  #settle(error?: Error, code?: number | null, signal?: NodeJS.Signals | null): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#stopMonitoring();
    const result = { exitCode: code ?? null, signal: signal ?? null, stdout: this.#output.stdout,
      stderr: this.#output.stderr, records: this.#output.records, resources: this.#resources };
    if (error) this.#reject(new CommandRunError(error.message, result, { cause: error }));
    else this.#resolve(result);
  }

  async #close(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    this.#stopMonitoring();
    this.#sample();
    try {
      await this.#group.cleanup();
      cleanupCgroup(this.#options.cgroup);
      this.#settle(this.#pendingError, code, signal);
    } catch (error) {
      this.#settle(error instanceof Error ? error : new Error(String(error)), code, signal);
    } finally { this.#finishActive(); }
  }

  #append(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    if (this.#settled) return;
    this.#output.bytes += chunk.byteLength;
    if (this.#output.bytes > this.#options.limits.maxOutputBytes) {
      this.#fail(new Error('COMMAND_OUTPUT_LIMIT_EXCEEDED'));
      return;
    }
    const content = chunk.toString('utf8');
    this.#output[stream] += content;
    const last = this.#output.records.at(-1);
    if (last?.stream === stream) {
      this.#output.records[this.#output.records.length - 1] = { ...last, content: last.content + content };
    } else if (this.#output.records.length >= MAXIMUM_OUTPUT_RECORDS) {
      this.#fail(new Error('COMMAND_OUTPUT_RECORD_LIMIT_EXCEEDED'));
    } else {
      this.#output.sequence += 1;
      this.#output.records.push({ sequence: this.#output.sequence, stream, content });
    }
  }

  #sample(): void {
    const facts = processFacts(this.#options.child.pid ?? -1, this.#options.cgroup);
    if (!facts) {
      if (this.#options.cgroup) this.#fail(new Error('COMMAND_CGROUP_ACCOUNTING_UNAVAILABLE'));
      return;
    }
    const count = this.#options.sandboxed ? Math.max(0, facts.processes - 1) : facts.processes;
    this.#resources.cpuTimeMs = Math.max(this.#resources.cpuTimeMs, facts.cpuTimeMs);
    this.#resources.maximumMemoryBytes = Math.max(this.#resources.maximumMemoryBytes, facts.memoryBytes);
    this.#resources.maximumProcesses = Math.max(this.#resources.maximumProcesses, count);
    if (count > this.#options.limits.maximumProcesses) this.#fail(new Error('COMMAND_PROCESS_LIMIT_EXCEEDED'));
    else if (facts.memoryBytes > this.#options.limits.memoryBytes) this.#fail(new Error('COMMAND_MEMORY_LIMIT_EXCEEDED'));
    else if (facts.cpuTimeMs > this.#options.limits.cpuMillis) this.#fail(new Error('COMMAND_CPU_LIMIT_EXCEEDED'));
  }
}
