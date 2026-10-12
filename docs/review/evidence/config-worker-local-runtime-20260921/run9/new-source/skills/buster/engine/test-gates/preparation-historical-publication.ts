import { preparedPlanStateRoot } from './prepared-plan-paths.ts';
import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import type { WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { writeDurableState, withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { preparationDigest } from './preparation-header.ts';
import { retainPreparationGate, type PreparationGateBinding } from './preparation-gate.ts';
import { assertHistoricalImportReceipt, type HistoricalImportReceipt } from './preparation-historical-reference.ts';
import { digestHistoricalFile } from './preparation-historical-ledger.ts';
import type { PreparationExecutionOptions } from './preparation-execution.ts';

async function sync(directory: string): Promise<void> {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function regular(file: string): Promise<void> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || ![0, 1000, 1003, 1004].includes(stat.uid)) {
    throw new Error('BUSTER_HISTORICAL_CANDIDATE_INVALID');
  }
}

/** Only the three known V2 metadata nodes change owner, never the bulk input tree.
 * No service is started while this function runs. */
async function ownCandidate(directory: string, uid: number): Promise<void> {
  for (const item of [directory, path.join(directory, 'records')]) {
    const stat = await fs.lstat(item);
    if (!stat.isDirectory() || await fs.realpath(item) !== item || ![0, 1000, 1003, 1004].includes(stat.uid)) {
      throw new Error('BUSTER_HISTORICAL_CANDIDATE_INVALID');
    }
    await fs.chown(item, 0, 0);
    await fs.chmod(item, 0o755);
  }
  const file = path.join(directory, 'records', 'store.json');
  await regular(file);
  await fs.chown(file, 0, 0);
  await fs.chmod(file, uid === 0 ? 0o400 : 0o600);
  await fs.chown(file, uid, uid);
  if (uid !== 0) {
    for (const item of [path.join(directory, 'records'), directory]) {
      await fs.chmod(item, 0o700);
      await fs.chown(item, uid, uid);
    }
  }
}

function assertPublicationIdentity(intent: Record<string, unknown>, candidate: Stats, receipt: HistoricalImportReceipt): void {
  if (Object.keys(intent).sort().join(',') !== 'device,inode,nativeResultDigest,schemaVersion'
    || intent.schemaVersion !== 'buster-historical-publication-intent.v1'
    || intent.nativeResultDigest !== receipt.nativeResultDigest || candidate.dev !== intent.device
    || candidate.ino !== intent.inode || !candidate.isDirectory()) throw new Error('BUSTER_HISTORICAL_PUBLICATION_INTENT_INVALID');
}

async function candidatePath(source: string, target: string, intentFile: string,
  receipt: HistoricalImportReceipt, maximumBytes: number): Promise<string> {
  try { await fs.lstat(source); return source; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // A crash can occur after rename, before receipt publication. The exact
  // native result still binds this candidate before any service has started.
  const handle = await fs.open(intentFile, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== 0 || stat.nlink !== 1 || stat.size > maximumBytes
      || (stat.mode & 0o777) !== 0o400 || await fs.realpath(intentFile) !== intentFile) {
      throw new Error('BUSTER_HISTORICAL_PUBLICATION_INTENT_INVALID');
    }
    const bytes = Buffer.alloc(stat.size + 1);
    const read = await handle.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== stat.size) throw new Error('BUSTER_HISTORICAL_PUBLICATION_INTENT_INVALID');
    const intent = JSON.parse(bytes.subarray(0, stat.size).toString('utf8'));
    const candidate = await fs.lstat(target);
    assertPublicationIdentity(intent, candidate, receipt);
    return target;
  } finally { await handle.close(); }
}

export function historicalResultReceipt(result: WorkerAttemptResultV3): HistoricalImportReceipt {
  if (result.state !== 'completed' || result.cleanup.state !== 'completed'
    || result.specialistResult?.schemaId !== 'buster-historical-import-result.v1') {
    throw new Error('BUSTER_HISTORICAL_RESULT_INVALID');
  }
  const receipt = { ...result.specialistResult.values, schemaVersion: 'buster-historical-import-receipt.v1',
    nativeResultDigest: preparationDigest(result) };
  assertHistoricalImportReceipt(receipt);
  return receipt;
}

