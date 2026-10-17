import { runtimeDispatchProfileFields, type AdapterActivationContext, type AdapterInstance, type EffectRequest } from '@kubeclaw/plugin-sdk';
import { createDispatchAdapter } from './dispatch-adapter.ts';
import { dispatchOpenClaw } from './openclaw.ts';
import { targetsFrom, validTargetId } from './openclaw-config.ts';
import { workspaceTarget } from './workspace-target.ts';

function assertRequest(request: EffectRequest): void {
  if (
    request.capability !== 'runtime.dispatch'
    || request.operation !== 'dispatch'
    || request.resource.type !== 'runtime.agent'
    || !validTargetId(request.resource.canonicalId)
  ) {
    throw new Error('RUNTIME_OPERATION_UNSUPPORTED');
  }
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const targets = targetsFrom(context.config);
  return createDispatchAdapter(context, targets, assertRequest, async ({ request, signal, target }) => (
    dispatchOpenClaw(context, request.resource.canonicalId, workspaceTarget(target, request),
      request.payload as Record<string, unknown>, signal, request.idempotencyKey, runtimeDispatchProfileFields(request, request.capability).runtimeDispatchProfile)
  ));
}
