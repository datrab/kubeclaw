import { validateComponentSettings } from './swarm-bundle.ts';

export interface BusterManifestPolicy {
  readonly maximumNodes: number;
  readonly maximumDepth: number;
  readonly maximumAliases: number;
  readonly maximumFlattenVisits: number;
  readonly maximumFlattenPending: number;
}
export interface BusterClusterSharedSettings {
  readonly kubectlExecutable: string;
  readonly leaseApiGroup: string;
  readonly leaseApiVersion: string;
}
export interface BusterKubernetesFixtureSettings {
  readonly allowedNamespacePrefixes: readonly string[];
  readonly registryRepositoryPrefixes: readonly string[];
  readonly allowedSecretReferences: readonly string[];
  readonly allowedStorageClasses: readonly string[];
  readonly allowDefaultStorageClass: boolean;
  readonly runnerServiceAccount: string;
  readonly credentialReaderServiceAccount: string;
  readonly maximumManifestBytes: number;
  readonly maximumResources: number;
  readonly maximumPersistentVolumeClaimBytes: number;
  readonly maximumPersistentVolumeTotalBytes: number;
  readonly maximumRetentionSeconds: number;
  readonly maximumExecutionMs: number;
  readonly pollIntervalMs: number;
  readonly shortCommandTimeoutMs: number;
  readonly commandOutputManifestMultiplier: number;
  readonly diagnosticCodeUnits: number;
  readonly manifest: BusterManifestPolicy;
}
export interface BusterTailscaleExposureSettings {
  readonly allowedNamespacePrefixes: readonly string[];
  readonly allowedHostSuffixes: readonly string[];
  readonly maximumExecutionMs: number;
  readonly pollIntervalMs: number;
  readonly shortCommandTimeoutMs: number;
  readonly maximumCommandOutputBytes: number;
}
export interface BusterClusterInvokerSettings {
  readonly shared: BusterClusterSharedSettings;
  readonly kubernetesFixture: BusterKubernetesFixtureSettings;
  readonly tailscaleExposure: BusterTailscaleExposureSettings;
}
export function validateBusterClusterInvokerSettings(value: unknown): BusterClusterInvokerSettings {
  validateComponentSettings('buster-cluster-invokers', value, 'SWARM_CONFIG_BUSTER_CLUSTER_INVALID');
  const input = value as BusterClusterInvokerSettings;
  const kube = input.kubernetesFixture;
  const tail = input.tailscaleExposure;
  if (kube.maximumPersistentVolumeTotalBytes < kube.maximumPersistentVolumeClaimBytes
    || !Number.isSafeInteger(kube.maximumManifestBytes * kube.commandOutputManifestMultiplier)
    || tail.pollIntervalMs > tail.maximumExecutionMs
    || tail.allowedHostSuffixes.some(suffix => suffix.includes('..'))) {
    throw new Error('SWARM_CONFIG_BUSTER_CLUSTER_COHERENCE_INVALID');
  }
  return Object.freeze({ shared: Object.freeze({ ...input.shared }),
    kubernetesFixture: Object.freeze({ ...kube,
      allowedNamespacePrefixes: Object.freeze([...kube.allowedNamespacePrefixes]),
      registryRepositoryPrefixes: Object.freeze([...kube.registryRepositoryPrefixes]),
      allowedSecretReferences: Object.freeze([...kube.allowedSecretReferences]),
      allowedStorageClasses: Object.freeze([...kube.allowedStorageClasses]),
      manifest: Object.freeze({ ...kube.manifest }) }),
    tailscaleExposure: Object.freeze({ ...tail,
      allowedNamespacePrefixes: Object.freeze([...tail.allowedNamespacePrefixes]),
      allowedHostSuffixes: Object.freeze([...tail.allowedHostSuffixes]) }) });
}

export function rejectLegacyClusterEnvironment(environment: Readonly<Record<string, string | undefined>>): void {
  for (const key of ['BUSTER_LEASE_API_GROUP', 'BUSTER_LEASE_API_VERSION', 'BUSTER_ALLOWED_SOURCE_SECRETS']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}`);
  }
}