async function publishCandidate(options: PreparationExecutionOptions, stateRoot: string, group: string,
  receipt: HistoricalImportReceipt): Promise<void> {
  const original = await digestHistoricalFile(path.join(stateRoot, 'records', 'store.json'), options.settings.maximumSourceBytes);
  if (preparationDigest(original) !== preparationDigest(receipt.descriptor)) throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
  const manifest = await digestHistoricalFile(path.join(group, 'data', 'manifest.json'), options.settings.maximumMetadataBytes);
  if (manifest.originalStoreDigest !== receipt.manifestDigest) throw new Error('BUSTER_HISTORICAL_MANIFEST_CHANGED');
  const source = path.join(group, 'data', 'metadata-v2');
  const target = preparedPlanStateRoot(stateRoot);
  const intentFile = path.join(group, 'historical-publication.json');
  const candidate = await candidatePath(source, target, intentFile, receipt, options.settings.maximumResultBytes);
  await ownCandidate(candidate, 0);
  const current = await digestHistoricalFile(path.join(candidate, 'records', 'store.json'), options.settings.maximumMetadataBytes);
  if (current.originalStoreDigest !== receipt.initialV2StoreDigest) throw new Error('BUSTER_HISTORICAL_CANDIDATE_CHANGED');
  if (candidate === source) {
    const selected = await fs.lstat(source);
    await writeDurableState(intentFile, { schemaVersion: 'buster-historical-publication-intent.v1',
      device: selected.dev, inode: selected.ino, nativeResultDigest: receipt.nativeResultDigest });
    await fs.chmod(intentFile, 0o400);
    await sync(group);
    try {
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0
        || await fs.realpath(target) !== target) throw new Error('BUSTER_HISTORICAL_TARGET_EXISTS');
      // Inspect only the root-owned target directory entry, not a V2 bulk parse.
      if ((await fs.readdir(target)).length !== 0) throw new Error('BUSTER_HISTORICAL_TARGET_EXISTS');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await fs.rename(source, target);
    await sync(path.join(group, 'data'));
    await sync(path.dirname(target));
  }
  await ownCandidate(target, 1000);
  await sync(path.dirname(target));
}

/** Called only with the original journal result and positive native quiescence. */
export async function publishHistoricalImport(options: PreparationExecutionOptions, stateRoot: string,
  result: WorkerAttemptResultV3, binding: PreparationGateBinding): Promise<HistoricalImportReceipt> {
  if (process.getuid?.() !== 0) throw new Error('BUSTER_HISTORICAL_ROOT_REQUIRED');
  const receipt = historicalResultReceipt(result);
  const reservations = await options.ledger.reservations();
  const reservation = reservations.find(item => item.admissionId === receipt.importId);
  if (!reservation || reservation.attemptSpecDigest !== receipt.attemptSpecDigest
    || reservation.slot !== receipt.preparationUid || preparationDigest(reservation.historicalDescriptor) !== preparationDigest(receipt.descriptor)
    || preparationDigest(reservation.gate) !== preparationDigest(binding)) throw new Error('BUSTER_HISTORICAL_RESULT_UNBOUND');
  const envelope = reservation.envelope;
  const owner = await options.owner.record({ workerId: envelope.claim.workerId, attemptId: envelope.attemptId,
    claimId: envelope.claim.claimId, generation: envelope.claim.generation, profileDigest: envelope.profile.profileDigest,
    attemptSpecDigest: envelope.attemptSpecDigest });
  if (owner?.phase !== 'disposed' || owner.finalObservation?.populated !== false) {
    throw new Error('BUSTER_HISTORICAL_QUIESCENCE_UNPROVEN');
  }
  await retainPreparationGate(options.command.sourceRoot, receipt.importId, binding);
  const group = path.join(options.command.sourceRoot, receipt.importId);
  const file = path.join(group, 'historical-receipt.json');
  return withDurableStoreLock(file, async () => {
    if (reservation.phase === 'retained-historical') {
      if (reservation.groupReceiptDigest !== preparationDigest(receipt)) throw new Error('BUSTER_HISTORICAL_RECEIPT_CHANGED');
      const actual = await digestHistoricalFile(file, options.settings.maximumResultBytes);
      // Stored receipt uses the exact canonical codec, so its raw identity is
      // the same digest as its canonical semantic identity.
      if (actual.originalStoreDigest !== preparationDigest(receipt)) throw new Error('BUSTER_HISTORICAL_RECEIPT_CHANGED');
      return receipt;
    }
    await publishCandidate(options, stateRoot, group, receipt);
    await writeDurableState(file, receipt);
    await fs.chmod(file, 0o400);
    await sync(group);
    await options.ledger.retainedHistorical(receipt.importId, preparationDigest(receipt));
    return receipt;
  });
}
