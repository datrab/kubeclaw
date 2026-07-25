import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { approvalSignalStreamKey, gateStatusPath } from '../core/paths.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { assertPipelineEvent, assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import { nullableObjectRecord as objectRecord } from './event-adapter-support.ts';
import {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  buildApprovalIdentity,
  normalizeApprovalGateState,
  normalizeApprovalTimeoutPolicy,
} from '../runners/approval-gate-shared.ts';

export { approvalSignalStreamKey };

export const APPROVAL_SIGNAL_REDIS_BLOCK_MS = 1000;
export const APPROVAL_SIGNAL_REDIS_START_ID = '0-0';
const APPROVAL_SIGNAL_REDIS_MAX_LEN = 1000;
const APPROVAL_SIGNAL_MAX_RETRIES_PER_REQUEST = 3;
const APPROVAL_SIGNAL_SOURCE = 'approval_signal_publisher';
const APPROVAL_GATE_TYPE = 'approval';

export function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function normalizedUpperText(value: any) {
  return selectTruthyValue(() => value === undefined, () => value === null) ? '' : String(value).trim().toUpperCase();
}

function normalizedLowerText(value: any) {
  return selectTruthyValue(() => value === undefined, () => value === null) ? '' : String(value).trim().toLowerCase();
}

export function nullableString(value: any) {
  return selectTruthyValue(() => value === undefined, () => value === null, () => value === '') ? null : String(value);
}

