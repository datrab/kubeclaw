import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';
import path from 'node:path';
import { integer, boolean, stringArray, optionalStringArray } from './production-config-values.ts';
type Source = Record<string, unknown> | null;

export function kubernetesFixtureOptions(
  kubernetesFixtureSource: Source,
  directory: string,
): Pick<BusterCapabilityRuntimeOptions, 'kubernetesFixture'> {
  return kubernetesFixtureSource
    ? {
        kubernetesFixture: {
          kubectlExecutable: path.resolve(directory, String(kubernetesFixtureSource.kubectlExecutable)),
          controllerNamespace: String(kubernetesFixtureSource.controllerNamespace),
          leaseApiGroup: String(kubernetesFixtureSource.leaseApiGroup),
          leaseApiVersion: String(kubernetesFixtureSource.leaseApiVersion),
          allowedNamespacePrefixes: stringArray(
            kubernetesFixtureSource.allowedNamespacePrefixes,
            'kubernetesFixture.allowedNamespacePrefixes',
          ),
          allowedRegistryPrefixes: stringArray(
            kubernetesFixtureSource.allowedRegistryPrefixes,
            'kubernetesFixture.allowedRegistryPrefixes',
          ),
          allowedSecretReferences: optionalStringArray(
            kubernetesFixtureSource.allowedSecretReferences,
            'kubernetesFixture.allowedSecretReferences',
          ),
          ...fixtureStoragePolicy(kubernetesFixtureSource),
          maximumManifestBytes: integer(
            kubernetesFixtureSource.maximumManifestBytes,
            'kubernetesFixture.maximumManifestBytes',
          ),
          maximumResources: integer(kubernetesFixtureSource.maximumResources, 'kubernetesFixture.maximumResources'),
          maximumPersistentVolumeClaimBytes: integer(
            kubernetesFixtureSource.maximumPersistentVolumeClaimBytes,
            'kubernetesFixture.maximumPersistentVolumeClaimBytes',
          ),
          maximumPersistentVolumeTotalBytes: integer(
            kubernetesFixtureSource.maximumPersistentVolumeTotalBytes,
            'kubernetesFixture.maximumPersistentVolumeTotalBytes',
          ),
          maximumRetentionSeconds: integer(
            kubernetesFixtureSource.maximumRetentionSeconds,
            'kubernetesFixture.maximumRetentionSeconds',
          ),
          maximumExecutionMs: integer(
            kubernetesFixtureSource.maximumExecutionMs,
            'kubernetesFixture.maximumExecutionMs',
          ),
          ...(kubernetesFixtureSource.pollIntervalMs === undefined
            ? {}
            : {
                pollIntervalMs: integer(kubernetesFixtureSource.pollIntervalMs, 'kubernetesFixture.pollIntervalMs'),
              }),
        },
      }
    : {};
}

export function tailscaleExposureOptions(
  tailscaleExposureSource: Source,
  directory: string,
): Pick<BusterCapabilityRuntimeOptions, 'tailscaleExposure'> {
  return tailscaleExposureSource
    ? {
        tailscaleExposure: {
          kubectlExecutable: path.resolve(directory, String(tailscaleExposureSource.kubectlExecutable)),
          controllerNamespace: String(tailscaleExposureSource.controllerNamespace),
          leaseApiGroup: String(tailscaleExposureSource.leaseApiGroup),
          leaseApiVersion: String(tailscaleExposureSource.leaseApiVersion),
          allowedNamespacePrefixes: stringArray(
            tailscaleExposureSource.allowedNamespacePrefixes,
            'tailscaleExposure.allowedNamespacePrefixes',
          ),
          allowedHostSuffixes: stringArray(
            tailscaleExposureSource.allowedHostSuffixes,
            'tailscaleExposure.allowedHostSuffixes',
          ),
          maximumExecutionMs: integer(
            tailscaleExposureSource.maximumExecutionMs,
            'tailscaleExposure.maximumExecutionMs',
          ),
          ...(tailscaleExposureSource.pollIntervalMs === undefined
            ? {}
            : {
                pollIntervalMs: integer(tailscaleExposureSource.pollIntervalMs, 'tailscaleExposure.pollIntervalMs'),
              }),
        },
      }
    : {};
}

export function kubernetesRuntimeSecurityOptions(
  kubernetesRuntimeSecuritySource: Source,
  directory: string,
): Pick<BusterCapabilityRuntimeOptions, 'kubernetesRuntimeSecurity'> {
  return kubernetesRuntimeSecuritySource
    ? {
        kubernetesRuntimeSecurity: {
          kubectlExecutable: path.resolve(directory, String(kubernetesRuntimeSecuritySource.kubectlExecutable)),
          controllerNamespace: String(kubernetesRuntimeSecuritySource.controllerNamespace),
          leaseApiGroup: String(kubernetesRuntimeSecuritySource.leaseApiGroup),
          allowedNamespacePrefixes: stringArray(
            kubernetesRuntimeSecuritySource.allowedNamespacePrefixes,
            'kubernetesRuntimeSecurity.allowedNamespacePrefixes',
          ),
          maximumExecutionMs: integer(
            kubernetesRuntimeSecuritySource.maximumExecutionMs,
            'kubernetesRuntimeSecurity.maximumExecutionMs',
          ),
          maximumOutputBytes: integer(
            kubernetesRuntimeSecuritySource.maximumOutputBytes,
            'kubernetesRuntimeSecurity.maximumOutputBytes',
          ),
          maximumObservationAgeMs: integer(
            kubernetesRuntimeSecuritySource.maximumObservationAgeMs,
            'kubernetesRuntimeSecurity.maximumObservationAgeMs',
          ),
          ...(kubernetesRuntimeSecuritySource.pollIntervalMs === undefined
            ? {}
            : {
                pollIntervalMs: integer(
                  kubernetesRuntimeSecuritySource.pollIntervalMs,
                  'kubernetesRuntimeSecurity.pollIntervalMs',
                ),
              }),
        },
      }
    : {};
}

function fixtureStoragePolicy(kubernetesFixtureSource: Record<string, unknown>) {
  return {
    allowedStorageClasses: optionalStringArray(
      kubernetesFixtureSource.allowedStorageClasses,
      'kubernetesFixture.allowedStorageClasses',
    ),
    allowDefaultStorageClass: boolean(
      kubernetesFixtureSource.allowDefaultStorageClass,
      'kubernetesFixture.allowDefaultStorageClass',
    ),
  };
}
