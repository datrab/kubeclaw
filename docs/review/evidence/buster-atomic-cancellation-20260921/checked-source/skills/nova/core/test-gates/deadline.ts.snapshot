const expirations = new WeakMap<AbortSignal, number>();
export class NovaGateTimeoutError extends Error {
  constructor() { super('NOVA_REMOTE_PLAN_TIMEOUT'); this.name = 'NovaGateTimeoutError'; }
}
export function checkGateSignal(signal?: AbortSignal): void {
  if (!signal) return;
  if (!signal.aborted) {
    if (Date.now() >= (expirations.get(signal) ?? Infinity)) throw new NovaGateTimeoutError();
    return;
  }
  if (signal.reason instanceof NovaGateTimeoutError) throw signal.reason;
  throw new Error('NOVA_REMOTE_PLAN_CANCELLED', { cause: signal.reason });
}
export class GateDeadline {
  readonly expiresAt: number;
  readonly signal: AbortSignal;
  readonly #controller = new AbortController();
  readonly #timer: NodeJS.Timeout;
  constructor(milliseconds: number, caller?: AbortSignal) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) throw new Error('NOVA_REMOTE_PLAN_TIMEOUT_INVALID');
    this.expiresAt = Date.now() + milliseconds;
    this.signal = caller ? AbortSignal.any([caller, this.#controller.signal]) : this.#controller.signal;
    expirations.set(this.signal, this.expiresAt);
    this.#timer = setTimeout(() => this.#controller.abort(new NovaGateTimeoutError()), milliseconds);
    this.#timer.unref();
  }
  check(): void {
    if (Date.now() >= this.expiresAt) this.#controller.abort(new NovaGateTimeoutError());
    checkGateSignal(this.signal);
  }
  remaining(): number { this.check(); return Math.max(1, this.expiresAt - Date.now()); }
  dispose(): void { clearTimeout(this.#timer); }
}
export async function gateDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  checkGateSignal(signal);
  await new Promise<void>((resolve, reject) => {
    const finish = (): void => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort); try { checkGateSignal(signal); } catch (error) { reject(error); } };
    signal.addEventListener('abort', abort, { once: true });
  });
}
