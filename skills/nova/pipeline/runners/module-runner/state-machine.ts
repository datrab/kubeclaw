// runners/module-runner/state-machine.ts — explicit module attempt state machine

import { STATUS, EXIT_ERROR, EXIT_NEEDS_NOVA } from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from '../../services/correlation.ts';
import {
  emitTerminalModuleFailTelemetry,
  ensureValidationState,
  setLogScope,
} from '../module-runner-shared.ts';
import {
  finalizeForgeOnlyPass,
  runModuleForgePhase,
} from '../module-runner-forge.ts';
import { prepareModuleForBuster } from '../module-runner-prebuster.ts';
import { runModuleBusterPhase } from './buster-phase.ts';
import {
  buildBlockedTerminalResult,
  buildModulePassTerminalResult,
  buildRetryResult,
} from './terminal-results.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const MODULE_ATTEMPT_ACTIONS = Object.freeze({
  TERMINAL_PASS: 'terminal_pass',
  TERMINAL_BLOCKED: 'terminal_blocked',
  RELEASE_BLUEPRINT: 'release_blueprint',
  RUN_FORGE: 'run_forge',
  FINALIZE_FORGE_ONLY: 'finalize_forge_only',
  PREPARE_BUSTER: 'prepare_buster',
  RUN_BUSTER: 'run_buster',
  TERMINAL_OR_RETRY: 'terminal_or_retry',
  UNEXPECTED_STATUS: 'unexpected_status',
});

export function planLoadedModuleStatus(status: AnyRecord) {
  if (status?.status === STATUS.PASS) return MODULE_ATTEMPT_ACTIONS.TERMINAL_PASS;
  if (status?.status === STATUS.BLOCKED) return MODULE_ATTEMPT_ACTIONS.TERMINAL_BLOCKED;
  if (!status || status.status === STATUS.PENDING) return MODULE_ATTEMPT_ACTIONS.RELEASE_BLUEPRINT;
  return null;
}

export function planModuleAttemptPhase(status: AnyRecord, stages: string[] = ['forge', 'buster']) {
  if (stages.includes('forge')
      && [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.FAIL].includes(status?.status)
      && status?.current_phase !== 'buster') {
    return MODULE_ATTEMPT_ACTIONS.RUN_FORGE;
  }

  if (!stages.includes('buster') && status?.status === STATUS.READY_FOR_TESTING) {
    return MODULE_ATTEMPT_ACTIONS.FINALIZE_FORGE_ONLY;
  }

  return MODULE_ATTEMPT_ACTIONS.PREPARE_BUSTER;
}

export function planAfterBusterPreparation(prepared: AnyRecord = {}) {
  return prepared.terminal ? MODULE_ATTEMPT_ACTIONS.TERMINAL_OR_RETRY : MODULE_ATTEMPT_ACTIONS.RUN_BUSTER;
}

export function planAfterBusterPhase(busterPhase: AnyRecord = {}) {
  return Object.prototype.hasOwnProperty.call(busterPhase, 'retry')
    ? MODULE_ATTEMPT_ACTIONS.TERMINAL_OR_RETRY
    : MODULE_ATTEMPT_ACTIONS.UNEXPECTED_STATUS;
}

async function releaseBlueprintForAttempt({ config, progress, moduleId, mod, dir, deps, status }: AnyRecord) {
  try {
    await deps.releaseBlueprint(config, progress, moduleId, dir, mod.stages || ['forge', 'buster']);
  } catch (e) {
    const reason = `Blueprint release failed: ${errorMessage(e)}. Nova may need to create/fix the architecture branch.`;
    log('ERROR', `Module ${moduleId}: blueprint release failed: ${errorMessage(e)}`);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'blueprint_release', null, status?.status ?? STATUS.PENDING, reason, {}, deps._explicitDeps);
    return {
      status,
      terminal: {
        retry: false,
        result: {
          exit: EXIT_NEEDS_NOVA,
          reason,
          module: moduleId,
          resume_command: `node pipeline.ts --project ${config.project} --resume`,
          gateway_label: resolveStatusGatewayLabel(status),
          session_key: resolveStatusSessionKey(status),
        },
      },
    };
  }

  if (!status) {
    const initialized = deps.initStatus(moduleId, mod);
    deps.saveStatus(config, dir, initialized);
    return { status: initialized, terminal: null };
  }
  return { status, terminal: null };
}

