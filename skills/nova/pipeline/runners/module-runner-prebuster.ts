import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/module-runner-prebuster.ts — pre-Buster validation and git preparation

import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler } from '../core/registry-access.ts';
import { resolveStatusSessionKey, resolveStatusGatewayLabel } from '../services/correlation.ts';
import { resolveModuleBusterDispatchId } from '../services/buster-dispatch-identity.ts';
import { getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import { normalizeTypedValidatorControlResult } from '../services/contracts/validator-control-result.ts';
import { assertPipelineStepResult } from '../services/contracts/pipeline-step-result.ts';
import { normalizeGitFailureClass } from '../services/failure-semantics.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { emitOperatorAlert } from '../services/telemetry.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';
import {
  _telemetryCtx,
  buildModuleValidatorRunInput,
  currentAttemptNumber,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
  ensureValidationState,
  getModuleStats,
  markValidationPassed,
} from './module-runner-shared.ts';
import { buildModuleValidatorPluginInvocation } from './module-runner-plugin-contracts.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleErrorTerminalResult,
  buildRetryResult,
} from './module-runner/terminal-results.ts';
import { applyModuleRunnerCompletion } from './module-runner/completions.ts';
import {
  buildModuleValidatorBlockTerminal, buildModuleValidatorErrorTerminal,
  persistModuleValidatorBlocked,
} from './module-runner-validator-terminals.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function moduleValidatorProducerType(stageId: any = ''): string {
  const producerType = String(selectDefinedValue(() => (stageId), () => (''))).split(':')[1];
  return producerType ?? 'missing_stage_type';
}

function objectRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function findingList(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value : [];
}

function moduleValidatorSummary(controlResult: AnyRecord = {}) {
  return selectDefinedValue(() => (selectDefinedValue(() => (controlResult?.diagnostics?.summary), () => (controlResult?.diagnostics?.metadata?.error))), () => (`${moduleValidatorProducerType(controlResult?.diagnostics?.typed?.validator?.stageId)} validator failed`));
}

function moduleValidatorMetadata(controlResult: AnyRecord = {}) {
  return objectRecord(selectDefinedValue(() => (controlResult?.diagnostics?.metadata), () => (controlResult?.diagnostics?.typed?.validator?.metadata)));
}

function moduleValidatorCodes(controlResult: AnyRecord = {}) {
  const codes = findingList(controlResult?.diagnostics?.findings)
    .map((finding: AnyRecord) => finding?.code)
    .filter(Boolean);
  return codes.length > 0 ? codes.join(', ') : 'none';
}

async function runRegistryModuleValidator({ config, progress, moduleId, mod, dir, status, stageId, phase }: AnyRecord) {
  const validatorInput = buildModuleValidatorRunInput(config, moduleId, mod, dir, status, stageId, {
    attempt: currentAttemptNumber(status),
    phase,
  });
  const { handler: executeValidator, record } = requireStageHandler(config, 'validator.run', stageId, 'run');
  ensureModulePluginLogDirs(config);
  const pluginInvocation = buildModuleValidatorPluginInvocation(moduleId, status, stageId, {
    attempt: currentAttemptNumber(status),
  });
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'validator.run',
    stageId,
    record,
    invocation: pluginInvocation,
    stateSnapshot: async () => validatorInput.stateSnapshot,
    environmentMetadata: {
      moduleId,
      moduleDir: dir,
      phase,
      validatorType: moduleValidatorProducerType(stageId),
    },
  });
  const rawResult = await executeValidator(
    buildPluginInvocationEnvelope(validatorInput, pluginContext),
    pluginContext,
  );
  return normalizeTypedValidatorControlResult(rawResult, {
    producerType: moduleValidatorProducerType(stageId),
    label: `${stageId} module validator`,
    stageId,
    moduleId,
    input: validatorInput,
    invocation: pluginInvocation,
  });
}

function buildModuleValidatorContractDiagnostics(error: AnyRecord) {
  if (!isContractInvalidError(error)) return {};
  return {
    contract_invalid: true,
    contract_diagnostic: getContractInvalidDiagnostic(error as AnyRecord),
  };
}

