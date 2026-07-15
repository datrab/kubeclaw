import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
// runners/module-runner/buster-phase.ts — Buster phase execution for module runner

import { STATUS } from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import { shouldApplyRedisCompletionToStatus } from '../../services/completion-adjudicator.ts';
import { onPhaseStarted } from '../../services/telemetry.ts';
import {
  _telemetryCtx,
  computeElapsedSeconds,
  getAttemptStartedAt,
  getModuleStats,
  setLogScope,
} from '../module-runner-shared.ts';
import { handleBusterSpawnFailure } from './buster-phase/spawn-failure.ts';
import { handleFailedPollResult } from './buster-phase/poll-failure.ts';
import { handleBusterFailOrBlockedStatus } from './buster-phase/terminal-failure.ts';
import { executeBusterAttemptDispatch } from './buster-phase/dispatch.ts';
import { getBusterRuntimeConfig, getPipelineDefaultsConfig } from '../../services/runtime-defaults.ts';
import { buildModuleErrorTerminalResult, buildModulePassTerminalResult } from './terminal-results.ts';

type AnyRecord = Record<string, any>;

const BUSTER_RETRYABLE_STARTUP_REASONS = Object.freeze(['healthcheck_failed', 'startup_evidence_missing', 'rate_limited']);
const REDIS_COMPLETION_SOURCE = 'redis';

function normalizedStatusText(value: unknown): string {
  return String(selectDefinedValue(() => (value), () => (''))).trim().toUpperCase();
}

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function workerTypedWorker(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.typed?.worker && typeof controlResult.diagnostics.typed.worker === 'object'
    ? controlResult.diagnostics.typed.worker
    : {};
}

function workerOutcomeClass(controlResult: AnyRecord | null = null): string | null {
  const typedWorker = workerTypedWorker(controlResult);
  const outcomeClass = workerOutcomeClassAuthority(typedWorker);
  return typeof outcomeClass === 'string' && outcomeClass.trim() ? outcomeClass.trim() : null;
}

function workerOutcomeClassAuthority(typedWorker: AnyRecord): unknown {
  if (typeof typedWorker?.outcomeClass === 'string' && typedWorker.outcomeClass.trim()) return typedWorker.outcomeClass;
  if (typeof typedWorker?.metadata?.outcomeClass === 'string' && typedWorker.metadata.outcomeClass.trim()) return typedWorker.metadata.outcomeClass;
  return null;
}

function workerSummary(controlResult: AnyRecord | null = null): string | null {
  const summary = controlResult?.diagnostics?.summary;
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
}

