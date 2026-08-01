export interface ProviderRoute {
  readonly adapter: string;
  readonly endpoint: string;
}

export interface CapabilityProvider {
  readonly agentRole: string;
  readonly capabilities: ReadonlyMap<string, ProviderRoute>;
}

export function parseCapabilityProviders(
  raw?: string,
): ReadonlyMap<string, CapabilityProvider>;

export function resolveProviderCapability(
  providers: ReadonlyMap<string, CapabilityProvider>,
  providerId: string,
  capability: string,
): ProviderRoute;
