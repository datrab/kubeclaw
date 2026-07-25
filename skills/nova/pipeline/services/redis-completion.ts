import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// Redis completion stream identity, selection, and archival helpers.
// Kept separate from tools/redis.ts so the CLI remains a thin adapter.

import {
  normalizeRedisPipelineEnvelope,
  validateRedisCompletionEntry,
} from './redis-message-contract.ts';
import {
  firstDefinedCompletionValue as firstDefined,
  normalizeCompletionIdentityValue as normalizeIdentityValue,
} from './completion-identity-values.ts';

export {
  REDIS_COMPLETION_OUTCOMES,
  REDIS_COMPLETION_SOURCES,
  REDIS_COMPLETION_STATUSES,
  REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
  REDIS_PIPELINE_STREAM_ROLES,
  REDIS_PIPELINE_TARGET_KINDS,
  REDIS_TASK_TYPES,
  RedisPipelineMessageInvalidError,
  assertRedisCompletionEntry,
  assertRedisTaskEntry,
  buildRedisTaskStreamEntry,
  inferRedisPipelineTargetKind,
  inferRedisTaskTarget,
  isValidRedisCompletionEntry,
  isValidRedisTaskEntry,
  normalizeRedisPipelineEnvelope,
  validateRedisCompletionEntry,
  validateRedisPipelineEnvelope,
  validateRedisTaskEntry,
} from './redis-message-contract.ts';

function normalizeRunId(record: any) {
  return normalizeIdentityValue(firstDefined(record?.run_id, record?.runId));
}

function normalizeDispatchId(record: any) {
  return normalizeIdentityValue(firstDefined(record?.dispatch_id, record?.dispatchId));
}

function normalizeSessionKey(record: any) {
  return normalizeIdentityValue(firstDefined(record?.session_key, record?.sessionKey));
}

const STRONG_COMPLETION_IDENTITY_FIELDS = Object.freeze(['run_id', 'attempt', 'dispatch_id']);

function isCurrentBusterPipelineCompletion(entry: any = {}) {
  return (selectDefinedValue(() => (entry?.source), () => (''))).toLowerCase() === 'buster-pipeline';
}

function matchesCompletionTarget(entry: any = {}, targetId: any) {
  const expectedTarget = normalizeIdentityValue(targetId);
  if (!expectedTarget) return false;
  const envelope = normalizeRedisPipelineEnvelope(entry);
  const candidates = [
    entry.module,
    entry.module_id,
    entry.gate_id,
    entry.target_id,
    envelope.target_id,
    envelope.target_kind === 'gate' && envelope.target_id ? `gate:${envelope.target_id}` : null,
  ].map(normalizeIdentityValue).filter(Boolean);
  return candidates.includes(expectedTarget);
}

function buildInvalidCompletionEntry(entry: any = {}, validationErrors: any = [], moduleId: any = null, expected: any = {}) {
  const envelope = normalizeRedisPipelineEnvelope(entry);
  return {
    _id: selectTruthyValue(() => (entry?._id), () => (null)),
    type: 'completion',
    module: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (moduleId), () => (envelope.target_id))), () => (entry?.module))), () => (null)),
    status: 'FAIL',
    outcome: 'COMPLETION_INVALID',
    source: 'completion-invalid',
    reason: 'invalid_completion_entry_schema',
    summary: `Invalid Redis completion entry for ${selectDefinedValue(() => (selectDefinedValue(() => (moduleId), () => (envelope.target_id))), () => ('missing_module_id'))}: ${validationErrors.join('; ')}`,
    invalid_redis_id: selectTruthyValue(() => (entry?._id), () => (null)),
    invalid_completion_source: selectTruthyValue(() => (entry?.source), () => (null)),
    invalid_completion_status: selectTruthyValue(() => (entry?.status), () => (null)),
    invalid_completion_errors: validationErrors.join('; '),
    run_id: normalizeRunId(entry),
    attempt: normalizeIdentityValue(entry?.attempt),
    dispatch_id: normalizeDispatchId(entry),
    session_key: normalizeSessionKey(entry),
  };
}

