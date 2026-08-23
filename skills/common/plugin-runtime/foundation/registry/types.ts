import type {
  AdapterRegistration,
  ObserverRegistration,
  PackageProvenance,
  PluginManifest,
  ReportAdapterRegistration,
  RegistrationProvenance,
  StageRegistration,
  TestProviderRegistration,
} from '@kubeclaw/plugin-sdk';
import type { ProviderRegistrationV1, ReportAdapterRegistrationV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface DiscoveredPackage {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifest: PluginManifest;
  readonly provenance: PackageProvenance;
}

export interface StageRegistryEntry {
  readonly registration: StageRegistration;
  readonly provenance: RegistrationProvenance;
  readonly package: DiscoveredPackage;
}

export interface ObserverRegistryEntry {
  readonly registration: ObserverRegistration;
  readonly provenance: RegistrationProvenance;
  readonly package: DiscoveredPackage;
}

export interface AdapterRegistryEntry {
  readonly registration: AdapterRegistration;
  readonly provenance: RegistrationProvenance;
  readonly package: DiscoveredPackage;
}

export interface TestProviderRegistryEntry {
  readonly declaration: TestProviderRegistration;
  readonly registration: ProviderRegistrationV1;
  readonly provenance: RegistrationProvenance;
  readonly configSchemaPath: string;
  readonly configSchemaDigest: string;
  readonly package: DiscoveredPackage;
}

export interface ReportAdapterRegistryEntry {
  readonly declaration: ReportAdapterRegistration;
  readonly registration: ReportAdapterRegistrationV1;
  readonly provenance: RegistrationProvenance;
  readonly package: DiscoveredPackage;
}

export interface RegistrySnapshot {
  readonly apiVersion: 'pipeline-plugin-v2';
  readonly snapshotDigest: string;
  readonly packages: ReadonlyMap<string, DiscoveredPackage>;
  readonly stages: ReadonlyMap<string, StageRegistryEntry>;
  readonly observers: ReadonlyMap<string, ObserverRegistryEntry>;
  readonly adapters: ReadonlyMap<string, AdapterRegistryEntry>;
  readonly capabilityProviders: ReadonlyMap<string, readonly AdapterRegistryEntry[]>;
  readonly testProviders: ReadonlyMap<string, TestProviderRegistryEntry>;
  readonly testProviderContracts: ReadonlyMap<string, TestProviderRegistryEntry>;
  readonly reportAdapters: ReadonlyMap<string, ReportAdapterRegistryEntry>;
  readonly reportAdapterFormats: ReadonlyMap<string, readonly ReportAdapterRegistryEntry[]>;
}

export interface TrustPolicy {
  readonly trustedBuiltinRoots: readonly string[];
  readonly allowedSourceDigests: ReadonlyMap<string, readonly string[]>;
  readonly verifiedAttestations: ReadonlyMap<string, string>;
  readonly verifierId: string;
}

export interface DiscoveryOptions {
  readonly installationRoots: readonly string[];
  readonly trustPolicy: TrustPolicy;
  readonly now?: () => Date;
}
