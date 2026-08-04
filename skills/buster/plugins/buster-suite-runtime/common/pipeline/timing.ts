import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
// Common timing primitives for wait/retry loops.
// No runtime authority or lifecycle semantics live here.

type BudgetDetails = {
  deadlineMs?: number | null;
  remainingMs?: number | null;
  reason?: string | null;
};

type BudgetInput = {
  deadlineMs?: number;
  deadline?: number;
  timeoutMs?: number;
  timeoutMinutes?: number;
  label?: string;
  signal?: AbortSignal | null;
};

type BudgetExtensionMeta = {
  authorized?: boolean;
  reason?: string;
  bufferMs?: number;
};
const DEFAULT_BUDGET_REASON = 'budget_exhausted';
const DEFAULT_BUDGET_LABEL = 'budget';
const RATE_LIMIT_COOLDOWN_REASON = 'rate_limit_cooldown';

export type TimeBudget = {
  readonly deadlineMs: number;
  readonly signal: AbortSignal;
  readonly extensions: Array<{ ms: number; reason: string; at: string }>;
  remainingMs(): number;
  throwIfExhausted(reason?: string): void;
  extend(ms: number, meta?: BudgetExtensionMeta): number;
  extendForRateLimit(cooldownMs: number, meta?: BudgetExtensionMeta): number;
  sleep(ms: number): Promise<void>;
};

export class BudgetExhaustedError extends Error {
  code: string;
  deadlineMs: number | null;
  remainingMs: number;
  reason: string;

  constructor(message = 'Time budget exhausted', details: BudgetDetails = {}) {
    super(message);
    this.name = 'BudgetExhaustedError';
    this.code = 'BUDGET_EXHAUSTED';
    this.deadlineMs = Number.isFinite(details.deadlineMs) ? details.deadlineMs as number : null;
    this.remainingMs = Number.isFinite(details.remainingMs) ? details.remainingMs as number : 0;
    this.reason = textValue(details.reason) ?? DEFAULT_BUDGET_REASON;
  }
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function nonNegativeMs(value: unknown): number {
  const parsed = Number(value);
  return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
}

export function abortSignalError(signal: AbortSignal | null | undefined) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(reason ? String(reason) : 'Operation aborted') as Error & { code?: string };
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  return err;
}

function toDeadlineMs(input: BudgetInput = {}) {
  if (Number.isFinite(input.deadlineMs)) return input.deadlineMs as number;
  if (Number.isFinite(input.deadline)) return input.deadline as number;
  if (Number.isFinite(input.timeoutMs)) return Date.now() + Math.max(0, input.timeoutMs as number);
  if (Number.isFinite(input.timeoutMinutes)) return Date.now() + Math.max(0, (input.timeoutMinutes as number) * 60 * 1000);
  throw new TypeError('createBudget requires deadlineMs, deadline, timeoutMs, or timeoutMinutes');
}

class DeadlineBudget implements TimeBudget {
  private deadline: number;
  private readonly controller = new AbortController();
  private readonly upstream: AbortSignal | null;
  private readonly label: string;
  private readonly extensionHistory: Array<{ ms: number; reason: string; at: string }> = [];
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private upstreamAbortHandler: (() => void) | null = null;

  constructor(input: BudgetInput) {
    this.deadline = toDeadlineMs(input);
    this.upstream = input.signal ?? null;
    this.label = textValue(input.label) ?? DEFAULT_BUDGET_LABEL;
    this.connectUpstream();
    this.scheduleDeadlineAbort();
  }

  get deadlineMs(): number { return this.deadline; }
  get signal(): AbortSignal { return this.controller.signal; }
  get extensions() { return this.extensionHistory.slice(); }

  remainingMs(): number {
    return Math.max(0, this.deadline - Date.now());
  }

