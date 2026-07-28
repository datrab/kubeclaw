import type { CapabilityGrant, PackageResolution } from '../../sdk/src/index.ts';
import { RegistryError } from './errors.ts';
import { FrozenMap } from './frozen-map.ts';
import { FrozenSet } from './frozen-set.ts';
import {
  CAPABILITY_IDS,
  isCoreOnlyCapability,
  isKnownCapability,
  validateCapabilityConstraints,
} from './capability-vocabulary.ts';
import type {
  AdapterRegistryEntry,
  RegistrySnapshot,
} from './types.ts';

const CONFIDENTIAL_CAPABILITIES = new Set<string>(['secrets.read']);

export function isConfidentialCapability(capability: string): boolean {
  return CONFIDENTIAL_CAPABILITIES.has(capability);
}

export interface CapabilityPolicy {
  readonly enabledRegistrations: ReadonlySet<string>;
  readonly grants: ReadonlyMap<string, ReadonlyMap<string, Readonly<Record<string, unknown>>>>;
  readonly providers: ReadonlyMap<string, string>;
}

export interface GrantedRegistry {
  readonly snapshot: RegistrySnapshot;
  readonly grants: ReadonlyMap<string, readonly CapabilityGrant[]>;
  readonly selectedProviders: ReadonlyMap<string, AdapterRegistryEntry>;
  readonly availableCapabilities: ReadonlyMap<string, ReadonlySet<string>>;
  readonly enabledRegistrations: ReadonlySet<string>;
}

function packageResolution(entry: AdapterRegistryEntry): PackageResolution {
  const identity = entry.package.provenance.package;
  return {
    ...identity,
    registrationId: entry.registration.id,
  };
}

function registrationRequirements(snapshot: RegistrySnapshot): Array<readonly [string, readonly string[]]> {
  return [
    ...[...snapshot.stages].map(([type, entry]) => [
      `${entry.package.manifest.id}:${entry.registration.id}`,
      entry.registration.requiredCapabilities,
    ] as const),
    ...[...snapshot.observers].map(([id, entry]) => [id, entry.registration.requiredCapabilities] as const),
    ...[...snapshot.adapters].map(([id, entry]) => [id, entry.registration.requiredCapabilities] as const),
  ];
}

function validateVocabulary(snapshot: RegistrySnapshot): void {
  for (const [, requirements] of registrationRequirements(snapshot)) {
    for (const capability of requirements) {
      if (isCoreOnlyCapability(capability)) {
        throw new RegistryError('REGISTRY_CAPABILITY_FORBIDDEN', `Core-only capability cannot be granted: ${capability}`);
      }
      if (!isKnownCapability(capability)) {
        throw new RegistryError('REGISTRY_CAPABILITY_UNKNOWN', `Unknown capability: ${capability}`);
      }
    }
  }
  for (const [, adapter] of snapshot.adapters) {
    for (const capability of adapter.registration.providesCapabilities) {
      if (!isKnownCapability(capability)) {
        throw new RegistryError('REGISTRY_CAPABILITY_UNKNOWN', `Adapter provides unknown capability: ${capability}`);
      }
    }
  }
}

function validateProviderPolicy(
  snapshot: RegistrySnapshot,
  policy: CapabilityPolicy,
): void {
  for (const [capability, providerId] of policy.providers) {
    if (!isKnownCapability(capability)) {
      throw new RegistryError(
        'REGISTRY_CAPABILITY_UNKNOWN',
        `Provider policy references unknown capability: ${capability}`,
      );
    }
    const adapter = snapshot.adapters.get(providerId);
    if (!adapter || !adapter.registration.providesCapabilities.includes(capability)) {
      throw new RegistryError(
        'REGISTRY_CAPABILITY_PROVIDER_INVALID',
        `Invalid provider '${providerId}' for '${capability}'`,
      );
    }
  }
}

function selectedProvider(
  snapshot: RegistrySnapshot,
  policy: CapabilityPolicy,
  capability: string,
): AdapterRegistryEntry {
  const providerId = policy.providers.get(capability);
  if (!providerId) {
    const candidates = snapshot.capabilityProviders.get(capability) ?? [];
    if (candidates.length > 1) {
      throw new RegistryError(
        'REGISTRY_CAPABILITY_PROVIDER_AMBIGUOUS',
        `Required capability has multiple providers and no configured selection: ${capability}`,
      );
    }
    throw new RegistryError(
      'REGISTRY_CAPABILITY_PROVIDER_MISSING',
      `Required capability has no selected provider: ${capability}`,
    );
  }
  const adapter = snapshot.adapters.get(providerId);
  if (!adapter || !adapter.registration.providesCapabilities.includes(capability)) {
    throw new RegistryError('REGISTRY_CAPABILITY_PROVIDER_INVALID', `Invalid provider '${providerId}' for '${capability}'`);
  }
  return adapter;
}

