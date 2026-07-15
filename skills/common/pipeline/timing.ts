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
    this.reason = selectDefinedValue(() => (textValue(details.reason)), () => (DEFAULT_BUDGET_REASON));
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

function abortError(signal: AbortSignal | null | undefined) {
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

export function isBudgetExhaustedError(error: unknown) {
  return selectTruthyValue(() => ((error as {
    name?: string;
    code?: string;
} | null)?.name === 'BudgetExhaustedError'), () => ((error as {
    name?: string;
    code?: string;
} | null)?.code === 'BUDGET_EXHAUSTED'));
}

export function createBudget(input: BudgetInput = {}): TimeBudget {
  let deadlineMs = toDeadlineMs(input);
  const controller = new AbortController();
  const upstream = selectTruthyValue(() => (input.signal), () => (null));
  const label = selectDefinedValue(() => (textValue(input.label)), () => (DEFAULT_BUDGET_LABEL));
  const extensions: Array<{ ms: number; reason: string; at: string }> = [];
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let upstreamAbortHandler: (() => void) | null = null;

  function remainingMs() {
    return Math.max(0, deadlineMs - Date.now());
  }

  function exhaustedError(reason = 'budget_exhausted') {
    return new BudgetExhaustedError(`${label} exhausted`, {
      deadlineMs,
      remainingMs: remainingMs(),
      reason,
    });
  }

  function abortIfNeeded(reason = 'budget_exhausted') {
    if (controller.signal.aborted) return;
    if (deadlineTimer) clearTimeout(deadlineTimer);
    deadlineTimer = null;
    removeUpstreamAbortListener();
    controller.abort(exhaustedError(reason));
  }

  function removeUpstreamAbortListener() {
    if (selectTruthyValue(() => (!upstream), () => (!upstreamAbortHandler))) return;
    upstream.removeEventListener('abort', upstreamAbortHandler);
    upstreamAbortHandler = null;
  }

  function scheduleDeadlineAbort() {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (controller.signal.aborted) {
      deadlineTimer = null;
      return;
    }
    deadlineTimer = setTimeout(() => abortIfNeeded(), remainingMs());
    (deadlineTimer as any).unref?.();
  }

  if (upstream) {
    if (upstream.aborted) controller.abort(abortError(upstream));
    else {
      upstreamAbortHandler = () => {
        if (controller.signal.aborted) return;
        if (deadlineTimer) clearTimeout(deadlineTimer);
        deadlineTimer = null;
        removeUpstreamAbortListener();
        controller.abort(abortError(upstream));
      };
      upstream.addEventListener('abort', upstreamAbortHandler, { once: true });
    }
  }

  const budget: TimeBudget = {
    get deadlineMs() { return deadlineMs; },
    get signal() { return controller.signal; },
    get extensions() { return extensions.slice(); },
    remainingMs,
    throwIfExhausted(reason = 'budget_exhausted') {
      if (controller.signal.aborted) throw abortError(controller.signal);
      if (remainingMs() <= 0) {
        const error = exhaustedError(reason);
        abortIfNeeded(reason);
        throw error;
      }
    },
    extend(ms: number, meta: BudgetExtensionMeta = {}) {
      if (selectTruthyValue(() => (meta.authorized !== true), () => (!meta.reason))) {
        throw new TypeError('Budget extension requires explicit authorization and reason');
      }
      const extensionMs = nonNegativeMs(ms);
      deadlineMs += extensionMs;
      extensions.push({ ms: extensionMs, reason: meta.reason, at: new Date().toISOString() });
      scheduleDeadlineAbort();
      return deadlineMs;
    },
    extendForRateLimit(cooldownMs: number, meta: BudgetExtensionMeta = {}) {
      const bufferMs = nonNegativeMs(meta.bufferMs);
      return budget.extend(nonNegativeMs(cooldownMs) + bufferMs, {
        authorized: true,
        reason: selectDefinedValue(() => (textValue(meta.reason)), () => (RATE_LIMIT_COOLDOWN_REASON)),
      });
    },
    async sleep(ms: number) {
      return sleep(ms, { budget });
    },
  };
  scheduleDeadlineAbort();
  return budget;
}

export function createBudgetFromMinutes(timeoutMinutes: number, options: Omit<BudgetInput, 'timeoutMs'> = {}) {
  return createBudget({ ...options, timeoutMs: nonNegativeMs(timeoutMinutes) * 60 * 1000 });
}

export function sleep(ms: number, options: { budget?: TimeBudget | null; signal?: AbortSignal | null } = {}) {
  const durationMs = nonNegativeMs(ms);
  const budget = selectTruthyValue(() => (options.budget), () => (null));
  const signals = [options.signal, budget?.signal].filter(Boolean) as AbortSignal[];

  for (const signal of signals) {
    if (signal.aborted) return Promise.reject(abortError(signal));
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
    const onAbort = (event: Event) => finish(reject, abortError(event?.target as AbortSignal | null));

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
