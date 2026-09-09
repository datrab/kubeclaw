import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { ProtocolLines } from './protocol.ts';

function serializable(value: unknown, label: string, limit = 1024 * 1024): string {
  let encoded: string;
  try { encoded = JSON.stringify(value); }
  catch { throw new Error(`ISOLATION_${label}_NOT_SERIALIZABLE`); }
  if (encoded === undefined) throw new Error(`ISOLATION_${label}_NOT_SERIALIZABLE`);
  if (Buffer.byteLength(encoded) > limit) throw new Error(`ISOLATION_${label}_TOO_LARGE`);
  return encoded;
}

interface SessionInput {
  readonly child: ChildProcessWithoutNullStreams;
  readonly context: PluginInvocationContext;
  readonly signal?: AbortSignal;
  readonly wallTimeMs: number;
  readonly invocationMessage: Readonly<Record<string, unknown>>;
  /** Host-owned hard process-tree boundary; the supervisor receives TERM first. */
  readonly terminateTree?: () => void;
}

export function runIsolationSession(input: SessionInput): Promise<unknown> {
  return new IsolationSession(input).run();
}

class IsolationSession {
  readonly #input: SessionInput;
  readonly #protocol = new ProtocolLines();
  #finishing = false;
  #closed = false;
  #error: Error | undefined;
  #value: unknown;
  #stderr: Buffer = Buffer.alloc(0);
  #timer: NodeJS.Timeout | undefined;
  #terminationTimer: NodeJS.Timeout | undefined;
  #pending = 0;
  #resolve: (value: unknown) => void = () => undefined;
  #reject: (error: Error) => void = () => undefined;
  constructor(input: SessionInput) { this.#input = input; }

  run(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.#resolve = resolve; this.#reject = reject;
      // All pipe handlers exist before the first write, including pre-abort.
      this.#input.child.stdin.on('error', this.#pipeError);
      this.#input.child.stdout.on('error', this.#pipeError);
      this.#input.child.stderr.on('error', this.#pipeError);
      this.#input.child.stderr.on('data', this.#stderrData);
      this.#input.child.stdout.on('data', this.#stdoutData);
      this.#input.child.once('error', this.#pipeError);
      this.#input.child.once('close', this.#onClose);
      if (this.#input.signal?.aborted) { this.#finish(new Error('ISOLATED_PLUGIN_CANCELLED')); return; }
      this.#input.signal?.addEventListener('abort', this.#abort, { once: true });
      this.#timer = setTimeout(() => this.#finish(new Error('ISOLATED_PLUGIN_TIMEOUT')), this.#input.wallTimeMs);
      try { this.#write(serializable(this.#input.invocationMessage, 'INVOCATION')); }
      catch (error) { this.#finish(this.#asError(error)); }
    });
  }

  #asError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }
  readonly #abort = (): void => this.#finish(new Error('ISOLATED_PLUGIN_CANCELLED'));
  readonly #pipeError = (cause: Error): void => this.#finish(new Error(`ISOLATION_PIPE_FAILED:${cause.message}`, { cause }));
  readonly #stderrData = (chunk: Buffer): void => {
    if (this.#stderr.length + chunk.length > 64 * 1024) { this.#finish(new Error('ISOLATED_PLUGIN_STDERR_LIMIT')); return; }
    this.#stderr = Buffer.concat([this.#stderr, chunk]);
  };
  readonly #stdoutData = (chunk: Buffer): void => {
    if (this.#finishing) return;
    try { this.#protocol.push(chunk, (message) => { if (!this.#finishing) this.#handle(message); }); }
    catch (error) { this.#finish(this.#asError(error)); }
  };

  #write(encoded: string): void {
    if (this.#finishing || this.#input.child.stdin.destroyed || !this.#input.child.stdin.writable) return;
    if (this.#input.child.stdin.writableLength + Buffer.byteLength(encoded) > 1024 * 1024) {
      this.#finish(new Error('ISOLATION_PROTOCOL_INPUT_LIMIT')); return;
    }
    this.#input.child.stdin.write(`${encoded}\n`, (error) => { if (error) this.#pipeError(error); });
  }

  #response(id: string, operation: () => Promise<unknown>): void {
    if (++this.#pending > 64) { this.#finish(new Error('ISOLATION_RPC_LIMIT')); return; }
    void Promise.resolve().then(() => {
      if (this.#finishing) throw new Error('ISOLATION_SESSION_CLOSED');
      return operation();
    }).then(
      (value) => this.#sendResponse({ kind: 'response', id, ok: true, value }),
      (error: unknown) => this.#sendResponse({ kind: 'response', id, ok: false, error: this.#asError(error).message }),
    ).catch((error: unknown) => this.#finish(this.#asError(error))).finally(() => { this.#pending--; });
  }

  #sendResponse(message: Readonly<Record<string, unknown>>): void {
    if (this.#finishing) return;
    this.#write(serializable(message, 'RESPONSE'));
  }

  #handle(message: Record<string, unknown>): void {
    if (message.kind === 'capability' && typeof message.id === 'string') { this.#capability(message); return; }
    if (message.kind === 'event' && typeof message.id === 'string') { this.#event(message); return; }
    if (message.kind === 'result') { this.#result(message.value); return; }
    if (message.kind === 'error' || message.kind === 'fatal') { this.#failure(message.error); return; }
    this.#finish(new Error('ISOLATION_PROTOCOL_INVALID_MESSAGE'));
  }

  #capability(message: Record<string, unknown>): void {
    const request = message.request;
    if (typeof message.capability !== 'string' || message.capability.length > 128 || !request || typeof request !== 'object') {
      this.#finish(new Error('ISOLATION_PROTOCOL_CAPABILITY_INVALID')); return;
    }
    this.#response(String(message.id), () => this.#input.context.invoke(message.capability as string, request as never));
  }

  #event(message: Record<string, unknown>): void {
    if (typeof message.type !== 'string' || message.type.length > 256) { this.#finish(new Error('ISOLATION_PROTOCOL_EVENT_INVALID')); return; }
    this.#response(String(message.id), () => this.#input.context.emit(message.type as string, message.identity as never, message.payload as never));
  }

  #result(value: unknown): void {
    if (this.#pending) { this.#finish(new Error('ISOLATION_RPC_NOT_DRAINED')); return; }
    try { serializable(value, 'RESULT'); }
    catch (error) { this.#finish(this.#asError(error)); return; }
    this.#finish(undefined, value);
  }

  #failure(error: unknown): void {
    const detail = error && typeof error === 'object' ? String((error as Record<string, unknown>).message) : String(error);
    this.#finish(new Error(`ISOLATED_PLUGIN_FAILED:${detail}`));
  }

  readonly #onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
    this.#closed = true;
    if (!this.#finishing) {
      try { this.#protocol.finish(); }
      catch (error) { this.#finish(this.#asError(error)); return; }
      this.#finish(new Error(`ISOLATED_PLUGIN_EXITED:${String(code)}:${String(signal)}:${this.#stderr.toString('utf8').slice(0, 4096)}`));
    }
    this.#settle();
  };

  #settle(): void {
    if (this.#terminationTimer) clearTimeout(this.#terminationTimer);
    if (this.#error) this.#reject(this.#error); else this.#resolve(this.#value);
  }

  #finish(error?: Error, value?: unknown): void {
    if (this.#finishing) return;
    this.#finishing = true; this.#error = error; this.#value = value;
    if (this.#timer) clearTimeout(this.#timer);
    this.#input.signal?.removeEventListener('abort', this.#abort);
    if (this.#closed) { this.#settle(); return; }
    this.#input.child.stdin.destroy();
    this.#input.child.kill('SIGTERM');
    this.#terminationTimer = setTimeout(() => {
      try { this.#input.terminateTree?.(); }
      catch (cause) { this.#error = new Error('ISOLATION_TREE_TERMINATION_FAILED', { cause }); }
      this.#input.child.kill('SIGKILL');
      this.#terminationTimer = setTimeout(() => {
        if (this.#closed) return;
        this.#error = new Error('ISOLATION_PROCESS_CLEANUP_TIMEOUT', { cause: this.#error });
        this.#input.child.stdout.destroy(); this.#input.child.stderr.destroy();
        this.#settle();
      }, 1000);
    }, 1000);
  }
}

export { serializable };
