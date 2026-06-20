// runners/module-runner/buster-phase.ts — Buster phase execution for module runner

import { STATUS } from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import { shouldApplyRedisCompletionToStatus } from '../../services/completion-adjudicator.ts';
import { transitionModuleStatus } from '../../lifecycle-state.ts';
import { onPhaseStarted } from '../../services/telemetry.ts';
import {
  _telemetryCtx,
  getModuleStats,
  setLogScope,
} from '../module-runner-shared.ts';
import { resolveExpectedCompletionSessionKey } from './buster-phase/identity.ts';
import { handleBusterSpawnFailure } from './buster-phase/spawn-failure.ts';
import { handleFailedPollResult } from './buster-phase/poll-failure.ts';
import { handleBusterPassStatus } from './buster-phase/terminal-pass.ts';
import { handleBusterFailOrBlockedStatus } from './buster-phase/terminal-failure.ts';
import { executeBusterAttemptDispatch } from './buster-phase/dispatch.ts';

type AnyRecord = Record<string, any>;

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function workerTypedMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  const typedWorker = workerTypedWorker(controlResult);
  return typedWorker.metadata && typeof typedWorker.metadata === 'object'
    ? typedWorker.metadata
    : {};
}

function workerTypedWorker(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.typed?.worker && typeof controlResult.diagnostics.typed.worker === 'object'
    ? controlResult.diagnostics.typed.worker
    : {};
}

function workerOutcomeClass(controlResult: AnyRecord | null = null): string | null {
  const typedWorker = workerTypedWorker(controlResult);
  const outcomeClass = typedWorker.outcomeClass ?? typedWorker.metadata?.outcomeClass;
  return typeof outcomeClass === 'string' && outcomeClass.trim() ? outcomeClass.trim() : null;
}

function workerSummary(controlResult: AnyRecord | null = null): string | null {
  const summary = controlResult?.diagnostics?.summary;
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
}

function isRetryableStartupWorkerReason(reason: string | null = null): boolean {
  return reason === 'healthcheck_failed' || reason === 'startup_evidence_missing';
}