function nullableNumber(value: any) {
  if (selectTruthyValue(() => value === undefined, () => value === null, () => value === '')) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function boolString(value: any) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

function parseNullableBool(value: any) {
  if ([true, false].includes(value as boolean)) return value;
  const normalized = normalizedLowerText(value);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

export function approvalSignalStatePath(config: any, gateId: any, opts: any = {}) {
  return firstDefined(opts.statePath, gateStatusPath(config, gateId));
}

export function approvalSignalStreamKeyAuthority(config: any, state: any = {}, opts: any = {}) {
  return firstDefined(opts.streamKey, approvalSignalStreamKey(config, state));
}

function retryStrategy(times: number) {
  return Math.min(times * 100, 2000);
}

export function approvalSignalRedisOptions(opts: any, overrides: any = {}) {
  return {
    retryStrategy: typeof opts.retryStrategy === 'function' ? opts.retryStrategy : retryStrategy,
    maxRetriesPerRequest: firstDefined(opts.maxRetriesPerRequest, APPROVAL_SIGNAL_MAX_RETRIES_PER_REQUEST),
    enableReadyCheck: true,
    ...overrides,
  };
}

export function createApprovalSignalRedisClient(opts: any, overrides: any = {}) {
  if (opts.redisClient) return opts.redisClient;
  const RedisCtor = opts.RedisCtor ?? loadRedisCtor();
  return createRedisClient(RedisCtor, objectRecord(opts.redis) ?? {}, overrides);
}

export function isTerminalApprovalStatus(status: any) {
  return [APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.CANCELLED, APPROVAL_STATUS.TIMED_OUT].includes(status);
}

function approvalSignalKind(state: any) {
  const status = normalizedUpperText(state?.status);
  if (status === APPROVAL_STATUS.APPROVED) return 'approve';
  if (status === APPROVAL_STATUS.REJECTED) return 'reject';
  if (status === APPROVAL_STATUS.CANCELLED) return 'cancel';
  if (status === APPROVAL_STATUS.TIMED_OUT) return normalizeApprovalTimeoutPolicy(state?.timeout_policy) === APPROVAL_TIMEOUT_POLICY.CONTINUE ? 'timeout_continue' : 'timeout_block';
  return 'pending_update';
}

function approvalSignalPayload(config: any, gateId: any, normalized: any, identity: any, opts: any) {
  return {
    gate_id: gateId,
    gate_type: APPROVAL_GATE_TYPE,
    run_id: nullableString(identity.run_id),
    project: nullableString(identity.project),
    wait_ref: nullableString(opts.waitRef ?? null),
    status: normalizedUpperText(normalized?.status),
    signal_kind: approvalSignalKind(normalized),
    requested_at: nullableString(normalized?.requested_at),
    deadline: nullableString(normalized?.deadline),
    timeout_minutes: nullableNumber(normalized?.timeout_minutes),
    timeout_policy: normalizeApprovalTimeoutPolicy(normalized?.timeout_policy),
    resolved_at: nullableString(normalized?.resolved_at),
    decision_by: nullableString(normalized?.decision_by),
    decision_via: nullableString(normalized?.decision_via),
    continued: normalized?.continued === undefined ? null : normalized.continued,
    reason: nullableString(normalized?.reason),
    state_path: approvalSignalStatePath(config, gateId, opts),
    updated_at: nullableString(normalized?.updated_at),
  };
}

export function buildApprovalSignalEvent(config: any, gateId: any, gate: any, state: any = {}, opts: any = {}) {
  const normalized = normalizeApprovalGateState(state, buildApprovalIdentity(config, gateId, gate, state));
  const identity = buildApprovalIdentity(config, gateId, gate, normalized);
  const payload = approvalSignalPayload(config, gateId, normalized, identity, opts);
  return assertPipelineEvent({
    type: 'approval.signal', source: 'local_fs',
    identity: { gate_id: gateId, ...(identity.run_id ? { run_id: identity.run_id } : {}) },
    payload,
  }, { requiredIdentityFields: ['gate_id'] });
}

export function buildApprovalSignalRedisEntry(event: any, opts: any = {}) {
  const asserted = assertPipelineEvent(event, { requiredIdentityFields: ['gate_id'] });
  const payload = objectRecord(asserted.payload);
  if (!payload) throw new TypeError('approval.signal event payload must be an object');
  return {
    schema_version: 'v1', type: 'approval.signal', stream_role: 'approval_signal',
    source: opts.source ?? APPROVAL_SIGNAL_SOURCE,
    project: nullableString(payload.project), run_id: nullableString(payload.run_id), gate_id: nullableString(payload.gate_id),
    gate_type: nullableString(payload.gate_type) ?? APPROVAL_GATE_TYPE,
    wait_ref: nullableString(payload.wait_ref), status: nullableString(payload.status), signal_kind: nullableString(payload.signal_kind),
    timeout_policy: nullableString(payload.timeout_policy), decision_by: nullableString(payload.decision_by), decision_via: nullableString(payload.decision_via),
    continued: boolString(payload.continued), state_path: nullableString(payload.state_path), timestamp: new Date().toISOString(), payload: JSON.stringify(payload),
  };
}

export async function publishApprovalSignalEvent(redisClient: any, streamKey: any, event: any, opts: any = {}) {
  if (selectTruthyValue(() => !redisClient, () => typeof redisClient.xadd !== 'function')) throw new TypeError('publishApprovalSignalEvent requires a Redis client with xadd');
  if (!streamKey) throw new Error('publishApprovalSignalEvent requires streamKey');
  const entry = buildApprovalSignalRedisEntry(event, opts);
  const fields = Object.entries(entry).flatMap(([key, value]: any) => [key, selectTruthyValue(() => value === undefined, () => value === null) ? '' : value]);
  const id = await redisClient.xadd(streamKey, 'MAXLEN', '~', String(opts.maxLen ?? APPROVAL_SIGNAL_REDIS_MAX_LEN), '*', ...fields);
  return { ok: true, stream: streamKey, id, entry };
}

export async function publishApprovalSignalState(config: any, gateId: any, gate: any, state: any = {}, opts: any = {}) {
  const event = buildApprovalSignalEvent(config, gateId, gate, state, opts);
  const streamKey = approvalSignalStreamKeyAuthority(config, state, opts);
  const client = createApprovalSignalRedisClient(opts, approvalSignalRedisOptions(opts));
  try {
    return await publishApprovalSignalEvent(client, streamKey, event, opts);
  } finally {
    if (!opts.redisClient && typeof client.quit === 'function') await client.quit();
    else if (!opts.redisClient && typeof client.disconnect === 'function') client.disconnect();
  }
}

export function emitApprovalSignalEvent(eventBus: any, config: any, gateId: any, gate: any, state: any, opts: any) {
  const adapter = assertPipelineEventBusAdapter(eventBus, 'ApprovalSignalEventAdapter eventBus');
  return adapter.emit(buildApprovalSignalEvent(config, gateId, gate, state, opts));
}

export function approvalSignalEventFromRedisEntry(entry: any = {}) {
  let payload = null;
  if (entry.payload) {
    try { payload = JSON.parse(entry.payload); } catch (_error: any) { payload = null; }
  }
  if (selectTruthyValue(() => !payload, () => typeof payload !== 'object', () => Array.isArray(payload))) {
    payload = {
      gate_id: nullableString(entry.gate_id), gate_type: nullableString(entry.gate_type) ?? APPROVAL_GATE_TYPE,
      run_id: nullableString(entry.run_id), project: nullableString(entry.project), wait_ref: nullableString(entry.wait_ref),
      status: nullableString(entry.status), signal_kind: nullableString(entry.signal_kind), timeout_policy: nullableString(entry.timeout_policy),
      decision_by: nullableString(entry.decision_by), decision_via: nullableString(entry.decision_via), continued: parseNullableBool(entry.continued),
      state_path: nullableString(entry.state_path),
    };
  }
  return assertPipelineEvent({
    type: 'approval.signal', source: 'redis',
    identity: { gate_id: nullableString(payload.gate_id), ...(payload.run_id ? { run_id: nullableString(payload.run_id) } : {}) },
    payload,
  }, { requiredIdentityFields: ['gate_id'] });
}
