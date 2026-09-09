import { portableJson, PORTABLE_JSON_ENCODING, type AdministrativeReopenDecision, type LifecycleEvent, type PluginDomainEvent } from '@kubeclaw/plugin-sdk';
import type { JournalRecord } from '../state/journal.ts';
import type { PendingRepair, RepairOrder } from './repair-budget.ts';

export interface RepairIdentityContext {
  readonly encoding?: typeof PORTABLE_JSON_ENCODING | undefined;
  readonly projection?: Readonly<{ kind: 'pending' | 'order'; value: unknown }>;
}

export function repairIdentityEncoding(value: unknown): typeof PORTABLE_JSON_ENCODING | undefined {
  if (value !== undefined && value !== PORTABLE_JSON_ENCODING) throw new Error('REPAIR_IDENTITY_ENCODING_UNSUPPORTED');
  return value;
}

const completions = new Set(['attempt.completed', 'attempt.cancelled', 'attempt.timed_out']);

function isAdministrativeProjection(event: LifecycleEvent, administrative: ReadonlyMap<string, unknown>): boolean {
  if (!event.payload.administrativeDecision || !event.causationId || !administrative.has(event.causationId)) return false;
  const decision = administrative.get(event.causationId) as AdministrativeReopenDecision;
  semanticMatch(event.payload.administrativeDecision, decision);
  if (decision.decisionId !== event.causationId || decision.runId !== event.identity.runId
    || decision.stageId !== event.identity.stageId || decision.continuation !== 'remediation'
    || decision.remediationStageId !== event.payload.remediationStageId) throw new Error('REPAIR_PROJECTION_ADMINISTRATIVE_INVALID');
  return true;
}

function projected(event: LifecycleEvent): RepairIdentityContext['projection'] {
  if (event.type === 'stage.waiting' && event.payload.repairRequest) {
    const request = event.payload.repairRequest as Record<string, unknown>;
    if (request.budgetOrder) {
      const order = request.budgetOrder as RepairOrder;
      semanticMatch(request, { ...order.request, budgetOrder: order });
      return { kind: 'order', value: order };
    }
  }
  if (event.type === 'orchestrator.required' && event.payload.wait) {
    const wait = event.payload.wait as { request?: { repairAuthorization?: unknown } };
    if (wait.request?.repairAuthorization) return { kind: 'pending', value: wait.request.repairAuthorization };
  }
  return undefined;
}

/** Index only the producing completion's following same-stage projection.
 * Journal parsing validates the immutable record chain before this fold. */
export function repairIdentityContexts(records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[],
  runId: string): ReadonlyMap<LifecycleEvent, RepairIdentityContext> {
  const result = new Map<LifecycleEvent, RepairIdentityContext>();
  const latest = new Map<string, LifecycleEvent>();
  const administrative = new Map<string, unknown>();
  for (const { entry } of records) {
    if (entry.schemaVersion !== 'lifecycle-event.v2' || entry.identity.runId !== runId) continue;
    if (entry.type === 'run.resumed' && entry.causationId && entry.payload.administrativeDecision) {
      administrative.set(entry.causationId, entry.payload.administrativeDecision);
    }
    if (!entry.identity.stageId) continue;
    if (completions.has(entry.type)) {
      result.set(entry, { encoding: repairIdentityEncoding(entry.payload.repairIdentityEncoding) });
      latest.set(entry.identity.stageId, entry);
      continue;
    }
    const projection = projected(entry);
    if (!projection) continue;
    // An administrative request is a separately authorized new decision, not
    // a projection of the prior failed completion's automatic disposition.
    if (isAdministrativeProjection(entry, administrative)) continue;
    const completion = latest.get(entry.identity.stageId);
    if (!completion || completion.causationId !== entry.causationId) throw new Error('REPAIR_PROJECTION_CAUSATION_INVALID');
    const prior = result.get(completion)!;
    if (prior.projection) throw new Error('REPAIR_PROJECTION_AMBIGUOUS');
    result.set(completion, { ...prior, projection });
  }
  return result;
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new Error('REPAIR_PROJECTION_DIGEST_INVALID');
  return value;
}

function semanticMatch(actual: unknown, expected: unknown): void {
  if (portableJson(actual) !== portableJson(expected)) throw new Error('REPAIR_PROJECTION_SEMANTICS_INVALID');
}

/** Legacy IDs are reused, never reserialized under guessed locales. All
 * non-ID fields must equal the decision derived from the original completion. */
export function reconcileRepairProjection(pending: PendingRepair, identity: RepairIdentityContext,
  attempt: number, disposition: 'allowed' | 'authorize' | 'blocked'): PendingRepair {
  const projection = identity.projection;
  if (!projection) return pending; // Existing completion-only legacy crash prefixes remain supported.
  if (projection.kind === 'pending') {
    if (disposition !== 'authorize') throw new Error('REPAIR_PROJECTION_DISPOSITION_INVALID');
    const { digest: storedDigest, ...body } = projection.value as PendingRepair;
    const { digest: calculatedDigest, ...expected } = pending;
    semanticMatch(body, expected);
    const stored = digest(storedDigest);
    if (identity.encoding && stored !== calculatedDigest) throw new Error('REPAIR_PROJECTION_DIGEST_INVALID');
    return { ...pending, digest: stored };
  }
  if (disposition !== 'allowed') throw new Error('REPAIR_PROJECTION_DISPOSITION_INVALID');
  const { id, requestDigest, ...body } = projection.value as RepairOrder;
  const expected = { ...(pending.repairIdentityEncoding ? { repairIdentityEncoding: pending.repairIdentityEncoding } : {}),
    category: pending.category, requesterStageId: pending.request.requesterStageId, requesterAttempt: attempt,
    request: pending.request, sourceFacts: pending.sourceFacts };
  semanticMatch(body, expected);
  const stored = digest(id);
  if (stored !== requestDigest || (identity.encoding && stored !== pending.digest)) throw new Error('REPAIR_PROJECTION_DIGEST_INVALID');
  return { ...pending, digest: stored };
}
