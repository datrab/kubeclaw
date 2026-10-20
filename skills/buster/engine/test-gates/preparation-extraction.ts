import { resolveHistoricalInput, type HistoricalStagedAdmission } from './preparation-historical-reference.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { assertPreparedSource, preparationDigest } from './preparation-header.ts';
import type { BusterStagedAdmission } from './preparation-input.ts';
import { assertBusterInput } from './preparation-input.ts';
import type { PreparedSource } from './preparation-source.ts';
import { preparationSourceDirectory } from './preparation-source.ts';
import { preparationProfile } from './preparation-envelope.ts';
import { createPreparationGate, publishPreparationGate, verifyPreparationGate } from './preparation-gate.ts';
import { encodePreparationMessage, preparationChunkBytes } from './preparation-channel.ts';
import type { PreparationExecutionOptions } from './preparation-execution.ts';
import { runPreparationPhase } from './preparation-native-phase.ts';

// The real owner lifetime fence excludes other productive parents. This bounded
// coordination closes duplicate request races before the durable attempt fence.
const activeExtractions = new Map<string, Set<string>>();

async function retainedWirePath(options: PreparationExecutionOptions, staged: BusterStagedAdmission): Promise<string> {
  const input = staged.input;
  const reservations = await options.ledger.reservations();
  if (input.schemaVersion === 'buster-historical-input.v1') {
    const group = reservations.find(item => item.admissionId === input.importId);
    if (group?.phase !== 'retained-historical' || !group.slotReleased || !group.groupReceiptDigest) {
      throw new Error('BUSTER_PREPARATION_RETAINED_INPUT_REQUIRED');
    }
    return resolveHistoricalInput(options.command.sourceRoot, staged as HistoricalStagedAdmission,
      options.settings.maximumMetadataBytes, group.groupReceiptDigest);
  }
  const record = reservations.find(item => item.admissionId === input.admissionId);
  if (record?.phase !== 'retained-input' || !record.gate || !record.slotReleased
    || preparationDigest(record.input) !== preparationDigest(staged)) throw new Error('BUSTER_PREPARATION_RETAINED_INPUT_REQUIRED');
  const gate = await verifyPreparationGate(options.command.sourceRoot, record.admissionId, record.gate);
  const stat = await fs.lstat(gate);
  if (stat.gid !== 0 || (stat.mode & 0o7777) !== 0o700) throw new Error('BUSTER_PREPARATION_INPUT_GATE_INVALID');
  return path.join(preparationSourceDirectory(options.command.sourceRoot, record.admissionId), 'request.json');
}

/** The root streams immutable wire; JSON/base64 decoding stays inside the new native owner. */
async function* retainedWire(options: PreparationExecutionOptions, staged: BusterStagedAdmission): AsyncGenerator<Buffer> {
  const file = await retainedWirePath(options, staged);
  const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.uid !== staged.input.preparationUid
      || before.size !== staged.input.wireBytes || (before.mode & 0o7777) !== 0o444) {
      throw new Error('BUSTER_PREPARATION_INPUT_FILE_INVALID');
    }
    for (let offset = 0; offset < before.size;) {
      const buffer = Buffer.allocUnsafe(Math.min(preparationChunkBytes, before.size - offset));
      const read = await handle.read(buffer, 0, buffer.length, offset);
      if (read.bytesRead === 0) throw new Error('BUSTER_PREPARATION_INPUT_CHANGED');
      offset += read.bytesRead;
      yield buffer.subarray(0, read.bytesRead);
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error('BUSTER_PREPARATION_INPUT_CHANGED');
    }
  } finally { await handle.close(); }
}

export async function extractBusterPreparation(options: PreparationExecutionOptions,
  staged: BusterStagedAdmission, signal: AbortSignal): Promise<PreparedSource> {
  const captured = structuredClone(staged);
  assertBusterInput(captured.input, captured.job);
  signal.throwIfAborted();
  const root = await fs.realpath(options.command.sourceRoot);
  signal.throwIfAborted();
  const identity = preparationDigest(captured.input);
  const active = activeExtractions.get(root) ?? new Set<string>();
  if (active.has(identity)) throw new Error('BUSTER_PREPARATION_EXTRACTION_BUSY');
  if (active.size >= options.settings.maximumActivePreparations) throw new Error('BUSTER_PREPARATION_SLOT_CAPACITY');
  active.add(identity);
  activeExtractions.set(root, active);
  try { return await extractReserved(options, captured, signal); }
  finally {
    active.delete(identity);
    if (active.size === 0) activeExtractions.delete(root);
  }
}

async function extractReserved(options: PreparationExecutionOptions,
  staged: BusterStagedAdmission, signal: AbortSignal): Promise<PreparedSource> {
  const envelope = await options.ledger.reserveExtraction(randomBytes(16).toString('hex'), staged,
    preparationProfile(options.engineContentDigest, options.ledger.version), new Date());
  const admissionId = envelope.operation.values.admissionId;
  if (typeof admissionId !== 'string') throw new Error('BUSTER_PREPARATION_ADMISSION_ID_INVALID');
  const reservation = (await options.ledger.reservations()).find(item => item.admissionId === admissionId);
  if (!reservation) throw new Error('BUSTER_PREPARATION_RESERVATION_MISSING');
  if (reservation.phase === 'published' && reservation.slotReleased && reservation.source) {
    return { job: structuredClone(staged.job), source: structuredClone(reservation.source) };
  }
  const gate = reservation.gate ?? await createPreparationGate(options.command.sourceRoot, admissionId, envelope);
  if (reservation.gate) await verifyPreparationGate(options.command.sourceRoot, admissionId, gate);
  else await options.ledger.bindGate(admissionId, gate);
  const result = await runPreparationPhase(options, envelope, signal, async channel => {
    for await (const bytes of retainedWire(options, staged)) {
      await channel.send(encodePreparationMessage('bytes', admissionId, bytes));
    }
    await channel.send(encodePreparationMessage('end', admissionId));
  });
  if (result.specialistResult?.schemaId !== 'buster-preparation-result.v1') throw new Error('BUSTER_PREPARATION_RESULT_INVALID');
  const prepared = result.specialistResult.values as unknown as PreparedSource;
  assertPreparedSource(prepared.source, prepared.job);
  if (prepared.source.admissionId !== admissionId || prepared.source.attemptSpecDigest !== envelope.attemptSpecDigest
    || prepared.source.preparationUid !== envelope.operation.values.preparationUid
    || preparationDigest(prepared.job) !== staged.input.headerDigest) throw new Error('BUSTER_PREPARATION_RESULT_IDENTITY_INVALID');
  await options.ledger.prepared(prepared.source);
  await options.ledger.published(prepared.source);
  await publishPreparationGate(options.command.sourceRoot, admissionId, gate);
  await options.ledger.releasePublishedSlot(prepared.source);
  return prepared;
}
