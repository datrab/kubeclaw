import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { assertPreparedHeader, preparationDigest, type PreparedPlanJob } from './preparation-header.ts';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';

export interface HistoricalImportDescriptor {
  readonly schemaVersion: 'buster-historical-import-descriptor.v1';
  readonly originalStoreDigest: string;
  readonly originalStoreBytes: number;
  readonly originalStoreDevice: number;
  readonly originalStoreInode: number;
}

export interface HistoricalInputReference {
  readonly schemaVersion: 'buster-historical-input.v1';
  readonly importId: string;
  readonly sequence: number;
  readonly originalPayloadDigest: string;
  readonly preparationUid: PreparationSlot;
  readonly attemptSpecDigest: string;
  readonly jobId: string;
  readonly requestDigest: string;
  readonly headerDigest: string;
  readonly wireDigest: string;
  readonly wireBytes: number;
}

export interface HistoricalStagedAdmission {
  readonly job: PreparedPlanJob;
  readonly input: HistoricalInputReference;
}

export interface HistoricalImportReceipt {
  readonly schemaVersion: 'buster-historical-import-receipt.v1';
  readonly importId: string;
  readonly descriptor: HistoricalImportDescriptor;
  readonly preparationUid: PreparationSlot;
  readonly attemptSpecDigest: string;
  readonly recordCount: number;
  readonly wireCount: number;
  readonly wireBytes: number;
  readonly manifestDigest: string;
  readonly initialV2StoreDigest: string;
  readonly nativeResultDigest: string;
}

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const importPattern = /^[a-f0-9]{32}$/u;
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw new Error('BUSTER_HISTORICAL_IDENTITY_INVALID');
  }
}
function integer(value: unknown, minimum: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
function digest(value: unknown): boolean { return typeof value === 'string' && digestPattern.test(value); }

export function assertHistoricalImportDescriptor(value: unknown): asserts value is HistoricalImportDescriptor {
  exact(value, ['schemaVersion', 'originalStoreDigest', 'originalStoreBytes', 'originalStoreDevice', 'originalStoreInode']);
  if (value.schemaVersion !== 'buster-historical-import-descriptor.v1' || !digest(value.originalStoreDigest)
    || !integer(value.originalStoreBytes, 1) || !integer(value.originalStoreDevice, 0)
    || !integer(value.originalStoreInode, 1)) throw new Error('BUSTER_HISTORICAL_DESCRIPTOR_INVALID');
}

export function assertHistoricalInput(value: unknown, job: PreparedPlanJob): asserts value is HistoricalInputReference {
  assertPreparedHeader(job);
  exact(value, ['schemaVersion', 'importId', 'sequence', 'originalPayloadDigest', 'preparationUid',
    'attemptSpecDigest', 'jobId', 'requestDigest', 'headerDigest', 'wireDigest', 'wireBytes']);
  assertPreparationSlot(value.preparationUid);
  if (value.schemaVersion !== 'buster-historical-input.v1' || typeof value.importId !== 'string'
    || !importPattern.test(value.importId) || !integer(value.sequence, 1) || !integer(value.wireBytes, 1)
    || ![value.originalPayloadDigest, value.attemptSpecDigest, value.wireDigest].every(digest)
    || value.jobId !== job.jobId || value.requestDigest !== job.requestDigest
    || value.headerDigest !== preparationDigest(job)) throw new Error('BUSTER_HISTORICAL_INPUT_INVALID');
}

export function assertHistoricalImportReceipt(value: unknown): asserts value is HistoricalImportReceipt {
  exact(value, ['schemaVersion', 'importId', 'descriptor', 'preparationUid', 'attemptSpecDigest',
    'recordCount', 'wireCount', 'wireBytes', 'manifestDigest', 'initialV2StoreDigest', 'nativeResultDigest']);
  assertHistoricalImportDescriptor(value.descriptor);
  assertPreparationSlot(value.preparationUid);
  if (value.schemaVersion !== 'buster-historical-import-receipt.v1' || typeof value.importId !== 'string'
    || !importPattern.test(value.importId) || !integer(value.recordCount, 0) || !integer(value.wireCount, 0)
    || !integer(value.wireBytes, 0) || Number(value.wireCount) > Number(value.recordCount)
    || ![value.attemptSpecDigest, value.manifestDigest, value.initialV2StoreDigest, value.nativeResultDigest].every(digest)) {
    throw new Error('BUSTER_HISTORICAL_RECEIPT_INVALID');
  }
}

export function historicalInputDirectory(sourceRoot: string, input: Pick<HistoricalInputReference, 'importId' | 'sequence'>): string {
  if (!path.isAbsolute(sourceRoot) || path.resolve(sourceRoot) !== sourceRoot || sourceRoot === '/'
    || typeof input.importId !== 'string' || !importPattern.test(input.importId) || !integer(input.sequence, 1)) throw new Error('BUSTER_HISTORICAL_PATH_INVALID');
  return path.join(sourceRoot, input.importId, 'data', 'inputs', String(input.sequence));
}

async function trustedDirectory(directory: string, uid = 0): Promise<void> {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o022) !== 0
    || (uid !== 0 && ((stat.mode & 0o7777) !== 0o755 || stat.gid !== uid))
    || await fs.realpath(directory) !== directory) throw new Error('BUSTER_HISTORICAL_PUBLICATION_UNTRUSTED');
}