function buildUnexpectedStatusTerminal({ config, moduleId, mod, status, deps }: AnyRecord) {
  setLogScope(null, null);
  const reason = `Unexpected status: ${status?.status}`;
  log('ERROR', `Module ${moduleId} ended in unexpected status: ${status?.status}`);
  emitTerminalModuleFailTelemetry(config, moduleId, status, mod, status?.current_phase || null, status?.active_agent?.model || null, status?.status ?? null, reason, {}, deps?._explicitDeps);
  return {
    retry: false,
    result: {
      exit: EXIT_ERROR,
      reason,
      gateway_label: resolveStatusGatewayLabel(status),
      session_key: resolveStatusSessionKey(status),
    },
  };
}

export async function runModuleAttemptStateMachine({
  config,
  progress,
  moduleId,
  mod,
  dir,
  timeout,
  maxFails,
  novaPrompt = null,
  deps,
  status,
  handleModuleFail,
}: AnyRecord = {}) {
  let recalledMemoryIds: AnyRecord[] = [];

  const loadedAction = planLoadedModuleStatus(status);
  if (loadedAction === MODULE_ATTEMPT_ACTIONS.TERMINAL_PASS) {
    log('OK', `Module ${moduleId} already PASS — skipping`);
    return buildModulePassTerminalResult(config, moduleId);
  }
  if (loadedAction === MODULE_ATTEMPT_ACTIONS.TERMINAL_BLOCKED) {
    log('WARN', `Module ${moduleId} is BLOCKED — cannot proceed`);
    return buildBlockedTerminalResult(status, moduleId);
  }
  if (loadedAction === MODULE_ATTEMPT_ACTIONS.RELEASE_BLUEPRINT) {
    const released = await releaseBlueprintForAttempt({ config, progress, moduleId, mod, dir, deps, status });
    status = released.status;
    if (released.terminal) return released.terminal;
  }

  const stages = mod.stages || ['forge', 'buster'];
  ensureValidationState(status);

  log('INFO', `Module ${moduleId}: entering attempt (status=${status?.status || 'NEW'}, ` +
    `fail_count=${status?.fail_count || 0}, stages=${stages.join('+')})`);

  if (planModuleAttemptPhase(status, stages) === MODULE_ATTEMPT_ACTIONS.RUN_FORGE) {
    const forgePhase = await runModuleForgePhase({
      config,
      progress,
      moduleId,
      mod,
      dir,
      status,
      maxFails,
      timeout,
      novaPrompt,
      stages,
      deps,
      recalledMemoryIds,
    });
    status = forgePhase.status;
    recalledMemoryIds = forgePhase.recalledMemoryIds;
    if (forgePhase.terminal) return forgePhase.terminal;
  }

  if (planModuleAttemptPhase(status, stages) === MODULE_ATTEMPT_ACTIONS.FINALIZE_FORGE_ONLY) {
    const forgeOnlyPass = await finalizeForgeOnlyPass({
      config,
      moduleId,
      mod,
      dir,
      status,
      stages,
      deps,
    });
    return forgeOnlyPass.terminal;
  }

  const busterPreparation = await prepareModuleForBuster({
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
    recalledMemoryIds,
  });
  status = busterPreparation.status;
  if (planAfterBusterPreparation(busterPreparation) === MODULE_ATTEMPT_ACTIONS.TERMINAL_OR_RETRY) {
    return busterPreparation.terminal;
  }

  const busterPhase = await runModuleBusterPhase({
    config,
    progress,
    moduleId,
    mod,
    dir,
    status,
    timeout,
    maxFails,
    deps,
    recalledMemoryIds,
    handleModuleFail,
    buildRetryResult,
  });
  status = busterPhase.status || status;
  if (planAfterBusterPhase(busterPhase) === MODULE_ATTEMPT_ACTIONS.TERMINAL_OR_RETRY) {
    return busterPhase;
  }

  return buildUnexpectedStatusTerminal({ config, moduleId, mod, status, deps });
}
