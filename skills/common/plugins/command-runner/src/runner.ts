import { spawn, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import type { Readable } from 'node:stream';

type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;

export interface CommandOutputRecord {
  readonly sequence: number;
  readonly stream: 'stdout' | 'stderr';
  readonly content: string;
}

export interface CommandRunLimits {
  readonly maxOutputBytes?: number;
  readonly maxExecutionMs?: number;
  readonly maximumProcesses?: number;
  readonly memoryBytes?: number;
  readonly cpuMillis?: number;
  readonly openFiles?: number;
}

export interface CommandRunRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly writableRoot?: string;
  readonly readOnlyRoots?: readonly string[];
  readonly limits?: CommandRunLimits;
}

export interface CommandRunnerOptions {
  readonly maxOutputBytes: number;
  readonly maxExecutionMs: number;
  readonly terminationGraceMs: number;
  readonly maximumProcesses?: number;
  readonly sandboxExecutable?: string;
  readonly sandboxMemoryBytes?: number;
  readonly sandboxCpuMillis?: number;
  readonly sandboxOpenFiles?: number;
  readonly cgroupRoot?: string;
  readonly allowSampledProcessLimit?: boolean;
}

interface ProcessFacts {
  readonly cpuTimeMs: number;
  readonly memoryBytes: number;
  readonly processes: number;
}

export class CommandRunError extends Error {
  readonly output: Readonly<Record<string, unknown>>;
  constructor(code: string, output: Readonly<Record<string, unknown>>) {
    super(code);
    this.name = 'CommandRunError';
    this.output = output;
  }
}

const MAXIMUM_OUTPUT_RECORDS = 4096;

