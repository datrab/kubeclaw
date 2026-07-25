import { buildStagePluginInvocation } from './stage-envelope-primitives.ts';
import { resolveStatusDispatchId, resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { normalizeTypedWorkerControlResult } from '../services/contracts/worker-control-result.ts';
import { coerceModuleForgeWorkerControlResult } from '../agents/orchestration.ts';
import { invocationAttempt, optionalText, requiredText } from './module-runner-shared.ts';

type AnyRecord = Record<string, any>;

export function buildModuleWorkerPluginInvocation(moduleId: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId, attempt: invocationAttempt(status, opts),
    dispatchId: opts?.dispatchId !== undefined ? requiredText(opts.dispatchId, 'module worker dispatchId') : optionalText(resolveStatusDispatchId(status)),
    sessionKey: resolveStatusSessionKey(status), gatewayLabel: resolveStatusGatewayLabel(status),
  });
}

export function buildModuleValidatorPluginInvocation(moduleId: string, status: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId, attempt: invocationAttempt(status, opts), causationRef: optionalText(opts?.causationRef),
  });
}

export function normalizeModuleForgeWorkerResult(config: AnyRecord, workerInput: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  return normalizeTypedWorkerControlResult(rawResult, {
    producerType: 'module_forge', label: 'Module Forge',
    stageId: requiredText(opts?.stageId, 'module_forge.stageId'), moduleId: requiredText(opts?.moduleId, 'module_forge.moduleId'),
    input: workerInput, invocation: opts?.pluginInvocation ?? null,
    coerce: (result: unknown) => coerceModuleForgeWorkerControlResult(config, workerInput, result, opts),
  });
}
