import type {
  AdapterActivationContext,
  AdapterInstance,
  EffectRequest,
} from '@kubeclaw/plugin-sdk';

interface DispatchInvocation<Target> {
  readonly context: AdapterActivationContext;
  readonly target: Target;
  readonly request: EffectRequest;
  readonly signal: AbortSignal;
}

export function createDispatchAdapter<Target>(
  context: AdapterActivationContext,
  targets: ReadonlyMap<string, Target>,
  assertRequest: (request: EffectRequest) => void,
  dispatch: (invocation: DispatchInvocation<Target>) => Promise<Readonly<Record<string, unknown>>>,
): AdapterInstance {
  let shuttingDown = false;
  return {
    async ready() {
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
    },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      assertRequest(request);
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`RUNTIME_TARGET_DENIED:${request.resource.canonicalId}`);
      return dispatch({ context, target, request, signal });
    },
    async shutdown() {
      shuttingDown = true;
    },
  };
}
