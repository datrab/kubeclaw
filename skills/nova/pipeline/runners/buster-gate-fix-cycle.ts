import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/buster-gate-fix-cycle.js — Buster gate Forge fix-cycle adapter
// Owns Buster-specific prompt/correlation/cleanup policy; shared Forge cycle mechanics live in gate-forge-fix-cycle.js.

import { log } from '../core/logger.ts';
import { readGateRemediationSpec } from '../services/remediation-handoff.ts';
import { cloneSerializable } from '../services/contracts/gate-control-result.ts';
import { runGateForgeFixCycle } from './gate-forge-fix-cycle.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { arrayValue, objectRecord, selectPresent as selectPresentValue } from '../value-boundary.ts';
import { buildBusterGateFixCycleOptions } from './buster-gate-fix-cycle-options.ts';
const BUSTER_GATE_FIRST_FIX_CYCLE = 1;

function patchBusterRemediationControlResult(controlResult: any, updates: any = {}) {
  const cloned = cloneSerializable(controlResult);
  if (!cloned?.diagnostics?.typed?.remediation) return cloned;

  const remediation = cloned.diagnostics.typed.remediation;
  remediation.correlation = {
    ...objectRecord(remediation.correlation),
    ...objectRecord(cloneSerializable(updates.correlation)),
  };
  remediation.diagnostics = {
    ...objectRecord(remediation.diagnostics),
    ...objectRecord(cloneSerializable(updates.diagnostics)),
  };
  cloned.diagnostics.metadata = {
    ...objectRecord(cloned.diagnostics.metadata),
    ...objectRecord(cloneSerializable(updates.metadata)),
  };
  return cloned;
}

function busterGateMaxFixCyclesAuthority(remediation: any, gate: any, pipelineDefaults: any) {
  const value = selectPresentValue(remediation?.policy?.maxFixCycles, gate?.max_fix_cycles, pipelineDefaults?.max_fails);
  const maxFixCycles = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(maxFixCycles)), () => (maxFixCycles < 1))) {
    throw new Error('Buster gate fix cycle requires positive maxFixCycles authority');
  }
  return maxFixCycles;
}

function gateStartedAtAuthority(opts: any, remediation: any) {
  if (Number.isFinite(opts?.gateStartedAt)) return opts.gateStartedAt;
  if (remediation?.startedAt) {
    const startedAt = new Date(remediation.startedAt).getTime();
    if (Number.isFinite(startedAt)) return startedAt;
    throw new Error('Buster gate remediation startedAt is invalid');
  }
  return Date.now();
}

export async function performBusterGateFixAttempt({ config, progress, gateId, controlResult, opts = {}, deps, gate, callbacks = {} }: any) {
  if (!gate) throw new Error(`Gate '${gateId}' not found`);
  const remediation = objectRecord(readGateRemediationSpec(controlResult));
  const cycle = Number(selectPresentValue(opts.cycle, remediation?.policy?.nextFixCycle, BUSTER_GATE_FIRST_FIX_CYCLE));
  const pipelineDefaults = getPipelineDefaultsConfig(config);
  const maxFixCycles = busterGateMaxFixCyclesAuthority(remediation, gate, pipelineDefaults);
  const gateStartedAt = gateStartedAtAuthority(opts, remediation);
  const issues = arrayValue(remediation?.diagnostics?.issues);
  const fixHistory = arrayValue(opts.fixHistory);
  const gateDispatchId = selectTruthyValue(() => (remediation?.correlation?.dispatch_id), () => (null));
  const gateGatewayLabel = selectTruthyValue(() => (remediation?.correlation?.gateway_label), () => (null));
  const gateSessionKey = selectTruthyValue(() => (remediation?.correlation?.session_key), () => (null));

  log('STEP', `Gate '${gateId}' fix cycle ${cycle}/${maxFixCycles}`);

  const fixPromptResult = deps.buildGateFixPrompt(config, gate, issues, cycle, maxFixCycles, fixHistory);
  return runGateForgeFixCycle(buildBusterGateFixCycleOptions({
    config, progress, deps, gateId, gate, cycle, maxFixCycles, gateStartedAt,
    controlResult, issues, fixHistory, fixPromptResult, gateDispatchId, gateGatewayLabel,
    gateSessionKey, callbacks, patchControlResult: patchBusterRemediationControlResult,
  }));
}
