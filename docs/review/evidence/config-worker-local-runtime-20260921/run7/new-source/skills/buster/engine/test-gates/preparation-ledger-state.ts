import { validatePreparationCleanupChain } from './preparation-cleanup-validation.ts';
import type { PreparationCleanupAssociation } from './preparation-cleanup-binding.ts';
import { assertHistoricalImportDescriptor, type HistoricalImportDescriptor } from './preparation-historical-reference.ts';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import { assertStagedInput, type BusterInputReference, type StagedAdmission } from './preparation-input.ts';
import type { PreparationGateBinding } from './preparation-gate.ts';
import { assertPreparedSourceShape, preparationDigest, type PreparedSourceReference } from './preparation-header.ts';

export interface SourceReservation {
  readonly admissionId: string;
  readonly attemptSpecDigest: string;
  readonly envelope: WorkerAttemptEnvelopeV3;
  readonly slot: PreparationSlot;
  readonly slotReleased: boolean;
  readonly input: StagedAdmission | null;
  readonly parentInputId: string | null;
  readonly extractionGeneration: number;
  readonly previousExtractionDigest: string | null;
  readonly emptyGateResultDigest: string | null;
  readonly historicalDescriptor: HistoricalImportDescriptor | null;
  readonly groupMetadataBytes: number;
  readonly groupRecords: number;
  readonly groupReceiptDigest: string | null;
  readonly phase: 'historical-reserved' | 'retained-historical' | 'empty-gate-reclaiming' | 'staging' | 'retained-input' | 'reserved' | 'prepared' | 'published' | 'repository-released' | 'released';
  readonly gate: PreparationGateBinding | null;
  readonly bytes: number;
  readonly entries: number;
  readonly source: PreparedSourceReference | null;
  readonly cleanup: readonly PreparationCleanupAssociation[];
}
/** Initial durable allocation; later transitions preserve this accepted envelope. */
export function initialSourceReservation(admissionId: string, envelope: WorkerAttemptEnvelopeV3,
  slot: PreparationSlot, storage: { bytes: number; entries: number }): SourceReservation {
  return {
    admissionId,
    attemptSpecDigest: envelope.attemptSpecDigest,
    envelope,
    slot,
    slotReleased: false,
    phase: 'staging',
    emptyGateResultDigest: null,
    historicalDescriptor: null,
    groupMetadataBytes: 0,
    groupRecords: 0,
    groupReceiptDigest: null,
    input: null,
    parentInputId: null,
    extractionGeneration: 0,
    previousExtractionDigest: null,
    source: null,
    cleanup: [],
    gate: null,
    ...storage,
  };
}

export interface SourceLedger {
  readonly schemaVersion: 'buster-preparation-ledger.v1';
  readonly reservations: readonly SourceReservation[];
}
export const empty: SourceLedger = { schemaVersion: 'buster-preparation-ledger.v1', reservations: [] };
export function terminalMetadataProjection(item: SourceReservation): SourceReservation {
  if (item.phase === 'released') return item;
  const digest = `sha256:${'f'.repeat(64)}`;
  if (item.historicalDescriptor !== null) return { ...item, phase: 'historical-reserved', slotReleased: false, groupReceiptDigest: digest,
    gate: item.gate ?? { preparationUid: item.slot, device: Number.MAX_SAFE_INTEGER, inode: Number.MAX_SAFE_INTEGER, markerDigest: digest } };
  if (item.parentInputId === null) return { ...item, phase: 'empty-gate-reclaiming', slotReleased: false, emptyGateResultDigest: digest,
    gate: item.gate ?? { preparationUid: item.slot, device: Number.MAX_SAFE_INTEGER, inode: Number.MAX_SAFE_INTEGER, markerDigest: digest } };
  return { ...item, phase: 'repository-released', gate: item.gate ?? {
    preparationUid: item.slot, device: Number.MAX_SAFE_INTEGER, inode: Number.MAX_SAFE_INTEGER, markerDigest: digest,
  }, source: item.source ?? {
    schemaVersion: 'buster-prepared-source.v1', admissionId: item.admissionId, preparationUid: item.slot,
    jobId: `job:${'f'.repeat(64)}`, requestDigest: digest, headerDigest: digest,
    archiveDigest: digest, archiveBytes: Number.MAX_SAFE_INTEGER, attemptSpecDigest: item.attemptSpecDigest,
  } };
}

