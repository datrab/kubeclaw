// runners/module-runner/attempt.ts — one module lifecycle attempt

import { selectDeps } from '../../core/deps.ts';
import { STATUS } from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import { validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../../core/config.ts';
import { headHash, invalidateHeadHash } from '../../core/git-context.ts';
import { loadStatus, saveStatus, initStatus, savePrompt, saveStreamLog } from '../../services/status-store.ts';
import { releaseBlueprint } from '../../services/blueprint.ts';
import { extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames, classifyPreTestFailure, getPassedSuiteNames } from '../../services/failures/classification.ts';
import { buildPreTestDiscordFields } from '../../services/failures/presentation.ts';
import { handleFail } from '../../services/failures/retry-policy.ts';
import { sleep, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, archiveModuleCompletions } from '../../services/polling.ts';
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
  runModuleForgeWorker,
  runModuleBusterWorker,
} from '../../agents/orchestration.ts';
import { getTrackedAgent } from '../../agents/lifecycle.ts';
import { setShutdownContext, clearShutdownContext } from '../../agents/shutdown.ts';
import { discord } from '../../integrations/discord.ts';
import { gitSyncBeforeBuster, gitCommitAndPush } from '../../integrations/git-worktree.ts';
import { buildForgePrompt } from '../../prompts/forge.ts';
import { buildBusterModulePrompt } from '../../prompts/buster-module.ts';
import { checkDependencies } from '../../services/dependencies.ts';
import { runPreflightValidation, formatValidationFailures } from '../../services/validation.ts';
import { emitTerminalModuleFailTelemetry } from '../module-runner-shared.ts';
import { runModuleAttemptStateMachine } from './state-machine.ts';
import { buildModuleErrorTerminalResult } from './terminal-results.ts';

type AnyRecord = Record<string, any>;

const DEFAULT_DEPS = {
  checkDependencies,
  sleep,
  loadStatus,
  saveStatus,
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
  archiveModuleCompletions,
  acpLabel,
  modelToHarness,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
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

  return {
    mod,
    dir: mod.dir,
    timeout: mod.timeout_minutes ?? config.default_timeout_minutes,
    maxFails: mod.max_fails ?? config.default_max_fails,
  };
}

function assertTypedModuleAttemptTerminal(terminal: AnyRecord = {}) {
  if (!terminal || terminal.retry) return terminal;
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
    emitTerminalModuleFailTelemetry(config, moduleId, dependencyStatus, mod, 'dependency_check', null, dependencyStatus?.status ?? STATUS.PENDING, reason);
    return buildModuleErrorTerminalResult(config, moduleId, {
      reason,
      moduleDir: dir,
      attempt: dependencyStatus?.active_agent?.attempt ?? dependencyStatus?.attempt ?? null,
      phase: 'dependency_check',
      dispatchId: resolveStatusDispatchId(dependencyStatus),
      gatewayLabel: resolveStatusGatewayLabel(dependencyStatus),
      sessionKey: resolveStatusSessionKey(dependencyStatus),
      correlationProvenance: resolveStatusCorrelationProvenance(dependencyStatus),
    });
  }

  const handleModuleFail = (statusValue: AnyRecord, phase: string, reason: string, opts: AnyRecord = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
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
  }));
}

export default executeModuleAttempt;
