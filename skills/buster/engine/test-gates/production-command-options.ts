import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';
import path from 'node:path';
import type { captureRegistryPeer } from './production-registry-peer.ts';
import {
  boolean,
  integer,
  stringMap,
  stringArray,
  optionalStringArray,
  integerArray,
  registryHealthConfiguration,
  scannerRegistry,
  optionalDatabasePolicy,
} from './production-config-values.ts';
type Source = Record<string, unknown> | null;

/** Decode public command limits before confidential authority or registry access.
 * Shared with provider construction; this performs no executable/host lookup.
 */
export function readDirectCommandPolicy(source: Record<string, unknown>) {
  return {
    executableCatalog: stringMap(source.executableCatalog, 'directCommand.executableCatalog'),
    executableSearchPath: stringArray(
      source.executableSearchPath,
      'directCommand.executableSearchPath',
    ),
    runtimeReadRoots: stringArray(source.runtimeReadRoots, 'directCommand.runtimeReadRoots'),
    maximumOutputBytes: integer(source.maximumOutputBytes, 'directCommand.maximumOutputBytes'),
    maximumExecutionMs: integer(source.maximumExecutionMs, 'directCommand.maximumExecutionMs'),
    maximumProcesses: integer(source.maximumProcesses, 'directCommand.maximumProcesses'),
    maximumMemoryBytes: integer(source.maximumMemoryBytes, 'directCommand.maximumMemoryBytes'),
    maximumCpuMillis: integer(source.maximumCpuMillis, 'directCommand.maximumCpuMillis'),
    terminationGraceMs: integer(source.terminationGraceMs, 'directCommand.terminationGraceMs'),
  };
}

export function directCommandOptions(
  directCommandSource: Source,
  directory: string,
  directCommandCgroup: string | undefined,
  allowSampledProcessLimit: boolean,
): Pick<BusterCapabilityRuntimeOptions, 'directCommand'> {
  return directCommandSource
    ? {
        directCommand: {
          ...readDirectCommandPolicy(directCommandSource),
          ...(directCommandCgroup ? { cgroupRoot: path.resolve(directory, directCommandCgroup) } : {}),
          ...(allowSampledProcessLimit ? { allowSampledProcessLimit: true } : {}),
        },
      }
    : {};
}

/** Original public build policy decoder, without executable or credential activation. */
export function readContainerBuildPolicy(source: Record<string, unknown>) {
  return {
    allowedPlatforms: stringArray(source.allowedPlatforms, 'containerBuild.allowedPlatforms'),
    allowedBuildArguments: optionalStringArray(
      source.allowedBuildArguments,
      'containerBuild.allowedBuildArguments',
    ),
    maximumLogBytes: integer(source.maximumLogBytes, 'containerBuild.maximumLogBytes'),
    maximumExecutionMs: integer(source.maximumExecutionMs, 'containerBuild.maximumExecutionMs'),
    maximumManifestBytes: integer(
      source.maximumManifestBytes,
      'containerBuild.maximumManifestBytes',
    ),
  };
}

