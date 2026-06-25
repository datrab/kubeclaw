// Redis completion stream identity, selection, and archival helpers.
// Kept separate from tools/redis.ts so the CLI remains a thin adapter.

import {
  normalizeRedisPipelineEnvelope,
  validateRedisCompletionEntry,
} from './redis-message-contract.ts';

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

function normalizeIdentityValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

const STRONG_COMPLETION_IDENTITY_FIELDS = Object.freeze(['run_id', 'attempt', 'dispatch_id']);

function isCurrentBusterPipelineCompletion(entry = {}) {
  return (entry?.source || '').toLowerCase() === 'buster-pipeline';
}

function matchesCompletionTarget(entry = {}, targetId) {
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

function buildInvalidCompletionEntry(entry = {}, validationErrors = [], moduleId = null, expected = {}) {
  const envelope = normalizeRedisPipelineEnvelope(entry);
  return {
    _id: entry?._id || null,
    type: 'completion',
    module: moduleId || envelope.target_id || entry?.module || null,
    status: 'FAIL',
    outcome: 'COMPLETION_INVALID',
    source: 'completion-invalid',
    reason: 'invalid_completion_entry_schema',
    summary: `Invalid Redis completion entry for ${moduleId || envelope.target_id || 'unknown'}: ${validationErrors.join('; ')}`,
    invalid_redis_id: entry?._id || null,
    invalid_completion_source: entry?.source || null,
    invalid_completion_status: entry?.status || null,
    invalid_completion_errors: validationErrors.join('; '),
    run_id: normalizeIdentityValue(entry?.run_id ?? entry?.runId),
    attempt: normalizeIdentityValue(entry?.attempt),
    dispatch_id: normalizeIdentityValue(entry?.dispatch_id ?? entry?.dispatchId),
    session_key: normalizeIdentityValue(entry?.session_key ?? entry?.sessionKey),
  };
}

function validateMatchedCompletionEntry(entry = {}, moduleId = null, expected = {}) {
  const validationErrors = validateRedisCompletionEntry(entry);
  if (validationErrors.length === 0) return { valid: true, entry, invalid: null };
  return {
    valid: false,
    entry,
    invalid: buildInvalidCompletionEntry(entry, validationErrors, moduleId, expected),
  };
}

function normalizeCompletionOutcome(entry = {}) {
  const outcome = normalizeIdentityValue(entry.outcome)?.toUpperCase() || null;
  if (outcome === 'RATE_LIMITED') return 'RATE_LIMITED';
  return normalizeIdentityValue(entry.status)?.toUpperCase() || outcome || 'UNKNOWN';
}

export function buildCompletionConflictEntry(matched = [], moduleId, expected = {}) {
  if (!Array.isArray(matched) || matched.length < 2) return null;
  const outcomes = new Set(matched.map((entry) => normalizeCompletionOutcome(entry)));
  if (outcomes.size <= 1) return null;

  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const conflictIds = matched.map((entry) => entry._id).filter(Boolean);
  const summary = `Conflicting Redis completions for ${moduleId} with the same run/attempt/dispatch identity: ${[...outcomes].join(', ')}`;
  return {
    _id: conflictIds[0] || null,
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

export function attachSameOutcomeDuplicateDiagnostics(entry = null, matched = []) {
  if (!entry || !Array.isArray(matched) || matched.length < 2) return entry;
  const outcomes = new Set(matched.map((item) => normalizeCompletionOutcome(item)));
  if (outcomes.size !== 1) return entry;

  const duplicateIds = matched.map((item) => item._id).filter(Boolean);
  const duplicateSources = [...new Set(matched.map((item) => normalizeIdentityValue(item.source)).filter(Boolean))];
  return {
    ...entry,
    duplicate_completion_policy: 'idempotent_same_outcome',
    duplicate_completion_count: String(matched.length),
    duplicate_completion_redis_ids: duplicateIds.join(','),
    duplicate_completion_outcome: [...outcomes][0] || 'UNKNOWN',
    duplicate_completion_sources: duplicateSources.join(','),
  };
}

export function attachIgnoredCompletionSourceDiagnostics(entry = null, ignored = []) {
  if (!entry || !Array.isArray(ignored) || ignored.length === 0) return entry;

  const ignoredIds = ignored.map((item) => item._id).filter(Boolean);
  const ignoredSources = [...new Set(ignored.map((item) => normalizeIdentityValue(item.source) || 'unknown'))];
  return {
    ...entry,
    ignored_completion_source_policy: 'ignored_noncanonical_source',
    ignored_completion_count: String(ignored.length),
    ignored_completion_redis_ids: ignoredIds.join(','),
    ignored_completion_sources: ignoredSources.join(','),
  };
}

export function normalizeExpectedCompletionIdentity(expected = {}) {
  const normalized = {
    run_id: normalizeIdentityValue(expected.run_id ?? expected.runId),
    attempt: normalizeIdentityValue(expected.attempt),
    dispatch_id: normalizeIdentityValue(expected.dispatch_id ?? expected.dispatchId),
    session_key: normalizeIdentityValue(expected.session_key ?? expected.sessionKey),
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== null));
}

export function getMissingExpectedCompletionIdentityFields(expected = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  return STRONG_COMPLETION_IDENTITY_FIELDS.filter((field) => !normalizedExpected[field]);
}

export function hasStrongExpectedCompletionIdentity(expected = {}) {
  return getMissingExpectedCompletionIdentityFields(expected).length === 0;
}

export function matchesCompletionIdentity(entry = {}, expected = {}, opts = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const keys = Object.keys(normalizedExpected);
  if (opts.requireStrongIdentity !== false && !hasStrongExpectedCompletionIdentity(normalizedExpected)) return false;
  if (keys.length === 0) return opts.requireStrongIdentity === false;

  return keys.every((key) => normalizeIdentityValue(entry?.[key]) === normalizedExpected[key]);
}

export function selectLatestCompletion(entries = [], moduleId, expected = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const matched = entries
    .map(([id, fields]) => {
      const o = { _id: id };
      for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];
      return o;
    })
    .filter((entry) => entry.type === 'completion' && matchesCompletionTarget(entry, moduleId) && matchesCompletionIdentity(entry, normalizedExpected));

  if (matched.length === 0) return null;

  const selectable = matched.filter((entry) => isCurrentBusterPipelineCompletion(entry));
  const ignored = matched.filter((entry) => !isCurrentBusterPipelineCompletion(entry));
  if (selectable.length === 0) return null;

  const validated = selectable.map((entry) => validateMatchedCompletionEntry(entry, moduleId, normalizedExpected));
  const invalid = validated.find((item) => !item.valid);
  if (invalid) return invalid.invalid;

  const conflict = buildCompletionConflictEntry(selectable, moduleId, normalizedExpected);
  if (conflict) return conflict;

  const latestBusterPipelineEntry = [...selectable].reverse()[0] || null;
  return attachIgnoredCompletionSourceDiagnostics(
    attachSameOutcomeDuplicateDiagnostics(latestBusterPipelineEntry, selectable),
    ignored,
  );
}

function decodeStreamEntry(id, fields) {
  const entry = { _id: id };
  for (let i = 0; i < fields.length; i += 2) entry[fields[i]] = fields[i + 1];
  return entry;
}

function nextExclusiveStreamId(id) {
  return `(${id}`;
}

export async function scanLatestCompletionFromTail(redis, streamKey, moduleId, expected = {}, opts = {}) {
  const normalizedExpected = normalizeExpectedCompletionIdentity(expected);
  const requireAgent = Object.keys(normalizedExpected).length > 0;
  if (opts.batchSize === undefined || opts.scanLimit === undefined) {
    throw new TypeError('scanLatestCompletionFromTail requires explicit batchSize and scanLimit');
  }
  const batchSize = Math.max(1, Number(opts.batchSize));
  const scanLimit = Math.max(batchSize, Number(opts.scanLimit));
  if (!Number.isFinite(batchSize) || !Number.isFinite(scanLimit)) {
    throw new TypeError('scanLatestCompletionFromTail batchSize and scanLimit must be finite numbers');
  }

  let nextEnd = '+';
  let scanned = 0;
  let batches = 0;
  let latestMatch = null;
  const matched = [];

  while (scanned < scanLimit) {
    const remaining = Math.max(1, scanLimit - scanned);
    const count = Math.min(batchSize, remaining);
    const entries = await redis.xrevrange(streamKey, nextEnd, '-', 'COUNT', count);
    batches += 1;

    if (!Array.isArray(entries) || entries.length === 0) break;
    scanned += entries.length;

    for (const [id, fields] of entries) {
      const entry = decodeStreamEntry(id, fields);
      if (entry.type !== 'completion' || !matchesCompletionTarget(entry, moduleId)) continue;
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
          match: attachIgnoredCompletionSourceDiagnostics(entry, matched.filter((item) => !isCurrentBusterPipelineCompletion(item))),
          scanned,
          batches,
          truncated: false,
        };
      }
    }

    if (entries.length < count) break;
    nextEnd = nextExclusiveStreamId(entries[entries.length - 1][0]);
  }

  const selectable = matched.filter((entry) => isCurrentBusterPipelineCompletion(entry));
  const ignored = matched.filter((entry) => !isCurrentBusterPipelineCompletion(entry));
  const conflict = buildCompletionConflictEntry(selectable, moduleId, normalizedExpected);
  const preferredMatch = selectable[0] || latestMatch;

  return {
    match: conflict || attachIgnoredCompletionSourceDiagnostics(
      attachSameOutcomeDuplicateDiagnostics(preferredMatch, selectable),
      ignored,
    ),
    scanned,
    batches,
    truncated: scanned >= scanLimit,
    conflict: conflict || null,
  };
}