  throwIfExhausted(reason = DEFAULT_BUDGET_REASON): void {
    if (this.signal.aborted) throw abortSignalError(this.signal);
    if (this.remainingMs() > 0) return;
    const error = this.exhaustedError(reason);
    this.abortIfNeeded(reason);
    throw error;
  }

  extend(ms: number, meta: BudgetExtensionMeta = {}): number {
    if (meta.authorized !== true || !meta.reason) {
      throw new TypeError('Budget extension requires explicit authorization and reason');
    }
    const extensionMs = nonNegativeMs(ms);
    this.deadline += extensionMs;
    this.extensionHistory.push({ ms: extensionMs, reason: meta.reason, at: new Date().toISOString() });
    this.scheduleDeadlineAbort();
    return this.deadline;
  }

  extendForRateLimit(cooldownMs: number, meta: BudgetExtensionMeta = {}): number {
    return this.extend(nonNegativeMs(cooldownMs) + nonNegativeMs(meta.bufferMs), {
      authorized: true,
      reason: textValue(meta.reason) ?? RATE_LIMIT_COOLDOWN_REASON,
    });
  }

  async sleep(ms: number): Promise<void> {
    return sleep(ms, { budget: this });
  }

  private exhaustedError(reason: string): BudgetExhaustedError {
    return new BudgetExhaustedError(`${this.label} exhausted`, {
      deadlineMs: this.deadline,
      remainingMs: this.remainingMs(),
      reason,
    });
  }

  private abortIfNeeded(reason = DEFAULT_BUDGET_REASON): void {
    if (this.signal.aborted) return;
    this.clearTimer();
    this.removeUpstreamAbortListener();
    this.controller.abort(this.exhaustedError(reason));
  }

  private clearTimer(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  }

  private removeUpstreamAbortListener(): void {
    if (!this.upstream || !this.upstreamAbortHandler) return;
    this.upstream.removeEventListener('abort', this.upstreamAbortHandler);
    this.upstreamAbortHandler = null;
  }

  private scheduleDeadlineAbort(): void {
    this.clearTimer();
    if (this.signal.aborted) return;
    this.deadlineTimer = setTimeout(() => this.abortIfNeeded(), this.remainingMs());
    (this.deadlineTimer as { unref?: () => void }).unref?.();
  }

  private connectUpstream(): void {
    if (!this.upstream) return;
    if (this.upstream.aborted) {
      this.controller.abort(abortSignalError(this.upstream));
      return;
    }
    this.upstreamAbortHandler = () => {
      if (this.signal.aborted) return;
      this.clearTimer();
      this.removeUpstreamAbortListener();
      this.controller.abort(abortSignalError(this.upstream));
    };
    this.upstream.addEventListener('abort', this.upstreamAbortHandler, { once: true });
  }
}

export function sleep(ms: number, options: { budget?: TimeBudget | null; signal?: AbortSignal | null } = {}) {
  const durationMs = nonNegativeMs(ms);
  const budget = selectTruthyValue(() => (options.budget), () => (null));
  const signals = [options.signal, budget?.signal].filter(Boolean) as AbortSignal[];

  for (const signal of signals) {
    if (signal.aborted) return Promise.reject(abortSignalError(signal));
  }
  try {
    budget?.throwIfExhausted?.();
  } catch (error) {
    return Promise.reject(error);
  }

  const remaining = budget?.remainingMs ? budget.remainingMs() : Infinity;
  const waitMs = Math.min(durationMs, remaining);
  const willExhaustBudget = Number.isFinite(remaining) && remaining <= durationMs;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', onAbort);
    };
    const finish = (fn: (...args: any[]) => void, value?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onAbort = (event: Event) => finish(reject, abortSignalError(event?.target as AbortSignal | null));

    for (const signal of signals) signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      if (willExhaustBudget) {
        try {
          budget?.throwIfExhausted?.();
        } catch (error) {
          finish(reject, error);
          return;
        }
      }
      finish(resolve);
    }, waitMs);
  });
}
