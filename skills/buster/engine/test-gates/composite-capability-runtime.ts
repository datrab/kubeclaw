import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';

export class CompositeTestProviderCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #routes: ReadonlyMap<string, TestProviderCapabilityInvoker>;
  constructor(routes: ReadonlyMap<string, TestProviderCapabilityInvoker>) { this.#routes = new Map(routes); }
  invoke(capability: string, request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const route = this.#routes.get(capability);
    if (!route) throw new Error(`TEST_PROVIDER_CAPABILITY_UNAVAILABLE:${capability}`);
    return route.invoke(capability, request, signal);
  }
}
