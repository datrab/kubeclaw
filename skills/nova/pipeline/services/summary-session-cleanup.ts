import { log } from '../core/logger.ts';
import { assertValidSessionTerminationResult } from './acp-gateway-contract.ts';

function resolveValue(value) {
  return typeof value === 'function' ? value() : value;
}

function normalizeIdentity(identity = {}) {
  return {
    config: resolveValue(identity.config) || null,
    sessionKey: resolveValue(identity.sessionKey) || null,
    trackingKey: resolveValue(identity.trackingKey) || null,
    runtime: resolveValue(identity.runtime) || null,
    model: resolveValue(identity.model) || null,
    agentId: resolveValue(identity.agentId) || null,
    label: resolveValue(identity.label) || null,
  };
}

export function createTrackedSummarySessionCleanup(deps = {}, identity = {}, options = {}) {
  let cleanupAttempted = false;
  let terminationCleaned = false;
  let untrackCleaned = false;
  const summaryType = options.summaryType || 'summary-session';

  return async function cleanupTrackedSummarySession(reason = 'finally') {
    const resolved = normalizeIdentity(identity);
    const shouldTerminate = Boolean(resolved.sessionKey && typeof deps.terminateSession === 'function' && !terminationCleaned);
    const shouldUntrack = Boolean(resolved.trackingKey && typeof deps.untrackAgent === 'function' && !untrackCleaned);
    if (cleanupAttempted && !shouldTerminate && !shouldUntrack) {
      return { cleaned: false, skipped: 'already_cleaned', reason };
    }
    cleanupAttempted = true;

    const diagnostics = {
      cleaned: true,
      reason,
      session_key: resolved.sessionKey,
      tracking_key: resolved.trackingKey,
      termination: null,
      termination_error: null,
      untrack_error: null,
    };

    if (shouldTerminate) {
      try {
        diagnostics.termination = assertValidSessionTerminationResult(await deps.terminateSession(resolved.sessionKey, {
          runtime: resolved.runtime,
          model: resolved.model,
          agentId: resolved.agentId,
          label: resolved.label,
        }));
        terminationCleaned = true;
      } catch (error) {
        diagnostics.termination_error = error?.message || 'unknown';
        log('WARN', `[${summaryType}] Failed to terminate tracked summary session ${resolved.sessionKey}: ${diagnostics.termination_error}`);
      }
    }

    if (shouldUntrack) {
      try {
        deps.untrackAgent(resolved.trackingKey);
        untrackCleaned = true;
      } catch (error) {
        diagnostics.untrack_error = error?.message || 'unknown';
        log('WARN', `[${summaryType}] Failed to untrack summary session ${resolved.trackingKey}: ${diagnostics.untrack_error}`);
      }
    }

    if (diagnostics.termination_error || diagnostics.untrack_error) {
      log('WARN', `[${summaryType}] Summary session cleanup completed with errors (reason=${reason})`);
    } else if (resolved.sessionKey || resolved.trackingKey) {
      log('DEBUG', `[${summaryType}] Summary session cleanup completed (reason=${reason})`);
    }

    return diagnostics;
  };
}
