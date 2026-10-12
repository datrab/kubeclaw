import { spawn } from 'node:child_process';
import { cgroupRoot, createCgroup } from './cgroup.ts';
import { CommandExecution, type ExecutionLimits } from './execution.ts';
import type { CommandRunRequest, CommandRunnerOptions } from './types.ts';
export { CommandRunError } from './types.ts';
export type { CommandOutputRecord, CommandRunLimits, CommandRunRequest, CommandRunnerOptions } from './types.ts';

function positive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function executionLimits(options: CommandRunnerOptions, request: CommandRunRequest): ExecutionLimits {
  const limits = request.limits ?? {};
  const maxExecutionMs = Math.min(options.maxExecutionMs, positive(limits.maxExecutionMs, options.maxExecutionMs));
  return {
    maxOutputBytes: Math.min(options.maxOutputBytes, positive(limits.maxOutputBytes, options.maxOutputBytes)),
    maxExecutionMs,
    maximumProcesses: Math.min(positive(options.maximumProcesses, 1024), positive(limits.maximumProcesses, positive(options.maximumProcesses, 1024))),
    memoryBytes: Math.min(positive(options.sandboxMemoryBytes, 1024 * 1024 * 1024), positive(limits.memoryBytes, positive(options.sandboxMemoryBytes, 1024 * 1024 * 1024))),
    cpuMillis: Math.min(positive(options.sandboxCpuMillis, maxExecutionMs), positive(limits.cpuMillis, positive(options.sandboxCpuMillis, maxExecutionMs))),
    openFiles: Math.min(positive(options.sandboxOpenFiles, 256), positive(limits.openFiles, positive(options.sandboxOpenFiles, 256))),
  };
}

function spawnArguments(options: CommandRunnerOptions, request: CommandRunRequest, limits: ExecutionLimits, cgroup: string | undefined): string[] {
  if (!options.sandboxExecutable) return [...request.args];
  return [String(limits.memoryBytes), String(Math.max(1, Math.ceil(limits.cpuMillis / 1000))), String(Math.max(8, limits.openFiles)),
    ...(cgroup ? ['--cgroup', cgroup] : []),
    ...(request.readOnlyRoots ?? []).flatMap((root) => ['--read-root', root]),
    ...(request.writableRoot ? ['--write-root', request.writableRoot] : []), request.executable, ...request.args];
}

export class CommandRunner {
  readonly #active = new Set<CommandExecution>();
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
    if (this.#stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED', { cause: signal.reason });
    if (!this.#options.sandboxExecutable && (request.writableRoot !== undefined || request.readOnlyRoots !== undefined)) {
      throw new Error('COMMAND_SANDBOX_REQUIRED');
    }
    const limits = executionLimits(this.#options, request);
    const cgroup = this.#options.sandboxExecutable
      ? createCgroup(this.#options, limits.maximumProcesses, limits.memoryBytes, limits.cpuMillis, limits.maxExecutionMs) : undefined;
    if (this.#options.sandboxExecutable && !cgroup && !this.#options.allowSampledProcessLimit) throw new Error('COMMAND_CGROUP_REQUIRED');
    const program = this.#options.sandboxExecutable ?? request.executable;
    const programArgs = spawnArguments(this.#options, request, limits, cgroup);
    const child = spawn(program, programArgs, { cwd: request.cwd, detached: process.platform !== 'win32',
      shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...(request.environment ?? {}) } });
    const graceMs = this.#options.sandboxExecutable ? Math.max(250, this.#options.terminationGraceMs) : this.#options.terminationGraceMs;
    const execution = new CommandExecution({ child, signal, limits, graceMs, cgroup, sandboxed: Boolean(this.#options.sandboxExecutable) });
    this.#active.add(execution);
    void execution.finished.then(() => this.#active.delete(execution), () => this.#active.delete(execution));
    return execution.result;
  }

  async shutdown(): Promise<void> {
    this.#stopping = true;
    const active = [...this.#active];
    active.forEach((execution) => execution.terminate());
    await Promise.all(active.map((execution) => execution.finished));
  }
}
