/** A timeout cannot kill JavaScript. Unsettled hooks remain explicitly unresolved. */
export class WorkerPhaseUnresolved extends Error {
  constructor(phase: string) { super(`WORKER_PHASE_UNRESOLVED:${phase}`); }
}

export class WorkerPhaseDeadline {
  #unresolved = false;
  readonly expiresAt: number;
  readonly timeoutMs: number;
  readonly now: () => number;
  readonly signal: AbortSignal | undefined;
  constructor(expiresAt: number, timeoutMs: number, now: () => number, signal?: AbortSignal) {
    this.expiresAt = expiresAt; this.timeoutMs = timeoutMs; this.now = now; this.signal = signal;
  }
  get unresolved(): boolean { return this.#unresolved; }
  quarantine(): void { this.#unresolved = true; }

  async run<T>(phase: string, work: (signal: AbortSignal) => Promise<T>, maintenance = false): Promise<T> {
    this.#assertStart(phase, maintenance);
    const controller = new AbortController();
    const end = maintenance ? this.now() + this.timeoutMs : Math.min(this.expiresAt, this.now() + this.timeoutMs);
    const abort = (): void => controller.abort(this.signal?.reason ?? new Error('WORKER_ATTEMPT_CANCELLED'));
    this.signal?.addEventListener('abort', abort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    const operation = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal); });
    const settlement = operation.then(() => { settled = true; }, () => { settled = true; });
    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      timer = setTimeout(() => controller.abort(this.#timeoutError(phase, maintenance)), Math.max(1, end - this.now()));
    });
    try {
      const value = await Promise.race([operation, cancelled]);
      if (this.now() >= end) throw this.#timeoutError(phase, maintenance);
      return value;
    } catch (error) {
      controller.abort(error);
      if (!settled && !(await this.#drain(settlement))) { this.#unresolved = true; throw new WorkerPhaseUnresolved(phase); }
      if (maintenance && this.signal?.aborted && this.now() < end) return await operation;
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      this.signal?.removeEventListener('abort', abort);
      controller.abort(new Error(`${phase}_COMPLETE`));
    }
  }

  #assertStart(phase: string, maintenance: boolean): void {
    if (this.#unresolved) throw new WorkerPhaseUnresolved(phase);
    if (!maintenance && this.now() >= this.expiresAt) throw new Error('WORKER_CLAIM_EXPIRED');
    if (!maintenance && this.signal?.aborted) throw this.signal.reason ?? new Error('WORKER_ATTEMPT_CANCELLED');
  }
  #timeoutError(phase: string, maintenance: boolean): Error {
    return new Error(!maintenance && this.now() >= this.expiresAt ? 'WORKER_CLAIM_EXPIRED' : `${phase}_TIMEOUT`);
  }

  async #drain(settlement: Promise<void>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try { return await Promise.race([settlement.then(() => true), new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), this.timeoutMs);
    })]); } finally { if (timer) clearTimeout(timer); }
  }
}

export async function settlesWithin(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([operation.then(() => true, () => true), new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  })]); } finally { if (timer) clearTimeout(timer); }
}

export function armWorkerClaimDeadline(expiresAt: number, now: () => number, expire: () => void): () => void {
  let timer: NodeJS.Timeout | undefined;
  const schedule = (): void => {
    const remaining = expiresAt - now();
    if (remaining <= 0) { expire(); return; }
    timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
  };
  schedule(); return () => { if (timer) clearTimeout(timer); };
}