function validateMatchedCompletionEntry(entry: any = {}, moduleId: any = null, expected: any = {}) {
  const validationErrors = validateRedisCompletionEntry(entry);
  if (validationErrors.length === 0) return { valid: true, entry, invalid: null };
  return {
    valid: false,
    entry,
    invalid: buildInvalidCompletionEntry(entry, validationErrors, moduleId, expected),
  };
}

function normalizeCompletionOutcome(entry: any = {}) {
  const outcome = selectTruthyValue(() => (normalizeIdentityValue(entry.outcome)?.toUpperCase()), () => (null));
  if (outcome === 'RATE_LIMITED') return 'RATE_LIMITED';
  return selectDefinedValue(() => (selectDefinedValue(() => (normalizeIdentityValue(entry.status)?.toUpperCase()), () => (outcome))), () => ('UNKNOWN'));
}

export function buildCompletionConflictEntry(matched: any = [], moduleId: any, expected: any = {}) {
  if (selectTruthyValue(() => (!Array.isArray(matched)), () => (matched.length < 2))) return null;
  const outcomes = new Set(matched.map((entry: any) => normalizeCompletionOutcome(entry)));
  if (outcomes.size <= 1) return null;

  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const conflictIds = matched.map((entry: any) => entry._id).filter(Boolean);
  const summary = `Conflicting Redis completions for ${moduleId} with the same run/attempt/dispatch identity: ${[...outcomes].join(', ')}`;
  return {
    _id: selectTruthyValue(() => (conflictIds[0]), () => (null)),
    type: 'completion',
    module: moduleId,
    status: 'FAIL',
    outcome: 'COMPLETION_CONFLICT',
    source: 'completion-conflict',
    reason: 'same_identity_completion_conflict',
    summary,
    conflict_count: String(matched.length),
    conflicting_redis_ids: conflictIds.join(','),
    conflicting_outcomes: [...outcomes].join(','),
    ...normalizedExpected,
  };
}

export function attachSameOutcomeDuplicateDiagnostics(entry: any = null, matched: any = []) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!entry), () => (!Array.isArray(matched)))), () => (matched.length < 2))) return entry;
  const outcomes = new Set(matched.map((item: any) => normalizeCompletionOutcome(item)));
  if (outcomes.size !== 1) return entry;

  const duplicateIds = matched.map((item: any) => item._id).filter(Boolean);
  const duplicateSources = [...new Set(matched.map((item: any) => normalizeIdentityValue(item.source)).filter(Boolean))];
  return {
    ...entry,
    duplicate_completion_policy: 'idempotent_same_outcome',
    duplicate_completion_count: String(matched.length),
    duplicate_completion_redis_ids: duplicateIds.join(','),
    duplicate_completion_outcome: selectDefinedValue(() => ([...outcomes][0]), () => ('UNKNOWN')),
    duplicate_completion_sources: duplicateSources.join(','),
  };
}

export function attachIgnoredCompletionSourceDiagnostics(entry: any = null, ignored: any = []) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!entry), () => (!Array.isArray(ignored)))), () => (ignored.length === 0))) return entry;

  const ignoredIds = ignored.map((item: any) => item._id).filter(Boolean);
  const ignoredSources = [...new Set(ignored.map((item: any) => selectDefinedValue(() => (normalizeIdentityValue(item.source)), () => ('missing_completion_source'))))];
  return {
    ...entry,
    ignored_completion_source_policy: 'ignored_noncanonical_source',
    ignored_completion_count: String(ignored.length),
    ignored_completion_redis_ids: ignoredIds.join(','),
    ignored_completion_sources: ignoredSources.join(','),
  };
}

export function normalizeExpectedCompletionIdentity(expected: any = {}) {
  const normalized = {
    run_id: normalizeRunId(expected),
    attempt: normalizeIdentityValue(expected.attempt),
    dispatch_id: normalizeDispatchId(expected),
    session_key: normalizeSessionKey(expected),
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, value]: any) => value !== null));
}

