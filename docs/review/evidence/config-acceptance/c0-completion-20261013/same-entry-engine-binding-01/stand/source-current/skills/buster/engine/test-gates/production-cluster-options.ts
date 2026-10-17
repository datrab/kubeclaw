import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';
import type { BusterClusterInvokerSettings } from '../../../common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';
import { object } from './production-config-values.ts';
export interface ClusterRuntimeBinding {
  readonly kubectlExecutable: string;
  readonly controllerNamespace: string;
  readonly leaseApiGroup: string;
  readonly leaseApiVersion: string;
}
export function clusterRuntimeBinding(value: unknown, policy: BusterClusterInvokerSettings): ClusterRuntimeBinding {
  const binding = object(value, 'clusterBindings');
  if (Object.keys(binding).length !== 1 || typeof binding.controllerNamespace !== 'string'
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(binding.controllerNamespace)) {
    throw new Error('BUSTER_CLUSTER_BINDINGS_INVALID');
  }
  return Object.freeze({ ...policy.shared, controllerNamespace: binding.controllerNamespace });
}
export function kubernetesFixtureOptions(enabled: boolean, policy: BusterClusterInvokerSettings,
  binding: ClusterRuntimeBinding, registryOrigin: string | undefined): Pick<BusterCapabilityRuntimeOptions, 'kubernetesFixture'> {
  if (!enabled) return {};
  if (!registryOrigin) throw new Error('BUSTER_CLUSTER_REGISTRY_REQUIRED');
  const registryReference = new URL(registryOrigin).host;
  const { runnerServiceAccount, credentialReaderServiceAccount, registryRepositoryPrefixes, ...selected } = policy.kubernetesFixture;
  return { kubernetesFixture: { ...selected, kubectlExecutable: binding.kubectlExecutable,
    controllerNamespace: binding.controllerNamespace, leaseApiGroup: binding.leaseApiGroup, leaseApiVersion: binding.leaseApiVersion,
    allowedRegistryPrefixes: registryRepositoryPrefixes.map(repository => `${registryReference}/${repository}`),
    runnerSubject: `${binding.controllerNamespace}/${runnerServiceAccount}`,
    credentialReaderSubject: `${binding.controllerNamespace}/${credentialReaderServiceAccount}` } };
}
export function tailscaleExposureOptions(enabled: boolean, policy: BusterClusterInvokerSettings,
  binding: ClusterRuntimeBinding): Pick<BusterCapabilityRuntimeOptions, 'tailscaleExposure'> {
  if (!enabled) return {};
  return { tailscaleExposure: { ...policy.tailscaleExposure, kubectlExecutable: binding.kubectlExecutable,
    controllerNamespace: binding.controllerNamespace, leaseApiGroup: binding.leaseApiGroup, leaseApiVersion: binding.leaseApiVersion } };
}
export function kubernetesRuntimeSecurityOptions(enabled: boolean, policy: BusterClusterInvokerSettings,
  binding: ClusterRuntimeBinding): Pick<BusterCapabilityRuntimeOptions, 'kubernetesRuntimeSecurity'> {
  if (!enabled) return {};
  return { kubernetesRuntimeSecurity: { ...policy.runtimeSecurity, kubectlExecutable: binding.kubectlExecutable,
    controllerNamespace: binding.controllerNamespace, leaseApiGroup: binding.leaseApiGroup } };
}
