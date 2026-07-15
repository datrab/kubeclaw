import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/polling-redis-completion.ts — Redis completion archive helpers.
// Active completion waits consume Redis through completion event adapters.

import { log } from '../core/logger.ts';
import { completionStreamKey } from '../core/paths.ts';
import { logRedisOperation } from './redis-log.ts';
import { emitObservabilityDegraded } from './telemetry.ts';
import { resolveRegisteredRedisAdapter } from './adapter-registry.ts';
import { resolveRedisCompletionPolicy } from './redis-completion-policy.ts';

const COMPLETION_ARCHIVE_UNAVAILABLE = 'redis completion archive unavailable';
const BUSTER_AGENT_TYPE = 'buster';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function archiveErrorMessage(error, fallback = COMPLETION_ARCHIVE_UNAVAILABLE) {
  return selectDefinedValue(() => (error?.message), () => (String(selectDefinedValue(() => (error), () => (fallback)))));
}

function buildCompletionArchiveFailureResult(moduleId, stream, archiveStream, activeIdentity = {}, error = null) {
  const message = archiveErrorMessage(error);
  return {
    archived: 0,
    failed: true,
    reason: 'completion_archive_failed',
    error: message,
    stream,
    archive_stream: archiveStream,
    module: moduleId,
    active_identity: objectRecord(activeIdentity),
  };
}

function emitCompletionArchiveFailure(config, moduleId, stream, activeIdentity = {}, error = null, opts = {}) {
  const detail = `Redis completion archive failed: ${archiveErrorMessage(error, 'archive unavailable')}`;
  const targetKind = pollingTargetKindAuthority(opts);
  emitObservabilityDegraded({ config }, {
    component: 'redis_completion',
    surface: 'completion_archive',
    reason: 'completion_archive_failed',
    detail,
    module_id: targetKind === 'gate' ? null : (selectDefinedValue(() => (selectDefinedValue(() => (opts.module_id), () => (moduleId))), () => (null))),
    gate_id: targetKind === 'gate' ? (selectDefinedValue(() => (selectDefinedValue(() => (opts.gate_id), () => (moduleId))), () => (null))) : null,
    gate_type: selectTruthyValue(() => (opts.gate_type), () => (null)),
    agent_type: selectDefinedValue(() => (opts.agent_type), () => (BUSTER_AGENT_TYPE)),
    stream_key: stream,
    attempt: selectDefinedValue(() => (activeIdentity?.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (activeIdentity?.dispatch_id), () => (activeIdentity?.dispatchId))), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (activeIdentity?.session_key), () => (activeIdentity?.sessionKey))), () => (null)),
  });
}

function pollingTargetKindAuthority(opts) {
  if (opts.targetKind) return opts.targetKind;
  if (opts.target_kind) return opts.target_kind;
  return opts.gate_id ? 'gate' : 'module';
}

async function resolveRedisModule(config, opts = {}) {
  try {
    const { adapter, key } = resolveRegisteredRedisAdapter(config, {
      source: 'completion archive',
      requiredMethods: ['archiveCompletions'],
    });
    log('INFO', `Redis completion adapter loaded from registry: ${key}`);

    // Set log callback for Redis operation tracing → redis/redis-ops.jsonl.
    // Resolve per call so long-lived processes honor the current config/test adapter.
    if (adapter?.setLogCallback) adapter.setLogCallback((event) => logRedisOperation(config, event));
    return { redisMod: adapter, importError: null };
  } catch (e) {
    const importError = `Redis module import failed: ${e.message}`;
    log('ERROR', `${importError} — Buster completion requires Redis; Git status is diagnostic only`);
    return { redisMod: null, importError };
  }
}

/**
 * Archive old completion entries for a module before dispatching a new Buster attempt.
 * Moves entries from the active stream to the archive stream, preventing the
 * completion event adapter from observing stale FAIL/PASS entries from a
 * previous attempt.
 *
 * Called once before each Buster dispatch (not on every poll cycle).
 */
export async function archiveModuleCompletions(config, moduleId, activeIdentity = {}, opts = {}) {
  const stream = completionStreamKey(config);
  const archiveStream = `${stream}:log`;

  try {
    const { redisMod, importError } = await resolveRedisModule(config, opts);
    if (!redisMod) {
      const error = new Error(selectDefinedValue(() => (importError), () => (COMPLETION_ARCHIVE_UNAVAILABLE)));
      emitCompletionArchiveFailure(config, moduleId, stream, activeIdentity, error, opts);
      log('WARN', `Completion archive failed for ${moduleId}: ${error.message}`);
      return buildCompletionArchiveFailureResult(moduleId, stream, archiveStream, activeIdentity, error);
    }
    const policy = resolveRedisCompletionPolicy(config);
    const result = await redisMod.archiveCompletions(stream, archiveStream, moduleId, policy.archiveMaxLen, activeIdentity, {
      batchSize: policy.tailScanBatchSize,
    });
    if (result.archived > 0) {
      log('INFO', `Archived ${result.archived} old completion(s) for ${moduleId} → ${archiveStream}`);
    }
    return result;
  } catch (e) {
    emitCompletionArchiveFailure(config, moduleId, stream, activeIdentity, e, opts);
    log('WARN', `Completion archive failed for ${moduleId}: ${e.message}`);
    return buildCompletionArchiveFailureResult(moduleId, stream, archiveStream, activeIdentity, e);
  }
}