async function trustedJson(file: string, maximumBytes: number, uid = 0): Promise<unknown> {
  if (!integer(maximumBytes, 1)) throw new Error('BUSTER_HISTORICAL_METADATA_LIMIT');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== uid || stat.nlink !== 1 || (stat.mode & 0o777) !== (uid === 0 ? 0o400 : 0o444)
      || stat.size > maximumBytes) throw new Error('BUSTER_HISTORICAL_PUBLICATION_UNTRUSTED');
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, null);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size) throw new Error('BUSTER_HISTORICAL_METADATA_CHANGED');
    return JSON.parse(bytes.subarray(0, offset).toString('utf8')) as unknown;
  } finally { await handle.close(); }
}

function assertReceiptBinding(receipt: HistoricalImportReceipt, input: HistoricalInputReference, expectedDigest: string): void {
  if (!digest(expectedDigest) || preparationDigest(receipt) !== expectedDigest
    || receipt.importId !== input.importId || receipt.preparationUid !== input.preparationUid
    || receipt.attemptSpecDigest !== input.attemptSpecDigest || input.sequence > receipt.recordCount) {
    throw new Error('BUSTER_HISTORICAL_INPUT_UNBOUND');
  }
}

/** Root-side lookup after group publication; never scans or parses the V1 store. */
export async function resolveHistoricalInput(sourceRoot: string, staged: HistoricalStagedAdmission,
  maximumMetadataBytes: number, expectedReceiptDigest: string): Promise<string> {
  const snapshot = structuredClone(staged);
  assertHistoricalInput(snapshot.input, snapshot.job);
  const input = snapshot.input;
  const directory = historicalInputDirectory(sourceRoot, input);
  const group = path.join(sourceRoot, input.importId);
  await trustedDirectory(sourceRoot);
  await trustedDirectory(group);
  const gate = await fs.lstat(group);
  if (gate.gid !== 0 || (gate.mode & 0o7777) !== 0o700) throw new Error('BUSTER_HISTORICAL_PUBLICATION_UNTRUSTED');
  // The quiescent host's descendants retain their original UID. The revoked
  // root gate prevents reuse of that UID from accessing these immutable inputs.
  for (const item of [path.join(group, 'data'), path.join(group, 'data', 'inputs'), directory]) {
    await trustedDirectory(item, input.preparationUid);
  }
  const receipt = await trustedJson(path.join(group, 'historical-receipt.json'), maximumMetadataBytes);
  assertHistoricalImportReceipt(receipt);
  assertReceiptBinding(receipt, input, expectedReceiptDigest);
  const entry = await trustedJson(path.join(directory, 'input.json'), maximumMetadataBytes, input.preparationUid);
  exact(entry, ['job', 'input']);
  assertHistoricalInput(entry.input, entry.job as PreparedPlanJob);
  if (preparationDigest(entry) !== preparationDigest(snapshot)) throw new Error('BUSTER_HISTORICAL_INPUT_UNBOUND');
  const file = path.join(directory, 'request.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.uid !== input.preparationUid || stat.nlink !== 1
    || (stat.mode & 0o777) !== 0o444 || stat.size !== input.wireBytes) {
    throw new Error('BUSTER_HISTORICAL_PUBLICATION_UNTRUSTED');
  }
  return file;
}
