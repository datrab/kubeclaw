import { log } from '../../../core/logger.ts';
import {
  finalizeTerminalModuleState,
} from '../../../lifecycle-state.ts';
import {
  onPhaseCompleted,
  onModulePass,
} from '../../../services/telemetry.ts';
import {
  _telemetryCtx,
  computeElapsedSeconds,
  formatDurationCompact,
  getAttemptStartedAt,
  getModuleStats,
  setLogScope,
} from '../../module-runner-shared.ts';
import { buildModulePassTerminalResult } from '../terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

export function handleBusterPassStatus({
  config,
  moduleId,
  mod,
  dir,
  status,
  deps,
  busterModel,
  completionIdentity,
  completionSessionKey,
}: AnyRecord = {}) {
  const passCompletedAt = new Date().toISOString();
  const passTransition = finalizeTerminalModuleState(status, { completedAt: passCompletedAt });
  status.cost ||= {};
  if (status.started_at) {
    status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  }
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
  deps.saveStatus(config, dir, status, passTransition);

  log('OK', `Module ${moduleId} PASS`);
  onPhaseCompleted(_telemetryCtx(config), moduleId, 'buster');
  onModulePass(_telemetryCtx(config), moduleId, {
    title: mod.title,
    old_status: 'TESTING',
    attempt: status.fail_count + 1,
    phase: 'buster',
    model: busterModel,
    duration_seconds: status.cost?.attempt_duration_seconds ?? status.cost?.total_duration_seconds ?? 0,
    cost_estimate_usd: null,
    commit_hash: status.commit_hash || null,
    presentation: {
      discord: {
        level: 'OK',
        title: `Module ${moduleId} PASS ✓`,
        description: mod.title,
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: completionSessionKey }),
          { name: 'Duration', value: formatDurationCompact(status.cost.attempt_duration_seconds || status.cost.total_duration_seconds) },
          { name: 'Attempts', value: `${status.fail_count + 1}` },
        ],
      },
    },
  });

  setLogScope(null, null);
  getModuleStats(config).modules_completed.push(moduleId);

  return buildModulePassTerminalResult(config, moduleId, {
    runId: completionIdentity.runId ?? completionIdentity.run_id ?? null,
    moduleDir: dir,
    attempt: completionIdentity.attempt ?? status.fail_count + 1,
    phase: 'buster',
    dispatchId: completionIdentity.dispatchId ?? completionIdentity.dispatch_id ?? null,
    gatewayLabel: completionIdentity.gateway_label ?? null,
    sessionKey: completionSessionKey,
  });
}
