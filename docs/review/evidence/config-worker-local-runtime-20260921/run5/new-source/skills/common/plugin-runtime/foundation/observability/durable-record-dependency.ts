import fs from 'node:fs/promises';
import { readDurableState } from './durable-delivery.ts';
import { assertDurableRecordReplay, type DurableRecord, type DurableRecordState } from './record-retirement.ts';

/** Reject aliased writer namespaces before a caller acquires a second lock. */
export async function assertDistinctStoreFiles(ownerFile: string, dependencyFile: string): Promise<void> {
  if (ownerFile === dependencyFile) throw new Error('DURABLE_RECORD_RETAINED_STORE_ALIAS');
  const [ownerPath, dependencyPath] = await Promise.all([fs.realpath(ownerFile), fs.realpath(dependencyFile)]);
  if (ownerPath !== ownerFile || dependencyPath !== dependencyFile || ownerPath === dependencyPath) {
    throw new Error('DURABLE_RECORD_RETAINED_STORE_ALIAS');
  }
  const [owner, dependency] = await Promise.all([fs.lstat(ownerPath), fs.lstat(dependencyPath)]);
  if (!owner.isFile() || !dependency.isFile() || owner.nlink !== 1 || dependency.nlink !== 1
    || owner.dev === dependency.dev && owner.ino === dependency.ino) {
    throw new Error('DURABLE_RECORD_RETAINED_STORE_ALIAS');
  }
}

/** Read-owned clones while the caller holds this store's original writer fence. */
export async function readStoreRecords<T>(file: string, maximumBytes: number, stream: string): Promise<readonly DurableRecord<T>[]> {
  const state = await readDurableState<DurableRecordState>(file, { schemaVersion: 'pipeline-durable-record-store.v1', records: [] }, maximumBytes);
  assertDurableRecordReplay(state);
  return structuredClone(state.records.filter(record => record.stream === stream)) as DurableRecord<T>[];
}

interface RetainedStoreFence<R> {
  readonly ownerFile: string;
  readonly retainedFile: string;
  readonly owner: (operation: () => Promise<R>) => Promise<R>;
  readonly retained: (operation: (records: readonly DurableRecord[]) => Promise<R>) => Promise<R>;
}
/** Fixed owner then dependency order; reject aliases before either nested acquisition. */
export async function withRetainedStoreFence<R>(fence: RetainedStoreFence<R>,
  operation: (records: readonly DurableRecord[]) => Promise<R>,
): Promise<R> {
  await assertDistinctStoreFiles(fence.ownerFile, fence.retainedFile);
  return fence.owner(async () => {
    await assertDistinctStoreFiles(fence.ownerFile, fence.retainedFile);
    return fence.retained(async records => {
      await assertDistinctStoreFiles(fence.ownerFile, fence.retainedFile);
      return operation(records);
    });
  });
}
