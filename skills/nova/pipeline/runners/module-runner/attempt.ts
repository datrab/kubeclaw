// runners/module-runner/attempt.ts — one module lifecycle attempt

import { selectDeps } from '../../core/deps.ts';
import {
  STATUS,
  EXIT_OK,
  EXIT_ERROR,
  EXIT_BLOCKED,
  EXIT_TIMEOUT,
  EXIT_RATE_LIMITED,
  EXIT_NEEDS_NOVA,
} from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import { validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../../core/config.ts';
import { headHash, invalidateHeadHash } from '../../core/git-context.ts';
import { getRunId } from '../../core/runtime.ts';
import { loadStatus, saveStatus, initStatus, savePrompt, saveStreamLog } from '../../services/status-store.ts';
import { releaseBlueprint } from '../../services/blueprint.ts';
import { extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames, classifyPreTestFailure, getPassedSuiteNames } from '../../services/failures/classification.ts';
import { buildPreTestDiscordFields } from '../../services/failures/presentation.ts';
import { handleFail } from '../../services/failures/retry-policy.ts';
import { sleep, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, archiveModuleCompletions } from '../../services/polling.ts';
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
  resolveResultSessionKey,
  resolveStatusCorrelationProvenance,
} from '../../services/correlation.ts';
import {
  PIPELINE_STEP_TYPES,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  buildPipelineStepResult,
  isPipelineStepResult,
} from '../../services/contracts/pipeline-step-result.ts';
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

function buildTypedModuleAttemptTerminal(config: AnyRecord, moduleId: string, terminal: AnyRecord = {}) {
  if (!terminal || terminal.retry) return terminal;
  return {
    ...terminal,
    result: buildTypedModuleAttemptResult(config, moduleId, terminal.result),
  };
}

function moduleTerminalOutcomeForExit(exit: unknown) {
  const exitCode = Number(exit);
  if (exitCode === EXIT_OK) return PIPELINE_STEP_OUTCOMES.PASSED;
  if (exitCode === EXIT_BLOCKED) return PIPELINE_STEP_OUTCOMES.BLOCKED;
  if (exitCode === EXIT_TIMEOUT) return PIPELINE_STEP_OUTCOMES.TIMEOUT;
  if (exitCode === EXIT_RATE_LIMITED) return PIPELINE_STEP_OUTCOMES.RATE_LIMITED;
  if (exitCode === EXIT_NEEDS_NOVA) return PIPELINE_STEP_OUTCOMES.NEEDS_NOVA;
  return PIPELINE_STEP_OUTCOMES.ERROR;
}

function moduleTerminalIssueType(outcome: string) {
  if (outcome === PIPELINE_STEP_OUTCOMES.NEEDS_NOVA) return 'code';
  if (outcome === PIPELINE_STEP_OUTCOMES.BLOCKED) return 'policy';
  return 'environment';
}

function buildTypedModuleAttemptResult(config: AnyRecord, moduleId: string, result: unknown = {}) {
  if (isPipelineStepResult(result)) return result;
  const rawResult: AnyRecord = result && typeof result === 'object' ? (result as AnyRecord) : {};
  const diagnostics = rawResult.diagnostics || {};
  const activeStatus = rawResult.status || null;
  const outcome = moduleTerminalOutcomeForExit(rawResult.exit);
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: outcome === PIPELINE_STEP_OUTCOMES.PASSED ? PIPELINE_STEP_ACTIONS.CONTINUE : PIPELINE_STEP_ACTIONS.HALT,
    outcome,
    issueType: moduleTerminalIssueType(outcome),
    reason: rawResult.reason || rawResult.status || diagnostics?.summary || null,
    correlation: {
      run_id: getRunId(config),
      module_id: moduleId,
      module_dir: rawResult.module_dir || rawResult.moduleDir || null,
      attempt: resolveResultAttempt(rawResult),
      phase: rawResult.phase || activeStatus?.current_phase || null,
      dispatch_id: resolveResultDispatchId(rawResult),
      gateway_label: resolveResultGatewayLabel(rawResult),
      session_key: resolveResultSessionKey(rawResult),
      correlation_provenance: resolveStatusCorrelationProvenance(activeStatus),
    },
    diagnostics: {
      ...diagnostics,
      metadata: {
        ...(diagnostics?.metadata || {}),
        ...(rawResult.fail_count === undefined ? {} : { fail_count: rawResult.fail_count }),
        ...(rawResult.max_rate_limit_pauses === undefined ? {} : { max_rate_limit_pauses: rawResult.max_rate_limit_pauses }),
        ...(rawResult.rate_limit_status === undefined ? {} : { rate_limit_status: rawResult.rate_limit_status }),
        ...(rawResult.polling_git === undefined ? {} : { polling_git: rawResult.polling_git }),
        ...(rawResult.module_status === undefined ? {} : { module_status: rawResult.module_status }),
        ...(rawResult.rate_limit_exhausted === undefined ? {} : { rate_limit_exhausted: rawResult.rate_limit_exhausted }),
        ...(rawResult.status_authority === undefined ? {} : { status_authority: rawResult.status_authority }),
        ...(rawResult.degraded === undefined ? {} : { degraded: rawResult.degraded }),
      },
    },
  });
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
    return {
      retry: false,
      result: buildTypedModuleAttemptResult(config, moduleId, {
        exit: EXIT_ERROR,
        reason,
        status: dependencyStatus,
        phase: 'dependency_check',
      }),
    };
  }

  const handleModuleFail = (statusValue: AnyRecord, phase: string, reason: string, opts: AnyRecord = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );

  return buildTypedModuleAttemptTerminal(config, moduleId, await runModuleAttemptStateMachine({
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
