import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withDurableStoreLock, writeDurableState } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { canonicalJson } from './digest.ts';
import type { NativeWorkerResourceObservation } from './native-resource-observation.ts';
import { transitions, identityValid, validateRecord, key, decodeOwnershipState, type WorkerOwnershipState as State } from './ownership-state.ts';

export interface WorkerOwnershipIdentity {
  readonly workerId: string;
  readonly attemptId: string;
  readonly claimId: string;
  readonly generation: number;
  readonly profileDigest: string;
  readonly attemptSpecDigest: string;
}

export type WorkerOwnershipPhase = 'reserved' | 'allocated' | 'running' | 'quiescing' | 'empty' | 'disposed' | 'unresolved' | 'abandoned';

export interface WorkerScopeBinding {
  readonly scopeName: string;
  readonly bootId: string;
  readonly device: number;
  readonly inode: number;
}

export interface WorkerOwnershipRecord {
  readonly identity: WorkerOwnershipIdentity;
  readonly scopeName: string;
  readonly revision: number;
  readonly phase: WorkerOwnershipPhase;
  readonly binding: WorkerScopeBinding | null;
  readonly diagnosis: string | null;
  readonly finalObservation: NativeWorkerResourceObservation | null;
}


type TransitionChange = { binding?: WorkerScopeBinding; diagnosis?: string; finalObservation?: NativeWorkerResourceObservation };

function validateTransitionChange(current: WorkerOwnershipRecord, phase: WorkerOwnershipPhase, change: TransitionChange): void {
  if (change.binding !== undefined && (current.phase !== 'reserved' || phase !== 'allocated')) {
    throw new Error('WORKER_OWNERSHIP_REBIND_FORBIDDEN');
  }
  if (change.finalObservation !== undefined && (current.finalObservation !== null || phase !== 'empty'
    || !['quiescing', 'empty'].includes(current.phase))) throw new Error('WORKER_OWNERSHIP_OBSERVATION_REWRITE_FORBIDDEN');
  if (current.phase === phase && change.finalObservation === undefined) throw new Error('WORKER_OWNERSHIP_TRANSITION_INVALID');
}

/**
 * Durable neutral ownership metadata. The trusted coordinator must supply
 * native lifecycle evidence; recording a phase is not proof of kernel state.
 * Disposed identities remain reserved so stale requests cannot restart work.
 */
export class FileWorkerOwnershipStore {
  readonly #file: string;
  readonly #maximumRecords: number;
  readonly #maximumBytes: number;

  constructor(root: string, limits: { maximumRecords: number; maximumBytes: number }) {
    if (!path.isAbsolute(root) || !Number.isSafeInteger(limits.maximumRecords) || limits.maximumRecords < 1
      || !Number.isSafeInteger(limits.maximumBytes) || limits.maximumBytes < 1) {
      throw new Error('WORKER_OWNERSHIP_CONFIG_INVALID');
    }
    this.#file = path.join(path.resolve(root), 'owners.json');
    this.#maximumRecords = limits.maximumRecords;
    this.#maximumBytes = limits.maximumBytes;
  }

  async records(): Promise<readonly WorkerOwnershipRecord[]> {
    return withDurableStoreLock(this.#file, async () => structuredClone((await this.#read()).records));
  }

  /** A changed boot is only a reboot proof after this store is bound to one host. */
  async bindHostIdentity(hostIdentity: string, currentBootId: string): Promise<void> {
    if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/u.test(hostIdentity)) throw new Error('WORKER_OWNERSHIP_HOST_IDENTITY_INVALID');
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(currentBootId)) throw new Error('WORKER_OWNERSHIP_BOOT_IDENTITY_INVALID');
    await withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      if (state.hostIdentity !== null) {
        if (state.hostIdentity !== hostIdentity) throw new Error('WORKER_OWNERSHIP_DIFFERENT_HOST_UNRESOLVED');
        return;
      }
      if (state.records.some(record => record.binding !== null && record.binding.bootId !== currentBootId)) {
        throw new Error('WORKER_OWNERSHIP_LEGACY_HOST_UNPROVEN');
      }
      state.hostIdentity = hostIdentity;
      await this.#write(state);
    });
  }

  /** Held for the entire supervisor lifetime, including recovery and admission. */
  async withSupervisor<T>(operation: () => Promise<T>): Promise<T> {
    return withDurableStoreLock(path.join(path.dirname(this.#file), 'supervisor', 'lifetime'), operation);
  }

  async reserve(input: WorkerOwnershipIdentity): Promise<WorkerOwnershipRecord> {
    const identity = structuredClone(input);
    identityValid(identity);
    return withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      const same = state.records.find(record => key(record.identity) === key(identity));
      if (same) {
        if (canonicalJson(same.identity) !== canonicalJson(identity)) throw new Error('WORKER_OWNERSHIP_CONFLICT');
        return structuredClone(same);
      }
      const previous = state.records.filter(record => record.identity.workerId === identity.workerId
        && record.identity.attemptId === identity.attemptId);
      if (previous.some(record => record.identity.generation >= identity.generation)) {
        throw new Error('WORKER_OWNERSHIP_STALE_GENERATION');
      }
      if (previous.some(record => !['disposed', 'abandoned'].includes(record.phase))) throw new Error('WORKER_OWNERSHIP_RECONCILIATION_REQUIRED');
      const record: WorkerOwnershipRecord = {
        identity, scopeName: `worker-${randomUUID()}`, revision: 1, phase: 'reserved', binding: null, diagnosis: null, finalObservation: null,
      };
      state.records.push(record);
      await this.#write(state);
      return structuredClone(record);
    });
  }

  async transition(input: WorkerOwnershipRecord, phase: WorkerOwnershipPhase,
    options: TransitionChange = {}): Promise<WorkerOwnershipRecord> {
    const expected = structuredClone(input);
    const change = structuredClone(options);
    validateRecord(expected);
    if (!Object.hasOwn(transitions, phase)) throw new Error('WORKER_OWNERSHIP_PHASE_INVALID');
    return withDurableStoreLock(this.#file, async () => {
      const state = await this.#read();
      const index = state.records.findIndex(record => key(record.identity) === key(expected.identity));
      const current = state.records[index];
      if (!current || canonicalJson(current) !== canonicalJson(expected)) throw new Error('WORKER_OWNERSHIP_CAS_CONFLICT');
      if (!transitions[current.phase].includes(phase)) throw new Error('WORKER_OWNERSHIP_TRANSITION_INVALID');
      validateTransitionChange(current, phase, change);
      const updated: WorkerOwnershipRecord = {
        ...current, revision: current.revision + 1, phase,
        binding: change.binding ?? current.binding, diagnosis: change.diagnosis ?? current.diagnosis,
        finalObservation: change.finalObservation ?? current.finalObservation,
      };
      validateRecord(updated);
      state.records[index] = updated;
      await this.#write(state);
      return structuredClone(updated);
    });
  }

  async #read(): Promise<State> {
    let handle;
    try { handle = await fs.open(this.#file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 'worker-ownership-store.v2', hostIdentity: null, records: [] };
      throw error;
    }
    let value: unknown;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > this.#maximumBytes) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
      const bytes = await handle.readFile();
      if (bytes.byteLength > this.#maximumBytes) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
      value = JSON.parse(bytes.toString('utf8'));
    } finally { await handle.close(); }
    return decodeOwnershipState(value, this.#maximumRecords);
  }

  async #write(state: State): Promise<void> {
    if (state.records.length > this.#maximumRecords || Buffer.byteLength(canonicalJson(state)) > this.#maximumBytes) {
      throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
    }
    await writeDurableState(this.#file, state);
  }
}
