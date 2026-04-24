// services/dependencies.js — Module dependency checker

import fs from 'fs';
import { log } from '../core/logger.js';
import { STATUS } from '../core/constants.js';
import { swarmRoot, gateStatusPath } from '../core/paths.js';
import { loadStatus, readBusterGateCompletion } from './status-store.js';

function evaluateApprovalDependency(config, gateId) {
  const gsp = gateStatusPath(config, gateId);
  if (!fs.existsSync(gsp)) {
    log('INFO', `Dependency not met: approval gate '${gateId}' gate-state file not found`);
    return { met: false, reason: `Approval gate '${gateId}' not completed` };
  }

  try {
    const gs = JSON.parse(fs.readFileSync(gsp, 'utf8'));
    const status = String(gs.status || '').toUpperCase();
    if (status === 'APPROVED' || status === STATUS.PASS || status === 'OK') {
      return { met: true };
    }
    if (status === 'TIMED_OUT' && gs.continued === true) {
      return { met: true };
    }
    log('INFO', `Dependency not met: approval gate '${gateId}' is ${status || 'UNKNOWN'}`);
    return { met: false, reason: `Approval gate '${gateId}' is ${status || 'UNKNOWN'}` };
  } catch {
    log('WARN', `Approval dependency gate '${gateId}' state file unparseable`);
    return { met: false, reason: `Approval gate '${gateId}' state file unparseable` };
  }
}

function evaluateBusterDependency(config, gateId, gate) {
  const completion = readBusterGateCompletion(config, gateId, gate);
  if (completion.isPass) {
    return { met: true };
  }

  const gateStatusValue = String(completion.gateStatus?.data?.status || '').toUpperCase();
  if ((gateStatusValue === 'PASS' || gateStatusValue === 'OK') && !completion.output.isPass) {
    log('INFO', `Dependency not met: gate '${gateId}' gate-status.json reports ${gateStatusValue} but canonical output_file completion is missing`);
    return { met: false, reason: `Gate '${gateId}' canonical completion output is missing` };
  }

  if (completion.output.exists && completion.output.data?.status) {
    log('INFO', `Dependency not met: gate '${gateId}' has status '${completion.output.data.status}'`);
    return { met: false, reason: `Gate '${gateId}' has status '${completion.output.data.status}'` };
  }

  if (completion.gateStatus.exists) {
    if (completion.gateStatus.data?.status) {
      log('INFO', `Dependency not met: gate '${gateId}' is ${completion.gateStatus.data.status}`);
      return { met: false, reason: `Gate '${gateId}' is ${completion.gateStatus.data.status}` };
    }
    log('WARN', `Dependency gate '${gateId}' status file unparseable`);
    return { met: false, reason: `Gate '${gateId}' status file unparseable` };
  }

  if (gate.output_file) {
    log('INFO', `Dependency not met: gate '${gateId}' output file not found`);
  }
  log('INFO', `Dependency not met: gate '${gateId}' gate-status.json not found`);
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
export function checkDependencies(config, progress, moduleId) {
  const mod = progress.modules[moduleId];
  if (!mod) {
    log('ERROR', `checkDependencies: module ${moduleId} not found in progress.json`);
    return { met: false, reason: `Module ${moduleId} not found` };
  }

  for (const dep of mod.depends_on || []) {
    if (dep.startsWith('gate:')) {
      const gateId = dep.replace('gate:', '');
      const gate = progress.gates[gateId];
      if (!gate) {
        log('WARN', `Dependency gate '${gateId}' not defined for module ${moduleId}`);
        return { met: false, reason: `Gate '${gateId}' not defined` };
      }

      if (gate.type === 'approval') {
        const approvalResult = evaluateApprovalDependency(config, gateId);
        if (!approvalResult.met) return approvalResult;
        continue;
      }

      if (gate.type === 'buster') {
        const busterResult = evaluateBusterDependency(config, gateId, gate);
        if (!busterResult.met) return busterResult;
        continue;
      }

      if (gate.output_file) {
        const outPath = `${swarmRoot(config)}/${gate.output_file}`;
        if (!fs.existsSync(outPath)) {
          log('INFO', `Dependency not met: gate '${gateId}' output file not found`);
          return { met: false, reason: `Gate '${gateId}' not completed` };
        }
        // Content-aware: a FAIL/ISSUES_FOUND/NO-GO output file is not a completed dependency
        try {
          const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
          const s = (data.status || '').toUpperCase();
          if (s === 'FAIL' || s === 'ISSUES_FOUND' || s === 'NO-GO') {
            log('INFO', `Dependency not met: gate '${gateId}' has status '${data.status}'`);
            return { met: false, reason: `Gate '${gateId}' has status '${data.status}'` };
          }
        } catch { /* non-JSON file = completed (e.g. markdown review) */ }
      }
    } else {
      const depMod = progress.modules[dep];
      if (!depMod) {
        log('WARN', `Dependency '${dep}' not defined in progress.json for module ${moduleId}`);
        return { met: false, reason: `Dependency '${dep}' not defined` };
      }
      const depStatus = loadStatus(config, depMod.dir);
      if (!depStatus || depStatus.status !== STATUS.PASS) {
        log('INFO', `Dependency not met: module ${dep} (${depMod.title}) is ${depStatus?.status || 'NOT_STARTED'}`);
        return { met: false, reason: `Module ${dep} (${depMod.title}) is ${depStatus?.status || 'NOT_STARTED'}` };
      }
    }
  }

  log('DEBUG', `Dependencies OK for ${moduleId}`);
  return { met: true };
}