export function containerBuildOptions(
  containerBuildSource: Source,
  directory: string,
  registryUsername: string | undefined,
  registryPassword: string | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'containerBuild'> {
  return containerBuildSource
    ? {
        containerBuild: {
          buildctlExecutable: path.resolve(directory, String(containerBuildSource.buildctlExecutable)),
          buildkitHost: String(containerBuildSource.buildkitHost),
          registryBaseUrl: String(containerBuildSource.registryBaseUrl),
          registryReference: String(containerBuildSource.registryReference),
          repositoryPrefix: String(containerBuildSource.repositoryPrefix),
          ...readContainerBuildPolicy(containerBuildSource),
          ...(registryUsername !== undefined ? { registryUsername, registryPassword: registryPassword! } : {}),
        },
      }
    : {};
}

function networkMethods(value: unknown): readonly string[] {
  const methods = stringArray(value, 'networkHttp.allowedMethods');
  if (methods.some(method => !['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'].includes(method))) {
    throw new Error('BUSTER_REMOTE_CONFIG_INVALID:networkHttp.allowedMethods');
  }
  return methods;
}

function networkHeaders(value: unknown): readonly string[] {
  const headers = stringArray(value, 'networkHttp.allowedRequestHeaders');
  // Preserve the provider's case-insensitive token domain without changing the
  // authored bytes returned to construction. No request or secret is read here.
  const denied = new Set(['connection', 'content-length', 'host', 'proxy-authorization', 'transfer-encoding', 'upgrade']);
  if (headers.some(name => !/^[a-z0-9!#$%&'*+.^_`|~-]+$/iu.test(name) || denied.has(name.toLowerCase()))) {
    throw new Error('BUSTER_REMOTE_CONFIG_INVALID:networkHttp.allowedRequestHeaders');
  }
  return headers;
}

function networkExecutionMs(value: unknown): number {
  const milliseconds = integer(value, 'networkHttp.maximumExecutionMs');
  if (milliseconds > 2_147_483_647) throw new Error('BUSTER_REMOTE_CONFIG_INVALID:networkHttp.maximumExecutionMs');
  return milliseconds;
}

/** Decode the public network policy without resolving registry credentials.
 * Both pre-authority source admission and provider construction use this exact
 * domain; no provider, key, registry or store is activated here.
 */
export function readNetworkHttpPolicy(networkHttpSource: Record<string, unknown>) {
  return {
    allowedOrigins: optionalStringArray(networkHttpSource.allowedOrigins, 'networkHttp.allowedOrigins'),
    allowedHostSuffixes: optionalStringArray(
      networkHttpSource.allowedHostSuffixes,
      'networkHttp.allowedHostSuffixes',
    ),
    allowedPorts: integerArray(networkHttpSource.allowedPorts, 'networkHttp.allowedPorts', 65_535),
    maximumResponseBytes: integer(networkHttpSource.maximumResponseBytes, 'networkHttp.maximumResponseBytes'),
    maximumExecutionMs: networkExecutionMs(networkHttpSource.maximumExecutionMs),
    ...(networkHttpSource.maximumRequestBytes === undefined
      ? {}
      : {
          maximumRequestBytes: integer(networkHttpSource.maximumRequestBytes, 'networkHttp.maximumRequestBytes'),
        }),
    ...(networkHttpSource.allowedMethods === undefined
      ? {}
      : {
          allowedMethods: networkMethods(networkHttpSource.allowedMethods),
        }),
    ...(networkHttpSource.allowedRequestHeaders === undefined
      ? {}
      : {
          allowedRequestHeaders: networkHeaders(networkHttpSource.allowedRequestHeaders),
        }),
    allowWebSocket: networkHttpSource.allowWebSocket === undefined
      ? false : boolean(networkHttpSource.allowWebSocket, 'networkHttp.allowWebSocket'),
  };
}

export function networkHttpOptions(
  networkHttpSource: Source,
  registryPeerSource: Source,
  registryUsername: string | undefined,
  registryPassword: string | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'networkHttp'> {
  return networkHttpSource
    ? {
        networkHttp: {
          ...(networkHttpSource.registryHealth === undefined
            ? {}
            : {
                registryHealth: registryHealthConfiguration(
                  networkHttpSource.registryHealth,
                  registryPeerSource,
                  registryUsername,
                  registryPassword,
                ),
              }),
          ...readNetworkHttpPolicy(networkHttpSource),
        },
      }
    : {};
}

/** Original public scanner limits and optional database policy; no native tool lookup. */
export function readSecurityScanPolicy(source: Record<string, unknown>) {
  return {
    allowedRegistryPrefixes: stringArray(
      source.allowedRegistryPrefixes,
      'securityScan.allowedRegistryPrefixes',
    ),
    maximumExecutionMs: integer(source.maximumExecutionMs, 'securityScan.maximumExecutionMs'),
    maximumOutputBytes: integer(source.maximumOutputBytes, 'securityScan.maximumOutputBytes'),
    ...optionalDatabasePolicy(source.databasePolicy),
  };
}

export function securityScanOptions(
  securityScanSource: Source,
  directory: string,
  capturedRegistryPeer: ReturnType<typeof captureRegistryPeer>,
): Pick<BusterCapabilityRuntimeOptions, 'securityScan'> {
  return securityScanSource
    ? {
        securityScan: {
          trivyExecutable: path.resolve(directory, String(securityScanSource.trivyExecutable)),
          ...readSecurityScanPolicy(securityScanSource),
          cacheDirectory: path.resolve(directory, String(securityScanSource.cacheDirectory)),
          ...scannerRegistry(securityScanSource, capturedRegistryPeer, directory),
        },
      }
    : {};
}
