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

export function directCommandOptions(
  directCommandSource: Source,
  directory: string,
  directCommandCgroup: string | undefined,
  allowSampledProcessLimit: boolean,
): Pick<BusterCapabilityRuntimeOptions, 'directCommand'> {
  return directCommandSource
    ? {
        directCommand: {
          executableCatalog: stringMap(directCommandSource.executableCatalog, 'directCommand.executableCatalog'),
          executableSearchPath: stringArray(
            directCommandSource.executableSearchPath,
            'directCommand.executableSearchPath',
          ),
          runtimeReadRoots: stringArray(directCommandSource.runtimeReadRoots, 'directCommand.runtimeReadRoots'),
          maximumOutputBytes: integer(directCommandSource.maximumOutputBytes, 'directCommand.maximumOutputBytes'),
          maximumExecutionMs: integer(directCommandSource.maximumExecutionMs, 'directCommand.maximumExecutionMs'),
          maximumProcesses: integer(directCommandSource.maximumProcesses, 'directCommand.maximumProcesses'),
          maximumMemoryBytes: integer(directCommandSource.maximumMemoryBytes, 'directCommand.maximumMemoryBytes'),
          maximumCpuMillis: integer(directCommandSource.maximumCpuMillis, 'directCommand.maximumCpuMillis'),
          terminationGraceMs: integer(directCommandSource.terminationGraceMs, 'directCommand.terminationGraceMs'),
          ...(directCommandCgroup ? { cgroupRoot: path.resolve(directory, directCommandCgroup) } : {}),
          ...(allowSampledProcessLimit ? { allowSampledProcessLimit: true } : {}),
        },
      }
    : {};
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
          allowedPlatforms: stringArray(containerBuildSource.allowedPlatforms, 'containerBuild.allowedPlatforms'),
          allowedBuildArguments: optionalStringArray(
            containerBuildSource.allowedBuildArguments,
            'containerBuild.allowedBuildArguments',
          ),
          maximumLogBytes: integer(containerBuildSource.maximumLogBytes, 'containerBuild.maximumLogBytes'),
          maximumExecutionMs: integer(containerBuildSource.maximumExecutionMs, 'containerBuild.maximumExecutionMs'),
          maximumManifestBytes: integer(
            containerBuildSource.maximumManifestBytes,
            'containerBuild.maximumManifestBytes',
          ),
          ...(registryUsername !== undefined ? { registryUsername, registryPassword: registryPassword! } : {}),
        },
      }
    : {};
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
          allowedOrigins: optionalStringArray(networkHttpSource.allowedOrigins, 'networkHttp.allowedOrigins'),
          allowedHostSuffixes: optionalStringArray(
            networkHttpSource.allowedHostSuffixes,
            'networkHttp.allowedHostSuffixes',
          ),
          allowedPorts: integerArray(networkHttpSource.allowedPorts, 'networkHttp.allowedPorts', 65_535),
          maximumResponseBytes: integer(networkHttpSource.maximumResponseBytes, 'networkHttp.maximumResponseBytes'),
          maximumExecutionMs: integer(networkHttpSource.maximumExecutionMs, 'networkHttp.maximumExecutionMs'),
          ...(networkHttpSource.maximumRequestBytes === undefined
            ? {}
            : {
                maximumRequestBytes: integer(networkHttpSource.maximumRequestBytes, 'networkHttp.maximumRequestBytes'),
              }),
          ...(networkHttpSource.allowedMethods === undefined
            ? {}
            : {
                allowedMethods: stringArray(networkHttpSource.allowedMethods, 'networkHttp.allowedMethods'),
              }),
          ...(networkHttpSource.allowedRequestHeaders === undefined
            ? {}
            : {
                allowedRequestHeaders: stringArray(
                  networkHttpSource.allowedRequestHeaders,
                  'networkHttp.allowedRequestHeaders',
                ),
              }),
          allowWebSocket: networkHttpSource.allowWebSocket === undefined
            ? false : boolean(networkHttpSource.allowWebSocket, 'networkHttp.allowWebSocket'),
        },
      }
    : {};
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
          allowedRegistryPrefixes: stringArray(
            securityScanSource.allowedRegistryPrefixes,
            'securityScan.allowedRegistryPrefixes',
          ),
          maximumExecutionMs: integer(securityScanSource.maximumExecutionMs, 'securityScan.maximumExecutionMs'),
          maximumOutputBytes: integer(securityScanSource.maximumOutputBytes, 'securityScan.maximumOutputBytes'),
          cacheDirectory: path.resolve(directory, String(securityScanSource.cacheDirectory)),
          ...optionalDatabasePolicy(securityScanSource.databasePolicy),
          ...scannerRegistry(securityScanSource, capturedRegistryPeer, directory),
        },
      }
    : {};
}