function assertNoAdapterCycles(
  snapshot: RegistrySnapshot,
  providers: ReadonlyMap<string, AdapterRegistryEntry>,
): void {
  const edges = new Map<string, Set<string>>();
  for (const [id, adapter] of snapshot.adapters) {
    const dependencies = new Set<string>();
    for (const capability of adapter.registration.requiredCapabilities) {
      const provider = providers.get(capability);
      if (!provider) continue;
      dependencies.add(`${provider.package.manifest.id}:${provider.registration.id}`);
    }
    edges.set(id, dependencies);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new RegistryError('REGISTRY_ADAPTER_CYCLE', `Adapter capability cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of edges.keys()) visit(id);
}

export function resolveCapabilityGrants(
  snapshot: RegistrySnapshot,
  policy: CapabilityPolicy,
): GrantedRegistry {
  validateVocabulary(snapshot);
  validateProviderPolicy(snapshot, policy);
  const allRequirements = new Map(registrationRequirements(snapshot));
  const enabled = new Set(policy.enabledRegistrations);
  for (const registrationId of enabled) {
    if (!allRequirements.has(registrationId)) {
      throw new RegistryError(
        'REGISTRY_REGISTRATION_MISSING',
        `Enabled registration does not exist: ${registrationId}`,
      );
    }
  }
  const providers = new Map<string, AdapterRegistryEntry>();
  for (;;) {
    const before = enabled.size;
    for (const registrationId of [...enabled]) {
      for (const capability of allRequirements.get(registrationId) ?? []) {
        let provider = providers.get(capability);
        if (!provider) {
          provider = selectedProvider(snapshot, policy, capability);
          providers.set(capability, provider);
        }
        enabled.add(`${provider.package.manifest.id}:${provider.registration.id}`);
      }
    }
    if (enabled.size === before) break;
  }
  const resolved: Array<readonly [string, readonly CapabilityGrant[]]> = [];
  for (const [registrationId, requirements] of allRequirements) {
    if (!enabled.has(registrationId)) continue;
    const configured = policy.grants.get(registrationId);
    const grants: CapabilityGrant[] = [];
    for (const capability of requirements) {
      const constraints = configured?.get(capability);
      if (!constraints) {
        throw new RegistryError('REGISTRY_CAPABILITY_DENIED', `Required capability denied: ${registrationId} -> ${capability}`);
      }
      const normalizedConstraints = validateCapabilityConstraints(capability, constraints);
      const provider = providers.get(capability);
      if (!provider) throw new RegistryError('REGISTRY_CAPABILITY_PROVIDER_MISSING', `Required capability has no selected provider: ${capability}`);
      grants.push(Object.freeze({
        capability,
        provider: packageResolution(provider),
        constraints: normalizedConstraints,
      }));
    }
    if (configured) {
      for (const capability of configured.keys()) {
        if (!requirements.includes(capability)) {
          throw new RegistryError('REGISTRY_CAPABILITY_UNREQUESTED', `Policy grants unrequested capability: ${registrationId} -> ${capability}`);
        }
      }
    }
    resolved.push([registrationId, Object.freeze(grants)]);
  }
  for (const registrationId of policy.grants.keys()) {
    if (!enabled.has(registrationId)) {
      throw new RegistryError('REGISTRY_CAPABILITY_UNREQUESTED', `Policy grants disabled registration: ${registrationId}`);
    }
  }
  const frozenProviders = new FrozenMap(providers);
  assertNoAdapterCycles(snapshot, frozenProviders);
  const available = new FrozenMap(
    resolved.map(([registrationId, grants]) => [
      registrationId,
      new FrozenSet(grants.map((grant) => grant.capability)),
    ] as const),
  );
  return Object.freeze({
    snapshot,
    grants: new FrozenMap(resolved),
    selectedProviders: frozenProviders,
    availableCapabilities: available,
    enabledRegistrations: new FrozenSet(enabled),
  });
}

export { CAPABILITY_IDS } from './capability-vocabulary.ts';
export type { CapabilityId } from './capability-vocabulary.ts';