function hasInFlightBusterDispatch(status: AnyRecord | null): boolean {
  return status?.status === STATUS.TESTING
    && status?.current_phase === 'buster'
    && Boolean(resolveModuleBusterDispatchId(status));
}

function promoteBusterOnlyModule(context: AnyRecord) {
  const { config, dir, status, stages, deps } = context;
  if (stages.includes('forge') || !stages.includes('buster') || ![STATUS.PENDING, STATUS.FAIL].includes(status.status)) return;
  log('INFO', 'No forge in stages — promoting to READY_FOR_TESTING for buster-only run');
  const startedAt = new Date().toISOString();
  if (!status.started_at) status.started_at = startedAt;
  const transition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
    note: 'Buster-only module — skipping Forge',
    now: startedAt,
    attemptStartedAt: startedAt,
  });
  ensureValidationState(status);
  deps.saveStatus(config, dir, status, transition);
}

async function notifyValidatorFailure(context: AnyRecord, spec: AnyRecord, control: AnyRecord, reason: string) {
  const { config, moduleId, status, deps } = context;
  const correlation = {
    run_id: getRunId(config),
    module_id: moduleId,
    attempt: currentAttemptNumber(status),
    gateway_label: resolveStatusGatewayLabel(status),
    session_key: resolveStatusSessionKey(status),
  };
  const metadata = moduleValidatorMetadata(control);
  const fields = spec.phase === 'delivery_lint'
    ? [{ name: 'Codes', value: moduleValidatorCodes(control) }]
    : metadata.report_summary ? [{ name: 'Lint', value: `${metadata.report_summary.total_errors} errors / ${metadata.report_summary.total_warnings} warnings` }] : [];
  await deps.discord(config, 'WARN', `Module ${moduleId} ${spec.title} FAIL`, spec.phase === 'delivery_lint'
    ? 'Deterministic artifact inconsistency detected after Forge. Retrying without Buster.'
    : reason.slice(0, 500), [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation),
      { name: 'Stage', value: spec.phase },
      { name: 'Action', value: control.nextAction },
      ...fields,
    ], { correlation });
}

