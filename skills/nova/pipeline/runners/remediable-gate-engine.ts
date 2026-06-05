import { runScheduledGateInvocation } from './scheduled-gate-invocation.ts';
import {
  bumpGateRemediationControlResult,
  isGateRemediationControlResult,
  readGateRemediationSpec,
  resolveGateRemediationController,
} from '../services/remediation-handoff.ts';

export async function runRemediableGateControlLoopResult({
  initialControlResult,
  remediationController = null,
  evaluateGate = null,
  performFix = null,
  buildExhaustedControlResult = null,
  normalizeControlResult,
  gateId,
  gate,
}) {
  if (typeof normalizeControlResult !== 'function') {
    throw new Error(`gate:${gate?.type || gateId || 'unknown'} remediable loop requires normalizeControlResult(...)`);
  }

  const controller = resolveGateRemediationController({
    remediationController,
    evaluateGate,
    performFix,
    buildExhaustedControlResult,
  }, `gate:${gate?.type || gateId || 'unknown'}`);
  let controlResult = initialControlResult;

  while (isGateRemediationControlResult(controlResult)) {
    const remediation = readGateRemediationSpec(controlResult);
    const maxFixCycles = Number(remediation?.policy?.maxFixCycles || 0);
    const cycle = Number(remediation?.policy?.nextFixCycle || 0);

    if (!Number.isFinite(cycle) || cycle < 1 || cycle > maxFixCycles) {
      const exhaustedControlResult = await controller.buildExhaustedControlResult({ controlResult, remediation, gateId, gate });
      return { controlResult: exhaustedControlResult };
    }

    const fixOutcome = await controller.performFix({ controlResult, remediation, cycle, maxFixCycles, gateId, gate });

    if (fixOutcome?.mode === 'terminal') {
      if (!fixOutcome.controlResult) {
        throw new Error(`gate:${gate?.type || gateId || 'unknown'} terminal remediation outcome must return controlResult`);
      }
      return { controlResult: fixOutcome.controlResult };
    }

    if (fixOutcome?.mode === 'retry_request_fix') {
      controlResult = bumpGateRemediationControlResult(
        fixOutcome.controlResult || controlResult,
        cycle + 1,
      );
      continue;
    }

    if (fixOutcome?.mode === 're_evaluate') {
      if (fixOutcome.controlResult) {
        controlResult = fixOutcome.controlResult;
      }
    } else {
      throw new Error(`gate:${gate?.type || gateId || 'unknown'} remediation outcome must use typed mode terminal, retry_request_fix, or re_evaluate`);
    }

    controlResult = await controller.evaluateGate({
      attempt: cycle + 1,
      remediationCycle: cycle,
      controlResult,
      remediation,
      fixOutcomeDegraded: fixOutcome?.degraded || null,
      gateId,
      gate,
    });

    if (isGateRemediationControlResult(controlResult)) {
      const nextRemediation = readGateRemediationSpec(controlResult);
      const nextCycle = Number(nextRemediation?.policy?.nextFixCycle || 0);
      if (Number.isFinite(nextCycle) && nextCycle <= cycle) {
        if (cycle + 1 > maxFixCycles) {
          const exhaustedControlResult = await controller.buildExhaustedControlResult({ controlResult, remediation: nextRemediation, gateId, gate });
          return { controlResult: exhaustedControlResult };
        }
        controlResult = bumpGateRemediationControlResult(controlResult, cycle + 1);
      }
    }
  }

  return { controlResult };
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
}) {
  const { rawResult, record } = await runScheduledGateInvocation({
    config,
    progress,
    gateId,
    gate,
    opts,
    stageId,
    gateInput,
    pluginInvocation,
  });

  const normalizeBase = { input: gateInput, stageId, moduleId: record?.manifest?.moduleId || null, pluginInvocation };
  const controlResult = normalizeControlResult(rawResult, normalizeBase);
  const remediationController = typeof createRemediationController === 'function'
    ? createRemediationController(controlResult)
    : buildRemediationHandlers?.(controlResult);
  const loopResult = await runRemediableGateControlLoopResult({
    initialControlResult: controlResult,
    remediationController,
    normalizeControlResult: (rawResult, normalizeOpts = {}) => normalizeControlResult(rawResult, { ...normalizeBase, ...normalizeOpts }),
    gateId,
    gate,
  });

  return { controlResult: loopResult.controlResult };
}
