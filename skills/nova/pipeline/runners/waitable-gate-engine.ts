import { runScheduledGateControlInvocation } from './scheduled-gate-invocation.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function validateGateWaitController(controller: any = {}, stageId: any = 'gate:missing_gate_type') {
  const errors: any[] = [];
  if (selectTruthyValue(() => (!controller), () => (typeof controller !== 'object'))) {
    return [`${stageId} wait controller must be an object`];
  }
  if (typeof controller.waitForSignal !== 'function') {
    errors.push(`${stageId} wait controller must implement waitForSignal(...)`);
  }
  return errors;
}

export function resolveGateWaitController(controller: any = {}, stageId: any = 'gate:missing_gate_type') {
  const errors = validateGateWaitController(controller, stageId);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return controller;
}


async function runWaitableGateControlLoopResult({
  initialControlResult,
  waitController,
  normalizeControlResult,
  gateId,
  gate,
}: any) {
  if (typeof normalizeControlResult !== 'function') {
    throw new Error(`gate:${selectTruthyValue(() => (selectTruthyValue(() => (gate?.type), () => (gateId))), () => ('missing_gate_type'))} waitable loop requires normalizeControlResult(...)`);
  }

  if (initialControlResult?.nextAction !== 'wait') {
    return { controlResult: initialControlResult };
  }

  const controller = resolveGateWaitController(waitController, `gate:${selectTruthyValue(() => (selectTruthyValue(() => (gate?.type), () => (gateId))), () => ('missing_gate_type'))}`);
  const resolved = await controller.waitForSignal({
    controlResult: initialControlResult,
    gateId,
    gate,
  });
  const resolvedControlResult = normalizeControlResult(resolved);
  return { controlResult: resolvedControlResult };
}

export async function runScheduledWaitableGate({
  config,
  progress,
  gateId,
  gate,
  opts = {},
  stageId,
  gateInput,
  pluginInvocation,
  normalizeControlResult,
  createWaitController,
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
  const waitController = controlResult?.nextAction === 'wait'
    ? createWaitController(controlResult)
    : null;
  try {
    const loopResult = await runWaitableGateControlLoopResult({
      initialControlResult: controlResult,
      waitController,
      normalizeControlResult: normalizeResult,
      gateId,
      gate,
    });
    return { controlResult: loopResult.controlResult };
  } catch (error: any) {
    return { controlResult: null, error, stageStarted: true };
  }
}