function isRetryableStartupWorkerReason(reason: string | null = null): boolean {
  return reason !== null && BUSTER_RETRYABLE_STARTUP_REASONS.includes(reason);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveBusterSessionKey(workerMetadataValue: AnyRecord, busterSessionKey: unknown): string | null {
  const metadataSessionKey = nonEmptyString(workerMetadataValue.session_key);
  const outcomeSessionKey = nonEmptyString(busterSessionKey);
  if (metadataSessionKey && outcomeSessionKey && metadataSessionKey !== outcomeSessionKey) {
    throw new Error('Buster worker returned conflicting session key authorities');
  }
  if (metadataSessionKey) return metadataSessionKey;
  if (outcomeSessionKey) return outcomeSessionKey;
  return null;
}

function mergeWorkerStatus(currentStatus: AnyRecord | null, workerStatus: AnyRecord | null): AnyRecord | null {
  if (!workerStatus) return currentStatus;
  return {
    ...(currentStatus && typeof currentStatus === 'object' ? currentStatus : {}),
    ...workerStatus,
    validation: (selectDefinedValue(() => (workerStatus.validation), () => (null))),
    cost: (selectDefinedValue(() => (workerStatus.cost), () => (null))),
  };
}

function statusAfterWorkerDispatch(currentStatus: AnyRecord, workerStatus: AnyRecord | null): AnyRecord {
  return selectDefinedValue(() => (mergeWorkerStatus(currentStatus, workerStatus)), () => (currentStatus));
}

function startupRateLimitPauseCountAuthority(workerMetadataValue: AnyRecord, currentCount: number): number {
  if (workerMetadataValue.rate_limit_pauses !== undefined && workerMetadataValue.rate_limit_pauses !== null) {
    const count = Number(workerMetadataValue.rate_limit_pauses);
    if (Number.isFinite(count) && count >= 0) return count;
    throw new Error('Buster worker rate_limit_pauses must be a non-negative number');
  }
  return currentCount + 1;
}

function statusAfterPollFailure(currentStatus: AnyRecord, pollFailure: AnyRecord): AnyRecord {
  if (pollFailure?.status && typeof pollFailure.status === 'object') return pollFailure.status;
  return currentStatus;
}

function statusAfterTerminalFailure(currentStatus: AnyRecord, terminalFailure: AnyRecord): AnyRecord {
  if (terminalFailure?.status && typeof terminalFailure.status === 'object') return terminalFailure.status;
  return currentStatus;
}

function moduleTerminalResult(result: AnyRecord): AnyRecord {
  let current = result;
  while (current?.terminal && current?.result === undefined) current = current.terminal;
  if (current?.retry === undefined && current?.result?.nextAction && current?.result?.outcome) {
    return { retry: false, result: current.result };
  }
  if (current?.nextAction && current?.outcome) {
    return { retry: false, result: current };
  }
  return current;
}

function finalizeBusterPassCompletion({
  config,
  moduleId,
  dir,
  status,
  deps,
  completionIdentity,
  completionSessionKey,
  persistStatus = true,
}: AnyRecord = {}) {
  const passCompletedAt = new Date().toISOString();
  if (persistStatus) {
    deps.applyModuleCompletion(config, dir, status, {
      target_kind: 'module',
      target_id: moduleId,
      phase: 'buster',
      attempt: completionIdentity.attempt,
      status: 'PASS',
      authority: {
        kind: completionIdentity.dispatchId ? 'redis' : 'worker',
        dispatch_id: selectDefinedValue(() => (completionIdentity.dispatchId), () => (null)),
      },
      summary: selectDefinedValue(() => (status.completion_summary), () => ('Buster checks PASS')),
      occurred_at: passCompletedAt,
      observed: {
        session_key: selectDefinedValue(() => (completionSessionKey), () => (null)),
        gateway_label: selectDefinedValue(() => (completionIdentity.gateway_label), () => (null)),
      },
    });
  }

  if (!status.cost) status.cost = {};
  if (status.started_at) {
    status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  }
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
  deps.saveStatus(config, dir, status);

  log('OK', `Module ${moduleId} implementation checks PASS`);
  setLogScope(null, null);
  getModuleStats(config).modules_completed.push(moduleId);

  return buildModulePassTerminalResult(config, moduleId, {
    runId: selectDefinedValue(() => (completionIdentity.runId), () => (null)),
    moduleDir: dir,
    attempt: completionIdentity.attempt,
    phase: 'buster',
    dispatchId: selectDefinedValue(() => (completionIdentity.dispatchId), () => (null)),
    gatewayLabel: selectDefinedValue(() => (completionIdentity.gateway_label), () => (null)),
    sessionKey: completionSessionKey,
  });
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
  if (selectTruthyValue(() => (status.status === STATUS.READY_FOR_TESTING), () => ((status.status === STATUS.TESTING && status.current_phase === 'buster')))) {
    setLogScope(moduleId, 'buster');
    const busterPolicy = deps.resolvePolicy(config, progress, 'buster', {
      scopeModel: selectTruthyValue(() => (mod.buster_model), () => (null)),
      dispatchPath: config?.agents?.buster?.dispatch,
    });
    const busterModel = busterPolicy.model;
    log('STEP', `Phase: BUSTER (model: ${selectDefinedValue(() => (busterModel), () => ('model_not_configured'))}, thinking: ${selectDefinedValue(() => (busterPolicy.thinking), () => ('thinking_not_configured'))}, thinking_source: ${busterPolicy.thinking_source}, model_source: ${busterPolicy.model_source})`);
    deps.logEffectivePolicy(config, { scope: 'module_buster', agent: 'buster', moduleId, ...busterPolicy });
    getModuleStats(config).total_buster_attempts++;
    onPhaseStarted(_telemetryCtx(config), moduleId, 'buster', busterModel);

    const busterRuntime = getBusterRuntimeConfig(config);
    const maxBusterCrashRetries = busterRuntime.max_crash_retries;
    const agentStartupRetryBudget = getPipelineDefaultsConfig(config).agent_startup_retry_budget;
    let startupRetryCount = 0;
    let startupRateLimitPauses = 0;

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
        startupRateLimitPauseCount: startupRateLimitPauses,
      });
      if (dispatchResult.terminal) return moduleTerminalResult(dispatchResult.terminal);

      const { completionIdentity, workerOutcome } = dispatchResult;
      status = statusAfterWorkerDispatch(status, dispatchResult.status);
      if (workerOutcome?.terminal) return moduleTerminalResult(workerOutcome.terminal);
      const { busterWorkerControlResult, busterSessionKey } = workerOutcome;
      const busterWorkerMetadata = workerMetadata(busterWorkerControlResult);
      const startupWorkerReason = typeof busterWorkerMetadata.reason === 'string' && busterWorkerMetadata.reason.trim()
        ? busterWorkerMetadata.reason.trim().toLowerCase()
        : null;
      if (startupWorkerReason === 'rate_limited') {
        startupRateLimitPauses = startupRateLimitPauseCountAuthority(busterWorkerMetadata, startupRateLimitPauses);
        log('WARN', `Module ${moduleId}: Buster startup rate limited — retrying after cooldown pause ${startupRateLimitPauses}`);
        busterAttempt -= 1;
        continue;
      }
      if (isRetryableStartupWorkerReason(startupWorkerReason) && startupRetryCount < agentStartupRetryBudget) {
        startupRetryCount += 1;
        log('WARN', `Module ${moduleId}: Buster startup failed (${startupWorkerReason}) — retrying agent startup ${startupRetryCount}/${agentStartupRetryBudget}`);
        busterAttempt -= 1;
        continue;
      }
      const redisEntry = selectDefinedValue(() => (busterWorkerMetadata.redis_entry), () => (null));
      const typedPassBusterStatus = busterWorkerControlResult?.nextAction === 'pass' && workerOutcomeClass(busterWorkerControlResult) === 'passed'
        ? {
            ...status,
            status: STATUS.PASS,
            completion_summary: (selectDefinedValue(() => (workerSummary(busterWorkerControlResult)), () => (null))),
          }
        : null;
      let busterFinalStatus = busterWorkerMetadata.final_status
        ? {
            ...status,
            ...busterWorkerMetadata.final_status,
            validation: (selectDefinedValue(() => (busterWorkerMetadata.final_status.validation), () => (null))),
            cost: (selectDefinedValue(() => (busterWorkerMetadata.final_status.cost), () => (null))),
          }
        : typedPassBusterStatus;
      if (!busterFinalStatus && [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(normalizedStatusText(redisEntry?.status))) {
        busterFinalStatus = {
          ...status,
          status: normalizedStatusText(redisEntry.status),
          completion_summary: selectDefinedValue(() => (redisEntry.summary), () => (status.completion_summary)),
        };
      }
      completionIdentity.dispatchId = (selectDefinedValue(() => (busterWorkerMetadata.dispatch_id), () => (null)));
      completionIdentity.gateway_label = (selectDefinedValue(() => (busterWorkerMetadata.gateway_label), () => (null)));
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

      completionIdentity.sessionKey = resolveBusterSessionKey(busterWorkerMetadata, busterSessionKey);

      // ── Poll failed (timeout, parse error, etc.) ──
      const busterFinalState = normalizedStatusText(busterFinalStatus?.status);
      const redisTerminalState = normalizedStatusText(redisEntry?.status);
      const hasTerminalBusterStatus = [busterFinalState, redisTerminalState]
        .some((candidate) => [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(candidate));
      if (!hasTerminalBusterStatus) {
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
        status = statusAfterPollFailure(status, pollFailure);
        if (pollFailure.retry) continue;
        return moduleTerminalResult(pollFailure.terminal);
      }


      // ── Poll succeeded (terminal status reached) ──
      status = (selectDefinedValue(() => (busterFinalStatus), () => (status))) as AnyRecord;
      let terminalStatusPersisted = false;

      // Reconcile Redis completion evidence against local status through the shared adjudicator.
      const completionSessionKey = resolveBusterSessionKey(completionIdentity, busterSessionKey);
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
        if (redisAdjudication.shouldApply && redisStatus === STATUS.PASS) {
          const syncedAt = new Date().toISOString();
          const redisSource = selectDefinedValue(() => (redisEntry.source), () => (REDIS_COMPLETION_SOURCE));
          const driftEntries = Array.isArray(redisAdjudication.adjudication?.drift)
            ? redisAdjudication.adjudication.drift
            : [];
          const joinedDriftCodes = driftEntries.map((entry) => entry.code).join(', ');
          const driftCodes = joinedDriftCodes ? joinedDriftCodes : 'none';
          const hasDrift = redisAdjudication.adjudication?.drift_detected === true;
          const logLevel = hasDrift ? 'WARN' : 'INFO';
          const handoffMessage = hasDrift
            ? `Lifecycle state shows '${status.status}' but Redis says '${redisStatus}' — applying shared completion adjudication (drift=${driftCodes})`
            : `Buster phase completed '${redisStatus}' from Redis while module lifecycle was '${status.status}' — advancing module phase state`;
          log(logLevel, handoffMessage);
          deps.applyModuleCompletion(config, dir, status, {
            target_kind: 'module',
            target_id: moduleId,
            phase: 'buster',
            attempt: completionIdentity.attempt,
            status: redisStatus,
            authority: {
              kind: 'redis',
              dispatch_id: selectDefinedValue(() => (completionIdentity.dispatchId), () => (redisEntry.dispatch_id)),
              key: selectDefinedValue(() => (redisEntry.completion_key), () => (null)),
              source: redisSource,
            },
            reason_code: selectDefinedValue(() => (redisEntry.reason), () => (null)),
            summary: selectDefinedValue(() => (redisEntry.summary), () => (`Trusted terminal status from Redis completion (${redisSource})`)),
            occurred_at: syncedAt,
            observed: {
              session_key: completionSessionKey,
              gateway_label: selectDefinedValue(() => (completionIdentity.gateway_label), () => (redisEntry.gateway_label)),
            },
          });
          terminalStatusPersisted = true;
        }
      }

      // ── PASS ──
      if (status.status === STATUS.PASS) {
        return finalizeBusterPassCompletion({
          config,
          moduleId,
          dir,
          status,
          deps,
          completionIdentity,
          completionSessionKey,
          persistStatus: !terminalStatusPersisted,
        });
      }


      // ── FAIL / BLOCKED ──
      if ([STATUS.FAIL, STATUS.BLOCKED].includes(status.status)) {
        const terminalFailure = await handleBusterFailOrBlockedStatus({
          config,
          progress,
          moduleId,
          mod,
          dir,
          status,
          deps,
          redisEntry,
          failureClass: (selectDefinedValue(() => (busterWorkerMetadata.failure_class), () => (null))),
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
        status = statusAfterTerminalFailure(status, terminalFailure);
        if (terminalFailure.retry) continue;
        return moduleTerminalResult(terminalFailure.terminal);
      }


      const missingEvidenceReason = `Buster phase did not produce terminal completion evidence (${normalizedStatusText(status.status) || 'missing_status'})`;
      log('ERROR', `Module ${moduleId}: ${missingEvidenceReason}`);
      deps.applyModuleCompletion(config, dir, status, {
        target_kind: 'module',
        target_id: moduleId,
        phase: 'buster',
        attempt: completionIdentity.attempt,
        status: 'ERROR',
        authority: {
          kind: 'worker',
          dispatch_id: selectDefinedValue(() => (completionIdentity.dispatchId), () => (null)),
        },
        reason_code: 'buster_terminal_completion_missing',
        summary: missingEvidenceReason,
        observed: {
          session_key: completionSessionKey,
          gateway_label: selectDefinedValue(() => (completionIdentity.gateway_label), () => (null)),
        },
      });
      return buildModuleErrorTerminalResult(config, moduleId, {
        reason: missingEvidenceReason,
        runId: completionIdentity.runId,
        moduleDir: dir,
        attempt: completionIdentity.attempt,
        phase: 'buster',
        dispatchId: completionIdentity.dispatchId,
        gatewayLabel: selectDefinedValue(() => (completionIdentity.gateway_label), () => (null)),
        sessionKey: completionSessionKey,
        terminalReasonCode: 'buster_terminal_completion_missing',
        terminalHumanReason: missingEvidenceReason,
        terminalSource: 'module:buster_completion',
        metadata: {
          failure_class: 'buster_terminal_completion_missing',
          worker_reason: selectDefinedValue(() => (busterWorkerMetadata.reason), () => (null)),
          worker_next_action: selectDefinedValue(() => (busterWorkerControlResult?.nextAction), () => (null)),
        },
      });
    } // end busterAttempt loop
  }

  return { status };
}

export default runModuleBusterPhase;