async function resolveValidatorFailure(context: AnyRecord, spec: AnyRecord, control: AnyRecord, reason: string) {
  const { config, moduleId, dir, status, deps, recalledMemoryIds, handleModuleFail } = context;
  log('WARN', `Module ${moduleId} ${spec.logLabel} failed — ${spec.failureAction}`);
  await notifyValidatorFailure(context, spec, control, reason);
  if (control.nextAction === 'block') {
    persistModuleValidatorBlocked({ config, dir, status, deps, phase: spec.phase, reason });
    return { status, terminal: buildModuleValidatorBlockTerminal(config, moduleId, spec.stageId, reason, control, {}, { dir, status, phase: spec.phase }) };
  }
  const failResult = await handleModuleFail(status, spec.phase, reason, { recalledMemoryIds });
  return failResult._retry
    ? { status, terminal: buildRetryResult(failResult, status) }
    : { status, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
}

async function runPreBusterValidator(context: AnyRecord, spec: AnyRecord) {
  const { config, progress, moduleId, mod, dir, status, deps } = context;
  let control;
  try {
    control = await runRegistryModuleValidator({
      config, progress, moduleId, mod, dir, status, stageId: spec.stageId, phase: spec.phase,
    });
  } catch (error: unknown) {
    const reason = `${spec.executionLabel} validator execution failed: ${errorMessage(error)}`;
    log('ERROR', reason);
    persistModuleValidatorBlocked({ config, dir, status, deps, phase: spec.phase, reason });
    return { status, terminal: buildModuleValidatorErrorTerminal(config, moduleId, spec.stageId, reason, buildModuleValidatorContractDiagnostics(error as AnyRecord), { dir, status, phase: spec.phase }) };
  }
  if (control.nextAction !== 'pass') {
    return resolveValidatorFailure(context, spec, control, moduleValidatorSummary(control));
  }
  markValidationPassed(status, spec.milestone);
  deps.saveStatus(config, dir, status);
  return null;
}

function missingValidationMilestoneResult(context: AnyRecord): AnyRecord | null {
  const { config, moduleId, dir, status, stages } = context;
  const validation = ensureValidationState(status);
  if (!stages.includes('forge') || !stages.includes('buster') || status.status !== STATUS.READY_FOR_TESTING) return null;
  if (validation.delivery_lint_passed && validation.pre_check_passed) return null;
  return { status, terminal: buildModuleErrorTerminalResult(config, moduleId, {
    reason: 'Validation milestones missing before Buster dispatch — refusing to continue',
    moduleDir: dir,
    attempt: currentAttemptNumber(status),
    phase: 'pre_buster_validation',
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    metadata: { validation },
  }) };
}

function shouldSyncGitBeforeBuster(status: AnyRecord, stages: string[]): boolean {
  return stages.includes('buster') && selectTruthyValue(
    () => status.status === STATUS.READY_FOR_TESTING,
    () => status.status === STATUS.TESTING && status.current_phase === 'buster' && !hasInFlightBusterDispatch(status),
  );
}

async function syncGitBeforeBuster(context: AnyRecord) {
  const { config, moduleId, mod, dir, status, stages, deps } = context;
  if (!shouldSyncGitBeforeBuster(status, stages)) return null;
  try {
    const transition = await deps.gitSyncBeforeBuster(config, dir, status);
    deps.saveStatus(config, dir, status, transition);
    for (const name of ['during_git_operation', 'before_buster_handoff']) {
      emitPipelineCheckpoint(config, name, { step_type: 'module', step_id: moduleId, module_id: moduleId, attempt: currentAttemptNumber(status) });
    }
    return null;
  } catch (error: unknown) {
    const message = errorMessage(error);
    const failureClass = normalizeGitFailureClass(message);
    log('ERROR', `Git sync before Buster failed: ${message}`);
    emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'git_sync', model: null, oldStatus: status?.status });
    return { status, terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason: message, moduleDir: dir, attempt: currentAttemptNumber(status), phase: 'git_sync',
      gatewayLabel: resolveStatusGatewayLabel(status), sessionKey: resolveStatusSessionKey(status),
      ...(failureClass ? { terminalReasonCode: failureClass, metadata: { failure_class: failureClass } } : {}),
    }) };
  }
}

export async function prepareModuleForBuster({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  maxFails,
  timeout,
  stages,
  deps,
  recalledMemoryIds = [],
}: AnyRecord = {}) {
  const handleModuleFail = (statusValue: AnyRecord, phase: string, reason: string, opts: AnyRecord = {}) => (
    deps.handleFail({ config, status: statusValue, moduleDir: dir, moduleId, maxFails, phase, reason, opts: { progress, ...opts } })
  );
  const context = {
    config, progress, moduleId, mod, dir, status, maxFails, timeout, stages, deps,
    recalledMemoryIds, handleModuleFail,
  };
  promoteBusterOnlyModule(context);
  if (stages.includes('forge') && stages.includes('buster') && status.status === STATUS.READY_FOR_TESTING) {
    const validation = ensureValidationState(status);
    if (!validation.delivery_lint_passed) {
      const result = await runPreBusterValidator(context, {
        stageId: 'validator:delivery_lint',
        phase: 'delivery_lint',
        milestone: 'delivery_lint_passed',
        title: 'DELIVERY LINT',
        logLabel: 'delivery lint',
        executionLabel: 'Delivery lint',
        failureAction: 'aborting before Buster dispatch',
      });
      if (result) return result;
    }
    if (!validation.pre_check_passed) {
      const result = await runPreBusterValidator(context, {
        stageId: 'validator:pre_check',
        phase: 'pre_check',
        milestone: 'pre_check_passed',
        title: 'PRE-CHECK',
        logLabel: 'pre-check',
        executionLabel: 'Pre-check',
        failureAction: 'retrying Forge before Buster dispatch',
      });
      if (result) return result;
    }
  }
  const missing = missingValidationMilestoneResult(context);
  if (missing) return missing;
  const gitFailure = await syncGitBeforeBuster(context);
  if (gitFailure) return gitFailure;
  return { status, terminal: null };
}
