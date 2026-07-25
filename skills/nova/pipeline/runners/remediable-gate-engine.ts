import { runScheduledGateControlInvocation } from './scheduled-gate-invocation.ts';
import {
  bumpGateRemediationControlResult,
  isGateRemediationControlResult,
  readGateRemediationSpec,
  resolveGateRemediationController,
} from '../services/remediation-handoff.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export async function runRemediableGateControlLoopResult({
  initialControlResult,
  remediationController = null,
  evaluateGate = null,
  performFix = null,
  buildExhaustedControlResult = null,
  normalizeControlResult,
  gateId,
  gate,
}: any) {
  if (typeof normalizeControlResult !== 'function') {
    throw new Error(`gate:${selectTruthyValue(() => (selectTruthyValue(() => (gate?.type), () => (gateId))), () => ('missing_gate_type'))} remediable loop requires normalizeControlResult(...)`);
  }

  const controller = resolveGateRemediationController({
    remediationController,
    evaluateGate,
    performFix,
    buildExhaustedControlResult,
  }, `gate:${selectTruthyValue(() => (selectTruthyValue(() => (gate?.type), () => (gateId))), () => ('missing_gate_type'))}`);
  let controlResult = initialControlResult;

  while (isGateRemediationControlResult(controlResult)) {
    const iteration = await runRemediationIteration({ controller, controlResult, gateId, gate });
    if (iteration.terminal) return { controlResult: iteration.controlResult };
    controlResult = iteration.controlResult;
  }

  return { controlResult };
}

async function runRemediationIteration({ controller, controlResult, gateId, gate }: any) {
  const remediation = readGateRemediationSpec(controlResult);
  const maxFixCycles = Number(selectDefinedValue(() => (remediation?.policy?.maxFixCycles), () => (0)));
  const cycle = Number(selectDefinedValue(() => (remediation?.policy?.nextFixCycle), () => (0)));
  if (!Number.isFinite(cycle) || cycle < 1 || cycle > maxFixCycles) {
    return exhaustedIteration(controller, controlResult, remediation, gateId, gate);
  }
  const fixOutcome = await controller.performFix({ controlResult, remediation, cycle, maxFixCycles, gateId, gate });
  if (fixOutcome?.mode === 'terminal') return terminalFixOutcome(fixOutcome, gateId, gate);
  if (fixOutcome?.mode === 'retry_request_fix') {
    return { terminal: false, controlResult: bumpGateRemediationControlResult(retryRequestControlResultAuthority(fixOutcome, controlResult), cycle + 1) };
  }
  if (fixOutcome?.mode !== 're_evaluate') throw invalidRemediationModeError(gateId, gate);
  const evaluated = await controller.evaluateGate({
    attempt: cycle + 1, remediationCycle: cycle,
    controlResult: fixOutcome.controlResult || controlResult, remediation,
    fixOutcomeDegraded: selectTruthyValue(() => (fixOutcome?.degraded), () => (null)), gateId, gate,
  });
  return normalizeNextRemediation(controller, evaluated, cycle, maxFixCycles, gateId, gate);
}

async function exhaustedIteration(controller: any, controlResult: any, remediation: any, gateId: any, gate: any) {
  return { terminal: true, controlResult: await controller.buildExhaustedControlResult({ controlResult, remediation, gateId, gate }) };
}

function terminalFixOutcome(fixOutcome: any, gateId: any, gate: any) {
  if (!fixOutcome.controlResult) throw new Error(`${remediationStageId(gateId, gate)} terminal remediation outcome must return controlResult`);
  return { terminal: true, controlResult: fixOutcome.controlResult };
}

function invalidRemediationModeError(gateId: any, gate: any) {
  return new Error(`${remediationStageId(gateId, gate)} remediation outcome must use typed mode terminal, retry_request_fix, or re_evaluate`);
}

function remediationStageId(gateId: any, gate: any) {
  if (gate?.type) return `gate:${gate.type}`;
  if (gateId) return `gate:${gateId}`;
  return 'gate:missing_gate_type';
}

async function normalizeNextRemediation(controller: any, controlResult: any, cycle: number, maxFixCycles: number, gateId: any, gate: any) {
  if (!isGateRemediationControlResult(controlResult)) return { terminal: false, controlResult };
  const remediation = readGateRemediationSpec(controlResult);
  const nextCycle = Number(selectDefinedValue(() => (remediation?.policy?.nextFixCycle), () => (0)));
  if (!Number.isFinite(nextCycle) || nextCycle > cycle) return { terminal: false, controlResult };
  if (cycle + 1 > maxFixCycles) return exhaustedIteration(controller, controlResult, remediation, gateId, gate);
  return { terminal: false, controlResult: bumpGateRemediationControlResult(controlResult, cycle + 1) };
}

function retryRequestControlResultAuthority(fixOutcome: any, currentControlResult: any) {
  if (fixOutcome?.controlResult) return fixOutcome.controlResult;
  if (currentControlResult) return currentControlResult;
  throw new Error('Gate remediation retry_request_fix requires current controlResult authority');
}

export async function runScheduledRemediableGate({
  config,
  progress,
  gateId,
  gate,
  opts = {},
  stageId,
  gateInput,
  pluginInvocation,
  normalizeControlResult,
  createRemediationController = null,
  buildRemediationHandlers = null,
}: any) {
  const { controlResult, normalizeResult } = await runScheduledGateControlInvocation({
    config,
    progress,
    gateId,
    gate,
    opts,
    stageId,
    gateInput,
    pluginInvocation,
    normalizeControlResult,
  });
  const remediationController = typeof createRemediationController === 'function'
    ? createRemediationController(controlResult)
    : buildRemediationHandlers?.(controlResult);
  const loopResult = await runRemediableGateControlLoopResult({
    initialControlResult: controlResult,
    remediationController,
    normalizeControlResult: normalizeResult,
    gateId,
    gate,
  });

  return { controlResult: loopResult.controlResult };
}
