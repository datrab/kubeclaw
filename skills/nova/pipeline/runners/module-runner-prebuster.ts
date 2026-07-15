import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/module-runner-prebuster.ts — pre-Buster validation and git preparation

import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler } from '../core/registry.ts';
import { resolveStatusSessionKey, resolveStatusGatewayLabel } from '../services/correlation.ts';
import { getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import { normalizeTypedValidatorControlResult } from '../services/contracts/validator-control-result.ts';
import { assertPipelineStepResult } from '../services/contracts/pipeline-step-result.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { emitOperatorAlert } from '../services/telemetry.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';
import {
  _telemetryCtx,
  buildModuleValidatorPluginInvocation,
  buildModuleValidatorRunInput,
  currentAttemptNumber,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
  ensureValidationState,
  getModuleStats,
  markValidationPassed,
} from './module-runner-shared.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleErrorTerminalResult,
  buildRetryResult,
} from './module-runner/terminal-results.ts';
import { applyModuleRunnerCompletion } from './module-runner/completions.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bracketedErrorCode(message: string): string | null {
  const match = String(selectDefinedValue(() => (message), () => (''))).match(/\[([A-Z][A-Z0-9_]+)\]/);
  return selectTruthyValue(() => (match?.[1]), () => (null));
}
function moduleValidatorProducerType(stageId = ''): string {
  const producerType = String(selectDefinedValue(() => (stageId), () => (''))).split(':')[1];
  return selectDefinedValue(() => (producerType), () => ('missing_stage_type'));
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

function buildModuleValidatorBlockTerminal(config: AnyRecord, moduleId: string, stageId: string, reason: string, controlResult: AnyRecord | null = null, diagnostics: AnyRecord = {}, {
  dir = null,
  status = null,
  phase = stageId,
}: AnyRecord = {}) {
  return buildModuleBlockedTerminalResult(config, moduleId, {
    reason,
    moduleDir: dir,
    attempt: currentAttemptNumber(status),
    phase,
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    terminalReasonCode: 'infra_error',
    metadata: {
      failure_class: 'infra_error',
      validator: stageId,
      validator_result: controlResult,
    },
    diagnostics,
  });
}

function buildModuleValidatorErrorTerminal(config: AnyRecord, moduleId: string, stageId: string, reason: string, diagnostics: AnyRecord = {}, {
  dir = null,
  status = null,
  phase = stageId,
}: AnyRecord = {}) {
  return buildModuleErrorTerminalResult(config, moduleId, {
    reason,
    moduleDir: dir,
    attempt: currentAttemptNumber(status),
    phase,
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    terminalReasonCode: 'invalid_contract',
    metadata: {
      failure_class: 'invalid_contract',
      validator: stageId,
      validator_result: null,
    },
    diagnostics,
  });
}

function persistModuleValidatorBlocked({ config, dir, status, deps, phase, reason }: AnyRecord) {
  applyModuleRunnerCompletion({
    deps,
    config,
    dir,
    status,
    moduleId: status?.module_id,
    phase,
    attempt: currentAttemptNumber(status),
    completionStatus: 'BLOCKED',
    authority: { kind: 'deterministic_check' },
    reasonCode: reason,
    summary: reason,
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    metadata: {
      fail_count: selectDefinedValue(() => (status?.fail_count), () => (null)),
    },
  });
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
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );

  if (!stages.includes('forge') && stages.includes('buster')
      && [STATUS.PENDING, STATUS.FAIL].includes(status.status)) {
    log('INFO', 'No forge in stages — promoting to READY_FOR_TESTING for buster-only run');
    const busterOnlyStartedAt = new Date().toISOString();
    if (!status.started_at) status.started_at = busterOnlyStartedAt;
    const busterOnlyTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: 'Buster-only module — skipping Forge',
      now: busterOnlyStartedAt,
      attemptStartedAt: busterOnlyStartedAt,
    });
    ensureValidationState(status);
    deps.saveStatus(config, dir, status, busterOnlyTransition);
  }

  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING) {
    const validation = ensureValidationState(status);

    if (!validation.delivery_lint_passed) {
      let deliveryLintControl;
      try {
        deliveryLintControl = await runRegistryModuleValidator({
          config,
          progress,
          moduleId,
          mod,
          dir,
          status,
          stageId: 'validator:delivery_lint',
          phase: 'delivery_lint',
        });
      } catch (error) {
        const reason = `Delivery lint validator execution failed: ${errorMessage(error)}`;
        log('ERROR', reason);
        persistModuleValidatorBlocked({ config, dir, status, deps, phase: 'delivery_lint', reason });
        return { status, terminal: buildModuleValidatorErrorTerminal(config, moduleId, 'validator:delivery_lint', reason, buildModuleValidatorContractDiagnostics(error as AnyRecord), { dir, status, phase: 'delivery_lint' }) };
      }

      if (deliveryLintControl.nextAction !== 'pass') {
        const reason = moduleValidatorSummary(deliveryLintControl);
        const deliveryLintCorrelation = {
          run_id: getRunId(config),
          module_id: moduleId,
          attempt: currentAttemptNumber(status),
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        };
        log('WARN', `Module ${moduleId} delivery lint failed — aborting before Buster dispatch`);
        await deps.discord(config, 'WARN', `Module ${moduleId} DELIVERY LINT FAIL`,
          `Deterministic artifact inconsistency detected after Forge. Retrying without Buster.`, [
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, deliveryLintCorrelation),
            { name: 'Stage', value: 'delivery_lint' },
            { name: 'Action', value: deliveryLintControl.nextAction },
            { name: 'Codes', value: moduleValidatorCodes(deliveryLintControl) },
          ],
          { correlation: deliveryLintCorrelation },
        );
        if (deliveryLintControl.nextAction === 'block') {
          persistModuleValidatorBlocked({ config, dir, status, deps, phase: 'delivery_lint', reason });
          return { status, terminal: buildModuleValidatorBlockTerminal(config, moduleId, 'validator:delivery_lint', reason, deliveryLintControl, {}, { dir, status, phase: 'delivery_lint' }) };
        }
        const failResult = await handleModuleFail(status, 'delivery_lint', reason, { recalledMemoryIds });
        return failResult._retry
          ? { status, terminal: buildRetryResult(failResult, status) }
          : { status, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
      }

      markValidationPassed(status, 'delivery_lint_passed');
      deps.saveStatus(config, dir, status);
    }

    if (!validation.pre_check_passed) {
      let preCheckControl;
      try {
        preCheckControl = await runRegistryModuleValidator({
          config,
          progress,
          moduleId,
          mod,
          dir,
          status,
          stageId: 'validator:pre_check',
          phase: 'pre_check',
        });
      } catch (error) {
        const reason = `Pre-check validator execution failed: ${errorMessage(error)}`;
        log('ERROR', reason);
        persistModuleValidatorBlocked({ config, dir, status, deps, phase: 'pre_check', reason });
        return { status, terminal: buildModuleValidatorErrorTerminal(config, moduleId, 'validator:pre_check', reason, buildModuleValidatorContractDiagnostics(error as AnyRecord), { dir, status, phase: 'pre_check' }) };
      }
      if (preCheckControl.nextAction !== 'pass') {
        const precheckReason = moduleValidatorSummary(preCheckControl);
        const precheckMetadata = moduleValidatorMetadata(preCheckControl);
        const precheckCorrelation = {
          run_id: getRunId(config),
          module_id: moduleId,
          attempt: currentAttemptNumber(status),
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        };
        log('WARN', `Module ${moduleId} pre-check failed — retrying Forge before Buster dispatch`);
        await deps.discord(config, 'WARN', `Module ${moduleId} PRE-CHECK FAIL`, precheckReason.slice(0, 500), [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, precheckCorrelation),
          { name: 'Stage', value: 'pre_check' },
          { name: 'Action', value: preCheckControl.nextAction },
          ...(precheckMetadata.report_summary ? [{
            name: 'Lint',
            value: `${precheckMetadata.report_summary.total_errors} errors / ${precheckMetadata.report_summary.total_warnings} warnings`,
          }] : []),
        ], { correlation: precheckCorrelation });
        if (preCheckControl.nextAction === 'block') {
          persistModuleValidatorBlocked({ config, dir, status, deps, phase: 'pre_check', reason: precheckReason });
          return { status, terminal: buildModuleValidatorBlockTerminal(config, moduleId, 'validator:pre_check', precheckReason, preCheckControl, {}, { dir, status, phase: 'pre_check' }) };
        }
        const failResult = await handleModuleFail(status, 'pre_check', precheckReason, { recalledMemoryIds });
        return failResult._retry
          ? { status, terminal: buildRetryResult(failResult, status) }
          : { status, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
      }

      markValidationPassed(status, 'pre_check_passed');
      deps.saveStatus(config, dir, status);
    }
  }

  const validation = ensureValidationState(status);
  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING
      && (selectTruthyValue(() => (!validation.delivery_lint_passed), () => (!validation.pre_check_passed)))) {
    return {
      status,
      terminal: buildModuleErrorTerminalResult(config, moduleId, {
        reason: 'Validation milestones missing before Buster dispatch — refusing to continue',
        moduleDir: dir,
        attempt: currentAttemptNumber(status),
        phase: 'pre_buster_validation',
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: resolveStatusSessionKey(status),
        metadata: {
          validation,
        },
      }),
    };
  }

  if (stages.includes('buster')
      && (selectTruthyValue(() => (status.status === STATUS.READY_FOR_TESTING), () => ((status.status === STATUS.TESTING && status.current_phase === 'buster'))))) {
    try {
      const gitSyncTransition = await deps.gitSyncBeforeBuster(config, dir, status);
      deps.saveStatus(config, dir, status, gitSyncTransition);
      emitPipelineCheckpoint(config, 'during_git_operation', {
        step_type: 'module',
        step_id: moduleId,
        module_id: moduleId,
        attempt: currentAttemptNumber(status),
      });
      emitPipelineCheckpoint(config, 'before_buster_handoff', {
        step_type: 'module',
        step_id: moduleId,
        module_id: moduleId,
        attempt: currentAttemptNumber(status),
      });
    } catch (e) {
      const message = errorMessage(e);
      const errorCode = bracketedErrorCode(message);
      log('ERROR', `Git sync before Buster failed: ${message}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'git_sync', null, status?.status);
      return {
        status,
        terminal: buildModuleErrorTerminalResult(config, moduleId, {
          reason: message,
          moduleDir: dir,
          attempt: currentAttemptNumber(status),
          phase: 'git_sync',
          gatewayLabel: resolveStatusGatewayLabel(status),
          sessionKey: resolveStatusSessionKey(status),
          ...(errorCode ? { terminalReasonCode: errorCode } : {}),
        }),
      };
    }
  }

  return { status, terminal: null };
}
