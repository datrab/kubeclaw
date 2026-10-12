import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommandRunError, CommandRunner } from '@kubeclaw/plugin-command-runner/runner';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

const CATALOG_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const PROTECTED_ENVIRONMENT = /^(?:BUSTER_|NOVA_|KUBECLAW_|OPENAI_|AWS_|AZURE_|GOOGLE_|GITHUB_|PATH$|HOME$|TMPDIR$|USER$|SHELL$|NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_|SSL_CERT_|SSH_|GIT_|NPM_TOKEN$|.*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL).*)/u;

function canonicalExecutable(value: string): string {
  const result = fs.realpathSync(value);
  if (!path.isAbsolute(result) || !fs.statSync(result).isFile()) throw new Error('DIRECT_COMMAND_CATALOG_EXECUTABLE_INVALID');
  fs.accessSync(result, fs.constants.X_OK);
  return result;
}

function containedDirectory(root: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error('DIRECT_COMMAND_WORKING_DIRECTORY_INVALID');
  const result = fs.realpathSync(value);
  if (!fs.statSync(result).isDirectory() || (result !== root && !result.startsWith(`${root}${path.sep}`))) {
    throw new Error('DIRECT_COMMAND_WORKING_DIRECTORY_DENIED');
  }
  return result;
}

function commandArguments(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 256 || value.some((item) => typeof item !== 'string'
    || item.length > 4096 || item.includes('\0'))) throw new Error('DIRECT_COMMAND_ARGUMENTS_INVALID');
  return [...value] as string[];
}

function environment(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DIRECT_COMMAND_ENVIRONMENT_INVALID');
  const entries = Object.entries(value);
  if (entries.length > 65 || entries.some(([name, item]) => !ENVIRONMENT_NAME.test(name)
    || (name !== 'CI' && PROTECTED_ENVIRONMENT.test(name)) || typeof item !== 'string'
    || item.includes('\0') || Buffer.byteLength(item) > 4096)) {
    throw new Error('DIRECT_COMMAND_ENVIRONMENT_INVALID');
  }
  return Object.fromEntries(entries as [string, string][]);
}

function positiveLimit(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('DIRECT_COMMAND_LIMIT_INVALID');
  return Math.min(Number(value), maximum);
}

export interface DirectCommandCapabilityInvokerOptions {
  readonly workspaceRoot: string;
  readonly executableCatalog: ReadonlyMap<string, string>;
  readonly executableSearchPath: readonly string[];
  readonly runtimeReadRoots: readonly string[];
  readonly maximumOutputBytes: number;
  readonly maximumExecutionMs: number;
  readonly maximumProcesses: number;
  readonly maximumMemoryBytes: number;
  readonly maximumCpuMillis: number;
  readonly terminationGraceMs: number;
  readonly cgroupRoot?: string;
  readonly allowSampledProcessLimit?: boolean;
}

export class DirectCommandCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #root: string;
  readonly #catalog: ReadonlyMap<string, string>;
  readonly #runner: CommandRunner;
  readonly #limits: DirectCommandCapabilityInvokerOptions;
  readonly #path: string;
  readonly #readRoots: readonly string[];

  constructor(options: DirectCommandCapabilityInvokerOptions) {
    this.#root = fs.realpathSync(options.workspaceRoot);
    this.#catalog = new Map([...options.executableCatalog].map(([name, executable]) => {
      if (!CATALOG_NAME.test(name)) throw new Error(`DIRECT_COMMAND_CATALOG_NAME_INVALID:${name}`);
      return [name, canonicalExecutable(executable)];
    }));
    if (this.#catalog.size === 0) throw new Error('DIRECT_COMMAND_CATALOG_EMPTY');
    if (options.executableSearchPath.length === 0) throw new Error('DIRECT_COMMAND_SEARCH_PATH_EMPTY');
    this.#path = options.executableSearchPath.map((directory) => {
      const canonical = fs.realpathSync(directory);
      if (!path.isAbsolute(canonical) || !fs.statSync(canonical).isDirectory()) {
        throw new Error('DIRECT_COMMAND_SEARCH_PATH_INVALID');
      }
      return canonical;
    }).join(path.delimiter);
    if (options.runtimeReadRoots.length === 0) throw new Error('DIRECT_COMMAND_RUNTIME_READ_ROOTS_EMPTY');
    this.#readRoots = options.runtimeReadRoots.map((root) => {
      const canonical = fs.realpathSync(root);
      if (!path.isAbsolute(canonical)) throw new Error('DIRECT_COMMAND_RUNTIME_READ_ROOT_INVALID');
      return canonical;
    });
    this.#limits = options;
    this.#runner = new CommandRunner({
      maxOutputBytes: options.maximumOutputBytes,
      maxExecutionMs: options.maximumExecutionMs,
      maximumProcesses: options.maximumProcesses,
      sandboxMemoryBytes: options.maximumMemoryBytes,
      sandboxCpuMillis: options.maximumCpuMillis,
      sandboxOpenFiles: 1024,
      terminationGraceMs: options.terminationGraceMs,
      ...(options.cgroupRoot ? { cgroupRoot: options.cgroupRoot } : {}),
      ...(options.allowSampledProcessLimit ? { allowSampledProcessLimit: true } : {}),
      sandboxExecutable: fileURLToPath(import.meta.resolve('@kubeclaw/plugin-foundation/isolation/plugin-sandbox')),
    });
  }

  invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    if (capability !== 'command.execute' || request.operation !== 'run'
      || request.resource.type !== 'command.executable') throw new Error('DIRECT_COMMAND_CAPABILITY_REQUEST_INVALID');
    const match = /^catalog:([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/u.exec(request.resource.canonicalId);
    const executable = match ? this.#catalog.get(match[1]!) : undefined;
    if (!executable) throw new Error(`DIRECT_COMMAND_EXECUTABLE_DENIED:${request.resource.canonicalId}`);
    const rawLimits = request.payload.limits;
    if (!rawLimits || typeof rawLimits !== 'object' || Array.isArray(rawLimits)) throw new Error('DIRECT_COMMAND_LIMIT_INVALID');
    const limits = rawLimits as Record<string, unknown>;
    const writableRoot = containedDirectory(this.#root, request.payload.writableRoot);
    const workingDirectory = containedDirectory(writableRoot, request.payload.workingDirectory);
    const home = path.join(writableRoot, '.kubeclaw-home');
    const temporary = path.join(writableRoot, '.kubeclaw-tmp');
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
    return this.#runner.run({
      executable,
      args: commandArguments(request.payload.args),
      cwd: workingDirectory,
      writableRoot,
      readOnlyRoots: this.#readRoots,
      environment: { ...environment(request.payload.environment), PATH: this.#path, HOME: home, TMPDIR: temporary },
      limits: {
        maxOutputBytes: positiveLimit(limits.maxOutputBytes, this.#limits.maximumOutputBytes),
        maxExecutionMs: positiveLimit(limits.maxExecutionMs, this.#limits.maximumExecutionMs),
        maximumProcesses: positiveLimit(limits.maximumProcesses, this.#limits.maximumProcesses),
        memoryBytes: positiveLimit(limits.memoryBytes, this.#limits.maximumMemoryBytes),
        cpuMillis: positiveLimit(limits.cpuMillis, this.#limits.maximumCpuMillis),
        openFiles: positiveLimit(limits.openFiles, 1024),
      },
    }, signal).catch((error: unknown) => {
      if (error instanceof CommandRunError) return { ...error.output, errorCode: error.message };
      throw error;
    });
  }

  shutdown(): Promise<void> { return this.#runner.shutdown(); }
}
