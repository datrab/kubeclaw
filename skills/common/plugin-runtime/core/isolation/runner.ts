import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { PluginInvocationContext } from '../../sdk/src/index.ts';
import { runIsolationSession, serializable } from './session.ts';

export interface IsolatedInvocation {
  readonly packageRoot: string; readonly modulePath: string; readonly exportName: string;
  readonly surface: 'stage' | 'observer'; readonly argument: unknown; readonly context: PluginInvocationContext; readonly signal?: AbortSignal;
}

function sandboxPaths(): { readonly launcher: string; readonly child: string } {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const launcher = path.join(directory, 'plugin-sandbox'); const child = path.join(directory, 'child.mjs');
  if (!fs.existsSync(launcher)) throw new Error('ISOLATION_SANDBOX_NOT_BUILT');
  return { launcher, child };
}

function canonicalModule(packageRootValue: string, modulePathValue: string): { readonly packageRoot: string; readonly modulePath: string } {
  const packageRoot = fs.realpathSync(packageRootValue); const modulePath = fs.realpathSync(modulePathValue);
  if (!modulePath.startsWith(`${packageRoot}${path.sep}`) || !fs.statSync(modulePath).isFile()) throw new Error('ISOLATION_MODULE_OUTSIDE_PACKAGE');
  return { packageRoot, modulePath };
}

export function invokeIsolated(invocation: IsolatedInvocation): Promise<unknown> {
  const paths = sandboxPaths(); const canonical = canonicalModule(invocation.packageRoot, invocation.modulePath);
  serializable(invocation.argument, 'ARGUMENT'); serializable(invocation.context.contract, 'CONTEXT');
  const limits = invocation.context.contract.lease.limits;
  const child = spawn(paths.launcher, [
    String(limits.memoryBytes), String(Math.max(1, Math.ceil(limits.cpuMillis / 1000))), '64', process.execPath,
    `--max-old-space-size=${Math.max(16, Math.floor(limits.memoryBytes / (1024 * 1024) * 0.7))}`, '--permission',
    `--allow-fs-read=${paths.child}`, `--allow-fs-read=${canonical.packageRoot}`, '--no-addons', paths.child,
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: { NODE_NO_WARNINGS: '1' }, cwd: canonical.packageRoot });
  return runIsolationSession({
    child, context: invocation.context, ...(invocation.signal ? { signal: invocation.signal } : {}), wallTimeMs: limits.wallTimeMs,
    invocationMessage: { kind: 'invoke', surface: invocation.surface, modulePath: canonical.modulePath, exportName: invocation.exportName,
      argument: invocation.argument, context: invocation.context.contract },
  });
}
