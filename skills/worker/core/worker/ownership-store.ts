import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withDurableStoreLock, writeDurableState } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { canonicalJson, sha256Digest } from './digest.ts';

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
}

interface State {
  schemaVersion: 'worker-ownership-store.v1';
  records: WorkerOwnershipRecord[];
}

const transitions: Record<WorkerOwnershipPhase, readonly WorkerOwnershipPhase[]> = {
  reserved: ['allocated', 'unresolved', 'abandoned'],
  allocated: ['running', 'quiescing', 'unresolved', 'abandoned'],
  running: ['quiescing', 'unresolved', 'abandoned'],
  quiescing: ['empty', 'unresolved', 'abandoned'],
  empty: ['disposed', 'unresolved', 'abandoned'],
  disposed: [],
  unresolved: ['quiescing', 'abandoned'],
  abandoned: [],
};

function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('WORKER_OWNERSHIP_RECORD_INVALID');
  }
}

function identityValid(identity: unknown): asserts identity is WorkerOwnershipIdentity {
  exact(identity, ['workerId', 'attemptId', 'claimId', 'generation', 'profileDigest', 'attemptSpecDigest']);
  for (const key of ['workerId', 'attemptId', 'claimId']) {
    const value = identity[key];
    if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value !== value.toWellFormed()) {
      throw new Error('WORKER_OWNERSHIP_IDENTITY_INVALID');
    }
  }
  if (!Number.isSafeInteger(identity.generation) || Number(identity.generation) < 1) {
    throw new Error('WORKER_OWNERSHIP_GENERATION_INVALID');
  }
  for (const key of ['profileDigest', 'attemptSpecDigest']) {
    if (typeof identity[key] !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(identity[key])) {
      throw new Error('WORKER_OWNERSHIP_DIGEST_INVALID');
    }
  }
}

function bindingValid(binding: unknown, scopeName: string): asserts binding is WorkerScopeBinding {
  exact(binding, ['scopeName', 'bootId', 'device', 'inode']);
  if (binding.scopeName !== scopeName || typeof binding.bootId !== 'string'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(binding.bootId)
    || !Number.isSafeInteger(binding.device) || Number(binding.device) < 0
    || !Number.isSafeInteger(binding.inode) || Number(binding.inode) < 1) {
    throw new Error('WORKER_OWNERSHIP_BINDING_INVALID');
  }
}

function validateRecord(record: unknown): asserts record is WorkerOwnershipRecord {
  exact(record, ['identity', 'scopeName', 'revision', 'phase', 'binding', 'diagnosis']);
  identityValid(record.identity);
  if (typeof record.scopeName !== 'string' || !/^worker-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(record.scopeName)
    || !Number.isSafeInteger(record.revision) || Number(record.revision) < 1
    || typeof record.phase !== 'string' || !Object.hasOwn(transitions, record.phase)) {
    throw new Error('WORKER_OWNERSHIP_RECORD_INVALID');
  }
  validateRecordBinding(record);
  validateDiagnosis(record);
}

function validateRecordBinding(record: Record<string, unknown>): void {
  if (record.binding !== null) bindingValid(record.binding, String(record.scopeName));
  if (!['reserved', 'unresolved', 'abandoned'].includes(String(record.phase)) && record.binding === null) {
    throw new Error('WORKER_OWNERSHIP_BINDING_REQUIRED');
  }
  if (record.phase === 'reserved' && record.binding !== null) throw new Error('WORKER_OWNERSHIP_RESERVED_BINDING');
}

function validateDiagnosis(record: Record<string, unknown>): void {
  if (record.diagnosis !== null && (typeof record.diagnosis !== 'string' || record.diagnosis.length < 1
    || record.diagnosis.length > 4096)) throw new Error('WORKER_OWNERSHIP_DIAGNOSIS_INVALID');
  if (['unresolved', 'abandoned'].includes(String(record.phase)) && record.diagnosis === null) throw new Error('WORKER_OWNERSHIP_DIAGNOSIS_REQUIRED');
}

function key(identity: WorkerOwnershipIdentity): string {
  return sha256Digest([identity.workerId, identity.attemptId, identity.generation]);
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
        identity, scopeName: `worker-${randomUUID()}`, revision: 1, phase: 'reserved', binding: null, diagnosis: null,
      };
      state.records.push(record);
      await this.#write(state);
      return structuredClone(record);
    });
  }

  async transition(input: WorkerOwnershipRecord, phase: WorkerOwnershipPhase,
    options: { binding?: WorkerScopeBinding; diagnosis?: string } = {}): Promise<WorkerOwnershipRecord> {
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
      if (change.binding !== undefined && (current.phase !== 'reserved' || phase !== 'allocated')) {
        throw new Error('WORKER_OWNERSHIP_REBIND_FORBIDDEN');
      }
      const updated: WorkerOwnershipRecord = {
        ...current, revision: current.revision + 1, phase,
        binding: change.binding ?? current.binding, diagnosis: change.diagnosis ?? current.diagnosis,
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
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 'worker-ownership-store.v1', records: [] };
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
    exact(value, ['schemaVersion', 'records']);
    if (value.schemaVersion !== 'worker-ownership-store.v1' || !Array.isArray(value.records)) {
      throw new Error('WORKER_OWNERSHIP_STORE_INVALID');
    }
    if (value.records.length > this.#maximumRecords) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
    const keys = new Set<string>();
    const scopes = new Set<string>();
    for (const record of value.records) {
      validateRecord(record);
      const identityKey = key(record.identity);
      if (keys.has(identityKey) || scopes.has(record.scopeName)) throw new Error('WORKER_OWNERSHIP_DUPLICATE');
      keys.add(identityKey); scopes.add(record.scopeName);
    }
    return value as unknown as State;
  }

  async #write(state: State): Promise<void> {
    if (state.records.length > this.#maximumRecords || Buffer.byteLength(canonicalJson(state)) > this.#maximumBytes) {
      throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
    }
    await writeDurableState(this.#file, state);
  }
}
