import type { TimeBudget } from '../timing.js';
export interface GitLogger {
    info?: (tag: string, msg: string) => void;
    warn?: (tag: string, msg: string) => void;
}
export interface GitWorkflowOptions {
    logger?: GitLogger | null;
}
export interface GitPushOptions extends GitWorkflowOptions {
    maxAttempts?: number;
    retryDelayMs?: number;
    commitMessage?: string;
    addPaths?: string[];
    budget?: TimeBudget | null;
    signal?: AbortSignal | null;
}
export declare function logGit(logger: GitLogger | null, level: 'info' | 'warn', message: string): void;
