type AnyRecord = Record<string, any>;
type DependencyReader = (id: string) => unknown[];
type ReadyReader = (id: string, context: {
    batchIds: Set<string>;
    dependencyIds: string[];
}) => boolean;
type BatchExecutor = (id: string, context: {
    index: number;
    batchId: string;
}) => Promise<unknown>;
type SchedulerLocks = Set<string>;
export declare function createAttemptKey(input?: AnyRecord): string;
export declare function acquireExecutionLock(locks: SchedulerLocks, key: unknown): boolean;
export declare function releaseExecutionLock(locks: SchedulerLocks, key: unknown): void;
export declare function buildDependencyGraph(nodes?: unknown[]): AnyRecord;
export declare function collectReadyBatch(input: {
    orderedIds?: unknown[];
    startIndex?: number;
    dependencyIds?: DependencyReader;
    isCandidateReady: ReadyReader;
}): string[];
export declare function collectReadyItems(input: {
    orderedIds?: unknown[];
    dependencyIds?: DependencyReader;
    isCandidateReady: ReadyReader;
}): string[];
export declare function runBatch(input: {
    batchId?: string;
    itemIds?: unknown[];
    locks?: SchedulerLocks;
    lockKey?: (id: string, context: {
        index: number;
        batchId: string;
    }) => string;
    executor: BatchExecutor;
}): Promise<AnyRecord>;
export declare function aggregateBatchResults(batchResult?: AnyRecord): AnyRecord;
export {};
