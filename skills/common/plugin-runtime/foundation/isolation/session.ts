import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { PluginInvocationContext } from '@kubeclaw/plugin-sdk';

const MAX_PROTOCOL_LINE_BYTES = 256 * 1024;

function serializable(value: unknown, label: string, limit = 1024 * 1024): string {
  let encoded: string;
  try { encoded = JSON.stringify(value); }
  catch { throw new Error(`ISOLATION_${label}_NOT_SERIALIZABLE`); }
  if (encoded === undefined) throw new Error(`ISOLATION_${label}_NOT_SERIALIZABLE`);
  if (Buffer.byteLength(encoded) > limit) throw new Error(`ISOLATION_${label}_TOO_LARGE`);
  return encoded;
}

function response(child: ChildProcessWithoutNullStreams, id: string, operation: Promise<unknown>): void {
  void operation.then(
    (value) => {
      let encoded: string;
      try { encoded = serializable({ kind: 'response', id, ok: true, value }, 'RESPONSE'); }
      catch (error) { encoded = JSON.stringify({ kind: 'response', id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
      child.stdin.write(`${encoded}\n`);
    },
    (error: unknown) => child.stdin.write(`${JSON.stringify({ kind: 'response', id, ok: false, error: error instanceof Error ? error.message : String(error) })}\n`),
  );
}

interface SessionInput {
  readonly child: ChildProcessWithoutNullStreams;
  readonly context: PluginInvocationContext;
  readonly signal?: AbortSignal;
  readonly wallTimeMs: number;
  readonly invocationMessage: Readonly<Record<string, unknown>>;
}

export function runIsolationSession(input: SessionInput): Promise<unknown> {
  return new IsolationSession(input).run();
}

class IsolationSession {
  readonly #input: SessionInput; #settled = false; #stdout = ''; #stderr = ''; #timer: NodeJS.Timeout | undefined;
  #resolve: (value: unknown) => void = () => undefined; #reject: (error: Error) => void = () => undefined;
  constructor(input: SessionInput) { this.#input = input; }

  run(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.#resolve = resolve; this.#reject = reject;
      if (this.#input.signal?.aborted) { this.#finish(new Error('ISOLATED_PLUGIN_CANCELLED')); return; }
      this.#input.signal?.addEventListener('abort', this.#abort, { once: true });
      this.#timer = setTimeout(() => this.#finish(new Error('ISOLATED_PLUGIN_TIMEOUT')), this.#input.wallTimeMs); this.#timer.unref();
      this.#input.child.stderr.on('data', this.#stderrData);
      this.#input.child.stdout.on('data', this.#stdoutData);
      this.#input.child.once('error', (error) => this.#finish(error));
      this.#input.child.once('close', (code, signal) => this.#closed(code, signal));
      this.#input.child.stdin.write(`${serializable(this.#input.invocationMessage, 'INVOCATION')}\n`);
    });
  }

  readonly #abort = (): void => this.#finish(new Error('ISOLATED_PLUGIN_CANCELLED'));
  readonly #stderrData = (chunk: Buffer): void => {
    this.#stderr += chunk.toString('utf8');
    if (Buffer.byteLength(this.#stderr) > 64 * 1024) this.#finish(new Error('ISOLATED_PLUGIN_STDERR_LIMIT'));
  };
  readonly #stdoutData = (chunk: Buffer): void => {
    this.#stdout += chunk.toString('utf8');
    if (Buffer.byteLength(this.#stdout) > 1024 * 1024) { this.#finish(new Error('ISOLATION_PROTOCOL_OUTPUT_LIMIT')); return; }
    this.#consumeLines();
  };

  #consumeLines(): void {
    for (;;) {
      const newline = this.#stdout.indexOf('\n');
      if (newline < 0) return;
      const line = this.#stdout.slice(0, newline); this.#stdout = this.#stdout.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_PROTOCOL_LINE_BYTES) { this.#finish(new Error('ISOLATION_PROTOCOL_LINE_LIMIT')); return; }
      const message = this.#parse(line);
      if (!message || this.#settled) return;
      this.#handle(message);
    }
  }

  #parse(line: string): Record<string, unknown> | undefined {
    try { return JSON.parse(line) as Record<string, unknown>; }
    catch { this.#finish(new Error('ISOLATION_PROTOCOL_INVALID_JSON')); return undefined; }
  }

  #handle(message: Record<string, unknown>): void {
    if (message.kind === 'capability' && typeof message.id === 'string') { this.#capability(message); return; }
    if (message.kind === 'event' && typeof message.id === 'string') { this.#event(message); return; }
    if (message.kind === 'result') { this.#result(message.value); return; }
    if (message.kind === 'error' || message.kind === 'fatal') this.#failure(message.error);
  }

  #capability(message: Record<string, unknown>): void {
    const request = message.request;
    if (typeof message.capability !== 'string' || message.capability.length > 128 || !request || typeof request !== 'object') {
      this.#finish(new Error('ISOLATION_PROTOCOL_CAPABILITY_INVALID')); return;
    }
    response(this.#input.child, String(message.id), this.#input.context.invoke(message.capability, request as never));
  }

  #event(message: Record<string, unknown>): void {
    if (typeof message.type !== 'string' || message.type.length > 256) { this.#finish(new Error('ISOLATION_PROTOCOL_EVENT_INVALID')); return; }
    response(this.#input.child, String(message.id), this.#input.context.emit(message.type, message.identity as never, message.payload as never));
  }

  #result(value: unknown): void {
    try { serializable(value, 'RESULT'); }
    catch (error) { this.#finish(error instanceof Error ? error : new Error(String(error))); return; }
    this.#finish(undefined, value);
  }

  #failure(error: unknown): void {
    const detail = error && typeof error === 'object' ? String((error as Record<string, unknown>).message) : String(error);
    this.#finish(new Error(`ISOLATED_PLUGIN_FAILED:${detail}`));
  }

  #closed(code: number | null, signal: NodeJS.Signals | null): void {
    if (!this.#settled) this.#finish(new Error(`ISOLATED_PLUGIN_EXITED:${String(code)}:${String(signal)}:${this.#stderr.slice(0, 4096)}`));
  }

  #finish(error?: Error, value?: unknown): void {
    if (this.#settled) return;
    this.#settled = true; if (this.#timer) clearTimeout(this.#timer);
    this.#input.signal?.removeEventListener('abort', this.#abort); this.#input.child.kill('SIGKILL');
    if (error) this.#reject(error); else this.#resolve(value);
  }
}

export { serializable };
