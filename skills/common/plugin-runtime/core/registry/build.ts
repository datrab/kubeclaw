import fs from 'node:fs';
import path from 'node:path';
import type {
  AdapterRegistration,
  ObserverRegistration,
  RegistrationProvenance,
  StageRegistration,
} from '../../sdk/src/index.ts';
import { RegistryError } from './errors.ts';
import { FrozenMap } from './frozen-map.ts';
import { validateReferencedSchema } from './schema.ts';
import type {
  AdapterRegistryEntry,
  DiscoveredPackage,
  ObserverRegistryEntry,
  RegistrySnapshot,
  StageRegistryEntry,
} from './types.ts';

type Registration = StageRegistration | ObserverRegistration | AdapterRegistration;

function assertPackageFile(pkg: DiscoveredPackage, relative: string, label: string): string {
  const unresolved = path.resolve(pkg.root, relative);
  if (!unresolved.startsWith(`${pkg.root}${path.sep}`)) {
    throw new RegistryError('REGISTRY_REFERENCE_FORBIDDEN', `${label} escapes plugin package`, {
      pluginId: pkg.manifest.id,
      relative,
    });
  }
  let canonical: string;
  try {
    canonical = fs.realpathSync(unresolved);
  } catch {
    throw new RegistryError('REGISTRY_REFERENCE_MISSING', `${label} does not exist`, {
      pluginId: pkg.manifest.id,
      relative,
    });
  }
  if (!canonical.startsWith(`${pkg.root}${path.sep}`) || !fs.statSync(canonical).isFile()) {
    throw new RegistryError('REGISTRY_REFERENCE_FORBIDDEN', `${label} is outside the plugin package or not a file`, {
      pluginId: pkg.manifest.id,
      relative,
    });
  }
  return canonical;
}

function validateRegistrationFiles(pkg: DiscoveredPackage, registration: Registration): void {
  assertPackageFile(pkg, registration.module, 'registration module');
  const schemas = [
    ['configuration schema', registration.configSchema],
    ...('inputSchema' in registration ? [['input schema', registration.inputSchema] as const] : []),
    ...('resultSchema' in registration ? [['result schema', registration.resultSchema] as const] : []),
    ...('checkpointSchema' in registration ? [['checkpoint schema', registration.checkpointSchema] as const] : []),
  ] as const;
  for (const [label, relative] of schemas) {
    const canonical = assertPackageFile(pkg, relative, label);
    validateReferencedSchema(fs.readFileSync(canonical, 'utf8'), canonical);
  }
}

function provenance(
  pkg: DiscoveredPackage,
  surface: RegistrationProvenance['surface'],
  registrationId: string,
): RegistrationProvenance {
  return Object.freeze({
    schemaVersion: 'registration-provenance.v2',
    package: pkg.provenance,
    surface,
    registrationId,
  });
}

function registrySnapshot(packageEntries: Array<readonly [string, DiscoveredPackage]>, stageEntries: Array<readonly [string, StageRegistryEntry]>, observerEntries: Array<readonly [string, ObserverRegistryEntry]>, adapterEntries: Array<readonly [string, AdapterRegistryEntry]>, capabilityEntries: Map<string, AdapterRegistryEntry[]>): RegistrySnapshot {
  return Object.freeze({ apiVersion: 'pipeline-plugin-v2', packages: new FrozenMap(packageEntries), stages: new FrozenMap(stageEntries),
    observers: new FrozenMap(observerEntries), adapters: new FrozenMap(adapterEntries),
    capabilityProviders: new FrozenMap([...capabilityEntries].map(([capability, providers]) => [capability, Object.freeze([...providers])])) });
}

export function buildRegistry(packages: readonly DiscoveredPackage[]): RegistrySnapshot {
  const packageEntries: Array<readonly [string, DiscoveredPackage]> = [];
  const stageEntries: Array<readonly [string, StageRegistryEntry]> = [];
  const observerEntries: Array<readonly [string, ObserverRegistryEntry]> = [];
  const adapterEntries: Array<readonly [string, AdapterRegistryEntry]> = [];
  const capabilityEntries = new Map<string, AdapterRegistryEntry[]>();
  const packageIds = new Set<string>(); const registrationIds = new Set<string>(); const stageTypes = new Set<string>();

  for (const pkg of packages) {
    if (packageIds.has(pkg.manifest.id)) {
      throw new RegistryError('REGISTRY_PACKAGE_DUPLICATE', `Duplicate plugin ID: ${pkg.manifest.id}`);
    }
    packageIds.add(pkg.manifest.id);
    packageEntries.push([pkg.manifest.id, pkg]);

    const claim = (registration: Registration, surface: RegistrationProvenance['surface']): string => {
      validateRegistrationFiles(pkg, registration);
      const globalId = `${pkg.manifest.id}:${registration.id}`;
      if (registrationIds.has(globalId)) {
        throw new RegistryError('REGISTRY_REGISTRATION_CONFLICT', `Duplicate registration ID: ${globalId}`);
      }
      registrationIds.add(globalId);
      return globalId;
    };

    for (const registration of pkg.manifest.stages) {
      claim(registration, 'stage');
      if (stageTypes.has(registration.type)) {
        throw new RegistryError('REGISTRY_STAGE_OWNER_CONFLICT', `Duplicate stage type owner: ${registration.type}`);
      }
      stageTypes.add(registration.type);
      stageEntries.push([registration.type, Object.freeze({
        registration: Object.freeze(registration),
        provenance: provenance(pkg, 'stage', registration.id),
        package: pkg,
      })]);
    }
    for (const registration of pkg.manifest.observers) {
      const globalId = claim(registration, 'observer');
      observerEntries.push([globalId, Object.freeze({
        registration: Object.freeze(registration),
        provenance: provenance(pkg, 'observer', registration.id),
        package: pkg,
      })]);
    }
    for (const registration of pkg.manifest.adapters) {
      const globalId = claim(registration, 'adapter');
      const entry = Object.freeze({
        registration: Object.freeze(registration),
        provenance: provenance(pkg, 'adapter', registration.id),
        package: pkg,
      });
      adapterEntries.push([globalId, entry]);
      for (const capability of registration.providesCapabilities) {
        const providers = capabilityEntries.get(capability) ?? [];
        providers.push(entry);
        capabilityEntries.set(capability, providers);
      }
    }
  }

  return registrySnapshot(packageEntries, stageEntries, observerEntries, adapterEntries, capabilityEntries);
}
