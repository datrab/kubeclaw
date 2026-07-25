import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
// runners/module-runner/attempt.ts — one module lifecycle attempt

import { selectDeps } from '../../core/deps.ts';
import { STATUS } from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import { validateBusterConfig } from '../../core/buster-config.ts';
import { resolvePolicy, logEffectivePolicy } from '../../core/policy.ts';
import { headHash, invalidateHeadHash } from '../../core/git-context.ts';
import { loadStatus, saveStatus, initStatus, savePrompt, saveStreamLog, applyModuleCompletion } from '../../services/status-store.ts';
import { releaseBlueprint } from '../../services/blueprint.ts';
import { extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames, classifyPreTestFailure, getPassedSuiteNames } from '../../services/failures/classification.ts';
import { buildPreTestDiscordFields } from '../../services/failures/presentation.ts';
import { handleFail } from '../../services/failures/retry-policy.ts';
import { sleep, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, pollForgeCompletionWithRateLimitRecovery, archiveModuleCompletions } from '../../services/polling.ts';
import {
  resolveStatusCorrelationProvenance,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from '../../services/correlation.ts';
import { assertPipelineStepResult } from '../../services/contracts/pipeline-step-result.ts';
import { modelToHarness } from '../../agents/runtime.ts';
import {
  acpLabel,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  verifyAgentHealth,
  runModuleForgeWorker,
  runModuleBusterWorker,
} from '../../agents/orchestration.ts';
import { getTrackedAgent } from '../../agents/lifecycle.ts';
import { setShutdownContext, clearShutdownContext } from '../../agents/shutdown.ts';
import { discord } from '../../integrations/discord.ts';
import { gitCommitAndPush } from '../../integrations/git-worktree.ts';
import { gitSyncBeforeBuster } from '../../services/git-sync-before-buster.ts';
import { buildForgePrompt } from '../../prompts/forge.ts';
import { buildBusterModulePrompt } from '../../prompts/buster-module.ts';
import { checkDependencies } from '../../services/dependencies.ts';
import { runPreflightValidation, formatValidationFailures } from '../../services/validation.ts';
import { emitTerminalModuleFailTelemetry } from '../module-runner-shared.ts';
import { runModuleAttemptStateMachine } from './state-machine.ts';
import { buildModuleErrorTerminalResult } from './terminal-results.ts';
import { getPipelineDefaultsConfig } from '../../services/runtime-defaults.ts';

type AnyRecord = Record<string, any>;

function moduleTimeoutAuthority(mod: AnyRecord, pipelineDefaults: AnyRecord): number {
  const value = mod?.timeout_minutes;
  if (value !== undefined && value !== null) {
    const timeout = Number(value);
    if (Number.isFinite(timeout) && timeout > 0) return timeout;
    throw new Error('Module timeout_minutes must be a positive number when provided');
  }
  const defaultTimeout = Number(pipelineDefaults?.timeout_minutes);
  if (Number.isFinite(defaultTimeout) && defaultTimeout > 0) return defaultTimeout;
  throw new Error('Module timeout requires pipeline defaults timeout_minutes');
}

function dependencyFailureStatusAuthority(dependencyStatus: AnyRecord | null): string {
  if (typeof dependencyStatus?.status === 'string' && dependencyStatus.status.trim()) return dependencyStatus.status.trim();
  return STATUS.PENDING;
}

const DEFAULT_DEPS = {
  checkDependencies,
  sleep,
  loadStatus,
  saveStatus,
  applyModuleCompletion,
  initStatus,
  savePrompt,
  saveStreamLog,
  releaseBlueprint,
  handleFail,
  extractAgentFailReason,
  extractPreTestFailReason,
  getFailedSuiteNames,
  classifyPreTestFailure,
  getPassedSuiteNames,
  buildPreTestDiscordFields,
  pollWithRateLimitRecovery,
  pollDualWithRateLimitRecovery,
  pollForgeCompletionWithRateLimitRecovery,
  archiveModuleCompletions,
  acpLabel,
  modelToHarness,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  verifyAgentHealth,
  runModuleForgeWorker,
  runModuleBusterWorker,
  setShutdownContext,
  clearShutdownContext,
  getTrackedAgent,
  discord,
  gitSyncBeforeBuster,
  gitCommitAndPush,
  buildForgePrompt,
  buildBusterModulePrompt,
  resolvePolicy,
  logEffectivePolicy,
  validateBusterConfig,
  headHash,
  invalidateHeadHash,
  runPreflightValidation,
  formatValidationFailures,
};

export function getModuleRunnerDeps(config: AnyRecord, overrides: AnyRecord = {}) {
  return { ...DEFAULT_DEPS, ...selectDeps(overrides, 'moduleRunner'), _explicitDeps: overrides };
}

export function resolveModuleRunContext(config: AnyRecord, progress: AnyRecord, moduleId: string) {
  const mod = progress.modules[moduleId];
  if (!mod) throw new Error(`Module ${moduleId} not in progress.json`);
  const pipelineDefaults = getPipelineDefaultsConfig(config);

  return {
    mod,
    dir: mod.dir,
    timeout: moduleTimeoutAuthority(mod, pipelineDefaults),
    maxFails: mod.max_fails
  };
}

function assertTypedModuleAttemptTerminal(terminal: AnyRecord = {}) {
  if (selectTruthyValue(() => (!terminal), () => (terminal.retry))) return terminal;
  return {
    ...terminal,
    result: assertPipelineStepResult(terminal.result),
  };
}

/**
 * Execute one complete module attempt. Stages determine which phases run:
 *   ['forge', 'buster'] — full cycle (default)
 *   ['forge']           — build only, PASS after Forge
 *   ['buster']          — test only, skip Forge
 *
 * @returns { retry: true, fail_count: number } - auto-retry, loop again
 * @returns { retry: false, result: object }    - done, with canonical PipelineStepResult
 */
export async function executeModuleAttempt({
  config,
  progress,
  moduleId,
  novaPrompt = null,
  deps = getModuleRunnerDeps(config),
}: AnyRecord = {}) {
  const { mod, dir, timeout, maxFails } = resolveModuleRunContext(config, progress, moduleId);
  const dependencyState = deps.checkDependencies(config, progress, moduleId);
  if (!dependencyState.met) {
    const dependencyStatus = deps.loadStatus(config, dir);
    const reason = `Dependencies not met: ${dependencyState.reason}`;
    log('ERROR', `Module ${moduleId} dependencies not met: ${dependencyState.reason}`);
    emitTerminalModuleFailTelemetry({ config, moduleId, status: dependencyStatus, mod, phase: 'dependency_check', model: null, oldStatus: dependencyFailureStatusAuthority(dependencyStatus), reason });
    return buildModuleErrorTerminalResult(config, moduleId, {
      reason,
      moduleDir: dir,
      attempt: selectDefinedValue(() => (selectDefinedValue(() => (dependencyStatus?.active_agent?.attempt), () => (dependencyStatus?.attempt))), () => (null)),
      phase: 'dependency_check',
      dispatchId: resolveStatusDispatchId(dependencyStatus),
      gatewayLabel: resolveStatusGatewayLabel(dependencyStatus),
      sessionKey: resolveStatusSessionKey(dependencyStatus),
      correlationProvenance: resolveStatusCorrelationProvenance(dependencyStatus),
    });
  }

  const handleModuleFail = (statusValue: AnyRecord, phase: string, reason: string, opts: AnyRecord = {}) => (
    deps.handleFail({ config, status: statusValue, moduleDir: dir, moduleId, maxFails, phase, reason, opts: { progress, ...opts } })
  );

  return assertTypedModuleAttemptTerminal(await runModuleAttemptStateMachine({
    config,
    progress,
    moduleId,
    mod,
    dir,
    timeout,
    maxFails,
    novaPrompt,
    deps,
    status: deps.loadStatus(config, dir),
    handleModuleFail,
  }) as AnyRecord);
}
