import type { WorkerOwnershipIdentity, WorkerOwnershipPhase, WorkerOwnershipRecord, WorkerScopeBinding } from './ownership-store.ts';
import { sha256Digest } from './digest.ts';
import { validateNativeWorkerResourceObservation } from './native-resource-observation.ts';

export interface WorkerOwnershipState {
  schemaVersion: 'worker-ownership-store.v2';
  hostIdentity: string | null;
  records: WorkerOwnershipRecord[];
}

export const transitions: Record<WorkerOwnershipPhase, readonly WorkerOwnershipPhase[]> = {
  reserved: ['allocated', 'unresolved', 'abandoned'],
  allocated: ['running', 'quiescing', 'unresolved', 'abandoned'],
  running: ['quiescing', 'unresolved', 'abandoned'],
  quiescing: ['empty', 'unresolved', 'abandoned'],
  empty: ['empty', 'disposed', 'unresolved', 'abandoned'],
  disposed: [],
  unresolved: ['quiescing', 'abandoned'],
  abandoned: [],
};

export function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('WORKER_OWNERSHIP_RECORD_INVALID');
  }
}

export function identityValid(identity: unknown): asserts identity is WorkerOwnershipIdentity {
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

export function validateRecord(record: unknown): asserts record is WorkerOwnershipRecord {
  exact(record, ['identity', 'scopeName', 'revision', 'phase', 'binding', 'diagnosis', 'finalObservation']);
  identityValid(record.identity);
  if (typeof record.scopeName !== 'string' || !/^worker-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(record.scopeName)
    || !Number.isSafeInteger(record.revision) || Number(record.revision) < 1
    || typeof record.phase !== 'string' || !Object.hasOwn(transitions, record.phase)) {
    throw new Error('WORKER_OWNERSHIP_RECORD_INVALID');
  }
  validateRecordBinding(record);
  validateDiagnosis(record);
  if (record.finalObservation !== null) {
    validateNativeWorkerResourceObservation(record.finalObservation);
    if (record.finalObservation.populated || !['empty', 'disposed', 'unresolved'].includes(String(record.phase))) {
      throw new Error('WORKER_OWNERSHIP_FINAL_OBSERVATION_INVALID');
    }
  }
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

export function key(identity: WorkerOwnershipIdentity): string {
  return sha256Digest([identity.workerId, identity.attemptId, identity.generation]);
}

export function decodeOwnershipState(value: unknown, maximumRecords: number): WorkerOwnershipState {
  const { records, hostIdentity } = statePayload(value);
  if (records.length > maximumRecords) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
  const keys = new Set<string>();
  const scopes = new Set<string>();
  for (const record of records) {
    validateRecord(record);
    const identityKey = key(record.identity);
    if (keys.has(identityKey) || scopes.has(record.scopeName)) throw new Error('WORKER_OWNERSHIP_DUPLICATE');
    keys.add(identityKey); scopes.add(record.scopeName);
  }
  return { schemaVersion: 'worker-ownership-store.v2', hostIdentity, records } as WorkerOwnershipState;
}

function statePayload(value: unknown) {
  const legacy = typeof value === 'object' && value !== null && 'schemaVersion' in value && value.schemaVersion === 'worker-ownership-store.v1';
  exact(value, legacy ? ['schemaVersion', 'records'] : ['schemaVersion', 'hostIdentity', 'records']);
  if (!['worker-ownership-store.v1', 'worker-ownership-store.v2'].includes(String(value.schemaVersion)) || !Array.isArray(value.records)) {
    throw new Error('WORKER_OWNERSHIP_STORE_INVALID');
  }
  const records = legacy ? value.records.map(record => {
    exact(record, ['identity', 'scopeName', 'revision', 'phase', 'binding', 'diagnosis']);
    return { ...record, finalObservation: null };
  }) : value.records;
  const hostIdentity = legacy ? null : value.hostIdentity;
  if (hostIdentity !== null && (typeof hostIdentity !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/u.test(hostIdentity))) {
    throw new Error('WORKER_OWNERSHIP_HOST_IDENTITY_INVALID');
  }
  return { records, hostIdentity };
}
