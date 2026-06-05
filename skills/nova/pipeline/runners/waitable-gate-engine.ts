import { runScheduledGateInvocation } from './scheduled-gate-invocation.ts';

export function validateGateWaitController(controller = {}, stageId = 'gate:unknown') {
  const errors = [];
  if (!controller || typeof controller !== 'object') {
    return [`${stageId} wait controller must be an object`];
  }
  if (typeof controller.waitForSignal !== 'function') {
    errors.push(`${stageId} wait controller must implement waitForSignal(...)`);
  }
  return errors;
}

export function resolveGateWaitController(controller = {}, stageId = 'gate:unknown') {
  const errors = validateGateWaitController(controller, stageId);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return controller;
}


export async function runWaitableGateControlLoopResult({
  initialControlResult,
  waitController,
  normalizeControlResult,
  gateId,
  gate,
}) {
  if (typeof normalizeControlResult !== 'function') {
    throw new Error(`gate:${gate?.type || gateId || 'unknown'} waitable loop requires normalizeControlResult(...)`);
  }

  if (initialControlResult?.nextAction !== 'wait') {
    return { controlResult: initialControlResult };
  }

  const controller = resolveGateWaitController(waitController, `gate:${gate?.type || gateId || 'unknown'}`);
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
  const waitController = controlResult?.nextAction === 'wait'
    ? createWaitController(controlResult)
    : null;
  try {
    const loopResult = await runWaitableGateControlLoopResult({
      initialControlResult: controlResult,
      waitController,
      normalizeControlResult: (rawResult, normalizeOpts = {}) => normalizeControlResult(rawResult, { ...normalizeBase, ...normalizeOpts }),
      gateId,
      gate,
    });
    return { controlResult: loopResult.controlResult };
  } catch (error) {
    return { controlResult: null, error, stageStarted: true };
  }
}
