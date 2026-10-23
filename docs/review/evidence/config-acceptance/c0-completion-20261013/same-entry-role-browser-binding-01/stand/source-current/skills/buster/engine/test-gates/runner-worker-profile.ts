import crypto from 'node:crypto';
import type { ResolvedPlanNodeV1, ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { RegistrySnapshot, TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';
import type { WorkerProfileV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { workerProfileDigest } from '@kubeclaw/worker-core';
import { compareText } from './runner-values.ts';
export function providerEntry(
  registry: RegistrySnapshot,
  node: ResolvedPlanNodeV1,
): TestProviderRegistryEntry {
  const entry = registry.testProviderContracts.get(node.provider.contractId);
  if (!entry)
    throw new Error(`TEST_PROVIDER_MISSING:${node.provider.contractId}`);
  return entry;
}

function registrationGrants(grants: ReadonlyMap<string, readonly string[]> | undefined,
  registrationId: string): readonly string[] {
  const selected = grants?.get(registrationId);
  return selected === undefined || selected === null ? [] : selected;
}

export function grantedCapabilities(
  options: {
    readonly registry: RegistrySnapshot;
    readonly grants: ReadonlyMap<string, readonly string[]> | undefined;
  },
  node: ResolvedPlanNodeV1,
): string[] {
  const entry = providerEntry(options.registry, node);
  const registrationId = `${entry.registration.package.packageId}:${entry.registration.registrationId}`;
  const nodeGrants = options.grants?.get(node.id);
  const configured = new Set(nodeGrants !== undefined && nodeGrants !== null
    ? nodeGrants
    : registrationGrants(options.grants, registrationId));
  return entry.registration.capabilities
    .filter((capability) => configured.has(capability))
    .sort();
}

export function createBusterWorkerProfile(
  registry: RegistrySnapshot,
  granted: readonly string[],
): WorkerProfileV1 {
  const capabilities = [...new Set(["provider.execute", ...granted])].sort();
  const capabilityKey = crypto.createHash('sha256').update(capabilities.join('\0')).digest('hex').slice(0, 16);
  const base = {
    schemaVersion: "worker-profile.v1" as const,
    profileId: `buster.local.${capabilityKey}`,
    workerType: "buster",
    coreContractId: "kubeclaw.worker-core@1",
    engine: {
      engineId: "buster-test-engine",
      contractId: "kubeclaw.buster-engine@1",
      engineVersion: "1.0.0",
      contentDigest: registry.snapshotDigest,
    },
    capabilities,
  };
  return { ...base, profileDigest: workerProfileDigest(base) };
}

export function createBusterWorkerProfiles(
  plan: ResolvedTestPlanV1,
  registry: RegistrySnapshot,
  grants?: ReadonlyMap<string, readonly string[]>,
): WorkerProfileV1[] {
  const profiles = new Map<string, WorkerProfileV1>();
  for (const node of plan.nodes) {
    const granted = grantedCapabilities({ registry, grants }, node);
    const profile = createBusterWorkerProfile(registry, granted);
    profiles.set(profile.profileDigest, profile);
  }
  return [...profiles.values()].sort((left, right) =>
    compareText(left.profileDigest, right.profileDigest),
  );
}

