const ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const CAPABILITY = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCapabilityProviders(raw = process.env.KUBECLAW_CAPABILITY_PROVIDERS) {
  if (!raw) throw new Error('CAPABILITY_PROVIDER_CATALOG_MISSING');
  let source;
  try {
    source = JSON.parse(raw);
  } catch {
    throw new Error('CAPABILITY_PROVIDER_CATALOG_INVALID');
  }
  if (!record(source) || Object.keys(source).length < 1) {
    throw new Error('CAPABILITY_PROVIDER_CATALOG_INVALID');
  }
  const providers = new Map();
  for (const [providerId, value] of Object.entries(source)) {
    if (!ID.test(providerId) || !record(value) || !ID.test(String(value.agentRole ?? '')) || !record(value.capabilities)) {
      throw new Error(`CAPABILITY_PROVIDER_INVALID:${providerId}`);
    }
    const capabilities = new Map();
    for (const [capability, route] of Object.entries(value.capabilities)) {
      if (!CAPABILITY.test(capability) || !record(route) || !ID.test(String(route.adapter ?? ''))) {
        throw new Error(`CAPABILITY_PROVIDER_ROUTE_INVALID:${providerId}:${capability}`);
      }
      let endpoint;
      try {
        endpoint = new URL(String(route.endpoint ?? ''));
      } catch {
        throw new Error(`CAPABILITY_PROVIDER_ENDPOINT_INVALID:${providerId}:${capability}`);
      }
      if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
        throw new Error(`CAPABILITY_PROVIDER_ENDPOINT_INVALID:${providerId}:${capability}`);
      }
      if (endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
        throw new Error(`CAPABILITY_PROVIDER_ENDPOINT_INVALID:${providerId}:${capability}`);
      }
      capabilities.set(capability, Object.freeze({
        adapter: route.adapter,
        endpoint: endpoint.origin,
      }));
    }
    if (capabilities.size < 1) throw new Error(`CAPABILITY_PROVIDER_EMPTY:${providerId}`);
    providers.set(providerId, Object.freeze({
      agentRole: value.agentRole,
      capabilities,
    }));
  }
  return providers;
}

export function resolveProviderCapability(providers, providerId, capability) {
  const provider = providers.get(providerId);
  if (!provider) throw new Error(`CAPABILITY_PROVIDER_NOT_FOUND:${providerId}`);
  const route = provider.capabilities.get(capability);
  if (!route) throw new Error(`CAPABILITY_PROVIDER_ROUTE_NOT_FOUND:${providerId}:${capability}`);
  return route;
}
