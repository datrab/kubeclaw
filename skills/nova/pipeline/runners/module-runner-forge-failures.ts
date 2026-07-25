import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { finalizeModuleSessionRateLimitExit, getRateLimitConfig } from '../services/rate-limit.ts';
import { normalizeGitFailureClass } from '../services/failure-semantics.ts';
import { assertPipelineStepResult } from '../services/contracts/pipeline-step-result.ts';
import { applyModuleRunnerCompletion } from './module-runner/completions.ts';
import { currentAttemptNumber, emitTerminalModuleFailTelemetry, _telemetryCtx } from './module-runner-shared.ts';
import { emitOperatorAlert } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  buildModuleErrorTerminalResult, buildModuleRateLimitedTerminalResult, buildRetryResult,
} from './module-runner/terminal-results.ts';

type AnyRecord = Record<string, any>;

function firstText(values: unknown[], fallback: string) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function result(context: AnyRecord, terminal: AnyRecord) {
  return { status: context.status, recalledMemoryIds: context.recalledMemoryIds, terminal };
}

async function fail(context: AnyRecord, reason: string, options: AnyRecord = {}) {
  const failed = await context.handleFail(context.status, 'forge', reason, { recalledMemoryIds: context.recalledMemoryIds, ...options });
  const terminal = failed._retry
    ? buildRetryResult(failed, context.status)
    : { retry: false, result: assertPipelineStepResult(failed) };
  return result(context, terminal);
}

function errorTerminal(context: AnyRecord, reason: string, metadata: AnyRecord = {}) {
  return result(context, buildModuleErrorTerminalResult(context.config, context.moduleId, {
    reason, moduleDir: context.dir, attempt: currentAttemptNumber(context.status), phase: 'forge',
    gatewayLabel: resolveStatusGatewayLabel(context.status), sessionKey: context.sessionKey, ...metadata,
  }));
}

async function spawnFailure(context: AnyRecord) {
  const metadata = context.worker.metadata;
  const reason = `Forge spawn failed: ${metadata.error}`;
  const gatewayLabel = metadata.gateway_label ?? resolveStatusGatewayLabel(context.status);
  const sessionKey = metadata.session_key ?? resolveStatusSessionKey(context.status);
  log('ERROR', `Module ${context.moduleId}, attempt ${context.status.fail_count + 1}/${context.maxFails}: forge agent spawn failed: ${metadata.error}`);
  await emitOperatorAlert(_telemetryCtx(context.config, context.deps._explicitDeps), 'module.operator_alert', {
    module_id: context.moduleId, phase: 'forge', attempt: currentAttemptNumber(context.status), gateway_label: gatewayLabel, session_key: sessionKey,
  }, {
    hookId: 'module.completed', moduleId: context.moduleId, attempt: currentAttemptNumber(context.status),
    presentation: { discord: {
      level: 'CRITICAL', title: `Module ${context.moduleId} — Forge Spawn Failed`, description: reason,
      fields: [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
          run_id: getRunId(context.config), module_id: context.moduleId,
          attempt: currentAttemptNumber(context.status), gateway_label: gatewayLabel, session_key: sessionKey,
        }),
        { name: 'Status', value: 'ERROR' }, { name: 'Action', value: 'Inspect Forge runtime and retry the module' },
      ],
    } },
  });
  emitTerminalModuleFailTelemetry({
    config: context.config, moduleId: context.moduleId, status: context.status, mod: context.mod,
    phase: 'forge', model: context.policy.model, oldStatus: context.status?.status ?? STATUS.IN_PROGRESS,
    reason, correlation: { gatewayLabel, sessionKey },
  });
  return errorTerminal(context, reason, { gatewayLabel, sessionKey });
}

async function noWorkFailure(context: AnyRecord) {
  const base = 'Forge session ended but produced no typed meaningful-diff completion evidence';
  const reason = context.terminalDetail ? `${base} (${context.terminalDetail})` : base;
  await emitOperatorAlert(_telemetryCtx(context.config, context.deps._explicitDeps), 'module.operator_alert', {
    module_id: context.moduleId, phase: 'forge', attempt: currentAttemptNumber(context.status),
    gateway_label: resolveStatusGatewayLabel(context.status), session_key: context.sessionKey,
  }, { hookId: 'module.completed', moduleId: context.moduleId, attempt: currentAttemptNumber(context.status) });
  return fail(context, reason);
}

