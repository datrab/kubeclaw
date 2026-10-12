import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { preparationDigest } from './preparation-header.ts';
import { historicalInputDirectory, type HistoricalImportReceipt } from './preparation-historical-reference.ts';
import { transformHistoricalSnapshot, type HistoricalBatchContext } from './preparation-historical-batch.ts';
import type { HistoricalStorageReservation } from './preparation-historical-channel.ts';
import { wireDigest } from './preparation-input.ts';

export type HistoricalHostSummary = Omit<HistoricalImportReceipt, 'schemaVersion' | 'nativeResultDigest'>;

async function exclusive(file: string, bytes: Buffer): Promise<void> {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.chmod(0o444); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function persistCandidate(data: string, gate: string, candidate: Buffer, manifest: Buffer): Promise<void> {
  const directory = path.join(data, 'metadata-v2');
  await fs.mkdir(directory, { mode: 0o755 });
  await fs.mkdir(path.join(directory, 'records'), { mode: 0o755 });
  await exclusive(path.join(directory, 'records', 'store.json'), candidate);
  await exclusive(path.join(data, 'manifest.json'), manifest);
  for (const item of [path.join(directory, 'records'), directory, data, gate]) await syncDirectory(item);
}

/** All bulk writes and serialization execute inside the single owned import host. */
export async function materializeHistoricalImport(bytes: Buffer, context: HistoricalBatchContext, sourceRoot: string,
  reserve: (required: HistoricalStorageReservation) => Promise<void>, signal: AbortSignal): Promise<HistoricalHostSummary> {
  const gate = path.join(sourceRoot, context.importId);
  historicalInputDirectory(sourceRoot, { importId: context.importId, sequence: 1 });
  const data = path.join(gate, 'data');
  const inputs = path.join(data, 'inputs');
  let allocated = false;
  let wireBytes = 0;
  let entryMetadataBytes = 0;
  let inputCount = 0;
  // Includes gate/marker, original sealed source entry, both candidate directories,
  // candidate, manifest, final receipt and its temporary durable publication file.
  const fixedEntries = 14;
  const fixedMetadata = context.descriptor.originalStoreBytes + context.settings.maximumInputBytes
    + 2 * context.settings.maximumResultBytes;
  const required = (extraBytes: number, extraEntries: number, records: number): HistoricalStorageReservation => {
    const metadataBytes = fixedMetadata + entryMetadataBytes + extraBytes;
    const entries = fixedEntries + inputCount * 3 + extraEntries;
    const bytes = metadataBytes + wireBytes + entries * context.settings.sourceEntryReservationBytes;
    if (![bytes, metadataBytes, entries, records].every(value => Number.isSafeInteger(value) && value >= 0)
      || bytes > context.settings.maximumSourceBytes || metadataBytes > context.settings.maximumMetadataBytes
      || entries > context.settings.maximumSourceEntries || records > context.settings.maximumRecords) {
      throw new Error('BUSTER_HISTORICAL_STORAGE_LIMIT');
    }
    return { bytes, entries, metadataBytes, records };
  };
  const allocate = async () => {
    if (allocated) return;
    await fs.mkdir(data, { mode: 0o755 });
    allocated = true;
    await fs.mkdir(inputs, { mode: 0o755 });
  };
  const batch = await transformHistoricalSnapshot(bytes, context, async (staged, wire) => {
    signal.throwIfAborted();
    const metadata = Buffer.from(JSON.stringify(staged));
    wireBytes += wire.length;
    entryMetadataBytes += metadata.length;
    inputCount += 1;
    await reserve(required(0, 0, 2 * staged.input.sequence));
    await allocate();
    const directory = historicalInputDirectory(sourceRoot, staged.input);
    await fs.mkdir(directory, { mode: 0o755 });
    await exclusive(path.join(directory, 'request.json'), wire);
    await exclusive(path.join(directory, 'input.json'), metadata);
    await syncDirectory(directory);
    await syncDirectory(inputs);
  });
  signal.throwIfAborted();
  const candidate = Buffer.from(canonicalJson(batch.state));
  const manifest = Buffer.from(canonicalJson({ schemaVersion: 'buster-historical-manifest.v1',
    importId: context.importId, descriptor: context.descriptor,
    records: batch.state.records.map(record => ({ sequence: record.sequence, idempotencyKey: record.idempotencyKey,
      payloadDigest: record.payloadDigest })) }));
  await reserve(required(candidate.length + manifest.length, 0, 2 * batch.recordCount));
  await allocate();
  await persistCandidate(data, gate, candidate, manifest);
  signal.throwIfAborted();
  return { importId: context.importId, descriptor: context.descriptor, preparationUid: context.preparationUid,
    attemptSpecDigest: context.attemptSpecDigest, recordCount: batch.recordCount, wireCount: batch.wireCount,
    wireBytes: batch.wireBytes, manifestDigest: wireDigest(manifest), initialV2StoreDigest: wireDigest(candidate) };
}

export function historicalSummaryDigest(summary: HistoricalHostSummary): string { return preparationDigest(summary); }
