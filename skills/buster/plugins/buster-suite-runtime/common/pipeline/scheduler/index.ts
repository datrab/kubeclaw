import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;
type DependencyReader = (id: string) => unknown[];
type ReadyReader = (id: string, context: { batchIds: Set<string>; dependencyIds: string[] }) => boolean;
type BatchExecutor = (id: string, context: { index: number; batchId: string }) => Promise<unknown>;
type SchedulerLocks = Set<string>;

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: unknown[] = []): string[] {
  return [...new Set(values.map(textValue).filter(Boolean))];
}

function errorCode(error: unknown): string {
  const value = typeof error === 'object' && error !== null ? (error as AnyRecord).code : null;
  return textValue(value) || 'scheduler_batch_item_failed';
}

function errorReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(selectTruthyValue(() => (error), () => ('scheduler_batch_item_failed')));
}

export function createAttemptKey(input: AnyRecord = {}): string {
  const runId = textValue(input.runId);
  const itemId = textValue(selectDefinedValue(() => (input.itemId), () => (input.moduleId), () => (input.suiteId)));
  const phase = textValue(input.phase);
  const attempt = Number(input.attempt);
  if (!runId) throw new Error('scheduler attempt key requires runId');
  if (!itemId) throw new Error('scheduler attempt key requires itemId');
  if (!phase) throw new Error('scheduler attempt key requires phase');
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('scheduler attempt key requires positive integer attempt');
  return `${runId}:${phase}:${itemId}:attempt-${attempt}`;
}

export function acquireExecutionLock(locks: SchedulerLocks, key: unknown): boolean {
  const lockKey = textValue(key);
  if (!lockKey) throw new Error('scheduler execution lock requires key');
  if (locks.has(lockKey)) return false;
  locks.add(lockKey);
  return true;
}

export function releaseExecutionLock(locks: SchedulerLocks, key: unknown): void {
  const lockKey = textValue(key);
  if (!lockKey) throw new Error('scheduler execution lock requires key');
  locks.delete(lockKey);
}

export function buildDependencyGraph(nodes: unknown[] = []): AnyRecord {
  const ids: string[] = [];
  const dependenciesById = new Map<string, string[]>();
  const dependentsById = new Map<string, string[]>();
  for (const node of nodes) {
    const record = typeof node === 'object' && node !== null ? node as AnyRecord : { id: node };
    const id = textValue(record.id);
    if (!id) throw new Error('scheduler graph node requires id');
    if (dependenciesById.has(id)) throw new Error(`scheduler graph duplicate node id: ${id}`);
    const dependencies = uniqueStrings(selectDefinedValue(() => (record.dependencies), () => (record.depends_on), () => ([])));
    ids.push(id);
    dependenciesById.set(id, dependencies);
    if (!dependentsById.has(id)) dependentsById.set(id, []);
    for (const dependency of dependencies) {
      if (!dependentsById.has(dependency)) dependentsById.set(dependency, []);
      dependentsById.get(dependency)?.push(id);
    }
  }
  return {
    ids,
    dependenciesById,
    dependentsById,
    dependencyIds: (id: string) => dependenciesById.get(id) || [],
    dependentIds: (id: string) => dependentsById.get(id) || [],
  };
}

export function collectReadyBatch(input: {
  orderedIds?: unknown[];
  startIndex?: number;
  dependencyIds?: DependencyReader;
  isCandidateReady: ReadyReader;
}): string[] {
  const orderedIds = uniqueStrings(input.orderedIds || []);
  const startIndex = Math.max(0, Number(selectDefinedValue(() => (input.startIndex), () => (0))) || 0);
  const dependencyIds = input.dependencyIds || (() => []);
  const batch: string[] = [];
  const batchIds = new Set<string>();
  for (let index = startIndex; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    if (id === undefined) break;
    const dependencies = uniqueStrings(dependencyIds(id));
    const dependsOnCurrentBatch = dependencies.some((dependency) => batchIds.has(dependency));
    const ready = !dependsOnCurrentBatch && input.isCandidateReady(id, { batchIds, dependencyIds: dependencies });
    if (!ready) {
      if (batch.length > 0) break;
      continue;
    }
    batch.push(id);
    batchIds.add(id);
  }
  return batch;
}

export function collectReadyItems(input: {
  orderedIds?: unknown[];
  dependencyIds?: DependencyReader;
  isCandidateReady: ReadyReader;
}): string[] {
  const orderedIds = uniqueStrings(input.orderedIds || []);
  const dependencyIds = input.dependencyIds || (() => []);
  const selectedIds = new Set<string>();
  const ready: string[] = [];
  for (const id of orderedIds) {
    const dependencies = uniqueStrings(dependencyIds(id));
    const dependsOnSelected = dependencies.some((dependency) => selectedIds.has(dependency));
    if (dependsOnSelected) continue;
    if (!input.isCandidateReady(id, { batchIds: selectedIds, dependencyIds: dependencies })) continue;
    ready.push(id);
    selectedIds.add(id);
  }
  return ready;
}

export async function runBatch(input: {
  batchId?: string;
  itemIds?: unknown[];
  locks?: SchedulerLocks;
  lockKey?: (id: string, context: { index: number; batchId: string }) => string;
  executor: BatchExecutor;
}): Promise<AnyRecord> {
  const itemIds = uniqueStrings(input.itemIds || []);
  const batchId = textValue(input.batchId) || `batch:${itemIds.join(',')}`;
  const settled = await Promise.allSettled(itemIds.map(async (itemId, index) => {
    const context = { index, batchId };
    const lockKey = input.lockKey ? textValue(input.lockKey(itemId, context)) : '';
    if (input.locks && lockKey && !acquireExecutionLock(input.locks, lockKey)) {
      const error = new Error(`scheduler execution already locked: ${lockKey}`) as Error & { code?: string };
      error.code = 'scheduler_execution_locked';
      throw error;
    }
    try {
      return await input.executor(itemId, context);
    } finally {
      if (input.locks && lockKey) releaseExecutionLock(input.locks, lockKey);
    }
  }));
  return {
    kind: 'scheduler_batch_result',
    batch_id: batchId,
    item_ids: itemIds,
    results: settled.map((entry, index) => {
      const itemId = itemIds[index];
      if (entry.status === 'fulfilled') return { item_id: itemId, status: 'fulfilled', result: entry.value };
      return {
        item_id: itemId,
        status: 'rejected',
        reason_code: errorCode(entry.reason),
        reason: errorReason(entry.reason),
      };
    }),
  };
}

export function aggregateBatchResults(batchResult: AnyRecord = {}): AnyRecord {
  const results = Array.isArray(batchResult.results) ? batchResult.results : [];
  const fulfilled = results.filter((entry: AnyRecord) => entry?.status === 'fulfilled');
  const rejected = results.filter((entry: AnyRecord) => entry?.status !== 'fulfilled');
  return {
    batch_id: textValue(batchResult.batch_id),
    item_ids: uniqueStrings(batchResult.item_ids || results.map((entry: AnyRecord) => entry?.item_id)),
    fulfilled,
    rejected,
    ok: rejected.length === 0,
  };
}
