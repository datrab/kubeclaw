import { log } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import {
  buildNonBlockingIncidentKey,
  reportClassifiedNonBlockingError,
} from '../../noncritical-reporting.ts';

function reportFailureSurfaceIncident(config, classification, error, message, options = {}) {
  const resolvedConfig = config || {};
  reportClassifiedNonBlockingError({
    log,
    reporter: 'failures',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'failures',
      resolvedConfig?.project || 'unknown',
      getRunId(resolvedConfig) || resolvedConfig?.run_id || resolvedConfig?._runId || 'unknown',
      classification,
      options.scope || 'global',
    ),
    message,
    error,
    level: options.level || 'DEBUG',
  });
}

export { reportFailureSurfaceIncident };
