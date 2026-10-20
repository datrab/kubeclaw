import { assertHistoricalImportDescriptor } from './preparation-historical-reference.ts';

/** Read-only kernel observation. This value is explicitly NOT migration authority. */
interface HistoricalFilesystemObservation {
  readonly filesystemUuid: string;
  readonly device: number;
  readonly inode: number;
  readonly mountId: number;
  readonly inventoryDigest: string;
  readonly bytes: number;
  readonly entries: number;
}
export interface HistoricalImmutableTreeObservation extends HistoricalFilesystemObservation {
  readonly schemaVersion: 'buster-legacy-immutable-tree.v1';
  readonly store: { readonly device: number; readonly inode: number; readonly bytes: number; readonly digest: string };
  readonly resultBytes: number;
  readonly resultEntries: number;
}
export interface HistoricalImmutableRuntimeObservation extends HistoricalFilesystemObservation {
  readonly schemaVersion: 'buster-legacy-immutable-runtime.v1';
}

function exact(value: unknown, keys: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== keys) throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
}
function integer(value: unknown, minimum: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** Strict small-result decoder only. Calling it never authorizes import. */
export function assertHistoricalImmutableTreeObservation(value: unknown,
  maximumBytes: number, maximumEntries: number): asserts value is HistoricalImmutableTreeObservation {
  exact(value, 'bytes,device,entries,filesystemUuid,inode,inventoryDigest,mountId,resultBytes,resultEntries,schemaVersion,store');
  exact(value.store, 'bytes,device,digest,inode');
  if (value.schemaVersion !== 'buster-legacy-immutable-tree.v1') {
    throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
  }
  const observed = value as unknown as HistoricalImmutableTreeObservation;
  assertObservationCounts(observed, maximumBytes, maximumEntries);
  if (!integer(observed.resultBytes, 0) || !integer(observed.resultEntries, 0)
    || observed.resultBytes > observed.bytes || observed.resultEntries > observed.entries) {
    throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
  }
  assertHistoricalImportDescriptor({ schemaVersion: 'buster-historical-import-descriptor.v1',
    originalStoreDigest: observed.store.digest, originalStoreBytes: observed.store.bytes,
    originalStoreDevice: observed.store.device, originalStoreInode: observed.store.inode });
  if (observed.store.device !== observed.device || observed.store.bytes > observed.bytes) {
    throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
  }
}

function assertObservationCounts(value: HistoricalFilesystemObservation, maximumBytes: number,
  maximumEntries: number): void {
  if (typeof value.filesystemUuid !== 'string'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value.filesystemUuid)
    || value.filesystemUuid === '00000000-0000-0000-0000-000000000000'
    || typeof value.inventoryDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value.inventoryDigest)) {
    throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
  }
  const nonnegative = [value.device, value.bytes];
  const positive = [value.inode, value.mountId, value.entries, maximumBytes, maximumEntries];
  if (!nonnegative.every(item => integer(item, 0)) || !positive.every(item => integer(item, 1))
    || value.bytes > maximumBytes || value.entries > maximumEntries) {
    throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
  }
}

/** Inert runtime symlinks contribute metadata bytes; their targets are not sealed evidence. */
export function assertHistoricalImmutableRuntimeObservation(value: unknown,
  maximumBytes: number, maximumEntries: number): asserts value is HistoricalImmutableRuntimeObservation {
  exact(value, 'bytes,device,entries,filesystemUuid,inode,inventoryDigest,mountId,schemaVersion');
  if (value.schemaVersion !== 'buster-legacy-immutable-runtime.v1') throw new Error('BUSTER_HISTORICAL_OBSERVATION_INVALID');
  assertObservationCounts(value as unknown as HistoricalImmutableRuntimeObservation, maximumBytes, maximumEntries);
}
