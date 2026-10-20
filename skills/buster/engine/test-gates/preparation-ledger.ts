import { preparationCleanupMetadataCapacity, type PreparationCleanupAssociation } from './preparation-cleanup-binding.ts';
import { resolveHistoricalInput, type HistoricalStagedAdmission } from './preparation-historical-reference.ts';
import { assertHistoricalImportDescriptor, type HistoricalImportDescriptor } from './preparation-historical-reference.ts';
import { empty, initialSourceReservation, terminalMetadataProjection, validateSourceLedger, type SourceReservation, type SourceLedger } from './preparation-ledger-state.ts';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { type WorkerAttemptEnvelopeV3, type WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { assertStagedInput, assertBusterInput, type StagedAdmission, type BusterStagedAdmission } from './preparation-input.ts';
import { gateReservation, stagedInputReservation, extractedSourceReservation } from './preparation-reservations.ts';
import { preparationDigest } from './preparation-header.ts';
import { captureBusterPreparationV10 } from '@kubeclaw/plugin-foundation/config/buster-preparation-v10';
import { validateBusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { preparationEnvelope } from './preparation-envelope.ts';
import { preparationSlots } from './preparation-slots.ts';
import path from 'node:path';
import { readDurableState, withDurableStoreLock, writeDurableState } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { PreparationGateBinding } from './preparation-gate.ts';
import type { NativeAttemptBootAssociation } from '@kubeclaw/worker-core';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { type PreparedSourceReference } from './preparation-header.ts';

/** Root-owned metadata. Failed or uncertain lifetimes keep their full reservation. */
export class PreparationSourceLedger {
  readonly #file: string;
  readonly #version: 'legacy' | 'v10';
  readonly #lockWaitSeconds: number;
  readonly #settings: BusterPreparationSettings;
  readonly #originalBoot: NativeAttemptBootAssociation | undefined;

  constructor(root: string, settings: BusterPreparationSettings, originalBoot?: NativeAttemptBootAssociation,
    version: 'legacy' | 'v10' = 'legacy') {
    if (!['legacy', 'v10'].includes(version)) throw new Error('BUSTER_PREPARATION_VERSION_INVALID');
    const v10 = version === 'v10' ? captureBusterPreparationV10(settings) : null;
    const captured = v10 ?? validateBusterPreparationSettings(settings);
    this.#version = version;
    this.#lockWaitSeconds = v10 ? v10.storeLockWaitSeconds : 5;
    this.#file = path.join(root, 'source-ledger', 'state.json');
    this.#settings = structuredClone(captured);
    this.#originalBoot = originalBoot;
  }

  /** Explicit constructor-selected codec; never infer from current settings or retained keys. */
  get version(): 'legacy' | 'v10' { return this.#version; }

  async reserve(admissionId: string, profile: WorkerProfileV3, now: Date): Promise<WorkerAttemptEnvelopeV3> {
    profile = structuredClone(profile);
    now = new Date(now);
    if (!/^[a-f0-9]{32}$/u.test(admissionId)) throw new Error('BUSTER_PREPARATION_RESERVATION_INVALID');
    return withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      const existing = state.reservations.find(item => item.admissionId === admissionId);
      if (existing) return structuredClone(existing.envelope);
      const occupied = new Set(state.reservations.filter(item => !item.slotReleased).map(item => item.slot));
      const slot = preparationSlots.slice(0, this.#settings.maximumActivePreparations).find(candidate => !occupied.has(candidate));
      if (slot === undefined) throw new Error('BUSTER_PREPARATION_SLOT_CAPACITY');
      const envelope = preparationEnvelope(admissionId, profile, this.#settings, now, slot, { kind: 'stage' }, this.#version);
      const reservation = initialSourceReservation(admissionId, envelope, slot, gateReservation(this.#settings));
      await this.#originalBoot?.bind(envelope);
      await this.#write({ ...state, reservations: [...state.reservations, reservation] });
      return structuredClone(envelope);
    }, this.#lockWaitSeconds);
  }

  async reserveHistorical(importId: string, profile: WorkerProfileV3, now: Date,
    descriptor: HistoricalImportDescriptor): Promise<WorkerAttemptEnvelopeV3> {
    if (this.#version === 'v10') throw new Error('BUSTER_PREPARATION_V10_HISTORICAL_UNSUPPORTED');
    descriptor = structuredClone(descriptor);
    profile = structuredClone(profile);
    now = new Date(now);
    assertHistoricalImportDescriptor(descriptor);
    return withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      const existing = state.reservations.find(item => item.admissionId === importId);
      if (existing) {
        if (preparationDigest(existing.historicalDescriptor) !== preparationDigest(descriptor)) {
          throw new Error('BUSTER_PREPARATION_RESERVATION_CONFLICT');
        }
        return structuredClone(existing.envelope);
      }
      const occupied = new Set(state.reservations.filter(item => !item.slotReleased).map(item => item.slot));
      const slot = preparationSlots.slice(0, this.#settings.maximumActivePreparations).find(value => !occupied.has(value));
      if (slot === undefined) throw new Error('BUSTER_PREPARATION_SLOT_CAPACITY');
      const envelope = preparationEnvelope(importId, profile, this.#settings, now, slot,
        { kind: 'historical', descriptor: structuredClone(descriptor) });
      const reservation: SourceReservation = {
        ...initialSourceReservation(importId, envelope, slot, gateReservation(this.#settings)),
        phase: 'historical-reserved',
        historicalDescriptor: structuredClone(descriptor),
      };
      await this.#originalBoot?.bind(envelope);
      await this.#write({ ...state, reservations: [...state.reservations, reservation] });
      return structuredClone(envelope);
    }, this.#lockWaitSeconds);
  }

  async reserveHistoricalStorage(importId: string, required: {
    bytes: number; entries: number; metadataBytes: number; records: number;
  }): Promise<void> {
    required = structuredClone(required);
    if (!Object.values(required).every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error('BUSTER_PREPARATION_RESERVATION_INVALID');
    }
    await this.#transition(importId, current => {
      if (current.phase !== 'historical-reserved' || current.slotReleased
        || required.bytes < current.bytes || required.entries < current.entries
        || required.metadataBytes < current.groupMetadataBytes || required.records < current.groupRecords) {
        throw new Error('BUSTER_PREPARATION_RESERVATION_CONFLICT');
      }
      return { ...current, bytes: required.bytes, entries: required.entries,
        groupMetadataBytes: required.metadataBytes, groupRecords: required.records };
    });
  }

  async retainedHistorical(importId: string, groupReceiptDigest: string): Promise<void> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(groupReceiptDigest)) throw new Error('BUSTER_PREPARATION_GROUP_RECEIPT_INVALID');
    await this.#transition(importId, current => {
      if (!['historical-reserved', 'retained-historical'].includes(current.phase) || !current.gate
        || (current.groupReceiptDigest !== null && current.groupReceiptDigest !== groupReceiptDigest)) {
        throw new Error('BUSTER_PREPARATION_GROUP_RECEIPT_INVALID');
      }
      return { ...current, phase: 'retained-historical', slotReleased: true, groupReceiptDigest };
    });
  }

  /** Reserve the exact durable wire before the host is allowed to write it. */
  async stageInput(staged: StagedAdmission): Promise<void> {
    staged = structuredClone(staged);
    assertStagedInput(staged.input, staged.job);
    await this.#transition(staged.input.admissionId, current => {
      if (current.phase !== 'staging' || current.attemptSpecDigest !== staged.input.attemptSpecDigest
        || current.slot !== staged.input.preparationUid || !current.gate
        || (current.input && preparationDigest(current.input) !== preparationDigest(staged))) {
        throw new Error('BUSTER_PREPARATION_INPUT_BINDING_INVALID');
      }
      return { ...current, input: structuredClone(staged), ...stagedInputReservation(staged, this.#settings) };
    });
  }

  /** Caller has verified the successful native result and revoked the now-quiescent gate. */
  async retainInput(staged: StagedAdmission): Promise<void> {
    staged = structuredClone(staged);
    await this.#transition(staged.input.admissionId, current => {
      if (!['staging', 'retained-input'].includes(current.phase) || !current.gate
        || preparationDigest(current.input) !== preparationDigest(staged)) {
        throw new Error('BUSTER_PREPARATION_INPUT_BINDING_INVALID');
      }
      return { ...current, phase: 'retained-input', slotReleased: true };
    });
  }

  /** Replay the current extraction; only a positively released generation permits its successor. */
  async reserveExtraction(admissionId: string, staged: BusterStagedAdmission,
    profile: WorkerProfileV3, now: Date): Promise<WorkerAttemptEnvelopeV3> {
    staged = structuredClone(staged);
    profile = structuredClone(profile);
    now = new Date(now);
    assertBusterInput(staged.input, staged.job);
    return withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      const key = preparationDigest(staged.input);
      await this.#validateRetainedInput(state, staged);
      const generations = state.reservations.filter(item => item.parentInputId === key);
      const existing = generations.sort((a, b) => b.extractionGeneration - a.extractionGeneration)[0];
      if (existing && existing.phase !== 'released') return structuredClone(existing.envelope);
      if (state.reservations.some(item => item.admissionId === admissionId)) {
        throw new Error('BUSTER_PREPARATION_RESERVATION_CONFLICT');
      }
      const occupied = new Set(state.reservations.filter(item => !item.slotReleased).map(item => item.slot));
      const slot = preparationSlots.slice(0, this.#settings.maximumActivePreparations).find(value => !occupied.has(value));
      if (slot === undefined) throw new Error('BUSTER_PREPARATION_SLOT_CAPACITY');
      const envelope = preparationEnvelope(admissionId, profile, this.#settings, now, slot,
        { kind: 'extract', input: structuredClone(staged.input) }, this.#version);
      const reservation: SourceReservation = {
        ...initialSourceReservation(admissionId, envelope, slot, extractedSourceReservation(staged, this.#settings)),
        phase: 'reserved',
        parentInputId: key,
        extractionGeneration: (existing?.extractionGeneration ?? 0) + 1,
        previousExtractionDigest: existing ? preparationDigest(existing.envelope) : null,
      };
      await this.#originalBoot?.bind(envelope);
      await this.#write({ ...state, reservations: [...state.reservations, reservation] });
      return structuredClone(envelope);
    }, this.#lockWaitSeconds);
  }

  async #validateRetainedInput(state: SourceLedger, staged: BusterStagedAdmission): Promise<void> {
    const inputReference = staged.input;
    if (inputReference.schemaVersion === 'buster-historical-input.v1') {
      const group = state.reservations.find(item => item.admissionId === inputReference.importId);
      if (group?.phase !== 'retained-historical' || !group.slotReleased || !group.groupReceiptDigest) {
        throw new Error('BUSTER_PREPARATION_RETAINED_INPUT_REQUIRED');
      }
      await resolveHistoricalInput(path.dirname(path.dirname(this.#file)),
        staged as HistoricalStagedAdmission, this.#settings.maximumMetadataBytes, group.groupReceiptDigest);
    } else {
      const input = state.reservations.find(item => item.admissionId === inputReference.admissionId);
      if (input?.phase !== 'retained-input' || !input.slotReleased
        || preparationDigest(input.input) !== preparationDigest(staged)) {
        throw new Error('BUSTER_PREPARATION_RETAINED_INPUT_REQUIRED');
      }
    }
  }

  /** Bind positive no-source terminal evidence before removing even root-only metadata. */
  async beginEmptyGateReclaim(admissionId: string, resultDigest: string): Promise<void> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(resultDigest)) throw new Error('BUSTER_PREPARATION_EMPTY_GATE_PROOF_INVALID');
    await this.#transition(admissionId, current => {
      if (!['staging', 'reserved', 'empty-gate-reclaiming'].includes(current.phase)
        || current.source !== null || !current.gate
        || (current.emptyGateResultDigest !== null && current.emptyGateResultDigest !== resultDigest)) {
        throw new Error('BUSTER_PREPARATION_EMPTY_GATE_PROOF_INVALID');
      }
      return { ...current, phase: 'empty-gate-reclaiming', emptyGateResultDigest: resultDigest };
    });
  }

  /** Publication intent never releases the identity; call after quiescence and durable gate revocation. */
  async releasePublishedSlot(source: PreparedSourceReference): Promise<void> {
    source = structuredClone(source);
    await this.#transition(source.admissionId, current => {
      if (current.phase !== 'published' || JSON.stringify(current.source) !== JSON.stringify(source)) {
        throw new Error('BUSTER_PREPARATION_SLOT_RELEASE_INVALID');
      }
      return { ...current, slotReleased: true };
    });
  }

  async bindGate(admissionId: string, binding: PreparationGateBinding): Promise<void> {
    binding = structuredClone(binding);
    await this.#transition(admissionId, current => {
      if (current.gate !== null && JSON.stringify(current.gate) !== JSON.stringify(binding)) {
        throw new Error('BUSTER_PREPARATION_GATE_CONFLICT');
      }
      return { ...current, gate: structuredClone(binding) };
    });
  }

  async published(source: PreparedSourceReference): Promise<void> {
    source = structuredClone(source);
    await this.#transition(source.admissionId, current => {
      if (!current.gate || !['prepared', 'published'].includes(current.phase)
        || JSON.stringify(current.source) !== JSON.stringify(source)) throw new Error('BUSTER_PREPARATION_PUBLICATION_INVALID');
      return { ...current, phase: 'published' };
    });
  }

  async prepared(source: PreparedSourceReference): Promise<void> {
    source = structuredClone(source);
    await this.#transition(source.admissionId, current => {
      if (current.attemptSpecDigest !== source.attemptSpecDigest) throw new Error('BUSTER_PREPARATION_RESERVATION_CONFLICT');
      if (current.phase !== 'reserved') {
        if (JSON.stringify(current.source) !== JSON.stringify(source)) throw new Error('BUSTER_PREPARATION_RESERVATION_CONFLICT');
        return current;
      }
      return { ...current, source: structuredClone(source), phase: 'prepared' };
    });
  }

  /** Caller must first verify the exact native cleanup receipt and retained archive identity. */
  async repositoryReleased(admissionId: string, archiveBytes: number, metadataBytes: number): Promise<void> {
    if (![archiveBytes, metadataBytes].every(value => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error('BUSTER_PREPARATION_RELEASE_INVALID');
    }
    await this.#transition(admissionId, current => {
      if (!current.source || current.source.archiveBytes !== archiveBytes || current.phase === 'released') {
        throw new Error('BUSTER_PREPARATION_RELEASE_INVALID');
      }
      const bytes = archiveBytes + metadataBytes + 6 * this.#settings.sourceEntryReservationBytes;
      if (bytes > current.bytes) throw new Error('BUSTER_PREPARATION_RELEASE_INVALID');
      return { ...current, phase: 'repository-released', bytes, entries: 6 };
    });
  }

  /** Never called merely because a child exited; exact quiescence and owned absence are prerequisites. */
  async released(admissionId: string): Promise<void> {
    await this.#transition(admissionId, current => ({ ...current, phase: 'released', slotReleased: true, bytes: 0, entries: 0 }));
  }

  /** The association is fsynced before any cleanup process can remove owned source. */
  async reserveCleanup(admissionId: string, association: PreparationCleanupAssociation): Promise<void> {
    association = structuredClone(association);
    await this.#transition(admissionId, async current => {
      if (current.slotReleased || !['staging', 'reserved'].includes(current.phase) || !current.gate) {
        throw new Error('BUSTER_PREPARATION_CLEANUP_INELIGIBLE');
      }
      const existing = current.cleanup.find(item => item.envelope.attemptId === association.envelope.attemptId);
      if (existing) {
        if (preparationDigest(existing) !== preparationDigest(association)) throw new Error('BUSTER_PREPARATION_CLEANUP_CONFLICT');
        return current;
      }
      await this.#originalBoot?.bind(association.envelope);
      return { ...current, cleanup: [...current.cleanup, association] };
    });
  }

  /** A result digest is write-once. Failed predecessor receipts remain bound on retry. */
  async recordCleanupResult(admissionId: string, envelopeDigest: string, resultDigest: string): Promise<void> {
    await this.#transition(admissionId, current => {
      const index = current.cleanup.findIndex(item => preparationDigest(item.envelope) === envelopeDigest);
      const association = current.cleanup[index];
      if (!association || (association.resultDigest !== null && association.resultDigest !== resultDigest)) {
        throw new Error('BUSTER_PREPARATION_CLEANUP_CONFLICT');
      }
      const cleanup = [...current.cleanup];
      cleanup[index] = { ...association, resultDigest };
      return { ...current, cleanup };
    });
  }

  async reservations(): Promise<readonly SourceReservation[]> {
    return withDurableStoreLock(this.#file, async () => structuredClone((await this.#read()).reservations), this.#lockWaitSeconds);
  }

  async #transition(admissionId: string, update: (value: SourceReservation) => SourceReservation | Promise<SourceReservation>): Promise<void> {
    await withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      const index = state.reservations.findIndex(item => item.admissionId === admissionId);
      if (index < 0) throw new Error('BUSTER_PREPARATION_RESERVATION_MISSING');
      const reservations = [...state.reservations];
      reservations[index] = await update(reservations[index]!);
      await this.#write({ ...state, reservations });
    }, this.#lockWaitSeconds);
  }

  async #read(): Promise<SourceLedger> {
    const state = await readDurableState<SourceLedger>(this.#file, empty, this.#settings.maximumMetadataBytes);
    validateSourceLedger(state);
    for (const record of state.reservations) {
      // The ledger's explicit receiver version is selected with its boot, not
      // inferred from retained settings. Resolve the original codec before
      // applying this receiver's quotas, transitions or boot associations.
      const originalVersion = record.envelope.operation.contractId === 'kubeclaw.buster-preparation@2' ? 'v10' : 'legacy';
      if (originalVersion !== this.#version) throw new Error('BUSTER_PREPARATION_LEDGER_VERSION_MISMATCH');
      await this.#originalBoot?.verify(record.envelope);
      for (const cleanup of record.cleanup) await this.#originalBoot?.verify(cleanup.envelope);
    }
    return state;
  }


  async #write(state: SourceLedger): Promise<void> {
    validateSourceLedger(state);
    const bytes = state.reservations.reduce((sum, item) => sum + item.bytes, 0);
    const entries = state.reservations.reduce((sum, item) => sum + item.entries, 0);
    // Every admitted slot reserves its future terminal reference before native launch.
    const metadata = Math.max(Buffer.byteLength(canonicalJson(state)), Buffer.byteLength(canonicalJson({ ...state,
      reservations: state.reservations.map(terminalMetadataProjection) })))
      + state.reservations.filter(item => item.phase === 'staging' && item.input === null).length
        * (this.#settings.maximumHeaderBytes + this.#settings.maximumInputBytes)
      + state.reservations.reduce((sum, item) => sum + item.groupMetadataBytes, 0)
      + state.reservations.filter(item => !item.slotReleased).length
        * preparationCleanupMetadataCapacity(this.#settings.maximumInputBytes);
    if (state.reservations.length + state.reservations.reduce((sum, item) => sum + item.groupRecords + item.cleanup.length
      + (item.slotReleased ? 0 : 1), 0) > this.#settings.maximumRecords || metadata > this.#settings.maximumMetadataBytes
      || !Number.isSafeInteger(bytes) || bytes > this.#settings.maximumSourceBytes
      || !Number.isSafeInteger(entries) || entries > this.#settings.maximumSourceEntries) {
      throw new Error('BUSTER_PREPARATION_SOURCE_CAPACITY');
    }
    await writeDurableState(this.#file, state);
  }
}
