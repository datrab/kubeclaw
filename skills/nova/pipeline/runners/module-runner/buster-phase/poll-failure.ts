import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { getRunId } from '../../../core/runtime.ts';
import { finalizeModuleSessionRateLimitExit } from '../../../services/rate-limit.ts';
import {
  transitionModuleStatus,
  markModuleBlocked,
} from '../../../lifecycle-state.ts';
import {
  buildTerminalBusterCrashFailEvent,
  currentAttemptNumber,
  emitTerminalBusterCrashTelemetry,
} from '../../module-runner-shared.ts';
import {
  resolveCompletionDispatchId,
  resolveCompletionGatewayLabel,
  resolveCompletionSessionKey,
} from './identity.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleErrorTerminalResult,
  buildModuleRateLimitedTerminalResult,
} from '../terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function resolvePollFailureStatusAuthority({ busterWorkerControlResult, status }: AnyRecord = {}) {
  const metadata = workerMetadata(busterWorkerControlResult);
  if (metadata.final_status) {
    return { status: metadata.final_status, source: 'worker_final_status' };
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
  const workerSessionKey = workerMeta.session_key || busterSessionKey || redisEntry?.session_key || null;
  const pollSessionKey = resolveCompletionSessionKey(status, completionIdentity, workerSessionKey, redisEntry);
  const reasonCode = workerMeta.reason || 'unknown';

  if (reasonCode === 'rate_limit_exhausted') {
    const rateLimitReason = 'Rate limit pauses exceeded maximum during Buster phase';
    const busterRateLimitExit = await finalizeModuleSessionRateLimitExit({
      reason: reasonCode,
      rate_limit_status: workerMeta.rate_limit_status || null,
      rate_limit_pauses: workerMeta.rate_limit_pauses ?? null,
      max_rate_limit_pauses: workerMeta.max_rate_limit_pauses ?? null,
      status: workerMeta.rate_limit_status || null,
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
        run_id: completionIdentity.runId || getRunId(config),
        attempt: completionIdentity.attempt ?? currentAttemptNumber(status),
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: resolveCompletionGatewayLabel(status, completionIdentity),
        session_key: pollSessionKey,
      },
      maxPauses: config.rate_limit.max_pauses_per_module,
      logLevel: 'ERROR',
      logMessage: `Module ${moduleId} rate limit pauses exhausted in buster phase`,
    } as AnyRecord);
    return { terminal: buildModuleRateLimitedTerminalResult(config, moduleId, {
      rateLimitResult: busterRateLimitExit,
      reason: rateLimitReason,
      runId: busterRateLimitExit.run_id ?? completionIdentity.runId ?? getRunId(config),
      moduleDir: dir,
      attempt: busterRateLimitExit.attempt ?? completionIdentity.attempt ?? currentAttemptNumber(status),
      phase: 'buster',
      dispatchId: busterRateLimitExit.dispatch_id ?? completionIdentity.dispatchId,
      gatewayLabel: busterRateLimitExit.gateway_label ?? resolveCompletionGatewayLabel(status, completionIdentity),
      sessionKey: busterRateLimitExit.session_key ?? pollSessionKey,
    }) };
  }
  if (reasonCode === 'git_error') {
    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason: workerMeta.status_message || 'Polling git sync failed closed during Buster phase',
      runId: completionIdentity.runId ?? getRunId(config),
      moduleDir: dir,
      attempt: completionIdentity.attempt ?? currentAttemptNumber(status),
      phase: 'buster',
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: resolveCompletionGatewayLabel(status, completionIdentity),
      sessionKey: pollSessionKey,
      metadata: {
        polling_git: workerMeta.polling_git || null,
        status_authority: statusAuthority.source,
        ...(statusAuthority.degraded ? { degraded: statusAuthority.degraded } : {}),
      },
    }) };
  }
  if (reasonCode === 'completion_conflict') {
    const conflictStatus = workerMeta.completion_conflict || {};
    const localStatus = conflictStatus.local_status || status?.status || null;
    log('ERROR', `Module ${moduleId}: Redis completion conflicts with terminal local state — failing closed`);
    const blockedTransition = markModuleBlocked(
      status,
      'buster',
      'Redis completion conflicts with terminal local state. Nova is failing closed instead of choosing a winner silently.',
      { reason: 'completion_conflict' },
    );
    deps.saveStatus(config, dir, status, blockedTransition);
    const conflictCorrelation = {
      run_id: completionIdentity.runId ?? getRunId(config),
      module_id: moduleId,
      attempt: completionIdentity.attempt ?? currentAttemptNumber(status),
      dispatch_id: completionIdentity.dispatchId || null,
      gateway_label: completionIdentity.gateway_label || null,
      session_key: pollSessionKey,
    };
    await deps.discord(config, 'CRITICAL', `Module ${moduleId} completion conflict`,
      'Redis completion and local terminal state disagree. Nova is failing closed instead of choosing a winner silently.', [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, conflictCorrelation),
        { name: 'Redis Status', value: String(conflictStatus.redis_status || conflictStatus.status || 'unknown') },
        { name: 'Local Status', value: String(localStatus || 'unknown') },
        { name: 'Policy', value: String(conflictStatus.authority_policy?.code || 'redis_terminal_conflicts_with_terminal_status') },
      ],
      { correlation: conflictCorrelation },
    );
    return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
      reason: 'COMPLETION_CONFLICT',
      runId: completionIdentity.runId ?? getRunId(config),
      moduleDir: dir,
      attempt: completionIdentity.attempt ?? currentAttemptNumber(status),
      phase: 'buster',
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: resolveCompletionGatewayLabel(status, completionIdentity),
      sessionKey: pollSessionKey,
      metadata: {
        redis_status: conflictStatus.redis_status || conflictStatus.status || null,
        local_status: localStatus,
        authority_policy: conflictStatus.authority_policy || null,
        status_authority: statusAuthority.source,
        drift: conflictStatus.drift || null,
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
      run_id: completionIdentity.runId ?? completionIdentity.run_id ?? getRunId(config),
      module_id: moduleId,
      attempt: currentAttemptNumber(status),
      dispatch_id: resolveCompletionDispatchId(status, completionIdentity),
      gateway_label: resolveCompletionGatewayLabel(status, completionIdentity),
      session_key: pollSessionKey,
    };
    await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
      `${reason}. Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: pollSessionKey }),
      { correlation: retryDiscordCorrelation },
    );

    // Reset to READY_FOR_TESTING for next Buster attempt
    const retryTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: `Buster subagent crashed — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
    });
    deps.saveStatus(config, dir, status, retryTransition);
    return { retry: true, status };
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
  const crashDispatchId = resolveCompletionDispatchId(status, completionIdentity);
  const crashGatewayLabel = resolveCompletionGatewayLabel(status, completionIdentity);
  const failEvent = buildTerminalBusterCrashFailEvent(
    status,
    mod,
    busterModel,
    status.status,
    crashFailReason,
    {
      sessionKey: pollSessionKey,
      dispatchId: crashDispatchId,
      gatewayLabel: crashGatewayLabel,
    },
  );

  const blockedTransition = markModuleBlocked(
    status,
    'buster',
    `Buster subagent crashed ${maxBusterCrashRetries + 1} times without producing a test result. Infrastructure issue — Forge cannot fix this.`,
    { reason: 'buster_crash_retries_exhausted' },
  );
  deps.saveStatus(config, dir, status, blockedTransition);
  await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent, blockedTelemetryReason, crashAttemptBudget);

  await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
    `Buster subagent crashed ${maxBusterCrashRetries + 1} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: pollSessionKey }),
      { name: 'Last Reason', value: reasonCode || 'unknown (no error detail available)' },
      { name: 'Crash Retries', value: `${maxBusterCrashRetries}` },
    ], {
      correlation: {
        run_id: completionIdentity.runId ?? completionIdentity.run_id ?? getRunId(config),
        module_id: moduleId,
        attempt: currentAttemptNumber(status),
        dispatch_id: crashDispatchId,
        gateway_label: crashGatewayLabel,
        session_key: pollSessionKey,
      },
    });

  return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
    reason: `Buster subagent crashed ${maxBusterCrashRetries + 1} times — infrastructure issue (not sent to Forge)`,
    runId: completionIdentity.runId ?? getRunId(config),
    moduleDir: dir,
    attempt: failEvent.attempt,
    phase: 'buster',
    dispatchId: failEvent.dispatch_id,
    gatewayLabel: failEvent.gateway_label,
    sessionKey: pollSessionKey,
  }) };
}
