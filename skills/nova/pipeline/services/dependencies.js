// services/dependencies.js — Module dependency checker
// Extracted from pipeline-original.js (module 03)

import fs from 'fs';
import { log } from '../core/logger.js';
import { STATUS } from '../core/constants.js';
import { swarmRoot, gateStatusPath } from '../core/paths.js';
import { loadStatus } from './status-store.js';

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
      if (gate.type === 'buster') {
        const gsp = gateStatusPath(config, gateId);
        if (!fs.existsSync(gsp)) {
          log('INFO', `Dependency not met: gate '${gateId}' gate-status.json not found`);
          return { met: false, reason: `Gate '${gateId}' not completed` };
        }
        try {
          const gs = JSON.parse(fs.readFileSync(gsp, 'utf8'));
          if (gs.status !== STATUS.PASS && gs.status !== 'OK') {
            log('INFO', `Dependency not met: gate '${gateId}' is ${gs.status}`);
            return { met: false, reason: `Gate '${gateId}' is ${gs.status}` };
          }
        } catch {
          log('WARN', `Dependency gate '${gateId}' status file unparseable`);
          return { met: false, reason: `Gate '${gateId}' status file unparseable` };
        }
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
