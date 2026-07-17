import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { finalizeModuleSessionRateLimitExit, getRateLimitConfig } from '../../../services/rate-limit.ts';
import {
  transitionModuleStatus,
} from '../../../lifecycle-state.ts';
import {
  buildTerminalBusterCrashFailEvent,
  emitTerminalBusterCrashTelemetry,
} from '../../module-runner-shared.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleErrorTerminalResult,
  buildModuleRateLimitedTerminalResult,
  buildModuleTimedOutTerminalResult,
} from '../terminal-results.ts';
import { applyModuleRunnerCompletion } from '../completions.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

import { selectDefinedValue, selectTruthyValue } from '../../../optional-absence.ts';
type AnyRecord = Record<string, any>;

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function completionConflictStatus(workerMeta: AnyRecord): AnyRecord {
  return workerMeta.completion_conflict && typeof workerMeta.completion_conflict === 'object'
    ? workerMeta.completion_conflict
    : {};
}

function requireText(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${field}: required non-empty string`);
}

function requirePositiveNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  throw new Error(`${field}: required positive number`);
}

function requiredCompletionIdentity(completionIdentity: AnyRecord) {
  return {
    runId: requireText(completionIdentity.runId, 'completionIdentity.runId'),
    attempt: requirePositiveNumber(completionIdentity.attempt, 'completionIdentity.attempt'),
    dispatchId: requireText(completionIdentity.dispatchId, 'completionIdentity.dispatchId'),
    gatewayLabel: requireText(completionIdentity.gateway_label, 'completionIdentity.gateway_label'),
    sessionKey: selectDefinedValue(() => (completionIdentity.sessionKey), () => (null)),
  };
}

function requiredRateLimitExitIdentity(rateLimitExit: AnyRecord) {
  return {
    runId: requireText(rateLimitExit.run_id, 'rateLimitExit.run_id'),
    attempt: requirePositiveNumber(rateLimitExit.attempt, 'rateLimitExit.attempt'),
    dispatchId: requireText(rateLimitExit.dispatch_id, 'rateLimitExit.dispatch_id'),
    gatewayLabel: requireText(rateLimitExit.gateway_label, 'rateLimitExit.gateway_label'),
    sessionKey: requireText(rateLimitExit.session_key, 'rateLimitExit.session_key'),
  };
}

function resolvePollFailureStatusAuthority({ busterWorkerControlResult, status }: AnyRecord = {}) {
  const metadata = workerMetadata(busterWorkerControlResult);
  if (metadata.final_status) {
    return {
      status: {
        ...status,
        ...metadata.final_status,
        validation: (selectDefinedValue(() => (metadata.final_status.validation), () => (null))),
        cost: (selectDefinedValue(() => (metadata.final_status.cost), () => (null))),
      },
      source: 'worker_final_status',
    };
  }
  return {
    status,
    source: 'in_memory_status',
    degraded: {
      code: 'poll_failure_status_authority_in_memory',
      message: 'Buster poll failure lacked worker final status; using active in-memory status with explicit authority evidence',
    },
  };
}

export async function handleFailedPollResult({
  config,
  moduleId,
  mod,
  dir,
  status,
  timeout,
  deps,
  redisEntry = null,
  busterWorkerControlResult,
  busterSessionKey,
  completionIdentity,
  busterModel,
  busterAttempt,
  maxBusterCrashRetries,
  isLastBusterAttempt,
}: AnyRecord = {}) {
  const workerMeta = workerMetadata(busterWorkerControlResult);
  const statusAuthority = resolvePollFailureStatusAuthority({ busterWorkerControlResult, status });
  status = statusAuthority.status;
  const identity = requiredCompletionIdentity(completionIdentity);
  const reasonCode = requireText(workerMeta.reason, 'busterWorkerControlResult.diagnostics.metadata.reason');

  if (reasonCode === 'rate_limit_exhausted') {
    const rateLimitReason = 'Rate limit pauses exceeded maximum during Buster phase';
    const busterRateLimitExit = await finalizeModuleSessionRateLimitExit({
      reason: reasonCode,
      rate_limit_status: selectDefinedValue(() => (workerMeta.rate_limit_status), () => (null)),
      rate_limit_pauses: selectDefinedValue(() => (workerMeta.rate_limit_pauses), () => (null)),
      max_rate_limit_pauses: selectDefinedValue(() => (workerMeta.max_rate_limit_pauses), () => (null)),
      status: selectDefinedValue(() => (workerMeta.rate_limit_status), () => (null)),
    }, {
      config,
      moduleId,
      moduleDir: dir,
      phase: 'buster',
      notifyDiscord: deps.discord,
      discordTitle: `Module ${moduleId} RATE LIMITED (Buster)`,
      discordDescription: (exitResult: AnyRecord) =>
        `Buster attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      discordIdentity: completionIdentity,
      reason: rateLimitReason,
      identity: {
        run_id: identity.runId,
        attempt: identity.attempt,
        dispatch_id: identity.dispatchId,
        gateway_label: identity.gatewayLabel,
        session_key: identity.sessionKey,
      },
      maxPauses: getRateLimitConfig(config).max_pauses_per_module,
      logLevel: 'ERROR',
      logMessage: `Module ${moduleId} rate limit pauses exhausted in buster phase`,
    } as AnyRecord);
    const rateLimitIdentity = requiredRateLimitExitIdentity(busterRateLimitExit);
    return { terminal: buildModuleRateLimitedTerminalResult(config, moduleId, {
      rateLimitResult: busterRateLimitExit,
      reason: rateLimitReason,
      runId: rateLimitIdentity.runId,
      moduleDir: dir,
      attempt: rateLimitIdentity.attempt,
      phase: 'buster',
      dispatchId: rateLimitIdentity.dispatchId,
      gatewayLabel: rateLimitIdentity.gatewayLabel,
      sessionKey: rateLimitIdentity.sessionKey,
    }) };
  }
  if (reasonCode === 'git_error') {
    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason: (selectDefinedValue(() => (workerMeta.status_message), () => ('Polling git sync failed closed during Buster phase'))),
      runId: identity.runId,
      moduleDir: dir,
      attempt: identity.attempt,
      phase: 'buster',
      dispatchId: identity.dispatchId,
      gatewayLabel: identity.gatewayLabel,
      sessionKey: identity.sessionKey,
      metadata: {
        polling_git: selectDefinedValue(() => (workerMeta.polling_git), () => (null)),
        status_authority: statusAuthority.source,
        ...(statusAuthority.degraded ? { degraded: statusAuthority.degraded } : {}),
      },
    }) };
  }
  if (reasonCode === 'completion_conflict') {
    const conflictStatus = completionConflictStatus(workerMeta);
    const localStatus = (selectDefinedValue(() => (conflictStatus.local_status), () => (null)));
    log('ERROR', `Module ${moduleId}: Redis completion conflicts with terminal local state — failing closed`);
    applyModuleRunnerCompletion({
      deps,
      config,
      dir,
      status,
      moduleId,
      phase: 'buster',
      attempt: identity.attempt,
      completionStatus: 'BLOCKED',
      authority: { kind: 'redis', dispatch_id: identity.dispatchId },
      reasonCode: 'completion_conflict',
      summary: 'Redis completion conflicts with terminal local state. Nova is failing closed instead of choosing a winner silently.',
      dispatchId: identity.dispatchId,
      gatewayLabel: identity.gatewayLabel,
      sessionKey: identity.sessionKey,
      metadata: { fail_count: status.fail_count },
    });
    const conflictCorrelation = {
      run_id: identity.runId,
      module_id: moduleId,
      attempt: identity.attempt,
      dispatch_id: identity.dispatchId,
      gateway_label: identity.gatewayLabel,
      session_key: identity.sessionKey,
    };
    await deps.discord(config, 'CRITICAL', `Module ${moduleId} completion conflict`,
      'Redis completion and local terminal state disagree. Nova is failing closed instead of choosing a winner silently.', [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, conflictCorrelation),
        { name: 'Redis Status', value: String((selectDefinedValue(() => (conflictStatus.redis_status), () => ('missing_redis_status')))) },
        { name: 'Local Status', value: String((selectDefinedValue(() => (localStatus), () => ('missing_local_status')))) },
        { name: 'Policy', value: String((selectDefinedValue(() => (conflictStatus.authority_policy?.code), () => ('redis_terminal_conflicts_with_terminal_status')))) },
      ],
      { correlation: conflictCorrelation },
    );
    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason: 'COMPLETION_CONFLICT',
      runId: identity.runId,
      moduleDir: dir,
      attempt: identity.attempt,
      phase: 'buster',
      dispatchId: identity.dispatchId,
      gatewayLabel: identity.gatewayLabel,
      sessionKey: identity.sessionKey,
      metadata: {
        redis_status: (selectDefinedValue(() => (conflictStatus.redis_status), () => (null))),
        local_status: localStatus,
        authority_policy: selectDefinedValue(() => (conflictStatus.authority_policy), () => (null)),
        status_authority: statusAuthority.source,
        drift: selectDefinedValue(() => (conflictStatus.drift), () => (null)),
      },
    }) };
  }
  if (['output_file_identity_mismatch', 'output_file_missing'].includes(reasonCode)) {
    const outputFailureLabel = reasonCode === 'output_file_missing'
      ? 'Buster output_file missing'
      : 'Buster output_file identity mismatch';
    const outputFailureDescription = reasonCode === 'output_file_missing'
      ? 'This is a Buster/runtime output artifact failure, not an app-code verdict. Forge output preserved.'
      : 'This is an infrastructure/correlation failure, not an app-code verdict. Forge output preserved.';
    const outputFailureAction = reasonCode === 'output_file_missing'
      ? 'Inspect why Buster did not write buster-output.json, then resume Buster.'
      : 'Inspect Buster output_file identity/correlation state, then resume Buster.';
    const reason = (selectDefinedValue(() => (workerMeta.status_message), () => (outputFailureLabel)));
    log('ERROR', `Module ${moduleId}: ${reason} — completion contract failure, not routing to Forge`);
    applyModuleRunnerCompletion({
      deps,
      config,
      dir,
      status,
      moduleId,
      phase: 'buster',
      attempt: identity.attempt,
      completionStatus: 'ERROR',
      authority: { kind: 'worker', dispatch_id: identity.dispatchId },
      reasonCode,
      summary: `${reason}. Completion contract failure — Forge cannot fix Buster output artifact failures.`,
      dispatchId: identity.dispatchId,
      gatewayLabel: identity.gatewayLabel,
      sessionKey: identity.sessionKey,
      metadata: {
        failure_class: reasonCode,
        status_authority: statusAuthority.source,
      },
    });
    const mismatchCorrelation = {
      run_id: identity.runId,
      module_id: moduleId,
      attempt: identity.attempt,
      dispatch_id: identity.dispatchId,
      gateway_label: identity.gatewayLabel,
      session_key: identity.sessionKey,
      model: selectDefinedValue(() => (completionIdentity.model), () => (null)),
      model_source: selectDefinedValue(() => (completionIdentity.model_source), () => (null)),
      reasoning_level: selectDefinedValue(() => (completionIdentity.reasoning_level), () => (null)),
      thinking_source: selectDefinedValue(() => (completionIdentity.thinking_source), () => (null)),
      runtime: selectDefinedValue(() => (completionIdentity.runtime), () => (null)),
    };
    await deps.discord(config, 'CRITICAL', `Module ${moduleId} FAILED — ${outputFailureLabel}`,
      `${reason}. ${outputFailureDescription}`, [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, mismatchCorrelation),
        { name: 'Action', value: outputFailureAction, inline: false },
      ],
      { correlation: mismatchCorrelation },
    );
    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason: `${outputFailureLabel} — completion contract failure (not sent to Forge)`,
      issueType: 'environment',
      runId: identity.runId,
      moduleDir: dir,
      attempt: identity.attempt,
      phase: 'buster',
      dispatchId: identity.dispatchId,
      gatewayLabel: identity.gatewayLabel,
      sessionKey: identity.sessionKey,
      metadata: {
        failure_class: reasonCode,
        status_authority: statusAuthority.source,
        forge_preserved: true,
        ...(statusAuthority.degraded ? { degraded: statusAuthority.degraded } : {}),
      },
    }) };
  }

  // Crash-retryable: timeout, parse corruption, catch-all
  if (!isLastBusterAttempt) {
    const reason = reasonCode === 'timeout'
      ? `Buster timed out (${timeout}min)`
      : reasonCode === 'parse_corrupted'
        ? 'local lifecycle snapshot corrupted'
        : `Poll failed: ${reasonCode}`;
    log('WARN', `Buster subagent crash (attempt ${busterAttempt}/${maxBusterCrashRetries + 1}): ${reason} — retrying Buster`);
    const retryDiscordCorrelation = {
      run_id: identity.runId,
      module_id: moduleId,
      attempt: identity.attempt,
      dispatch_id: identity.dispatchId,
      gateway_label: identity.gatewayLabel,
      session_key: identity.sessionKey,
    };
    await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
      `${reason}. Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: identity.sessionKey }),
      { correlation: retryDiscordCorrelation },
    );

    // Reset to READY_FOR_TESTING for next Buster attempt
    const retryTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: `Buster subagent crashed — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
    });
    deps.saveStatus(config, dir, status, retryTransition);
    return { retry: true, status: retryTransition.status };
  }

  // Last attempt exhausted — BLOCKED, not handleFail.
  // Buster crashing repeatedly is an infrastructure problem, not a code problem.
  // Forge can't fix it. Requires human intervention.
  log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);

  const crashAttemptBudget = maxBusterCrashRetries + 1;
  const crashAttemptSuffix = crashAttemptBudget === 1 ? '' : 's';
  const crashFailReason = reasonCode === 'timeout'
    ? `Buster timed out (${timeout}min)`
    : reasonCode === 'parse_corrupted'
      ? 'Buster lifecycle snapshot corrupted'
      : `Buster subagent crash: ${reasonCode}`;
  const blockedTelemetryReason = `Buster crash retries exhausted after ${crashAttemptBudget} attempt${crashAttemptSuffix} (${crashFailReason})`;
  const failEvent = buildTerminalBusterCrashFailEvent(
    status,
    mod,
    busterModel,
    status.status,
    crashFailReason,
    {
      sessionKey: identity.sessionKey,
      dispatchId: identity.dispatchId,
      gatewayLabel: identity.gatewayLabel,
    },
  );

  applyModuleRunnerCompletion({
    deps,
    config,
    dir,
    status,
    moduleId,
    phase: 'buster',
    attempt: identity.attempt,
    completionStatus: 'BLOCKED',
    authority: { kind: 'worker', dispatch_id: identity.dispatchId },
    reasonCode: 'buster_crash_retries_exhausted',
    summary: `Buster subagent crashed ${maxBusterCrashRetries + 1} times without producing a test result. Infrastructure issue — Forge cannot fix this.`,
    dispatchId: identity.dispatchId,
    gatewayLabel: identity.gatewayLabel,
    sessionKey: identity.sessionKey,
    metadata: { fail_count: status.fail_count },
  });
  await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedTelemetryReason, crashAttemptBudget);

  await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
    `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: identity.sessionKey }),
      { name: 'Last Reason', value: reasonCode },
      { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
    ], {
      correlation: {
        run_id: identity.runId,
        module_id: moduleId,
        attempt: identity.attempt,
        dispatch_id: identity.dispatchId,
        gateway_label: identity.gatewayLabel,
        session_key: identity.sessionKey,
      },
    });

  const terminalBuilder = reasonCode === 'timeout'
    ? buildModuleTimedOutTerminalResult
    : buildModuleBlockedTerminalResult;
  return { terminal: terminalBuilder(config, moduleId, {
    reason: reasonCode === 'timeout'
      ? `${crashFailReason} after ${crashAttemptBudget} attempt${crashAttemptSuffix} — not sent to Forge`
      : `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
    runId: identity.runId,
    moduleDir: dir,
    attempt: failEvent.attempt,
    phase: 'buster',
    dispatchId: failEvent.dispatch_id,
    gatewayLabel: failEvent.gateway_label,
    sessionKey: identity.sessionKey,
    metadata: {
      buster_crash_retries_exhausted: true,
      retry_attempts: maxBusterCrashRetries,
      reason_code: reasonCode,
    },
  }) };
}
