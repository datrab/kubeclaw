import fs from 'node:fs';
import path from 'node:path';
import type { AdapterActivationContext, AdapterInstance, EffectRequest } from '@kubeclaw/plugin-sdk';
import { CommandRunner } from './runner.ts';

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function canonicalDirectory(value: string): string {
  const canonical = fs.realpathSync(path.resolve(value));
  if (!fs.statSync(canonical).isDirectory()) throw new Error(`COMMAND_WORKING_DIRECTORY_INVALID:${canonical}`);
  return canonical;
}

function canonicalExecutable(value: string): string {
  const canonical = fs.realpathSync(path.resolve(value));
  if (!fs.statSync(canonical).isFile()) throw new Error(`COMMAND_EXECUTABLE_INVALID:${canonical}`);
  fs.accessSync(canonical, fs.constants.X_OK);
  return canonical;
}

function argumentsFrom(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.includes('\0'))) throw new Error('COMMAND_ARGUMENTS_INVALID');
  return value;
}

function resolveInvocation(request: EffectRequest, executables: ReadonlySet<string>, roots: readonly string[]): Readonly<{ executable: string; args: string[]; cwd: string }> {
  if (request.capability !== 'command.execute' || request.operation !== 'run') throw new Error(`COMMAND_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
  if (request.resource.type !== 'command.executable') throw new Error('COMMAND_RESOURCE_INVALID');
  let executable: string;
  try { executable = canonicalExecutable(request.resource.canonicalId); } catch { throw new Error(`COMMAND_EXECUTABLE_DENIED:${request.resource.canonicalId}`); }
  if (!executables.has(executable)) throw new Error(`COMMAND_EXECUTABLE_DENIED:${executable}`);
  if (typeof request.payload.workingDirectory !== 'string') throw new Error('COMMAND_WORKING_DIRECTORY_INVALID');
  const cwd = canonicalDirectory(request.payload.workingDirectory);
  if (!roots.some((root) => cwd === root || cwd.startsWith(`${root}${path.sep}`))) throw new Error(`COMMAND_WORKING_DIRECTORY_DENIED:${cwd}`);
  return { executable, args: argumentsFrom(request.payload.args), cwd };
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const executables = new Set(stringArray(context.config.allowedExecutables, 'allowedExecutables').map(canonicalExecutable));
  const roots = stringArray(context.config.allowedWorkingRoots, 'allowedWorkingRoots').map(canonicalDirectory);
  const runner = new CommandRunner({
    maxOutputBytes: positiveInteger(context.config.maxOutputBytes, 'maxOutputBytes'),
    maxExecutionMs: positiveInteger(context.config.maxExecutionMs, 'maxExecutionMs'),
    terminationGraceMs: positiveInteger(context.config.terminationGraceMs, 'terminationGraceMs'),
  });
  return {
    async ready() {
      if (runner.stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      executables.forEach(canonicalExecutable);
      roots.forEach(canonicalDirectory);
    },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (runner.stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const command = resolveInvocation(request, executables, roots);
      return runner.run(command.executable, command.args, command.cwd, signal);
    },
    async shutdown() { await runner.shutdown(); },
  };
}
