import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/dependencies.js — Module dependency checker

import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { projectGateSchedulerState, projectModuleSchedulerState } from './status-store.ts';

function isGateConsumed(projection: any = {}) {
  return selectTruthyValue(() => (projection?.scheduler_consumed === true), () => (projection?.completed === true));
}

function dependencyGateLabel(gate: any = null) {
  return gate?.type === 'approval' ? 'Approval gate' : 'Gate';
}

function evaluateGateDependency(config: any, gateId: any, gate: any) {
  const projection = projectGateSchedulerState(config, gateId, gate);
  if (isGateConsumed(projection)) {
    return { met: true };
  }

  const label = dependencyGateLabel(gate);
  const status = String(selectDefinedValue(() => (projection?.status), () => (''))).toUpperCase();

  if (projection?.gate_output_exists && projection?.gate_output_status) {
    log('INFO', `Dependency not met: gate '${gateId}' has status '${projection.gate_output_status}'`);
    return { met: false, reason: `Gate '${gateId}' has status '${projection.gate_output_status}'` };
  }

  if (status && !['PENDING', 'PENDING_APPROVAL'].includes(status)) {
    log('INFO', `Dependency not met: ${label.toLowerCase()} '${gateId}' is ${status}`);
    return { met: false, reason: `${label} '${gateId}' is ${status}` };
  }

  if (gate?.output_file) {
    log('INFO', `Dependency not met: gate '${gateId}' output file not found`);
  }
  log('INFO', `Dependency not met: gate '${gateId}' not completed`);
  return { met: false, reason: `Gate '${gateId}' not completed` };
}

/**
 * Check that all declared dependencies for a module are satisfied.
 * Dependencies can be other modules (by ID) or gates (gate:<gateId>).
 *
 * @param {object} config   - Pipeline config
 * @param {object} progress - Project progress (from progress.json)
 * @param {string} moduleId - Module to check
 * @returns {{ met: boolean, reason?: string }}
 */
export function checkDependencies(config: any, progress: any, moduleId: any) {
  const authorityConfig = config?._sharedPipelineConfig || config;
  const mod = progress.modules[moduleId];
  if (!mod) {
    log('ERROR', `checkDependencies: module ${moduleId} not found in progress.json`);
    return { met: false, reason: `Module ${moduleId} not found` };
  }

  for (const dep of selectDefinedValue(() => (mod.depends_on), () => ([]))) {
    if (dep.startsWith('gate:')) {
      const gateId = dep.replace('gate:', '');
      const gate = progress.gates?.[gateId];
      if (!gate) {
        log('WARN', `Dependency gate '${gateId}' not defined for module ${moduleId}`);
        return { met: false, reason: `Gate '${gateId}' not defined` };
      }

      const gateResult = evaluateGateDependency(authorityConfig, gateId, gate);
      if (!gateResult.met) return gateResult;
      continue;
    }

    const depMod = progress.modules[dep];
    if (!depMod) {
      log('WARN', `Dependency '${dep}' not defined in progress.json for module ${moduleId}`);
      return { met: false, reason: `Dependency '${dep}' not defined` };
    }
    const depProjection = projectModuleSchedulerState(authorityConfig, dep, depMod);
    if (selectTruthyValue(() => (!depProjection), () => (depProjection.status !== STATUS.PASS))) {
      log('INFO', `Dependency not met: module ${dep} (${depMod.title}) is ${selectDefinedValue(() => (depProjection?.status), () => ('NOT_STARTED'))}`);
      return { met: false, reason: `Module ${dep} (${depMod.title}) is ${selectDefinedValue(() => (depProjection?.status), () => ('NOT_STARTED'))}` };
    }
  }

  log('DEBUG', `Dependencies OK for ${moduleId}`);
  return { met: true };
}