export function getMissingExpectedCompletionIdentityFields(expected: any = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  return STRONG_COMPLETION_IDENTITY_FIELDS.filter((field: any) => !normalizedExpected[field]);
}

export function hasStrongExpectedCompletionIdentity(expected: any = {}) {
  return getMissingExpectedCompletionIdentityFields(expected).length === 0;
}

export function matchesCompletionIdentity(entry: any = {}, expected: any = {}, opts: any = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const keys = Object.keys(normalizedExpected);
  if (opts.requireStrongIdentity !== false && !hasStrongExpectedCompletionIdentity(normalizedExpected)) return false;
  if (keys.length === 0) return opts.requireStrongIdentity === false;

  return keys.every((key: any) => normalizeIdentityValue(entry?.[key]) === normalizedExpected[key]);
}

export function selectLatestCompletion(entries: any = [], moduleId: any, expected: any = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const matched = entries
    .map(([id, fields]: any) => {
      const o = { _id: id };
      for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];
      return o;
    })
    .filter((entry: any) => entry.type === 'completion' && matchesCompletionTarget(entry, moduleId) && matchesCompletionIdentity(entry, normalizedExpected));

  if (matched.length === 0) return null;

  const selectable = matched.filter((entry: any) => isCurrentBusterPipelineCompletion(entry));
  const ignored = matched.filter((entry: any) => !isCurrentBusterPipelineCompletion(entry));
  if (selectable.length === 0) return null;

  const validated = selectable.map((entry: any) => validateMatchedCompletionEntry(entry, moduleId, normalizedExpected));
  const invalid = validated.find((item: any) => !item.valid);
  if (invalid) return invalid.invalid;

  const conflict = buildCompletionConflictEntry(selectable, moduleId, normalizedExpected);
  if (conflict) return conflict;

  const latestBusterPipelineEntry = selectTruthyValue(() => ([...selectable].reverse()[0]), () => (null));
  return attachIgnoredCompletionSourceDiagnostics(
    attachSameOutcomeDuplicateDiagnostics(latestBusterPipelineEntry, selectable),
    ignored,
  );
}

function decodeStreamEntry(id: any, fields: any) {
  const entry = { _id: id };
  for (let i = 0; i < fields.length; i += 2) entry[fields[i]] = fields[i + 1];
  return entry;
}

function nextExclusiveStreamId(id: any) {
  return `(${id}`;
}

export async function scanLatestCompletionFromTail(redis: any, streamKey: any, moduleId: any, expected: any = {}, opts: any = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const requireAgent = Object.keys(normalizedExpected).length > 0;
  if (selectTruthyValue(() => (opts.batchSize === undefined), () => (opts.scanLimit === undefined))) {
    throw new TypeError('scanLatestCompletionFromTail requires explicit batchSize and scanLimit');
  }
  const batchSize = Math.max(1, Number(opts.batchSize));
  const scanLimit = Math.max(batchSize, Number(opts.scanLimit));
  if (selectTruthyValue(() => (!Number.isFinite(batchSize)), () => (!Number.isFinite(scanLimit)))) {
    throw new TypeError('scanLatestCompletionFromTail batchSize and scanLimit must be finite numbers');
  }

  let nextEnd = '+';
  let scanned = 0;
  let batches = 0;
  let latestMatch = null;
  const matched: any[] = [];

  while (scanned < scanLimit) {
    const remaining = Math.max(1, scanLimit - scanned);
    const count = Math.min(batchSize, remaining);
    const entries = await redis.xrevrange(streamKey, nextEnd, '-', 'COUNT', count);
    batches += 1;

    if (selectTruthyValue(() => (!Array.isArray(entries)), () => (entries.length === 0))) break;
    scanned += entries.length;

    for (const [id, fields] of entries) {
      const entry = decodeStreamEntry(id, fields);
      if (selectTruthyValue(() => (entry.type !== 'completion'), () => (!matchesCompletionTarget(entry, moduleId)))) continue;
      if (!matchesCompletionIdentity(entry, normalizedExpected)) continue;

      if (!isCurrentBusterPipelineCompletion(entry)) {
        matched.push(entry);
        continue;
      }

      const validated = validateMatchedCompletionEntry(entry, moduleId, normalizedExpected);
      if (!validated.valid) {
        return {
          match: validated.invalid,
          scanned,
          batches,
          truncated: false,
          conflict: validated.invalid,
        };
      }

      matched.push(entry);
      if (!latestMatch) latestMatch = entry;
      if (!requireAgent) {
        return {
          match: attachIgnoredCompletionSourceDiagnostics(entry, matched.filter((item: any) => !isCurrentBusterPipelineCompletion(item))),
          scanned,
          batches,
          truncated: false,
        };
      }
    }

    if (entries.length < count) break;
    nextEnd = nextExclusiveStreamId(entries[entries.length - 1][0]);
  }

  const selectable = matched.filter((entry: any) => isCurrentBusterPipelineCompletion(entry));
  const ignored = matched.filter((entry: any) => !isCurrentBusterPipelineCompletion(entry));
  const conflict = buildCompletionConflictEntry(selectable, moduleId, normalizedExpected);
  const preferredMatch = firstDefined(selectable[0], latestMatch);

  return {
    match: firstDefined(conflict, attachIgnoredCompletionSourceDiagnostics(
      attachSameOutcomeDuplicateDiagnostics(preferredMatch, selectable),
      ignored,
    )),
    scanned,
    batches,
    truncated: scanned >= scanLimit,
    conflict: selectTruthyValue(() => (conflict), () => (null)),
  };
}

