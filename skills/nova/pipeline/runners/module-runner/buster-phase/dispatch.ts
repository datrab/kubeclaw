import { STATUS, EXIT_ERROR, EXIT_NEEDS_NOVA } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { getRunId } from '../../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from '../../../services/correlation.ts';
import { startModulePhase } from '../../../lifecycle-state.ts';
import {
  emitTerminalModuleFailTelemetry,
} from '../../module-runner-shared.ts';
import { executeBusterWorkerAttempt } from '../../module-runner-buster-worker.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createModuleBusterCompletionIdentity({ runId, moduleId, attempt, busterAttempt, nowMs }: AnyRecord = {}) {
  if (!runId) throw new Error('Module Buster completion identity requires runId');
  if (!moduleId) throw new Error('Module Buster completion identity requires moduleId');
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('Module Buster completion identity requires positive integer attempt');
  if (!Number.isInteger(busterAttempt) || busterAttempt < 1) throw new Error('Module Buster completion identity requires positive integer busterAttempt');
  if (!Number.isInteger(nowMs) || nowMs < 0) throw new Error('Module Buster completion identity requires non-negative integer nowMs');
  return {
    runId,
    attempt,
    dispatchId: `buster-module-${moduleId}-${nowMs}-${busterAttempt}`,
    gateway_label: null,
  };
}

function normalizeRequestedBusterSuites(mod: AnyRecord = {}): string[] {
  if (!Array.isArray(mod.test_suites)) return [];
  return mod.test_suites
    .map((suite: unknown) => typeof suite === 'string' ? suite.trim() : '')
    .filter(Boolean);
}

function resolveModuleBusterIdentityNowMs(deps: AnyRecord = {}): number {
  const value = typeof deps.nowMs === 'function' ? deps.nowMs() : Date.now();
  if (!Number.isInteger(value) || value < 0) throw new Error('Module Buster identity clock returned invalid nowMs');
  return value;
}

export async function executeBusterAttemptDispatch({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  timeout,
  maxFails,
  deps,
  busterModel,
  maxBusterCrashRetries,
  busterAttempt,
}: AnyRecord = {}) {
  const requestedSuites = normalizeRequestedBusterSuites(mod);
  const completionIdentity = createModuleBusterCompletionIdentity({
    runId: getRunId(config),
    moduleId,
    attempt: status.fail_count + 1,
    busterAttempt,
    nowMs: resolveModuleBusterIdentityNowMs(deps),
  });

  if (requestedSuites.length === 0) {
    const reason = 'Buster dispatch requires a typed nonempty test_suites list';
    log('ERROR', `Module ${moduleId} — ${reason}`);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status ?? STATUS.READY_FOR_TESTING, reason);
    return { terminal: { retry: false, result: {
      exit: EXIT_NEEDS_NOVA,
      reason,
      module: moduleId,
      module_dir: dir,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: resolveStatusGatewayLabel(status),
      session_key: resolveStatusSessionKey(status),
      diagnostics: { code: 'buster_test_suites_empty', test_suites: mod?.test_suites ?? null },
    }} };
  }

  let busterPrompt;
  {
    const promptResult = deps.buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails, completionIdentity);
    if (promptResult.error) {
      log('ERROR', `Buster prompt build failed for ${moduleId}: ${promptResult.error}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status ?? STATUS.READY_FOR_TESTING, promptResult.error);
      return {
        terminal: {
          retry: false,
          result: {
            exit: EXIT_ERROR,
            reason: promptResult.error,
            gateway_label: resolveStatusGatewayLabel(status),
            session_key: resolveStatusSessionKey(status),
          },
        },
      };
    }
    busterPrompt = promptResult.prompt;
  }

  deps.savePrompt(config, dir, 'buster', status.fail_count + 1, busterPrompt);

  // ── Pre-dispatch config validation ──
  // Catches obvious config issues (missing paths, bad binaries) before wasting
  // a full Buster dispatch cycle. Only checked on first buster attempt per module
  // attempt — crash retries reuse the same config.
  if (busterAttempt === 1) {
    try {
      deps.validateBusterConfig(config);
    } catch (e) {
      const reason = `Config validation failed: ${errorMessage(e)}`;
      log('ERROR', `Module ${moduleId} — ${reason}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status ?? STATUS.READY_FOR_TESTING, reason);
      await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Config Invalid`,
        `Pre-dispatch validation caught config issues. Fix progress.json before retrying.`,
        buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, completionIdentity, [
          { name: 'Issue', value: errorMessage(e).slice(0, 200) },
        ])
      );
      deps.clearShutdownContext();
      return { terminal: { retry: false, result: {
        exit: EXIT_NEEDS_NOVA,
        reason,
        module: moduleId, module_dir: dir,
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: resolveStatusSessionKey(status),
      }} };
    }
  }

  const busterPhaseStartedAt = new Date().toISOString();
  const busterStartTransition = startModulePhase(status, 'buster',
    `Buster started (subagent attempt ${busterAttempt}/${maxBusterCrashRetries + 1})`,
    { now: busterPhaseStartedAt, clearCompletionSummary: true });
  deps.saveStatus(config, dir, status, busterStartTransition);

  deps.setShutdownContext(config, 'buster', moduleId, dir);

  await deps.discord(config, 'INFO', `Module ${moduleId} — Buster queued`,
    `Buster work is queued. Pre-test suites run first; a Buster subagent is spawned only if critical pre-tests pass.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId }),
      { name: 'Phase', value: 'buster', inline: true },
      { name: 'Queued Suites', value: requestedSuites.join(', '), inline: true },
      { name: 'Subagent Spawned?', value: 'Not yet', inline: true },
      { name: 'Next', value: 'Watch for either suite results, a pre-test failure, or a Buster subagent spawn message.', inline: false },
    ]);

  completionIdentity.gateway_label = null;

  const workerOutcome = await executeBusterWorkerAttempt({
    config,
    progress,
    moduleId,
    mod,
    dir,
    status,
    timeout,
    maxFails,
    deps,
    busterPrompt,
    completionIdentity,
    busterModel,
    maxBusterCrashRetries,
    busterAttempt,
  });

  return {
    completionIdentity,
    workerOutcome,
    status: workerOutcome.status || status,
  };
}