async function rateLimitFailure(context: AnyRecord) {
  const reason = 'Rate limit pauses exceeded maximum — pipeline halted';
  const metadata = context.worker.metadata;
  const exit = await finalizeModuleSessionRateLimitExit({
    reason: context.worker.reason, rate_limit_status: metadata.rate_limit_status,
    rate_limit_pauses: metadata.rate_limit_pauses, max_rate_limit_pauses: metadata.max_rate_limit_pauses,
    status: metadata.rate_limit_status,
  }, {
    config: context.config, moduleId: context.moduleId, moduleDir: context.dir, phase: 'forge',
    notifyDiscord: context.deps.discord, discordTitle: `Module ${context.moduleId} RATE LIMITED`,
    discordDescription: (value: AnyRecord) => `Forge attempt ${value.attempt} exceeded max ACP rate limit pauses (${value.max_rate_limit_pauses}). Pipeline cannot continue.`,
    reason, identity: {
      run_id: getRunId(context.config), attempt: currentAttemptNumber(context.status),
      gateway_label: metadata.gateway_label ?? resolveStatusGatewayLabel(context.status), session_key: context.sessionKey,
    },
    maxPauses: getRateLimitConfig(context.config).max_pauses_per_module,
    logLevel: 'ERROR', logMessage: `Module ${context.moduleId} rate limit pauses exhausted in forge phase`,
  } as AnyRecord);
  return result(context, buildModuleRateLimitedTerminalResult(context.config, context.moduleId, {
    rateLimitResult: exit, reason, runId: exit.run_id, moduleDir: context.dir,
    attempt: Number(exit.attempt), phase: 'forge', gatewayLabel: exit.gateway_label, sessionKey: exit.session_key,
  }));
}

async function invalidCompletion(context: AnyRecord) {
  const detail = context.terminalErrors.length ? context.terminalErrors.join('; ') : 'invalid Forge completion artifact';
  applyModuleRunnerCompletion({
    deps: context.deps, config: context.config, dir: context.dir, status: context.status,
    moduleId: context.moduleId, phase: 'forge', attempt: currentAttemptNumber(context.status),
    completionStatus: 'ERROR', authority: { kind: 'artifact', path: 'forge-completion.json' },
    reasonCode: 'invalid_contract', summary: detail,
    gatewayLabel: resolveStatusGatewayLabel(context.status), sessionKey: resolveStatusSessionKey(context.status) ?? context.sessionKey,
    metadata: { failure_class: 'invalid_contract', status_errors: context.terminalErrors },
  });
  return fail(context, detail, { discordFields: [{ name: 'Contract', value: 'forge-completion.json' }] });
}

function gitFailure(context: AnyRecord) {
  const metadata = context.worker.metadata;
  const failureClass = normalizeGitFailureClass(firstText([
    context.terminalMessage, context.terminalDetail, context.worker.summary, context.worker.reason,
  ], 'git_sync_failed')) || 'git_sync_failed';
  return errorTerminal(context, context.terminalMessage || 'Polling git sync failed closed during Forge phase', {
    terminalReasonCode: failureClass, terminalSource: 'module:forge_git',
    metadata: { failure_class: failureClass, polling_git: metadata.polling_git ?? null },
  });
}

export async function resolveForgeFailure(context: AnyRecord) {
  const reason = context.worker.reason;
  if (reason === 'spawn_failed') return spawnFailure(context);
  if (reason === 'healthcheck_failed') return fail(context, 'Forge agent failed health check — session not running after spawn');
  if (new Set(['session_ended_no_changes', 'agent_ended_no_meaningful_diff', 'session_ended_no_meaningful_diff']).has(reason)) return noWorkFailure(context);
  if (reason === 'timeout') return fail(context, `TIMEOUT: Forge did not complete within ${context.timeout} minutes`, { isTimeout: true });
  if (reason === 'rate_limit_exhausted') return rateLimitFailure(context);
  if (reason === 'invalid_forge_completion') return invalidCompletion(context);
  if (reason === 'parse_corrupted') return fail(context, 'Forge completion artifact is permanently corrupted (unparseable after multiple attempts)');
  if (reason === 'git_error') return gitFailure(context);
  const failure = firstText([
    context.terminalDetail, context.terminalMessage, context.worker.summary, reason,
  ], 'Forge completion artifact was not produced');
  return fail(context, failure);
}
