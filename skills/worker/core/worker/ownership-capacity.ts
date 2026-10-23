import { canonicalJson } from './digest.ts';
import type { WorkerOwnershipRecord, WorkerScopeBinding } from './ownership-store.ts';
import { maximumOwnershipDiagnosisUnits, maximumOwnershipHostIdentityCharacters,
  type WorkerOwnershipState } from './ownership-state.ts';

const maximumInteger = Number.MAX_SAFE_INTEGER;

const maximumHostIdentity = 'h'.repeat(maximumOwnershipHostIdentityCharacters);
const maximumObservation = { unit: 'linux-tasks', cpuTimeMicroseconds: maximumInteger,
  maximumMemoryBytes: maximumInteger, maximumTasks: maximumInteger,
  populated: false, oomKills: maximumInteger, taskLimitHits: maximumInteger };

function futureBinding(scopeName: string): WorkerScopeBinding {
  return { scopeName, bootId: '00000000-0000-0000-0000-000000000000', device: maximumInteger, inode: maximumInteger };
}

/** A serialization bound only. Never persist or publish this accounting projection. */
function terminalRepresentation(record: WorkerOwnershipRecord) {
  if (record.phase === 'disposed' || record.phase === 'abandoned') return record;
  const binding = record.binding ?? futureBinding(record.scopeName);
  return { ...record, revision: maximumInteger, phase: 'unresolved', binding,
    diagnosis: '\u0000'.repeat(record.workerCore?.settings.runtime.ownership_diagnostic_units ?? maximumOwnershipDiagnosisUnits), finalObservation: record.finalObservation ?? maximumObservation,
    topology: { ...record.topology, children: record.topology.children.map(child => ({ ...child,
      binding: child.binding ?? { ...binding, scopeName: child.name,
        inode: binding.inode === maximumInteger ? maximumInteger - 1 : maximumInteger },
    })) } };
}

/** Charge document framing and all owners under one unchanged byte ceiling.
 * Serialize one record at a time, stopping at the ceiling; do not allocate a
 * potentially enormous document containing every maximal diagnosis at once. */
export function ownershipTerminalCapacityBytes(state: WorkerOwnershipState, maximumBytes = maximumInteger): number {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
  let total = Buffer.byteLength(canonicalJson({ ...state, hostIdentity: state.hostIdentity ?? maximumHostIdentity, records: [] }));
  if (total > maximumBytes) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
  for (const [index, record] of state.records.entries()) {
    const bytes = Buffer.byteLength(canonicalJson(terminalRepresentation(record))) + (index === 0 ? 0 : 1);
    if (bytes > maximumBytes - total) throw new Error('WORKER_OWNERSHIP_CAPACITY_EXCEEDED');
    total += bytes;
  }
  return total;
}