export async function archiveCompletionsChunked(redis, streamKey, archiveStreamKey, moduleId, maxLen, opts = {}) {
  if (maxLen === undefined || opts.batchSize === undefined) {
    throw new TypeError('archiveCompletionsChunked requires explicit maxLen and batchSize');
  }
  const archiveMaxLen = Math.max(1, Number(maxLen));
  const batchSize = Math.max(1, Number(opts.batchSize));
  if (!Number.isFinite(archiveMaxLen) || !Number.isFinite(batchSize)) {
    throw new TypeError('archiveCompletionsChunked maxLen and batchSize must be finite numbers');
  }
  const activeIdentity = normalizeExpectedCompletionIdentity(opts.activeIdentity || opts.expectedIdentity || opts.expected || {});
  const hasActiveIdentity = hasStrongExpectedCompletionIdentity(activeIdentity);
  let nextStart = '-';
  let scanned = 0;
  let archived = 0;
  let batches = 0;

  while (true) {
    const entries = await redis.xrange(streamKey, nextStart, '+', 'COUNT', batchSize);
    batches += 1;

    if (!Array.isArray(entries) || entries.length === 0) break;
    scanned += entries.length;

    const matching = [];
    for (const [id, fields] of entries) {
      const entry = decodeStreamEntry(id, fields);
      if (entry.type !== 'completion' || !matchesCompletionTarget(entry, moduleId)) continue;
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
