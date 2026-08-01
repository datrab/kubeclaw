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
export type TimeBudget = {
    readonly deadlineMs: number;
    readonly signal: AbortSignal;
    readonly extensions: Array<{
        ms: number;
        reason: string;
        at: string;
    }>;
    remainingMs(): number;
    throwIfExhausted(reason?: string): void;
    extend(ms: number, meta?: BudgetExtensionMeta): number;
    extendForRateLimit(cooldownMs: number, meta?: BudgetExtensionMeta): number;
    sleep(ms: number): Promise<void>;
};
export declare class BudgetExhaustedError extends Error {
    code: string;
    deadlineMs: number | null;
    remainingMs: number;
    reason: string;
    constructor(message?: string, details?: BudgetDetails);
}
export declare function abortSignalError(signal: AbortSignal | null | undefined): Error;
export declare function isBudgetExhaustedError(error: unknown): boolean;
export declare function createBudget(input?: BudgetInput): TimeBudget;
export declare function createBudgetFromMinutes(timeoutMinutes: number, options?: Omit<BudgetInput, 'timeoutMs'>): TimeBudget;
export declare function sleep(ms: number, options?: {
    budget?: TimeBudget | null;
    signal?: AbortSignal | null;
}): Promise<void>;
export {};