const phases = ['historical-reserved', 'retained-historical', 'empty-gate-reclaiming', 'staging',
  'retained-input', 'reserved', 'prepared', 'published', 'repository-released', 'released'];
const releasedSlotPhases = ['retained-historical', 'retained-input', 'published', 'repository-released', 'released'];
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function invalid(): never { throw new Error('BUSTER_PREPARATION_LEDGER_INVALID'); }

function validateReservationShape(item: SourceReservation): void {
  const keys = ['admissionId', 'attemptSpecDigest', 'bytes', 'cleanup', 'emptyGateResultDigest', 'entries', 'envelope', 'extractionGeneration', 'gate',
    'groupMetadataBytes', 'groupReceiptDigest', 'groupRecords', 'historicalDescriptor', 'input', 'parentInputId',
    'phase', 'previousExtractionDigest', 'slot', 'slotReleased', 'source'];
  if (!item || Object.keys(item).sort().join(',') !== keys.sort().join(',')
    || typeof item.admissionId !== 'string' || !/^[a-f0-9]{32}$/u.test(item.admissionId) || !digest(item.attemptSpecDigest)
    || !phases.includes(item.phase) || ![item.bytes, item.entries, item.groupMetadataBytes, item.groupRecords].every(nonnegative)) invalid();
  if (typeof item.slotReleased !== 'boolean' || (item.slotReleased && !releasedSlotPhases.includes(item.phase))) invalid();
  if (item.parentInputId !== null && !digest(item.parentInputId)) invalid();
}

function validateReservationEnvelope(item: SourceReservation): void {
  assertPreparationSlot(item.slot);
  validateWorkerResourceContractV3('workerAttemptEnvelope', item.envelope);
  const values = item.envelope.operation.values;
  if (values.preparationUid !== item.slot || values.admissionId !== item.admissionId
    || item.envelope.attemptSpecDigest !== item.attemptSpecDigest
    || item.envelope.operation.contractId !== 'kubeclaw.buster-preparation@1'
    || Object.keys(values).sort().join(',') !== 'admissionId,phase,preparationUid,settings') invalid();
  const phase = values.phase as { kind?: unknown; input?: unknown; descriptor?: unknown };
  if (!phase || typeof phase !== 'object') invalid();
  if (item.historicalDescriptor !== null) {
    if (phase.kind !== 'historical' || preparationDigest(phase.descriptor) !== preparationDigest(item.historicalDescriptor)) invalid();
  } else if (item.parentInputId !== null) {
    if (phase.kind !== 'extract' || preparationDigest(phase.input) !== item.parentInputId) invalid();
  } else if (phase.kind !== 'stage') invalid();
}

function validateGate(item: SourceReservation): void {
  if (item.gate === null) return;
  if (Object.keys(item.gate).sort().join(',') !== 'device,inode,markerDigest,preparationUid'
    || item.gate.preparationUid !== item.slot || ![item.gate.device, item.gate.inode].every(nonnegative)
    || !digest(item.gate.markerDigest)) invalid();
}

function validateStagedReservation(item: SourceReservation): void {
  if (item.emptyGateResultDigest !== null && !digest(item.emptyGateResultDigest)) invalid();
  if (item.phase === 'empty-gate-reclaiming' && (!item.emptyGateResultDigest || !item.gate || item.source !== null)) invalid();
  if (item.input !== null) {
    assertStagedInput(item.input.input, item.input.job);
    if (item.input.input.admissionId !== item.admissionId || item.input.input.preparationUid !== item.slot
      || item.input.input.attemptSpecDigest !== item.attemptSpecDigest) invalid();
  }
  if (item.phase === 'retained-input' && (item.input === null || item.gate === null || !item.slotReleased)) invalid();
}

function validateAbsentHistoricalGroup(item: SourceReservation): void {
  if (item.groupMetadataBytes !== 0 || item.groupRecords !== 0 || item.groupReceiptDigest !== null
    || ['historical-reserved', 'retained-historical'].includes(item.phase)) invalid();
}

