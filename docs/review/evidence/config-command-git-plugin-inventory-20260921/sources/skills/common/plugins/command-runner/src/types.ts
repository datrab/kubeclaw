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

export interface ProcessFacts {
  readonly cpuTimeMs: number;
  readonly memoryBytes: number;
  readonly processes: number;
}

export class CommandRunError extends Error {
  readonly output: Readonly<Record<string, unknown>>;
  constructor(code: string, output: Readonly<Record<string, unknown>>, options?: ErrorOptions) {
    super(code, options);
    this.name = 'CommandRunError';
    this.output = output;
  }
}
