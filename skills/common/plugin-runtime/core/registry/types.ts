import type {
  AdapterRegistration,
  ObserverRegistration,
  PackageProvenance,
  PluginManifest,
  RegistrationProvenance,
  StageRegistration,
} from '../../sdk/src/index.ts';

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

export interface RegistrySnapshot {
  readonly apiVersion: 'pipeline-plugin-v2';
  readonly packages: ReadonlyMap<string, DiscoveredPackage>;
  readonly stages: ReadonlyMap<string, StageRegistryEntry>;
  readonly observers: ReadonlyMap<string, ObserverRegistryEntry>;
  readonly adapters: ReadonlyMap<string, AdapterRegistryEntry>;
  readonly capabilityProviders: ReadonlyMap<string, readonly AdapterRegistryEntry[]>;
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
