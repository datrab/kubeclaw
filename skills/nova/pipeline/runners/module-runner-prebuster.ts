// runners/module-runner-prebuster.ts — pre-Buster validation and git preparation

import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler } from '../core/registry.ts';
import { resolveStatusSessionKey, resolveStatusGatewayLabel } from '../services/correlation.ts';
import { getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import { normalizeTypedValidatorControlResult } from '../services/contracts/validator-control-result.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { emitOperatorAlert } from '../services/telemetry.ts';
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
import { buildRetryResult } from './module-runner/terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function moduleValidatorProducerType(stageId = ''): string {
  return String(stageId || '').split(':')[1] || 'unknown';
}

function moduleValidatorSummary(controlResult: AnyRecord = {}) {
  return controlResult?.diagnostics?.summary
    || controlResult?.diagnostics?.metadata?.error
    || `${moduleValidatorProducerType(controlResult?.diagnostics?.typed?.validator?.stageId)} validator failed`;
}

function moduleValidatorMetadata(controlResult: AnyRecord = {}) {
  return controlResult?.diagnostics?.metadata
    || controlResult?.diagnostics?.typed?.validator?.metadata
    || {};
}

function moduleValidatorCodes(controlResult: AnyRecord = {}) {
  const codes = (controlResult?.diagnostics?.findings || [])
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

function buildModuleValidatorBlockTerminal(moduleId: string, stageId: string, reason: string, controlResult: AnyRecord | null = null, diagnostics: AnyRecord = {}) {
  return {
    retry: false,
    result: {
      outcome_class: 'error',
      reason,
      module: moduleId,
      validator: stageId,
      validator_result: controlResult,
      ...(Object.keys(diagnostics || {}).length > 0 ? { diagnostics } : {}),
    },
  };
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
        return { status, terminal: buildModuleValidatorBlockTerminal(moduleId, 'validator:delivery_lint', reason, null, buildModuleValidatorContractDiagnostics(error as AnyRecord)) };
      }

      if (deliveryLintControl.nextAction !== 'pass') {
        const reason = moduleValidatorSummary(deliveryLintControl);
        log('WARN', `Module ${moduleId} delivery lint failed — aborting before Buster dispatch`);
        await deps.discord(config, 'WARN', `Module ${moduleId} DELIVERY LINT FAIL`,
          `Deterministic artifact inconsistency detected after Forge. Retrying without Buster.`, [
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: resolveStatusSessionKey(status) }),
            { name: 'Stage', value: 'delivery_lint' },
            { name: 'Action', value: deliveryLintControl.nextAction },
            { name: 'Codes', value: moduleValidatorCodes(deliveryLintControl) },
          ]);
        if (deliveryLintControl.nextAction === 'block') {
          return { status, terminal: buildModuleValidatorBlockTerminal(moduleId, 'validator:delivery_lint', reason, deliveryLintControl) };
        }
        const failResult = await handleModuleFail(status, 'delivery_lint', reason, { recalledMemoryIds });
        return failResult._retry
          ? { status, terminal: buildRetryResult(failResult, status) }
          : { status, terminal: { retry: false, result: failResult } };
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
        return { status, terminal: buildModuleValidatorBlockTerminal(moduleId, 'validator:pre_check', reason, null, buildModuleValidatorContractDiagnostics(error as AnyRecord)) };
      }
      if (preCheckControl.nextAction !== 'pass') {
        const precheckReason = moduleValidatorSummary(preCheckControl);
        const precheckMetadata = moduleValidatorMetadata(preCheckControl);
        log('WARN', `Module ${moduleId} pre-check failed — retrying Forge before Buster dispatch`);
        await deps.discord(config, 'WARN', `Module ${moduleId} PRE-CHECK FAIL`, precheckReason.slice(0, 500), [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: resolveStatusSessionKey(status) }),
          { name: 'Stage', value: 'pre_check' },
          { name: 'Action', value: preCheckControl.nextAction },
          ...(precheckMetadata.report_summary ? [{
            name: 'Lint',
            value: `${precheckMetadata.report_summary.total_errors} errors / ${precheckMetadata.report_summary.total_warnings} warnings`,
          }] : []),
        ]);
        if (preCheckControl.nextAction === 'block') {
          return { status, terminal: buildModuleValidatorBlockTerminal(moduleId, 'validator:pre_check', precheckReason, preCheckControl) };
        }
        const failResult = await handleModuleFail(status, 'pre_check', precheckReason, { recalledMemoryIds });
        return failResult._retry
          ? { status, terminal: buildRetryResult(failResult, status) }
          : { status, terminal: { retry: false, result: failResult } };
      }

      markValidationPassed(status, 'pre_check_passed');
      deps.saveStatus(config, dir, status);
    }
  }

  const validation = ensureValidationState(status);
  if (stages.includes('forge') && stages.includes('buster')
      && status.status === STATUS.READY_FOR_TESTING
      && (!validation.delivery_lint_passed || !validation.pre_check_passed)) {
    return {
      status,
      terminal: {
        retry: false,
        result: {
          outcome_class: 'error',
          reason: 'Validation milestones missing before Buster dispatch — refusing to continue',
          module: moduleId,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        },
      },
    };
  }

  if (stages.includes('buster')
      && (status.status === STATUS.READY_FOR_TESTING
        || (status.status === STATUS.TESTING && status.current_phase === 'buster'))) {
    try {
      const gitSyncTransition = await deps.gitSyncBeforeBuster(config, dir, status);
      deps.saveStatus(config, dir, status, gitSyncTransition);
    } catch (e) {
      log('ERROR', `Git sync before Buster failed: ${errorMessage(e)}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'git_sync', null, status?.status ?? STATUS.READY_FOR_TESTING, errorMessage(e));
      return {
        status,
        terminal: {
          retry: false,
          result: {
            outcome_class: 'error',
            reason: errorMessage(e),
            gateway_label: resolveStatusGatewayLabel(status),
            session_key: resolveStatusSessionKey(status),
          },
        },
      };
    }
  }

  return { status, terminal: null };
}
