import type { BusterSecurityScanSettings } from '../../../common/plugin-runtime/foundation/config/buster-security-scan.ts';
import { registryHealthConfiguration, requiredRegistryClient, scannerRegistry, type RegistryClientBinding } from './production-registry-client.ts';
import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';
import path from 'node:path';
import {
  integer,
  stringMap,
  stringArray,
  optionalStringArray,
  integerArray,
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
  binding: RegistryClientBinding | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'containerBuild'> {
  const registry = containerBuildSource ? requiredRegistryClient(binding) : undefined;
  return containerBuildSource
    ? {
        containerBuild: {
          buildctlExecutable: path.resolve(directory, String(containerBuildSource.buildctlExecutable)),
          buildkitHost: String(containerBuildSource.buildkitHost),
          registryBaseUrl: registry!.origin,
          registryReference: registry!.registryReference,
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
          ...(registry!.username !== undefined ? { registryUsername: registry!.username, registryPassword: registry!.password! } : {}),
        },
      }
    : {};
}

export function networkHttpOptions(
  networkHttpSource: Source,
  binding: RegistryClientBinding | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'networkHttp'> {
  return networkHttpSource
    ? {
        networkHttp: {
          ...(networkHttpSource.registryHealth === undefined
            ? {}
            : {
                registryHealth: registryHealthConfiguration(
                  networkHttpSource.registryHealth,
                  binding,
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
          allowWebSocket: networkHttpSource.allowWebSocket === true,
        },
      }
    : {};
}

export function securityScanOptions(
  enabled: boolean,
  policy: BusterSecurityScanSettings,
  binding: RegistryClientBinding | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'securityScan'> {
  if (!enabled) return {};
  const { registryClientRepositoryPrefixes, ...scanner } = policy;
  const registry = registryClientRepositoryPrefixes.length ? requiredRegistryClient(binding) : undefined;
  const allowedRegistryPrefixes = Object.freeze([...scanner.allowedRegistryPrefixes,
    ...registryClientRepositoryPrefixes.map(prefix => `${registry!.registryReference}/${prefix}`)]);
  if (!allowedRegistryPrefixes.length) throw new Error('SECURITY_SCAN_REGISTRY_POLICY_INVALID');
  return { securityScan: { ...scanner, allowedRegistryPrefixes, ...scannerRegistry(binding) } };
}
