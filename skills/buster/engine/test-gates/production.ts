import type { WorkerCorePolicyCapture } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import { readLegacyBusterRuntimeServicePolicy, type BusterRemotePlanServicePolicy } from '@kubeclaw/plugin-foundation/config/buster-service-policy';
import { rejectLegacyClusterEnvironment, validateBusterClusterInvokerSettings, type BusterClusterInvokerSettings } from '@kubeclaw/plugin-foundation/config/buster-cluster-invokers';
import { validateBusterExecutionSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import { directCommandOptions, containerBuildOptions, networkHttpOptions, securityScanOptions } from './production-command-options.ts';
import { browserAxeOptions, browserLighthouseOptions, browserVisualOptions, browserPlaywrightOptions } from './production-browser-options.ts';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions, kubernetesRuntimeSecurityOptions } from './production-cluster-options.ts';
import { object, registryHealthConfiguration, validateRuntimeRoot, runtimeAuthority, runtimeRegistry } from './production-config-values.ts';
import { capabilitySources } from './production-capability-sources.ts';
import type { BusterPreparation } from './preparation-client.ts';
import { validateBusterDependencyReadinessSettings, type BusterSettings, type WorkerCoreSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import fs from 'node:fs';
import path from 'node:path';
import { BusterRemotePlanRuntime } from './remote-plan-runtime.ts';
import { BusterRemotePlanService, FileBusterPlanJobStore } from './remote-plan-service.ts';

export function loadProductionBusterRemotePlanRuntime(
  file: string,
  preparation: BusterPreparation,
  settings: BusterSettings,
  workerLocalRuntime: WorkerCoreSettings['localRuntime'],
  environment: Readonly<Record<string, string | undefined>>,
  workerCore?: WorkerCorePolicyCapture,
): BusterRemotePlanRuntime {
  rejectLegacyClusterEnvironment(environment);
  const executionPolicy = validateBusterExecutionSettings(settings.execution);
  const clusterInvokers = validateBusterClusterInvokerSettings(settings.clusterInvokers);
  const canonical = fs.realpathSync(file);
  const workerRevision = environment.KUBECLAW_BUILD_REVISION;
  if (!workerRevision || !/^[a-f0-9]{40,64}$/u.test(workerRevision)) {
    throw new Error('BUSTER_REMOTE_WORKER_REVISION_INVALID');
  }
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  validateRuntimeRoot(value);
  const policy = readLegacyBusterRuntimeServicePolicy(value);
  const authority = runtimeAuthority(value, environment);
  const service = configuredService(value, policy, directory, environment, preparation, { buster: { ...settings, execution: executionPolicy, clusterInvokers }, workerLocalRuntime, ...(workerCore ? {workerCore} : {}) }, workerRevision, authority.sourceAttestationPublicKey);
  return configuredRuntime(value, policy, directory, service, settings, authority);
}

function configuredService(value: Record<string, unknown>, policy: BusterRemotePlanServicePolicy, directory: string, environment: NodeJS.ProcessEnv,
  preparation: BusterPreparation, settings: { buster: BusterSettings; workerLocalRuntime: WorkerCoreSettings['localRuntime']; workerCore?: WorkerCorePolicyCapture }, workerRevision: string, sourceAttestationPublicKey: string) {
  const dependencyReadiness = validateBusterDependencyReadinessSettings(settings.buster.dependencyReadiness);
  const registry = runtimeRegistry(value, directory);
  const allowedCapabilities = new Set(policy.allowedCapabilities);
  const sources = capabilitySources(value, allowedCapabilities, environment);
  const stateRoot = path.resolve(directory, value.stateRoot as string);
  const capabilities = configuredCapabilities(sources, directory, environment, settings.buster.clusterInvokers, value.clusterBindings);
  return new BusterRemotePlanService({
    preparation,
    store: new FileBusterPlanJobStore(stateRoot, {
      recordLimits: policy.recordLimits,
      maximumResultBytes: policy.maximumResultBytes,
      maximumResultStoreBytes: policy.maximumResultStoreBytes,
      trustedSourceAuthority: value.trustedSourceAuthority as string,
      sourceAttestationPublicKey,
    }),
    registry,
    dependencyReadiness,
    workerRevision,
    runtimeRoot: path.resolve(directory, value.runtimeRoot as string),
    ...(settings.workerCore ? {workerCore: settings.workerCore} : {}), admission: settings.buster.admission, workerLocalRuntime: settings.workerLocalRuntime, executionPolicy: settings.buster.execution,
    allowedCapabilities,
    ...capabilities,
  });
}

function configuredCapabilities(sources: ReturnType<typeof capabilitySources>, directory: string, environment: NodeJS.ProcessEnv,
  policy: BusterClusterInvokerSettings, bindingSource: unknown) {
  const {
    directCommandSource, containerBuildSource,
    networkHttpSource, browserAxeSource, browserLighthouseSource, browserVisualSource,
    browserPlaywrightSource, securityScanSource,
    directCommandCgroup, allowSampledProcessLimit, registryUsername, registryPassword, browserPlaywrightCgroup,
  } = sources;
  return {
    ...directCommandOptions(directCommandSource, directory, directCommandCgroup, allowSampledProcessLimit),
    ...containerBuildOptions(containerBuildSource, directory, registryUsername, registryPassword),
    ...configuredClusterCapabilities(sources, policy, bindingSource),
    ...networkHttpOptions(networkHttpSource, containerBuildSource, registryUsername, registryPassword),
    ...browserAxeOptions(browserAxeSource),
    ...browserLighthouseOptions(browserLighthouseSource),
    ...browserVisualOptions(browserVisualSource),
    ...browserPlaywrightOptions(browserPlaywrightSource, directory, browserPlaywrightCgroup),
    ...securityScanOptions(securityScanSource, directory, environment),
  };
}

function configuredClusterCapabilities(sources: ReturnType<typeof capabilitySources>,
  policy: BusterClusterInvokerSettings, bindingSource: unknown) {
  const { kubernetesFixtureEnabled, tailscaleExposureEnabled, kubernetesRuntimeSecurityEnabled,
    containerBuildSource, registryUsername, registryPassword } = sources;
  if (!kubernetesFixtureEnabled && !tailscaleExposureEnabled && !kubernetesRuntimeSecurityEnabled
    && bindingSource === undefined) return {};
  const binding = clusterRuntimeBinding(bindingSource, policy);
  return {
    ...kubernetesFixtureOptions(kubernetesFixtureEnabled, policy, binding, kubernetesFixtureEnabled
      ? registryHealthConfiguration(true, containerBuildSource, registryUsername, registryPassword).origin : undefined),
    ...tailscaleExposureOptions(tailscaleExposureEnabled, policy, binding),
    ...kubernetesRuntimeSecurityOptions(kubernetesRuntimeSecurityEnabled, policy, binding),
  };
}

function configuredRuntime(value: Record<string, unknown>, policy: BusterRemotePlanServicePolicy, directory: string, service: BusterRemotePlanService,
  settings: BusterSettings, { trustedPeerSpiffeIds, token }: ReturnType<typeof runtimeAuthority>) {
  const tlsSource = value.tls === undefined ? null : object(value.tls, 'tls');
  const tls = tlsSource ? {
    key: fs.readFileSync(fs.realpathSync(path.resolve(directory, String(tlsSource.keyPath)))),
    cert: fs.readFileSync(fs.realpathSync(path.resolve(directory, String(tlsSource.certificatePath)))),
  } : undefined;
  return new BusterRemotePlanRuntime({
    service,
    host: policy.host,
    port: policy.port,
    ...(trustedPeerSpiffeIds ? { trustedPeerSpiffeIds } : { token: token! }),
    maximumRequestBytes: settings.preparation.maximumRequestBytes,
    maximumResponseBytes: policy.maximumResponseBytes,
    maximumResultBytes: policy.maximumResultBytes,
    shutdownTimeoutMs: policy.shutdownTimeoutMs,
    ...(tls ? { tls } : {}),
  });
}