export async function runModuleBusterPhase({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  timeout,
  maxFails,
  deps,
  recalledMemoryIds = [],
  handleModuleFail,
  buildRetryResult,
}: AnyRecord = {}) {
  // ──────────────────────────────────────────────────────────────────────────
  //  BUSTER PHASE
  //  Enters on READY_FOR_TESTING (normal flow) or TESTING+buster (resume after interrupt).
  // ──────────────────────────────────────────────────────────────────────────
  if (status.status === STATUS.READY_FOR_TESTING
      || (status.status === STATUS.TESTING && status.current_phase === 'buster')) {
    setLogScope(moduleId, 'buster');
    const busterPolicy = deps.resolvePolicy(config, progress, 'buster', {
      scopeModel: mod.buster_model || null,
      dispatchPath: 'redis',
    });
    const busterModel = busterPolicy.model;
    log('STEP', `Phase: BUSTER (model: ${busterModel ?? '(none)'}, thinking: not_supported_on_redis, model_source: ${busterPolicy.model_source})`);
    deps.logEffectivePolicy(config, { scope: 'module_buster', agent: 'buster', moduleId, ...busterPolicy });
    getModuleStats(config).total_buster_attempts++;
    onPhaseStarted(_telemetryCtx(config), moduleId, 'buster', busterModel);

    const maxBusterCrashRetries = config.buster.max_crash_retries;
    const agentStartupRetryBudget = config.agent_startup_retry_budget;
    let startupRetryCount = 0;

    for (let busterAttempt = 1; busterAttempt <= maxBusterCrashRetries + 1; busterAttempt++) {
      const isLastBusterAttempt = busterAttempt > maxBusterCrashRetries;
      const dispatchResult = await executeBusterAttemptDispatch({
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
        busterPolicy,
        maxBusterCrashRetries,
        busterAttempt,
      });
      if (dispatchResult.terminal) return dispatchResult.terminal;

      const { completionIdentity, workerOutcome } = dispatchResult;
      status = dispatchResult.status || status;
      if (workerOutcome?.terminal) return workerOutcome.terminal;
      const { busterWorkerControlResult, busterSessionKey } = workerOutcome;
      const busterWorkerMetadata = workerMetadata(busterWorkerControlResult);
      const busterWorkerTypedMetadata = workerTypedMetadata(busterWorkerControlResult);
      const startupWorkerReason = busterWorkerMetadata.reason || workerOutcomeClass(busterWorkerControlResult) || busterWorkerTypedMetadata.outcomeClass || null;
      if (isRetryableStartupWorkerReason(startupWorkerReason) && startupRetryCount < agentStartupRetryBudget) {
        startupRetryCount += 1;
        log('WARN', `Module ${moduleId}: Buster startup failed (${startupWorkerReason}) — retrying agent startup ${startupRetryCount}/${agentStartupRetryBudget}`);
        busterAttempt -= 1;
        continue;
      }
      const redisEntry = busterWorkerMetadata.redis_entry || null;
      const typedPassBusterStatus = busterWorkerControlResult?.nextAction === 'pass' && workerOutcomeClass(busterWorkerControlResult) === 'passed'
        ? {
            ...status,
            status: STATUS.PASS,
            completion_summary: workerSummary(busterWorkerControlResult) || status?.completion_summary || null,
          }
        : null;
      const busterFinalStatus = busterWorkerMetadata.final_status
        ? {
            ...status,
            ...busterWorkerMetadata.final_status,
            validation: busterWorkerMetadata.final_status.validation || status?.validation || null,
            cost: busterWorkerMetadata.final_status.cost || status?.cost || null,
          }
        : typedPassBusterStatus;
      completionIdentity.dispatchId = busterWorkerMetadata.dispatch_id || completionIdentity.dispatchId;
      completionIdentity.gateway_label = busterWorkerMetadata.gateway_label || completionIdentity.gateway_label || null;
      startupRetryCount = 0;

      if (busterWorkerMetadata.reason === 'spawn_failed') {
        return handleBusterSpawnFailure({
          config,
          moduleId,
          status,
          mod,
          maxFails,
          busterWorkerControlResult,
          completionIdentity,
          busterModel,
        });
      }


      // ── Poll failed (timeout, parse error, etc.) ──
      const busterFinalState = String(busterFinalStatus?.status || '').trim().toUpperCase();
      const redisTerminalState = String(redisEntry?.status || '').trim().toUpperCase();
      const hasTerminalBusterStatus = [busterFinalState, redisTerminalState]
        .some((candidate) => [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(candidate));
      if (busterWorkerControlResult?.nextAction !== 'pass' && !hasTerminalBusterStatus) {
        const pollFailure = await handleFailedPollResult({
          config,
          moduleId,
          mod,
          dir,
          status,
          timeout,
          deps,
          redisEntry,
          busterWorkerControlResult,
          busterSessionKey,
          completionIdentity,
          busterModel,
          busterAttempt,
          maxBusterCrashRetries,
          isLastBusterAttempt,
        });
        status = pollFailure.status || status;
        if (pollFailure.retry) continue;
        return pollFailure.terminal;
      }


      // ── Poll succeeded (terminal status reached) ──
      status = busterFinalStatus || deps.loadStatus(config, dir) || status;

      // Reconcile Redis completion evidence against local status through the shared adjudicator.
      const completionSessionKey = resolveExpectedCompletionSessionKey(
        status,
        completionIdentity,
        busterSessionKey || busterWorkerMetadata.session_key || redisEntry?.session_key || null,
      );
      if (redisEntry?.status) {
        const redisAdjudication = shouldApplyRedisCompletionToStatus({
          moduleId,
          expectedStatuses: [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED],
          expectedIdentity: {
            run_id: completionIdentity.runId,
            attempt: completionIdentity.attempt,
            dispatch_id: completionIdentity.dispatchId,
            session_key: completionSessionKey,
          },
          redisEntry,
          status,
        });
        const redisStatus = redisAdjudication.status;
        if (redisAdjudication.shouldApply) {
          const syncedAt = new Date().toISOString();
          const redisSource = redisEntry.source || 'redis';
          const driftCodes = (redisAdjudication.adjudication?.drift || []).map((entry) => entry.code).join(', ') || 'none';
          log('WARN', `Lifecycle state shows '${status.status}' but Redis says '${redisStatus}' — applying shared completion adjudication (drift=${driftCodes})`);
          const redisTerminalTransition = transitionModuleStatus(status, redisStatus, {
            note: `Trusted terminal status from Redis completion (${redisSource})`,
            now: syncedAt,
            completedAt: redisStatus === STATUS.PASS ? syncedAt : undefined,
            completionSummary: redisEntry.summary ?? undefined,
          });
          deps.saveStatus(config, dir, status, redisTerminalTransition);
        }
      }

      // ── PASS ──
      if (status.status === STATUS.PASS) {
        return handleBusterPassStatus({
          config,
          moduleId,
          mod,
          dir,
          status,
          deps,
          busterModel,
          completionIdentity,
          completionSessionKey,
        });
      }


      // ── FAIL / BLOCKED ──
      if (status.status === STATUS.FAIL || status.status === STATUS.BLOCKED) {
        const terminalFailure = await handleBusterFailOrBlockedStatus({
          config,
          moduleId,
          mod,
          dir,
          status,
          deps,
          redisEntry,
          failureClass: busterWorkerMetadata.failure_class || busterWorkerTypedMetadata.failure_class || null,
          busterModel,
          completionIdentity,
          completionSessionKey,
          busterAttempt,
          maxBusterCrashRetries,
          isLastBusterAttempt,
          handleModuleFail,
          buildRetryResult,
          recalledMemoryIds,
        });
        status = terminalFailure.status || status;
        if (terminalFailure.retry) continue;
        return terminalFailure.terminal;
      }


      // Unexpected status — break out of retry loop
      break;
    } // end busterAttempt loop
  }

  return { status };
}

export default runModuleBusterPhase;