function validateHistoricalReservation(item: SourceReservation): void {
  if (item.groupReceiptDigest !== null && !digest(item.groupReceiptDigest)) invalid();
  if (item.historicalDescriptor === null) {
    validateAbsentHistoricalGroup(item);
    return;
  }
  assertHistoricalImportDescriptor(item.historicalDescriptor);
  if (item.input !== null || item.parentInputId !== null || item.source !== null) invalid();
  if (item.phase === 'retained-historical' && (!item.gate || !item.groupReceiptDigest || !item.slotReleased)) invalid();
  if (!['historical-reserved', 'retained-historical', 'released'].includes(item.phase)) invalid();
}

function validateReleasedCapacity(item: SourceReservation): void {
  if (item.phase === 'released') {
    if (item.bytes !== 0 || item.entries !== 0 || !item.slotReleased) invalid();
    if (item.emptyGateResultDigest === null && !item.cleanup.at(-1)?.resultDigest) invalid();
  } else if (item.bytes < 1 || item.entries < 1) invalid();
}

function validateExtractionSourceBinding(item: SourceReservation): void {
  if (item.source === null) return;
  const phase = item.envelope.operation.values.phase as { input?: BusterInputReference };
  const input = phase.input;
  if (!input || item.source.jobId !== input.jobId || item.source.requestDigest !== input.requestDigest
    || item.source.headerDigest !== input.headerDigest) invalid();
}

function validateSourceReservation(item: SourceReservation): void {
  if (item.source !== null) {
    assertPreparedSourceShape(item.source);
    if (item.source.admissionId !== item.admissionId || item.source.attemptSpecDigest !== item.attemptSpecDigest
      || item.source.preparationUid !== item.slot || item.parentInputId === null) invalid();
  }
  if (item.phase === 'reserved' && item.source !== null) invalid();
  if (['prepared', 'published', 'repository-released'].includes(item.phase) && (item.source === null || item.gate === null)) invalid();
  validateReleasedCapacity(item);
}


function validateExtractionGeneration(item: SourceReservation, byEnvelope: ReadonlyMap<string, SourceReservation>,
  generations: Set<string>): void {
  if (item.parentInputId === null) {
    if (item.extractionGeneration !== 0 || item.previousExtractionDigest !== null) invalid();
    return;
  }
  if (!Number.isSafeInteger(item.extractionGeneration) || item.extractionGeneration < 1) invalid();
  const key = `${item.parentInputId}:${item.extractionGeneration}`;
  if (generations.has(key)) invalid();
  generations.add(key);
  if (item.extractionGeneration === 1) {
    if (item.previousExtractionDigest !== null) invalid();
    return;
  }
  if (!digest(item.previousExtractionDigest)) invalid();
  const previous = byEnvelope.get(item.previousExtractionDigest!);
  if (!previous || previous.phase !== 'released' || previous.parentInputId !== item.parentInputId
    || previous.extractionGeneration + 1 !== item.extractionGeneration) invalid();
}

function validateUniqueReservation(item: SourceReservation, identities: Set<string>,
  occupied: Set<number>, inputs: Set<string>): void {
  if (identities.has(item.admissionId) || (!item.slotReleased && occupied.has(item.slot))
    || (item.parentInputId !== null && item.phase !== 'released' && inputs.has(item.parentInputId))) invalid();
  identities.add(item.admissionId);
  if (!item.slotReleased) occupied.add(item.slot);
  if (item.parentInputId !== null && item.phase !== 'released') inputs.add(item.parentInputId);
}

export function validateSourceLedger(state: SourceLedger): void {
  if (!state || state.schemaVersion !== empty.schemaVersion || Object.keys(state).sort().join(',') !== 'reservations,schemaVersion'
    || !Array.isArray(state.reservations)) invalid();
  const identities = new Set<string>();
  const occupied = new Set<number>();
  const inputs = new Set<string>();
  for (const item of state.reservations) {
    validateReservationShape(item);
    validateReservationEnvelope(item);
    validateGate(item);
    validatePreparationCleanupChain(item.cleanup, item.envelope, item.gate);
    validateStagedReservation(item);
    validateHistoricalReservation(item);
    validateSourceReservation(item);
    validateExtractionSourceBinding(item);
    validateUniqueReservation(item, identities, occupied, inputs);
  }
  const byEnvelope = new Map(state.reservations.map(item => [preparationDigest(item.envelope), item]));
  const generations = new Set<string>();
  for (const item of state.reservations) validateExtractionGeneration(item, byEnvelope, generations);
}
