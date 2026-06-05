
import { emitPluginEvent } from '../telemetry.ts';
import { doSandboxCleanup } from '../pipeline-helpers.ts';

export async function runSandboxCleanupStage({ payload, moduleId, tctx, logger, stage, logCompletion = false }) {
  const cleanupStart = Date.now();
  await emitPluginEvent(tctx, 'sandbox_cleanup', {
    module_id:        moduleId,
    stage,
    phase:            'started',
    duration_seconds: null,
    ok:               null,
  });

  const cleanup = await doSandboxCleanup(stage, payload);

  await emitPluginEvent(tctx, 'sandbox_cleanup', {
    module_id:        moduleId,
    stage,
    phase:            'completed',
    duration_seconds: Math.round((Date.now() - cleanupStart) / 1000),
    ok:               cleanup.ok,
  });

  if (logCompletion) {
    logger.info('SANDBOX', `${stage[0].toUpperCase()}${stage.slice(1)}-cleanup complete`, { ok: cleanup.ok });
  }

  return cleanup;
}
