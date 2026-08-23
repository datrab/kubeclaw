import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  validatePipelineTestGateContract,
  type PortDeclarationV1,
  type ProviderRegistrationV1,
  type ReportAdapterRegistrationV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import type {
  AdapterRegistration,
  ObserverRegistration,
  RegistrationProvenance,
  ReportAdapterRegistration,
  StageRegistration,
  TestProviderRegistration,
} from '@kubeclaw/plugin-sdk';
import { RegistryError } from './errors.ts';
import { FrozenMap } from './frozen-map.ts';
import { validateReferencedSchema } from './schema.ts';
import type {
  AdapterRegistryEntry,
  DiscoveredPackage,
  ObserverRegistryEntry,
  RegistrySnapshot,
  ReportAdapterRegistryEntry,
  StageRegistryEntry,
  TestProviderRegistryEntry,
} from './types.ts';

type Registration = StageRegistration | ObserverRegistration | AdapterRegistration | TestProviderRegistration | ReportAdapterRegistration;

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

function validateRegistrationFiles(pkg: DiscoveredPackage, registration: Registration): string {
  assertPackageFile(pkg, registration.module, 'registration module');
  const schemas = [
    ...('configSchema' in registration ? [['configuration schema', registration.configSchema] as const] : []),
    ...('inputSchema' in registration ? [['input schema', registration.inputSchema] as const] : []),
    ...('resultSchema' in registration ? [['result schema', registration.resultSchema] as const] : []),
    ...('checkpointSchema' in registration ? [['checkpoint schema', registration.checkpointSchema] as const] : []),
  ] as const;
  for (const [label, relative] of schemas) {
    const canonical = assertPackageFile(pkg, relative, label);
    validateReferencedSchema(fs.readFileSync(canonical, 'utf8'), canonical);
  }
  return 'configSchema' in registration
    ? assertPackageFile(pkg, registration.configSchema, 'configuration schema')
    : '';
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

function schemaDigest(schemaPath: string): string {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(schemaPath)).digest('hex')}`;
}

function compareStableId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalPort(port: TestProviderRegistration['inputs'][number]): PortDeclarationV1 {
  if (port.kind === 'value') {
    if (!port.schemaId) throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Value port requires schemaId: ${port.name}`);
    return { name: port.name, kind: 'value', required: port.required, schemaId: port.schemaId };
  }
  if (!port.mediaTypes?.length) throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Artifact port requires mediaTypes: ${port.name}`);
  return { name: port.name, kind: 'artifact', required: port.required,
    ...(port.schemaId ? { schemaId: port.schemaId } : {}), mediaTypes: [...port.mediaTypes] };
}

function assertUniqueNames(values: readonly { readonly name: string }[], label: string, globalId: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.name)) throw new RegistryError('REGISTRY_REGISTRATION_CONFLICT', `Duplicate ${label} name: ${globalId}:${value.name}`);
    seen.add(value.name);
  }
}

function canonicalTestProvider(pkg: DiscoveredPackage, declaration: TestProviderRegistration): TestProviderRegistryEntry {
  const configSchemaPath = assertPackageFile(pkg, declaration.configSchema, 'configuration schema');
  const globalId = `${pkg.manifest.id}:${declaration.id}`;
  assertUniqueNames(declaration.inputs, 'input', globalId);
  assertUniqueNames(declaration.outputs, 'output', globalId);
  const supportedEvidence = new Set(declaration.evidenceTypes);
  if (declaration.reportFormats.length > 0 && !supportedEvidence.has('test-report')) {
    throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Report provider must support test-report evidence: ${globalId}`);
  }
  for (const evidenceType of [
    ...declaration.evidenceDefaults.onPass,
    ...declaration.evidenceDefaults.onFail,
    ...declaration.evidenceDefaults.onError,
  ]) {
    if (!supportedEvidence.has(evidenceType)) {
      throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Evidence default is not supported: ${globalId}:${evidenceType}`);
    }
  }
  const registration: ProviderRegistrationV1 = deepFreeze({
    schemaVersion: 'provider-registration.v1',
    registrationId: declaration.id,
    contractId: declaration.contractId,
    kind: declaration.kind,
    package: { packageId: pkg.manifest.id, packageVersion: pkg.manifest.packageVersion,
      contentDigest: pkg.provenance.package.contentDigest },
    entrypoint: { module: declaration.module, export: declaration.export },
    configSchema: declaration.configSchema,
    inputs: declaration.inputs.map(canonicalPort),
    outputs: declaration.outputs.map(canonicalPort),
    capabilities: [...declaration.requiredCapabilities],
    retrySafe: declaration.retrySafe,
    matrixFields: [...declaration.matrixFields],
    reportFormats: [...declaration.reportFormats],
    evidenceTypes: [...declaration.evidenceTypes],
    evidenceDefaults: { onPass: [...declaration.evidenceDefaults.onPass],
      onFail: [...declaration.evidenceDefaults.onFail], onError: [...declaration.evidenceDefaults.onError] },
  });
  validatePipelineTestGateContract('providerRegistration', registration);
  return Object.freeze({ declaration, registration, provenance: provenance(pkg, 'test_provider', declaration.id),
    configSchemaPath, configSchemaDigest: schemaDigest(configSchemaPath), package: pkg });
}

function canonicalReportAdapter(pkg: DiscoveredPackage, declaration: ReportAdapterRegistration): ReportAdapterRegistryEntry {
  const registration: ReportAdapterRegistrationV1 = deepFreeze({
    schemaVersion: 'report-adapter-registration.v1',
    adapterId: declaration.id,
    format: declaration.format,
    contractVersion: declaration.contractVersion,
    package: {
      packageId: pkg.manifest.id,
      packageVersion: pkg.manifest.packageVersion,
      contentDigest: pkg.provenance.package.contentDigest,
    },
    entrypoint: { module: declaration.module, export: declaration.export },
    mediaTypes: [...declaration.mediaTypes],
  });
  validatePipelineTestGateContract('reportAdapterRegistration', registration);
  return Object.freeze({
    declaration,
    registration,
    provenance: provenance(pkg, 'report_adapter', declaration.id),
    package: pkg,
  });
}

function snapshotDigest(packageEntries: Array<readonly [string, DiscoveredPackage]>, stageEntries: Array<readonly [string, StageRegistryEntry]>, observerEntries: Array<readonly [string, ObserverRegistryEntry]>, adapterEntries: Array<readonly [string, AdapterRegistryEntry]>, testProviderEntries: Array<readonly [string, TestProviderRegistryEntry]>, reportAdapterEntries: Array<readonly [string, ReportAdapterRegistryEntry]>): string {
  const facts = {
    packages: packageEntries.map(([id, pkg]) => [id, pkg.manifest.packageVersion, pkg.provenance.package.contentDigest]).sort(),
    stages: stageEntries.map(([type, entry]) => [type, entry.package.manifest.id, entry.registration.id]).sort(),
    observers: observerEntries.map(([id]) => id).sort(),
    adapters: adapterEntries.map(([id]) => id).sort(),
    testProviders: testProviderEntries.map(([id, entry]) => [id, entry.registration.contractId, entry.configSchemaDigest]).sort(),
    reportAdapters: reportAdapterEntries.map(([id, entry]) => [id, entry.registration.format, entry.registration.contractVersion]).sort(),
  };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex')}`;
}

function registrySnapshot(packageEntries: Array<readonly [string, DiscoveredPackage]>, stageEntries: Array<readonly [string, StageRegistryEntry]>, observerEntries: Array<readonly [string, ObserverRegistryEntry]>, adapterEntries: Array<readonly [string, AdapterRegistryEntry]>, capabilityEntries: Map<string, AdapterRegistryEntry[]>, testProviderEntries: Array<readonly [string, TestProviderRegistryEntry]>, testProviderContractEntries: Array<readonly [string, TestProviderRegistryEntry]>, reportAdapterEntries: Array<readonly [string, ReportAdapterRegistryEntry]>, reportAdapterFormatEntries: Map<string, ReportAdapterRegistryEntry[]>): RegistrySnapshot {
  return Object.freeze({ apiVersion: 'pipeline-plugin-v2', snapshotDigest: snapshotDigest(packageEntries, stageEntries, observerEntries, adapterEntries, testProviderEntries, reportAdapterEntries), packages: new FrozenMap(packageEntries), stages: new FrozenMap(stageEntries),
    observers: new FrozenMap(observerEntries), adapters: new FrozenMap(adapterEntries),
    capabilityProviders: new FrozenMap([...capabilityEntries].map(([capability, providers]) => [capability, Object.freeze([...providers])])),
    testProviders: new FrozenMap(testProviderEntries), testProviderContracts: new FrozenMap(testProviderContractEntries),
    reportAdapters: new FrozenMap([...reportAdapterEntries].sort(([left], [right]) => compareStableId(left, right))),
    reportAdapterFormats: new FrozenMap([...reportAdapterFormatEntries]
      .sort(([left], [right]) => compareStableId(left, right))
      .map(([format, entries]) => [format, Object.freeze([...entries].sort((left, right) => {
        const leftId = `${left.registration.package.packageId}:${left.registration.adapterId}:${left.registration.contractVersion}:${left.registration.package.contentDigest}`;
        const rightId = `${right.registration.package.packageId}:${right.registration.adapterId}:${right.registration.contractVersion}:${right.registration.package.contentDigest}`;
        return compareStableId(leftId, rightId);
      }))] as const)) });
}

export function buildRegistry(packages: readonly DiscoveredPackage[]): RegistrySnapshot {
  const packageEntries: Array<readonly [string, DiscoveredPackage]> = [];
  const stageEntries: Array<readonly [string, StageRegistryEntry]> = [];
  const observerEntries: Array<readonly [string, ObserverRegistryEntry]> = [];
  const adapterEntries: Array<readonly [string, AdapterRegistryEntry]> = [];
  const testProviderEntries: Array<readonly [string, TestProviderRegistryEntry]> = [];
  const testProviderContractEntries: Array<readonly [string, TestProviderRegistryEntry]> = [];
  const reportAdapterEntries: Array<readonly [string, ReportAdapterRegistryEntry]> = [];
  const reportAdapterFormatEntries = new Map<string, ReportAdapterRegistryEntry[]>();
  const capabilityEntries = new Map<string, AdapterRegistryEntry[]>();
  const packageIds = new Set<string>(); const registrationIds = new Set<string>(); const stageTypes = new Set<string>();
  const testProviderContracts = new Set<string>();

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
    for (const registration of pkg.manifest.testProviders ?? []) {
      const globalId = claim(registration, 'test_provider');
      if (testProviderContracts.has(registration.contractId)) {
        throw new RegistryError('REGISTRY_TEST_PROVIDER_CONTRACT_CONFLICT', `Duplicate test-provider contract: ${registration.contractId}`);
      }
      testProviderContracts.add(registration.contractId);
      const entry = canonicalTestProvider(pkg, registration);
      testProviderEntries.push([globalId, entry]);
      testProviderContractEntries.push([registration.contractId, entry]);
    }
    for (const registration of pkg.manifest.reportAdapters ?? []) {
      const globalId = claim(registration, 'report_adapter');
      const entry = canonicalReportAdapter(pkg, registration);
      reportAdapterEntries.push([globalId, entry]);
      const entries = reportAdapterFormatEntries.get(registration.format) ?? [];
      entries.push(entry);
      reportAdapterFormatEntries.set(registration.format, entries);
    }
  }

  return registrySnapshot(packageEntries, stageEntries, observerEntries, adapterEntries, capabilityEntries, testProviderEntries, testProviderContractEntries, reportAdapterEntries, reportAdapterFormatEntries);
}
