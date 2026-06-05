// services/polling-redis-completion.ts — Redis completion archive helpers.
// Active completion waits consume Redis through completion event adapters.

import { log } from '../core/logger.ts';
import { completionStreamKey } from '../core/paths.ts';
import { logRedisOperation } from './redis-log.ts';
import { emitObservabilityDegraded } from './telemetry.ts';
import { resolveRegisteredRedisAdapter } from './adapter-registry.ts';

const COMPLETION_ARCHIVE_MAX_LEN = 1000;

function buildCompletionArchiveFailureResult(moduleId, stream, archiveStream, activeIdentity = {}, error = null) {
  const message = error?.message || String(error || 'redis completion archive unavailable');
  return {
    archived: 0,
    failed: true,
    reason: 'completion_archive_failed',
    error: message,
    stream,
    archive_stream: archiveStream,
    module: moduleId,
    active_identity: activeIdentity || {},
  };
}

function emitCompletionArchiveFailure(config, moduleId, stream, activeIdentity = {}, error = null, opts = {}) {
  const detail = `Redis completion archive failed: ${error?.message || String(error || 'archive unavailable')}`;
  const targetKind = opts.targetKind || opts.target_kind || (opts.gate_id ? 'gate' : 'module');
  emitObservabilityDegraded({ config }, {
    component: 'redis_completion',
    surface: 'completion_archive',
    reason: 'completion_archive_failed',
    detail,
    module_id: targetKind === 'gate' ? null : (opts.module_id ?? moduleId ?? null),
    gate_id: targetKind === 'gate' ? (opts.gate_id ?? moduleId ?? null) : null,
    gate_type: opts.gate_type || null,
    agent_type: opts.agent_type || 'buster',
    stream_key: stream,
    attempt: activeIdentity?.attempt ?? null,
    dispatch_id: activeIdentity?.dispatch_id ?? activeIdentity?.dispatchId ?? null,
    session_key: activeIdentity?.session_key ?? activeIdentity?.sessionKey ?? null,
  });
}

async function resolveRedisModule(config, opts = {}) {
  try {
    const { adapter, key } = resolveRegisteredRedisAdapter(config, {
      source: 'completion archive',
      requiredMethods: ['archiveCompletions'],
      deps: opts.deps,
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
      const error = new Error(importError || 'redis completion archive unavailable');
      emitCompletionArchiveFailure(config, moduleId, stream, activeIdentity, error, opts);
      log('WARN', `Completion archive failed for ${moduleId}: ${error.message}`);
      return buildCompletionArchiveFailureResult(moduleId, stream, archiveStream, activeIdentity, error);
    }
    const result = await redisMod.archiveCompletions(stream, archiveStream, moduleId, COMPLETION_ARCHIVE_MAX_LEN, activeIdentity);
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
