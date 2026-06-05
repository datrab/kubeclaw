import { STATUS, EXIT_ERROR } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { getRunId } from '../../../core/runtime.ts';
import { emitOperatorAlert } from '../../../services/telemetry.ts';
import {
  _telemetryCtx,
  currentAttemptNumber,
  emitTerminalModuleFailTelemetry,
} from '../../module-runner-shared.ts';
import {
  resolveCompletionGatewayLabel,
  resolveCompletionSessionKey,
} from './identity.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

export async function handleBusterSpawnFailure({
  config,
  moduleId,
  status,
  mod,
  maxFails,
  busterWorkerControlResult,
  completionIdentity,
  busterModel,
}: AnyRecord = {}) {
  const metadata = workerMetadata(busterWorkerControlResult);
  const reason = `Buster spawn failed: ${metadata.error}`;
  log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: buster agent spawn failed: ${metadata.error}`);
  const spawnFailureGatewayLabel = (metadata.gateway_label ?? resolveCompletionGatewayLabel(status, completionIdentity));
  const spawnFailureSessionKey = (metadata.session_key ?? resolveCompletionSessionKey(status, completionIdentity));
  await emitOperatorAlert(_telemetryCtx(config), 'module.operator_alert', {
    module_id: moduleId,
    phase: 'buster',
    attempt: currentAttemptNumber(status),
    dispatch_id: completionIdentity.dispatchId,
    gateway_label: spawnFailureGatewayLabel,
    session_key: spawnFailureSessionKey,
  }, {
    hookId: 'module.completed',
    moduleId,
    attempt: currentAttemptNumber(status),
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Module ${moduleId} — Buster Spawn Failed`,
        description: reason,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
          run_id: getRunId(config),
          module_id: moduleId,
          attempt: currentAttemptNumber(status),
          dispatch_id: completionIdentity.dispatchId,
          gateway_label: spawnFailureGatewayLabel,
          session_key: spawnFailureSessionKey,
        }),
      },
    },
  });
  emitTerminalModuleFailTelemetry(
    config,
    moduleId,
    status,
    mod,
    'buster',
    busterModel,
    status?.status ?? STATUS.READY_FOR_TESTING,
    reason,
    {
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: spawnFailureGatewayLabel,
      sessionKey: spawnFailureSessionKey,
    },
  );
  return { retry: false, result: { exit: EXIT_ERROR, reason, dispatch_id: completionIdentity.dispatchId, gateway_label: spawnFailureGatewayLabel, session_key: spawnFailureSessionKey } };
}