function cgroupRoot(value: string): string {
  const root = fs.realpathSync(value);
  const controllers = fs.readFileSync(`${root}/cgroup.controllers`, 'utf8').trim().split(/\s+/u);
  if (!['pids', 'memory', 'cpu'].every((controller) => controllers.includes(controller))) {
    throw new Error('COMMAND_CGROUP_CONTROLLERS_UNAVAILABLE');
  }
  const subtreeControl = `${root}/cgroup.subtree_control`;
  try { fs.writeFileSync(subtreeControl, '+pids +memory +cpu'); }
  catch { throw new Error('COMMAND_CGROUP_CONTROLLERS_NOT_DELEGATED'); }
  const enabled = fs.readFileSync(subtreeControl, 'utf8').trim().split(/\s+/u);
  if (!['pids', 'memory', 'cpu'].every((controller) => enabled.includes(controller))) {
    throw new Error('COMMAND_CGROUP_CONTROLLERS_NOT_ENABLED');
  }
  return root;
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function cgroupFacts(group: string): ProcessFacts | null {
  try {
    const cpu = fs.readFileSync(`${group}/cpu.stat`, 'utf8');
    const usageMicroseconds = Number(cpu.match(/^usage_usec\s+(\d+)$/mu)?.[1] ?? NaN);
    const memoryBytes = Number(fs.readFileSync(`${group}/memory.current`, 'utf8').trim());
    const processes = Number(fs.readFileSync(`${group}/pids.current`, 'utf8').trim());
    if (![usageMicroseconds, memoryBytes, processes].every(Number.isFinite)) return null;
    return { cpuTimeMs: usageMicroseconds / 1000, memoryBytes, processes };
  } catch {
    return null;
  }
}

function processFacts(pid: number, cgroup?: string): ProcessFacts | null {
  try {
    const parents = new Map<number, number>();
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/u.test(name)) continue;
      try {
        const status = fs.readFileSync(`/proc/${name}/status`, 'utf8');
        parents.set(Number(name), Number(status.match(/^PPid:\s+(\d+)$/mu)?.[1] ?? -1));
      } catch { /* A process can stop during the sample. */ }
    }
    const descendants = new Set([pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [candidate, parent] of parents) {
        if (descendants.has(parent) && !descendants.has(candidate)) {
          descendants.add(candidate);
          changed = true;
        }
      }
    }
    let cpuTimeMs = 0;
    let memoryBytes = 0;
    for (const processId of descendants) {
      try {
        const stat = fs.readFileSync(`/proc/${processId}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u);
        cpuTimeMs += ((Number(fields[11]) + Number(fields[12])) / 100) * 1000;
        const status = fs.readFileSync(`/proc/${processId}/status`, 'utf8');
        memoryBytes += Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/mu)?.[1] ?? 0) * 1024;
      } catch { /* A process can stop during the sample. */ }
    }
    const group = cgroup ? cgroupFacts(cgroup) : null;
    return { cpuTimeMs: group?.cpuTimeMs ?? cpuTimeMs,
      memoryBytes: group?.memoryBytes ?? memoryBytes, processes: descendants.size };
  } catch {
    return null;
  }
}

export class CommandRunner {
  readonly #active = new Set<ManagedChild>();
  readonly #options: CommandRunnerOptions;
  #stopping = false;

  constructor(options: CommandRunnerOptions) {
    if (options.cgroupRoot) cgroupRoot(options.cgroupRoot);
    this.#options = options;
  }
  get stopping(): boolean { return this.#stopping; }

  async run(executable: string, args: readonly string[], cwd: string, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>>;
  async run(request: CommandRunRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>>;
  async run(executableOrRequest: string | CommandRunRequest, argsOrSignal: readonly string[] | AbortSignal,
    cwd?: string, legacySignal?: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const request: CommandRunRequest = typeof executableOrRequest === 'string'
      ? { executable: executableOrRequest, args: argsOrSignal as readonly string[], cwd: cwd!, environment: {} }
      : executableOrRequest;
    const signal = (typeof executableOrRequest === 'string' ? legacySignal : argsOrSignal) as AbortSignal;
    const limits = request.limits ?? {};
    const maxOutputBytes = Math.min(this.#options.maxOutputBytes,
      positive(limits.maxOutputBytes, this.#options.maxOutputBytes));
    const maxExecutionMs = Math.min(this.#options.maxExecutionMs,
      positive(limits.maxExecutionMs, this.#options.maxExecutionMs));
    const maximumProcesses = Math.min(positive(this.#options.maximumProcesses, 1024),
      positive(limits.maximumProcesses, positive(this.#options.maximumProcesses, 1024)));
    const memoryBytes = Math.min(positive(this.#options.sandboxMemoryBytes, 1024 * 1024 * 1024),
      positive(limits.memoryBytes, positive(this.#options.sandboxMemoryBytes, 1024 * 1024 * 1024)));
    const cpuMillis = Math.min(positive(this.#options.sandboxCpuMillis, maxExecutionMs),
      positive(limits.cpuMillis, positive(this.#options.sandboxCpuMillis, maxExecutionMs)));
    const openFiles = Math.min(positive(this.#options.sandboxOpenFiles, 256),
      positive(limits.openFiles, positive(this.#options.sandboxOpenFiles, 256)));
    const cgroup = this.#options.sandboxExecutable
      ? this.#createCgroup(maximumProcesses, memoryBytes, cpuMillis, maxExecutionMs)
      : undefined;
    if (this.#options.sandboxExecutable && !cgroup && !this.#options.allowSampledProcessLimit) {
      throw new Error('COMMAND_CGROUP_REQUIRED');
    }
    const program = this.#options.sandboxExecutable ?? request.executable;
    const programArgs = this.#options.sandboxExecutable
      ? [String(memoryBytes), String(Math.max(1, Math.ceil(cpuMillis / 1000))), String(Math.max(8, openFiles)),
          ...(cgroup ? ['--cgroup', cgroup] : []),
          ...(request.readOnlyRoots ?? []).flatMap((root) => ['--read-root', root]),
          ...(request.writableRoot ? ['--write-root', request.writableRoot] : []), request.executable, ...request.args]
      : [...request.args];
    return new Promise((resolve, reject) => {
      const child = spawn(program, programArgs, {
        cwd: request.cwd,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...(request.environment ?? {}) },
      });
      this.#active.add(child);
      const output = { stdout: '', stderr: '', bytes: 0, sequence: 0, records: [] as CommandOutputRecord[] };
      let settled = false;
      let maximumMemoryBytes = 0;
      let maximumProcessCount = 1;
      let cpuTimeMs = 0;
      let pendingError: Error | undefined;
      const finish = (error?: Error, code?: number | null, terminationSignal?: NodeJS.Signals | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(sampleTimer);
        signal.removeEventListener('abort', abort);
        const result = { exitCode: code ?? null, signal: terminationSignal ?? null, stdout: output.stdout,
          stderr: output.stderr, records: output.records, resources: { cpuTimeMs, maximumMemoryBytes, maximumProcesses: maximumProcessCount } };
        if (error) reject(new CommandRunError(error.message, result));
        else resolve(result);
      };
      const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        if (settled) return;
        output.bytes += chunk.byteLength;
        if (output.bytes > maxOutputBytes) {
          pendingError = new Error('COMMAND_OUTPUT_LIMIT_EXCEEDED');
          this.#terminate(child);
          return;
        }
        const content = chunk.toString('utf8');
        output[stream] += content;
        const last = output.records.at(-1);
        if (last?.stream === stream) {
          output.records[output.records.length - 1] = { ...last, content: last.content + content };
        } else if (output.records.length >= MAXIMUM_OUTPUT_RECORDS) {
          pendingError = new Error('COMMAND_OUTPUT_RECORD_LIMIT_EXCEEDED');
          this.#terminate(child);
        } else {
          output.sequence += 1;
          output.records.push({ sequence: output.sequence, stream, content });
        }
      };
      const sample = (): void => {
        const facts = processFacts(child.pid ?? -1, cgroup);
        if (!facts) {
          if (cgroup) {
            pendingError = new Error('COMMAND_CGROUP_ACCOUNTING_UNAVAILABLE');
            this.#terminate(child);
          }
          return;
        }
        const projectProcesses = this.#options.sandboxExecutable
          ? Math.max(0, facts.processes - 1)
          : facts.processes;
        cpuTimeMs = Math.max(cpuTimeMs, facts.cpuTimeMs);
        maximumMemoryBytes = Math.max(maximumMemoryBytes, facts.memoryBytes);
        maximumProcessCount = Math.max(maximumProcessCount, projectProcesses);
        if (projectProcesses > maximumProcesses) {
          pendingError = new Error('COMMAND_PROCESS_LIMIT_EXCEEDED');
          this.#terminate(child);
        } else if (facts.memoryBytes > memoryBytes) {
          pendingError = new Error('COMMAND_MEMORY_LIMIT_EXCEEDED');
          this.#terminate(child);
        } else if (facts.cpuTimeMs > cpuMillis) {
          pendingError = new Error('COMMAND_CPU_LIMIT_EXCEEDED');
          this.#terminate(child);
        }
      };
      const abort = (): void => { pendingError = new Error('ADAPTER_CANCELLED'); this.#terminate(child); };
      const timeout = setTimeout(() => { pendingError = new Error('COMMAND_TIMEOUT'); this.#terminate(child); }, maxExecutionMs);
      timeout.unref();
      const sampleTimer = setInterval(sample, 25);
      sampleTimer.unref();
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      child.once('error', (error) => finish(error));
      child.once('close', async (code, terminationSignal) => {
        this.#active.delete(child);
        clearTimeout(timeout);
        clearInterval(sampleTimer);
        signal.removeEventListener('abort', abort);
        sample();
        await this.#cleanupGroup(child);
        this.#cleanupCgroup(cgroup);
        finish(pendingError, code, terminationSignal);
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
    this.#signalGroup(child, 'SIGTERM');
    const grace = this.#options.sandboxExecutable
      ? Math.max(250, this.#options.terminationGraceMs)
      : this.#options.terminationGraceMs;
    const force = setTimeout(() => this.#signalGroup(child, 'SIGKILL'), grace);
    force.unref();
    child.once('close', () => clearTimeout(force));
  }

  #signalGroup(child: ManagedChild, signal: NodeJS.Signals): void {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch { /* The process group can stop before the signal is sent. */ }
  }

  #groupAlive(child: ManagedChild): boolean {
    if (process.platform === 'win32' || !child.pid) return false;
    try { process.kill(-child.pid, 0); return true; } catch { return false; }
  }

  async #cleanupGroup(child: ManagedChild): Promise<void> {
    if (!this.#groupAlive(child)) return;
    this.#signalGroup(child, 'SIGTERM');
    const grace = this.#options.sandboxExecutable
      ? Math.max(250, this.#options.terminationGraceMs)
      : this.#options.terminationGraceMs;
    const deadline = Date.now() + grace;
    while (this.#groupAlive(child) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (this.#groupAlive(child)) this.#signalGroup(child, 'SIGKILL');
  }

  #createCgroup(maximumProcesses: number, memoryBytes: number, cpuMillis: number,
    maximumExecutionMs: number): string | undefined {
    if (!this.#options.cgroupRoot) return undefined;
    const root = cgroupRoot(this.#options.cgroupRoot);
    const group = fs.mkdtempSync(`${root}/kubeclaw-command-`);
    try {
      fs.writeFileSync(`${group}/pids.max`, String(maximumProcesses + 1));
      fs.writeFileSync(`${group}/memory.max`, String(memoryBytes));
      if (fs.existsSync(`${group}/memory.swap.max`)) fs.writeFileSync(`${group}/memory.swap.max`, '0');
      const cpuPeriodMicroseconds = 100_000;
      const cpuQuotaMicroseconds = Math.max(1_000, Math.min(cpuPeriodMicroseconds,
        Math.floor((cpuMillis / maximumExecutionMs) * cpuPeriodMicroseconds)));
      fs.writeFileSync(`${group}/cpu.max`, `${cpuQuotaMicroseconds} ${cpuPeriodMicroseconds}`);
      return group;
    } catch (error) {
      try { fs.rmdirSync(group); } catch { /* Preserve the original setup error. */ }
      throw error;
    }
  }

  #cleanupCgroup(group: string | undefined): void {
    if (!group) return;
    try { fs.writeFileSync(`${group}/cgroup.kill`, '1'); } catch { /* It may already be empty. */ }
    try { fs.rmdirSync(group); } catch { /* The kernel can finish removal after the final process exits. */ }
  }
}
