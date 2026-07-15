import { log } from '../core/logger.ts';
import { assertValidSessionTerminationResult } from './acp-gateway-contract.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function resolveValue(value) {
  return typeof value === 'function' ? value() : value;
}

function normalizeIdentity(identity = {}) {
  return {
    config: selectTruthyValue(() => (resolveValue(identity.config)), () => (null)),
    sessionKey: selectTruthyValue(() => (resolveValue(identity.sessionKey)), () => (null)),
    trackingKey: selectTruthyValue(() => (resolveValue(identity.trackingKey)), () => (null)),
    runtime: selectTruthyValue(() => (resolveValue(identity.runtime)), () => (null)),
    model: selectTruthyValue(() => (resolveValue(identity.model)), () => (null)),
    agentId: selectTruthyValue(() => (resolveValue(identity.agentId)), () => (null)),
    label: selectTruthyValue(() => (resolveValue(identity.label)), () => (null)),
  };
}

export function createTrackedSummarySessionCleanup(deps = {}, identity = {}, options = {}) {
  let cleanupAttempted = false;
  let terminationCleaned = false;
  let untrackCleaned = false;
  const summaryType = selectDefinedValue(() => (options.summaryType), () => ('summary-session'));

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
        const terminationOptions = {
          runtime: resolved.runtime,
          model: resolved.model,
          agentId: resolved.agentId,
          label: resolved.label,
        };
        if (resolved.config !== null) Object.assign(terminationOptions, sessionLifecyclePolicies(resolved.config));
        diagnostics.termination = assertValidSessionTerminationResult(await deps.terminateSession(resolved.sessionKey, terminationOptions));
        terminationCleaned = true;
      } catch (error) {
        diagnostics.termination_error = selectTruthyValue(() => (error?.message), () => ('missing_error_message'));
        log('WARN', `[${summaryType}] Failed to terminate tracked summary session ${resolved.sessionKey}: ${diagnostics.termination_error}`);
      }
    }

    if (shouldUntrack) {
      try {
        deps.untrackAgent(resolved.trackingKey);
        untrackCleaned = true;
      } catch (error) {
        diagnostics.untrack_error = selectTruthyValue(() => (error?.message), () => ('missing_error_message'));
        log('WARN', `[${summaryType}] Failed to untrack summary session ${resolved.trackingKey}: ${diagnostics.untrack_error}`);
      }
    }

    if (selectTruthyValue(() => (diagnostics.termination_error), () => (diagnostics.untrack_error))) {
      log('WARN', `[${summaryType}] Summary session cleanup completed with errors (reason=${reason})`);
    } else if (selectTruthyValue(() => (resolved.sessionKey), () => (resolved.trackingKey))) {
      log('DEBUG', `[${summaryType}] Summary session cleanup completed (reason=${reason})`);
    }

    return diagnostics;
  };
}
