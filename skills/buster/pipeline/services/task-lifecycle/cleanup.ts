
import { emitPluginEvent } from '../telemetry.ts';
import { doResourceCleanup } from '../pipeline-helpers.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
export async function runResourceCleanupStage({ payload, moduleId, tctx, logger, stage, logCompletion = false }) {
  const cleanupStart = Date.now();
  await emitPluginEvent(tctx, 'resource_cleanup', {
    module_id:        moduleId,
    stage,
    phase:            'started',
    duration_seconds: null,
    ok:               null,
  });

  const cleanup = await doResourceCleanup(stage, payload);

  await emitPluginEvent(tctx, 'resource_cleanup', {
    module_id:        moduleId,
    stage,
    phase:            'completed',
    duration_seconds: Math.round((Date.now() - cleanupStart) / 1000),
    ok:               cleanup.ok,
    leases_deleted:   selectTruthyValue(() => (cleanup.leases_deleted), () => ([])),
  });

  if (logCompletion) {
    logger.info('CLEANUP', `${stage[0].toUpperCase()}${stage.slice(1)} cleanup complete`, { ok: cleanup.ok });
  }

  return cleanup;
}
