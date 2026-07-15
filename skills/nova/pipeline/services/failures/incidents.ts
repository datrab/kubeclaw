import { log } from '../../core/logger.ts';
import { getRunId } from '../../core/runtime.ts';
import {
  buildNonBlockingIncidentKey,
  reportClassifiedNonBlockingError,
} from '../../noncritical-reporting.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function reportFailureSurfaceIncident(config, classification, error, message, options = {}) {
  const resolvedConfig = selectDefinedValue(() => (config), () => ({}));
  reportClassifiedNonBlockingError({
    log,
    reporter: 'failures',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'failures',
      selectTruthyValue(() => (resolvedConfig?.project), () => ('missing_project')),
      selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (getRunId(resolvedConfig)), () => (resolvedConfig?.run_id))), () => (resolvedConfig?._runId))), () => ('missing_run_id')),
      classification,
      selectTruthyValue(() => (options.scope), () => ('missing_scope')),
    ),
    message,
    error,
    level: selectDefinedValue(() => (options.level), () => ('DEBUG')),
  });
}

export { reportFailureSurfaceIncident };
