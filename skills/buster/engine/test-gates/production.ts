import fs from 'node:fs';
import path from 'node:path';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { buildRegistry } from '@kubeclaw/plugin-foundation/registry/build';
import { discoverPackages } from '@kubeclaw/plugin-foundation/registry/discovery';
import { BusterRemotePlanRuntime } from './remote-plan-runtime.ts';
import { BusterRemotePlanService, FileBusterPlanJobStore } from './remote-plan-service.ts';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  return value as number;
}

function stringMap(value: unknown, label: string): ReadonlyMap<string, string> {
  const source = object(value, label);
  if (Object.values(source).some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return new Map(Object.entries(source) as [string, string][]);
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32
    || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return [...value] as string[];
}

function optionalStringArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32
    || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return [...value] as string[];
}

function integerArray(value: unknown, label: string, maximum: number): readonly number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32
    || value.some((item) => !Number.isSafeInteger(item) || Number(item) < 1 || Number(item) > maximum)) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return [...new Set(value.map(Number))];
}

function optionalEnvironmentSecret(source: Record<string, unknown>, field: string, environment: Readonly<Record<string, string | undefined>>): string | undefined {
  const name = source[field];
  if (name === undefined) return undefined;
  if (typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(name)) throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${field}`);
  const value = environment[name];
  if (!value) throw new Error(`BUSTER_REMOTE_CONFIG_SECRET_MISSING:${field}`);
  return value;
}

export function loadProductionBusterRemotePlanRuntime(
  file: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BusterRemotePlanRuntime {
  const canonical = fs.realpathSync(file);
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  if (value.schemaVersion !== 'buster-remote-plan-runtime.v1') throw new Error('BUSTER_REMOTE_CONFIG_VERSION_INVALID');
  for (const name of ['platformConfig', 'host', 'sourceAttestationPublicKeyEnvironmentVariable',
    'trustedSourceAuthority',
    'stateRoot', 'runtimeRoot', 'tarExecutable']) {
    if (typeof value[name] !== 'string' || value[name].length === 0) throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${name}`);
  }
  const trustedPeerSpiffeIds = value.trustedPeerSpiffeIds === undefined
    ? undefined : stringArray(value.trustedPeerSpiffeIds, 'trustedPeerSpiffeIds');
  let token: string | undefined;
  let tokenName: string | undefined;
  if (!trustedPeerSpiffeIds) {
    if (typeof value.tokenEnvironmentVariable !== 'string'
      || !/^[A-Z][A-Z0-9_]*$/u.test(value.tokenEnvironmentVariable)) {
      throw new Error('BUSTER_REMOTE_CONFIG_TOKEN_ENV_INVALID');
    }
    tokenName = value.tokenEnvironmentVariable;
    token = environment[tokenName];
    if (!token) throw new Error('BUSTER_REMOTE_CONFIG_TOKEN_MISSING');
  }
  const sourceKeyName = value.sourceAttestationPublicKeyEnvironmentVariable as string;
  if (!/^[A-Z][A-Z0-9_]*$/u.test(sourceKeyName) || sourceKeyName === tokenName) {
    throw new Error('BUSTER_SOURCE_ATTESTATION_ENV_INVALID');
  }
  const sourceAttestationPublicKey = environment[sourceKeyName];
  if (!sourceAttestationPublicKey) throw new Error('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING');
  const platform = loadPlatformConfig(path.resolve(directory, value.platformConfig as string));
  const registry = buildRegistry(discoverPackages({
    installationRoots: platform.installationRoots,
    trustPolicy: {
      trustedBuiltinRoots: platform.trustedBuiltinRoots,
      allowedSourceDigests: new Map(Object.entries(platform.externalTrust.allowedSourceDigests)),
      verifiedAttestations: new Map(Object.entries(platform.externalTrust.verifiedAttestations)),
      verifierId: 'kubeclaw-platform-v2',
    },
  }));
  const records = object(value.recordLimits, 'recordLimits');
  const allowedCapabilities = new Set(Array.isArray(value.allowedCapabilities)
    && value.allowedCapabilities.every((item) => typeof item === 'string') ? value.allowedCapabilities : (() => {
      throw new Error('BUSTER_REMOTE_CONFIG_INVALID:allowedCapabilities');
    })());
  const directCommandSource = value.directCommand === undefined ? null : object(value.directCommand, 'directCommand');
  if (allowedCapabilities.has('command.execute') && !directCommandSource) {
    throw new Error('BUSTER_DIRECT_COMMAND_CONFIG_REQUIRED');
  }
  const directCommandCgroup = typeof directCommandSource?.cgroupRoot === 'string'
    && directCommandSource.cgroupRoot.length > 0 ? directCommandSource.cgroupRoot : undefined;
  const allowSampledProcessLimit = directCommandSource?.allowSampledProcessLimit === true;
  if (directCommandSource && !directCommandCgroup && !allowSampledProcessLimit) {
    throw new Error('BUSTER_DIRECT_COMMAND_ISOLATION_REQUIRED');
  }
  const containerBuildSource = value.containerBuild === undefined ? null : object(value.containerBuild, 'containerBuild');
  if (allowedCapabilities.has('container.build') && !containerBuildSource) throw new Error('BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED');
  const registryUsername = containerBuildSource ? optionalEnvironmentSecret(containerBuildSource, 'registryUsernameEnvironmentVariable', environment) : undefined;
  const registryPassword = containerBuildSource ? optionalEnvironmentSecret(containerBuildSource, 'registryPasswordEnvironmentVariable', environment) : undefined;
  if ((registryUsername === undefined) !== (registryPassword === undefined)) throw new Error('BUSTER_CONTAINER_BUILD_REGISTRY_CREDENTIALS_INCOMPLETE');
  const kubernetesFixtureSource = value.kubernetesFixture === undefined ? null : object(value.kubernetesFixture, 'kubernetesFixture');
  if (allowedCapabilities.has('kubernetes.fixture') && !kubernetesFixtureSource) {
    throw new Error('BUSTER_KUBERNETES_FIXTURE_CONFIG_REQUIRED');
  }
  const tailscaleExposureSource = value.tailscaleExposure === undefined ? null : object(value.tailscaleExposure, 'tailscaleExposure');
  if (allowedCapabilities.has('kubernetes.exposure') && !tailscaleExposureSource) {
    throw new Error('BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED');
  }
  const networkHttpSource = value.networkHttp === undefined ? null : object(value.networkHttp, 'networkHttp');
  if (allowedCapabilities.has('network.http') && !networkHttpSource) throw new Error('BUSTER_NETWORK_HTTP_CONFIG_REQUIRED');
  const stateRoot = path.resolve(directory, value.stateRoot as string);
  const service = new BusterRemotePlanService({
    store: new FileBusterPlanJobStore(stateRoot, {
      recordLimits: {
        maximumRecords: integer(records.maximumRecords, 'recordLimits.maximumRecords'),
        maximumBytes: integer(records.maximumBytes, 'recordLimits.maximumBytes'),
        maximumRecordBytes: integer(records.maximumRecordBytes, 'recordLimits.maximumRecordBytes'),
      },
      maximumArchiveBytes: integer(value.maximumArchiveBytes, 'maximumArchiveBytes'),
      maximumResultBytes: integer(value.maximumResultBytes, 'maximumResultBytes'),
      maximumResultStoreBytes: integer(value.maximumResultStoreBytes, 'maximumResultStoreBytes'),
      trustedSourceAuthority: value.trustedSourceAuthority as string,
      sourceAttestationPublicKey,
    }),
    registry,
    runtimeRoot: path.resolve(directory, value.runtimeRoot as string),
    tarExecutable: path.resolve(directory, value.tarExecutable as string),
    maximumExtractedBytes: integer(value.maximumExtractedBytes, 'maximumExtractedBytes'),
    allowedCapabilities,
    ...(directCommandSource ? { directCommand: {
      executableCatalog: stringMap(directCommandSource.executableCatalog, 'directCommand.executableCatalog'),
      executableSearchPath: stringArray(directCommandSource.executableSearchPath, 'directCommand.executableSearchPath'),
      runtimeReadRoots: stringArray(directCommandSource.runtimeReadRoots, 'directCommand.runtimeReadRoots'),
      maximumOutputBytes: integer(directCommandSource.maximumOutputBytes, 'directCommand.maximumOutputBytes'),
      maximumExecutionMs: integer(directCommandSource.maximumExecutionMs, 'directCommand.maximumExecutionMs'),
      maximumProcesses: integer(directCommandSource.maximumProcesses, 'directCommand.maximumProcesses'),
      maximumMemoryBytes: integer(directCommandSource.maximumMemoryBytes, 'directCommand.maximumMemoryBytes'),
      maximumCpuMillis: integer(directCommandSource.maximumCpuMillis, 'directCommand.maximumCpuMillis'),
      terminationGraceMs: integer(directCommandSource.terminationGraceMs, 'directCommand.terminationGraceMs'),
      ...(directCommandCgroup ? { cgroupRoot: path.resolve(directory, directCommandCgroup) } : {}),
      ...(allowSampledProcessLimit ? { allowSampledProcessLimit: true } : {}),
    } } : {}),
    ...(containerBuildSource ? { containerBuild: {
      buildctlExecutable: path.resolve(directory, String(containerBuildSource.buildctlExecutable)),
      buildkitHost: String(containerBuildSource.buildkitHost),
      registryBaseUrl: String(containerBuildSource.registryBaseUrl),
      registryReference: String(containerBuildSource.registryReference),
      repositoryPrefix: String(containerBuildSource.repositoryPrefix),
      allowedPlatforms: stringArray(containerBuildSource.allowedPlatforms, 'containerBuild.allowedPlatforms'),
      allowedBuildArguments: optionalStringArray(containerBuildSource.allowedBuildArguments, 'containerBuild.allowedBuildArguments'),
      maximumLogBytes: integer(containerBuildSource.maximumLogBytes, 'containerBuild.maximumLogBytes'),
      maximumExecutionMs: integer(containerBuildSource.maximumExecutionMs, 'containerBuild.maximumExecutionMs'),
      maximumManifestBytes: integer(containerBuildSource.maximumManifestBytes, 'containerBuild.maximumManifestBytes'),
      ...(registryUsername !== undefined ? { registryUsername, registryPassword: registryPassword! } : {}),
    } } : {}),
    ...(kubernetesFixtureSource ? { kubernetesFixture: {
      kubectlExecutable: path.resolve(directory, String(kubernetesFixtureSource.kubectlExecutable)),
      controllerNamespace: String(kubernetesFixtureSource.controllerNamespace),
      leaseApiGroup: String(kubernetesFixtureSource.leaseApiGroup),
      leaseApiVersion: String(kubernetesFixtureSource.leaseApiVersion),
      allowedNamespacePrefixes: stringArray(kubernetesFixtureSource.allowedNamespacePrefixes, 'kubernetesFixture.allowedNamespacePrefixes'),
      allowedRegistryPrefixes: stringArray(kubernetesFixtureSource.allowedRegistryPrefixes, 'kubernetesFixture.allowedRegistryPrefixes'),
      allowedSecretReferences: optionalStringArray(kubernetesFixtureSource.allowedSecretReferences,
        'kubernetesFixture.allowedSecretReferences'),
      maximumManifestBytes: integer(kubernetesFixtureSource.maximumManifestBytes, 'kubernetesFixture.maximumManifestBytes'),
      maximumResources: integer(kubernetesFixtureSource.maximumResources, 'kubernetesFixture.maximumResources'),
      maximumRetentionSeconds: integer(kubernetesFixtureSource.maximumRetentionSeconds, 'kubernetesFixture.maximumRetentionSeconds'),
      maximumExecutionMs: integer(kubernetesFixtureSource.maximumExecutionMs, 'kubernetesFixture.maximumExecutionMs'),
      ...(kubernetesFixtureSource.pollIntervalMs === undefined ? {} : {
        pollIntervalMs: integer(kubernetesFixtureSource.pollIntervalMs, 'kubernetesFixture.pollIntervalMs'),
      }),
    } } : {}),
    ...(tailscaleExposureSource ? { tailscaleExposure: {
      kubectlExecutable: path.resolve(directory, String(tailscaleExposureSource.kubectlExecutable)),
      controllerNamespace: String(tailscaleExposureSource.controllerNamespace),
      leaseApiGroup: String(tailscaleExposureSource.leaseApiGroup),
      leaseApiVersion: String(tailscaleExposureSource.leaseApiVersion),
      allowedNamespacePrefixes: stringArray(tailscaleExposureSource.allowedNamespacePrefixes,
        'tailscaleExposure.allowedNamespacePrefixes'),
      allowedHostSuffixes: stringArray(tailscaleExposureSource.allowedHostSuffixes,
        'tailscaleExposure.allowedHostSuffixes'),
      maximumExecutionMs: integer(tailscaleExposureSource.maximumExecutionMs,
        'tailscaleExposure.maximumExecutionMs'),
      ...(tailscaleExposureSource.pollIntervalMs === undefined ? {} : {
        pollIntervalMs: integer(tailscaleExposureSource.pollIntervalMs, 'tailscaleExposure.pollIntervalMs'),
      }),
    } } : {}),
    ...(networkHttpSource ? { networkHttp: {
      allowedOrigins: optionalStringArray(networkHttpSource.allowedOrigins, 'networkHttp.allowedOrigins'),
      allowedHostSuffixes: optionalStringArray(networkHttpSource.allowedHostSuffixes, 'networkHttp.allowedHostSuffixes'),
      allowedPorts: integerArray(networkHttpSource.allowedPorts, 'networkHttp.allowedPorts', 65_535),
      maximumResponseBytes: integer(networkHttpSource.maximumResponseBytes, 'networkHttp.maximumResponseBytes'),
      maximumExecutionMs: integer(networkHttpSource.maximumExecutionMs, 'networkHttp.maximumExecutionMs'),
    } } : {}),
  });
  const tlsSource = value.tls === undefined ? null : object(value.tls, 'tls');
  const tls = tlsSource ? {
    key: fs.readFileSync(fs.realpathSync(path.resolve(directory, String(tlsSource.keyPath)))),
    cert: fs.readFileSync(fs.realpathSync(path.resolve(directory, String(tlsSource.certificatePath)))),
  } : undefined;
  const host = value.host as string;
  return new BusterRemotePlanRuntime({
    service,
    host,
    port: integer(value.port, 'port', 0),
    ...(trustedPeerSpiffeIds ? { trustedPeerSpiffeIds } : { token: token! }),
    maximumRequestBytes: integer(value.maximumRequestBytes, 'maximumRequestBytes'),
    maximumResponseBytes: integer(value.maximumResponseBytes, 'maximumResponseBytes'),
    maximumResultBytes: integer(value.maximumResultBytes, 'maximumResultBytes'),
    shutdownTimeoutMs: integer(value.shutdownTimeoutMs, 'shutdownTimeoutMs'),
    ...(tls ? { tls } : {}),
  });
}