export async function archiveCompletionsChunked(redis: any, streamKey: any, archiveStreamKey: any, moduleId: any, maxLen: any, opts: any = {}) {
  if (selectTruthyValue(() => (maxLen === undefined), () => (opts.batchSize === undefined))) {
    throw new TypeError('archiveCompletionsChunked requires explicit maxLen and batchSize');
  }
  const archiveMaxLen = Math.max(1, Number(maxLen));
  const batchSize = Math.max(1, Number(opts.batchSize));
  if (selectTruthyValue(() => (!Number.isFinite(archiveMaxLen)), () => (!Number.isFinite(batchSize)))) {
    throw new TypeError('archiveCompletionsChunked maxLen and batchSize must be finite numbers');
  }
  const activeIdentity = normalizeExpectedCompletionIdentity(selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (opts.activeIdentity), () => (opts.expectedIdentity))), () => (opts.expected))), () => ({})));
  const hasActiveIdentity = hasStrongExpectedCompletionIdentity(activeIdentity);
  let nextStart = '-';
  let scanned = 0;
  let archived = 0;
  let batches = 0;

  while (true) {
    const entries = await redis.xrange(streamKey, nextStart, '+', 'COUNT', batchSize);
    batches += 1;

    if (selectTruthyValue(() => (!Array.isArray(entries)), () => (entries.length === 0))) break;
    scanned += entries.length;

    const matching: any[] = [];
    for (const [id, fields] of entries) {
      const entry = decodeStreamEntry(id, fields);
      if (selectTruthyValue(() => (entry.type !== 'completion'), () => (!matchesCompletionTarget(entry, moduleId)))) continue;
      const isActiveIdentity = hasActiveIdentity && matchesCompletionIdentity(entry, activeIdentity);
      if (!isActiveIdentity) matching.push([id, fields]);
    }

    if (matching.length > 0) {
      const archivedAt = Date.now().toString();
      const tx = redis.multi();
      for (const [id, fields] of matching) {
        tx.xadd(archiveStreamKey, '*', ...fields, 'archived_at', archivedAt);
        tx.xdel(streamKey, id);
      }
      await tx.exec();
      archived += matching.length;
    }

    if (entries.length < batchSize) break;
    nextStart = nextExclusiveStreamId(entries[entries.length - 1][0]);
  }

  if (archiveMaxLen > 0) {
    await redis.xtrim(archiveStreamKey, 'MAXLEN', '~', archiveMaxLen);
  }

  return { archived, scanned, batches, active_identity: activeIdentity, identity_scoped: hasActiveIdentity };
}
