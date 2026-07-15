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
import { buildModuleErrorTerminalResult } from '../terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

import { selectDefinedValue, selectTruthyValue } from '../../../optional-absence.ts';
type AnyRecord = Record<string, any>;

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function spawnFailureGatewayLabelAuthority(metadata: AnyRecord, status: AnyRecord, completionIdentity: AnyRecord): string | null {
  if (metadata.gateway_label !== undefined && metadata.gateway_label !== null) return metadata.gateway_label;
  return resolveCompletionGatewayLabel(status, completionIdentity);
}

function spawnFailureSessionKeyAuthority(metadata: AnyRecord, status: AnyRecord, completionIdentity: AnyRecord): string | null {
  if (metadata.session_key !== undefined && metadata.session_key !== null) return metadata.session_key;
  return resolveCompletionSessionKey(status, completionIdentity);
}

function spawnFailurePreviousStatus(status: AnyRecord): string {
  if (typeof status?.status === 'string' && status.status.trim()) return status.status;
  throw new Error('Buster spawn failure terminal telemetry requires current module status');
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
  const spawnFailureGatewayLabel = spawnFailureGatewayLabelAuthority(metadata, status, completionIdentity);
  const spawnFailureSessionKey = spawnFailureSessionKeyAuthority(metadata, status, completionIdentity);
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
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
            run_id: getRunId(config),
            module_id: moduleId,
            attempt: currentAttemptNumber(status),
            dispatch_id: completionIdentity.dispatchId,
            gateway_label: spawnFailureGatewayLabel,
            session_key: spawnFailureSessionKey,
          }),
          { name: 'Status', value: 'ERROR' },
          { name: 'Action', value: 'Inspect Buster runtime and retry the module' },
        ],
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
    spawnFailurePreviousStatus(status),
    reason,
    {
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: spawnFailureGatewayLabel,
      sessionKey: spawnFailureSessionKey,
    },
  );
  return buildModuleErrorTerminalResult(config, moduleId, {
    reason,
    runId: selectDefinedValue(() => (completionIdentity.runId), () => (null)),
    attempt: currentAttemptNumber(status),
    phase: 'buster',
    dispatchId: completionIdentity.dispatchId,
    gatewayLabel: spawnFailureGatewayLabel,
    sessionKey: spawnFailureSessionKey,
  });
}
