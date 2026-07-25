import { log } from '../../../core/logger.ts';
import { finalizeModuleSessionRateLimitExit, getRateLimitConfig } from '../../../services/rate-limit.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleErrorTerminalResult,
  buildModuleRateLimitedTerminalResult,
} from '../terminal-results.ts';
import { applyModuleRunnerCompletion } from '../completions.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function completionCorrelation(context: AnyRecord) {
  const { moduleId, identity } = context;
  return {
    run_id: identity.runId,
    module_id: moduleId,
    attempt: identity.attempt,
    dispatch_id: identity.dispatchId,
    gateway_label: identity.gatewayLabel,
    session_key: identity.sessionKey,
  };
}

export async function handleRateLimitPollFailure(context: AnyRecord) {
  const { config, moduleId, dir, deps, workerMeta, identity, completionIdentity, requireRateLimitIdentity } = context;
  const reason = 'Rate limit pauses exceeded maximum during Buster phase';
  const exit = await finalizeModuleSessionRateLimitExit({
    reason: 'rate_limit_exhausted',
    rate_limit_status: workerMeta.rate_limit_status ?? null,
    rate_limit_pauses: workerMeta.rate_limit_pauses ?? null,
    max_rate_limit_pauses: workerMeta.max_rate_limit_pauses ?? null,
    status: workerMeta.rate_limit_status ?? null,
  }, {
    config, moduleId, moduleDir: dir, phase: 'buster', notifyDiscord: deps.discord,
    discordTitle: `Module ${moduleId} RATE LIMITED (Buster)`,
    discordDescription: (result: AnyRecord) => `Buster attempt ${result.attempt} exceeded max ACP rate limit pauses (${result.max_rate_limit_pauses}).`,
    discordIdentity: completionIdentity,
    reason,
    identity: { run_id: identity.runId, attempt: identity.attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gatewayLabel, session_key: identity.sessionKey },
    maxPauses: getRateLimitConfig(config).max_pauses_per_module,
    logLevel: 'ERROR',
    logMessage: `Module ${moduleId} rate limit pauses exhausted in buster phase`,
  } as AnyRecord);
  const exitIdentity = requireRateLimitIdentity(exit);
  return { terminal: buildModuleRateLimitedTerminalResult(config, moduleId, {
    rateLimitResult: exit, reason, runId: exitIdentity.runId, moduleDir: dir,
    attempt: exitIdentity.attempt, phase: 'buster', dispatchId: exitIdentity.dispatchId,
    gatewayLabel: exitIdentity.gatewayLabel, sessionKey: exitIdentity.sessionKey,
  }) };
}

export function handleGitPollFailure(context: AnyRecord) {
  const { config, moduleId, dir, workerMeta, identity, statusAuthority } = context;
  return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
    reason: workerMeta.status_message ?? 'Polling git sync failed closed during Buster phase',
    runId: identity.runId, moduleDir: dir, attempt: identity.attempt, phase: 'buster',
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: {
      polling_git: workerMeta.polling_git ?? null,
      status_authority: statusAuthority.source,
      ...(statusAuthority.degraded ? { degraded: statusAuthority.degraded } : {}),
    },
  }) };
}

export async function handleCompletionConflictPollFailure(context: AnyRecord) {
  const { config, moduleId, dir, status, deps, workerMeta, identity, statusAuthority } = context;
  const conflict = workerMeta.completion_conflict && typeof workerMeta.completion_conflict === 'object' ? workerMeta.completion_conflict : {};
  const localStatus = conflict.local_status ?? null;
  log('ERROR', `Module ${moduleId}: Redis completion conflicts with terminal local state — failing closed`);
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt: identity.attempt,
    completionStatus: 'BLOCKED', authority: { kind: 'redis', dispatch_id: identity.dispatchId },
    reasonCode: 'completion_conflict',
    summary: 'Redis completion conflicts with terminal local state. Nova is failing closed instead of choosing a winner silently.',
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { fail_count: status.fail_count },
  });
  const correlation = completionCorrelation(context);
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} completion conflict`,
    'Redis completion and local terminal state disagree. Nova is failing closed instead of choosing a winner silently.', [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation),
      { name: 'Redis Status', value: String(conflict.redis_status ?? 'missing_redis_status') },
      { name: 'Local Status', value: String(localStatus ?? 'missing_local_status') },
      { name: 'Policy', value: String(conflict.authority_policy?.code ?? 'redis_terminal_conflicts_with_terminal_status') },
    ], { correlation });
  return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
    reason: 'COMPLETION_CONFLICT', runId: identity.runId, moduleDir: dir, attempt: identity.attempt,
    phase: 'buster', dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { redis_status: conflict.redis_status ?? null, local_status: localStatus, authority_policy: conflict.authority_policy ?? null, status_authority: statusAuthority.source, drift: conflict.drift ?? null },
  }) };
}

function outputFailureDetails(reasonCode: string) {
  if (reasonCode === 'output_file_missing') return {
    label: 'Buster output_file missing',
    description: 'This is a Buster/runtime output artifact failure, not an app-code verdict. Forge output preserved.',
    action: 'Inspect why Buster did not write buster-output.json, then resume Buster.',
  };
  return {
    label: 'Buster output_file identity mismatch',
    description: 'This is an infrastructure/correlation failure, not an app-code verdict. Forge output preserved.',
    action: 'Inspect Buster output_file identity/correlation state, then resume Buster.',
  };
}

export async function handleOutputContractPollFailure(context: AnyRecord) {
  const { config, moduleId, dir, status, deps, workerMeta, identity, statusAuthority, completionIdentity, reasonCode } = context;
  const details = outputFailureDetails(reasonCode);
  const reason = workerMeta.status_message ?? details.label;
  log('ERROR', `Module ${moduleId}: ${reason} — completion contract failure, not routing to Forge`);
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt: identity.attempt,
    completionStatus: 'ERROR', authority: { kind: 'worker', dispatch_id: identity.dispatchId },
    reasonCode, summary: `${reason}. Completion contract failure — Forge cannot fix Buster output artifact failures.`,
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { failure_class: reasonCode, status_authority: statusAuthority.source },
  });
  const correlation = {
    ...completionCorrelation(context),
    model: completionIdentity.model ?? null, model_source: completionIdentity.model_source ?? null,
    reasoning_level: completionIdentity.reasoning_level ?? null, thinking_source: completionIdentity.thinking_source ?? null,
    runtime: completionIdentity.runtime ?? null,
  };
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} FAILED — ${details.label}`, `${reason}. ${details.description}`, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation),
    { name: 'Action', value: details.action, inline: false },
  ], { correlation });
  return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
    reason: `${details.label} — completion contract failure (not sent to Forge)`, issueType: 'environment',
    runId: identity.runId, moduleDir: dir, attempt: identity.attempt, phase: 'buster',
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { failure_class: reasonCode, status_authority: statusAuthority.source, forge_preserved: true, ...(statusAuthority.degraded ? { degraded: statusAuthority.degraded } : {}) },
  }) };
}
