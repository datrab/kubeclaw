import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { PluginInvocationContext } from '../../sdk/src/index.ts';

export interface IsolatedInvocation {
  readonly packageRoot: string;
  readonly modulePath: string;
  readonly exportName: string;
  readonly surface: 'stage' | 'observer';
  readonly argument: unknown;
  readonly context: PluginInvocationContext;
  readonly signal?: AbortSignal;
}

const MAX_PROTOCOL_LINE_BYTES = 256 * 1024;
const MAX_ARGUMENT_BYTES = 1024 * 1024;

function sandboxPaths(): { readonly launcher: string; readonly child: string } {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const launcher = path.join(directory, 'plugin-sandbox');
  const child = path.join(directory, 'child.mjs');
  if (!fs.existsSync(launcher)) throw new Error('ISOLATION_SANDBOX_NOT_BUILT');
  return { launcher, child };
}

function canonicalModule(packageRootValue: string, modulePathValue: string): {
  readonly packageRoot: string;
  readonly modulePath: string;
} {
  const packageRoot = fs.realpathSync(packageRootValue);
  const modulePath = fs.realpathSync(modulePathValue);
  if (
    !modulePath.startsWith(`${packageRoot}${path.sep}`)
    || !fs.statSync(modulePath).isFile()
  ) {
    throw new Error('ISOLATION_MODULE_OUTSIDE_PACKAGE');
  }
  return { packageRoot, modulePath };
}

function serializable(value: unknown, label: string, limit = MAX_ARGUMENT_BYTES): string {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new Error(`ISOLATION_${label}_NOT_SERIALIZABLE`);
  }
  if (encoded === undefined) throw new Error(`ISOLATION_${label}_NOT_SERIALIZABLE`);
  if (Buffer.byteLength(encoded) > limit) throw new Error(`ISOLATION_${label}_TOO_LARGE`);
  return encoded;
}

function response(child: ReturnType<typeof spawn>, id: string, operation: Promise<unknown>): void {
  void operation.then(
    (value) => {
      let encoded: string;
      try {
        encoded = serializable({ kind: 'response', id, ok: true, value }, 'RESPONSE');
      } catch (error) {
        encoded = JSON.stringify({
          kind: 'response',
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      child.stdin!.write(`${encoded}\n`);
    },
    (error: unknown) => child.stdin!.write(`${JSON.stringify({
      kind: 'response',
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })}\n`),
  );
}

export function invokeIsolated(invocation: IsolatedInvocation): Promise<unknown> {
  const paths = sandboxPaths();
  const canonical = canonicalModule(invocation.packageRoot, invocation.modulePath);
  serializable(invocation.argument, 'ARGUMENT');
  serializable(invocation.context.contract, 'CONTEXT');
  const limits = invocation.context.contract.lease.limits;
  const cpuSeconds = Math.max(1, Math.ceil(limits.cpuMillis / 1000));
  const heapMegabytes = Math.max(16, Math.floor(limits.memoryBytes / (1024 * 1024) * 0.7));
  const child = spawn(paths.launcher, [
    String(limits.memoryBytes),
    String(cpuSeconds),
    '64',
    process.execPath,
    `--max-old-space-size=${heapMegabytes}`,
    '--permission',
    `--allow-fs-read=${paths.child}`,
    `--allow-fs-read=${canonical.packageRoot}`,
    '--no-addons',
    paths.child,
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { NODE_NO_WARNINGS: '1' },
    cwd: canonical.packageRoot,
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (error?: Error, value?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      invocation.signal?.removeEventListener('abort', abort);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(value);
    };
    const abort = (): void => finish(new Error('ISOLATED_PLUGIN_CANCELLED'));
    if (invocation.signal?.aborted) {
      abort();
      return;
    }
    invocation.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => finish(new Error('ISOLATED_PLUGIN_TIMEOUT')),
      limits.wallTimeMs,
    );
    timer.unref();
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr) > 64 * 1024) {
        finish(new Error('ISOLATED_PLUGIN_STDERR_LIMIT'));
      }
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) > 1024 * 1024) {
        finish(new Error('ISOLATION_PROTOCOL_OUTPUT_LIMIT'));
        return;
      }
      for (;;) {
        const newline = stdout.indexOf('\n');
        if (newline < 0) break;
        const line = stdout.slice(0, newline);
        stdout = stdout.slice(newline + 1);
        if (Buffer.byteLength(line) > MAX_PROTOCOL_LINE_BYTES) {
          finish(new Error('ISOLATION_PROTOCOL_LINE_LIMIT'));
          return;
        }
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          finish(new Error('ISOLATION_PROTOCOL_INVALID_JSON'));
          return;
        }
        if (message.kind === 'capability' && typeof message.id === 'string') {
          if (typeof message.capability !== 'string' || message.capability.length > 128) {
            finish(new Error('ISOLATION_PROTOCOL_CAPABILITY_INVALID'));
            return;
          }
          const request = message.request;
          if (!request || typeof request !== 'object') {
            finish(new Error('ISOLATION_PROTOCOL_CAPABILITY_INVALID'));
            return;
          }
          response(
            child,
            message.id,
            invocation.context.invoke(String(message.capability), request as never),
          );
        } else if (message.kind === 'event' && typeof message.id === 'string') {
          if (typeof message.type !== 'string' || message.type.length > 256) {
            finish(new Error('ISOLATION_PROTOCOL_EVENT_INVALID'));
            return;
          }
          response(
            child,
            message.id,
            invocation.context.emit(
              String(message.type),
              message.identity as never,
              message.payload as never,
            ),
          );
        } else if (message.kind === 'result') {
          try {
            serializable(message.value, 'RESULT');
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          finish(undefined, message.value);
        } else if (message.kind === 'error' || message.kind === 'fatal') {
          const detail = message.error && typeof message.error === 'object'
            ? String((message.error as Record<string, unknown>).message)
            : String(message.error);
          finish(new Error(`ISOLATED_PLUGIN_FAILED:${detail}`));
        }
      }
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code, signal) => {
      if (!settled) {
        finish(new Error(
          `ISOLATED_PLUGIN_EXITED:${String(code)}:${String(signal)}:${stderr.slice(0, 4096)}`,
        ));
      }
    });
    child.stdin.write(`${serializable({
      kind: 'invoke',
      surface: invocation.surface,
      modulePath: canonical.modulePath,
      exportName: invocation.exportName,
      argument: invocation.argument,
      context: invocation.context.contract,
    }, 'INVOCATION')}\n`);
  });
}
