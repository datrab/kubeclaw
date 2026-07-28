import { spawn, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';

type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;

function configuredStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) throw new Error(`${label} must be a non-empty string array`);
  return value;
}

function configuredPositiveInteger(value: unknown, label: string): number {
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

function isWithinRoot(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function commandArguments(value: unknown): string[] {
  if (
    !Array.isArray(value)
    || value.some((entry) => typeof entry !== 'string' || entry.includes('\0'))
  ) throw new Error('COMMAND_ARGUMENTS_INVALID');
  return value;
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const executables = new Set(
    configuredStringArray(context.config.allowedExecutables, 'allowedExecutables').map(canonicalExecutable),
  );
  const roots = configuredStringArray(context.config.allowedWorkingRoots, 'allowedWorkingRoots')
    .map(canonicalDirectory);
  const maxOutputBytes = configuredPositiveInteger(context.config.maxOutputBytes, 'maxOutputBytes');
  const maxExecutionMs = configuredPositiveInteger(context.config.maxExecutionMs, 'maxExecutionMs');
  const terminationGraceMs = configuredPositiveInteger(context.config.terminationGraceMs, 'terminationGraceMs');
  const active = new Set<ManagedChild>();
  let stopping = false;

  function terminate(child: ManagedChild): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, terminationGraceMs);
    force.unref();
    child.once('close', () => clearTimeout(force));
  }

  return {
    async ready() {
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      for (const executable of executables) canonicalExecutable(executable);
      for (const root of roots) canonicalDirectory(root);
    },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (request.capability !== 'command.execute' || request.operation !== 'run') {
        throw new Error(`COMMAND_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
      }
      const args = commandArguments(request.payload.args);
      const workingDirectory = request.payload.workingDirectory;
      if (typeof workingDirectory !== 'string') throw new Error('COMMAND_WORKING_DIRECTORY_INVALID');
      if (request.resource.type !== 'command.executable') throw new Error('COMMAND_RESOURCE_INVALID');
      let executable: string;
      try {
        executable = canonicalExecutable(request.resource.canonicalId);
      } catch {
        throw new Error(`COMMAND_EXECUTABLE_DENIED:${request.resource.canonicalId}`);
      }
      if (!executables.has(executable)) throw new Error(`COMMAND_EXECUTABLE_DENIED:${executable}`);
      const canonicalWorkingDirectory = canonicalDirectory(workingDirectory);
      if (!roots.some((root) => isWithinRoot(canonicalWorkingDirectory, root))) {
        throw new Error(`COMMAND_WORKING_DIRECTORY_DENIED:${canonicalWorkingDirectory}`);
      }
      return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
          cwd: canonicalWorkingDirectory,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {},
        });
        active.add(child);
        let stdout = '';
        let stderr = '';
        let outputBytes = 0;
        let settled = false;
        let timedOut = false;
        let cancelled = false;
        let outputExceeded = false;
        const settleReject = (error: Error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        const append = (current: string, chunk: Buffer): string => {
          outputBytes += chunk.byteLength;
          if (outputBytes > maxOutputBytes) {
            outputExceeded = true;
            terminate(child);
            throw new Error('COMMAND_OUTPUT_LIMIT_EXCEEDED');
          }
          return current + chunk.toString('utf8');
        };
        child.stdout.on('data', (chunk: Buffer) => {
          try { stdout = append(stdout, chunk); } catch (error) { settleReject(error as Error); }
        });
        child.stderr.on('data', (chunk: Buffer) => {
          try { stderr = append(stderr, chunk); } catch (error) { settleReject(error as Error); }
        });
        const abort = () => {
          cancelled = true;
          terminate(child);
          settleReject(new Error('ADAPTER_CANCELLED'));
        };
        signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(() => {
          timedOut = true;
          terminate(child);
          settleReject(new Error('COMMAND_TIMEOUT'));
        }, maxExecutionMs);
        timeout.unref();
        child.once('error', (error) => settleReject(error));
        child.once('close', (code, terminationSignal) => {
          active.delete(child);
          clearTimeout(timeout);
          signal.removeEventListener('abort', abort);
          if (settled || timedOut || cancelled || outputExceeded) return;
          settled = true;
          resolve({
            exitCode: code,
            signal: terminationSignal,
            stdout,
            stderr,
          });
        });
      });
    },
    async shutdown() {
      stopping = true;
      const closing = [...active].map((child) => new Promise<void>((resolve) => {
        child.once('close', () => resolve());
        terminate(child);
      }));
      await Promise.all(closing);
    },
  };
}
