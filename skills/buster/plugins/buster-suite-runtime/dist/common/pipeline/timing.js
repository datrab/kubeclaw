import { selectDefinedValue, selectTruthyValue } from './optional-absence.js';
const DEFAULT_BUDGET_REASON = 'budget_exhausted';
const DEFAULT_BUDGET_LABEL = 'budget';
const RATE_LIMIT_COOLDOWN_REASON = 'rate_limit_cooldown';
export class BudgetExhaustedError extends Error {
    code;
    deadlineMs;
    remainingMs;
    reason;
    constructor(message = 'Time budget exhausted', details = {}) {
        super(message);
        this.name = 'BudgetExhaustedError';
        this.code = 'BUDGET_EXHAUSTED';
        this.deadlineMs = Number.isFinite(details.deadlineMs) ? details.deadlineMs : null;
        this.remainingMs = Number.isFinite(details.remainingMs) ? details.remainingMs : 0;
        this.reason = textValue(details.reason) ?? DEFAULT_BUDGET_REASON;
    }
}
function textValue(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
}
function nonNegativeMs(value) {
    const parsed = Number(value);
    return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
}
export function abortSignalError(signal) {
    const reason = signal?.reason;
    if (reason instanceof Error)
        return reason;
    const err = new Error(reason ? String(reason) : 'Operation aborted');
    err.name = 'AbortError';
    err.code = 'ABORT_ERR';
    return err;
}
function toDeadlineMs(input = {}) {
    if (Number.isFinite(input.deadlineMs))
        return input.deadlineMs;
    if (Number.isFinite(input.deadline))
        return input.deadline;
    if (Number.isFinite(input.timeoutMs))
        return Date.now() + Math.max(0, input.timeoutMs);
    if (Number.isFinite(input.timeoutMinutes))
        return Date.now() + Math.max(0, input.timeoutMinutes * 60 * 1000);
    throw new TypeError('createBudget requires deadlineMs, deadline, timeoutMs, or timeoutMinutes');
}
export function isBudgetExhaustedError(error) {
    return selectTruthyValue(() => (error?.name === 'BudgetExhaustedError'), () => (error?.code === 'BUDGET_EXHAUSTED'));
}
class DeadlineBudget {
    deadline;
    controller = new AbortController();
    upstream;
    label;
    extensionHistory = [];
    deadlineTimer = null;
    upstreamAbortHandler = null;
    constructor(input) {
        this.deadline = toDeadlineMs(input);
        this.upstream = input.signal ?? null;
        this.label = textValue(input.label) ?? DEFAULT_BUDGET_LABEL;
        this.connectUpstream();
        this.scheduleDeadlineAbort();
    }
    get deadlineMs() { return this.deadline; }
    get signal() { return this.controller.signal; }
    get extensions() { return this.extensionHistory.slice(); }
    remainingMs() {
        return Math.max(0, this.deadline - Date.now());
    }
    throwIfExhausted(reason = DEFAULT_BUDGET_REASON) {
        if (this.signal.aborted)
            throw abortSignalError(this.signal);
        if (this.remainingMs() > 0)
            return;
        const error = this.exhaustedError(reason);
        this.abortIfNeeded(reason);
        throw error;
    }
    extend(ms, meta = {}) {
        if (meta.authorized !== true || !meta.reason) {
            throw new TypeError('Budget extension requires explicit authorization and reason');
        }
        const extensionMs = nonNegativeMs(ms);
        this.deadline += extensionMs;
        this.extensionHistory.push({ ms: extensionMs, reason: meta.reason, at: new Date().toISOString() });
        this.scheduleDeadlineAbort();
        return this.deadline;
    }
    extendForRateLimit(cooldownMs, meta = {}) {
        return this.extend(nonNegativeMs(cooldownMs) + nonNegativeMs(meta.bufferMs), {
            authorized: true,
            reason: textValue(meta.reason) ?? RATE_LIMIT_COOLDOWN_REASON,
        });
    }
    async sleep(ms) {
        return sleep(ms, { budget: this });
    }
    exhaustedError(reason) {
        return new BudgetExhaustedError(`${this.label} exhausted`, {
            deadlineMs: this.deadline,
            remainingMs: this.remainingMs(),
            reason,
        });
    }
    abortIfNeeded(reason = DEFAULT_BUDGET_REASON) {
        if (this.signal.aborted)
            return;
        this.clearTimer();
        this.removeUpstreamAbortListener();
        this.controller.abort(this.exhaustedError(reason));
    }
    clearTimer() {
        if (this.deadlineTimer)
            clearTimeout(this.deadlineTimer);
        this.deadlineTimer = null;
    }
    removeUpstreamAbortListener() {
        if (!this.upstream || !this.upstreamAbortHandler)
            return;
        this.upstream.removeEventListener('abort', this.upstreamAbortHandler);
        this.upstreamAbortHandler = null;
    }
    scheduleDeadlineAbort() {
        this.clearTimer();
        if (this.signal.aborted)
            return;
        this.deadlineTimer = setTimeout(() => this.abortIfNeeded(), this.remainingMs());
        this.deadlineTimer.unref?.();
    }
    connectUpstream() {
        if (!this.upstream)
            return;
        if (this.upstream.aborted) {
            this.controller.abort(abortSignalError(this.upstream));
            return;
        }
        this.upstreamAbortHandler = () => {
            if (this.signal.aborted)
                return;
            this.clearTimer();
            this.removeUpstreamAbortListener();
            this.controller.abort(abortSignalError(this.upstream));
        };
        this.upstream.addEventListener('abort', this.upstreamAbortHandler, { once: true });
    }
}
export function createBudget(input = {}) {
    return new DeadlineBudget(input);
}
export function createBudgetFromMinutes(timeoutMinutes, options = {}) {
    return createBudget({ ...options, timeoutMs: nonNegativeMs(timeoutMinutes) * 60 * 1000 });
}
export function sleep(ms, options = {}) {
    const durationMs = nonNegativeMs(ms);
    const budget = selectTruthyValue(() => (options.budget), () => (null));
    const signals = [options.signal, budget?.signal].filter(Boolean);
    for (const signal of signals) {
        if (signal.aborted)
            return Promise.reject(abortSignalError(signal));
    }
    try {
        budget?.throwIfExhausted?.();
    }
    catch (error) {
        return Promise.reject(error);
    }
    const remaining = budget?.remainingMs ? budget.remainingMs() : Infinity;
    const waitMs = Math.min(durationMs, remaining);
    const willExhaustBudget = Number.isFinite(remaining) && remaining <= durationMs;
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        const cleanup = () => {
            if (timer)
                clearTimeout(timer);
            for (const signal of signals)
                signal.removeEventListener('abort', onAbort);
        };
        const finish = (fn, value) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            fn(value);
        };
        const onAbort = (event) => finish(reject, abortSignalError(event?.target));
        for (const signal of signals)
            signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
            if (willExhaustBudget) {
                try {
                    budget?.throwIfExhausted?.();
                }
                catch (error) {
                    finish(reject, error);
                    return;
                }
            }
            finish(resolve);
        }, waitMs);
    });
}
