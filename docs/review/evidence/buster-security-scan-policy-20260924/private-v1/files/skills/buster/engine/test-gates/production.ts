import { validateBusterSecurityScanSettings } from '../../../common/plugin-runtime/foundation/config/buster-security-scan.ts';
import { registryClientBinding, requiredRegistryClient, type RegistryClientBinding } from './production-registry-client.ts';
import { rejectLegacyClusterEnvironment, validateBusterClusterInvokerSettings, type BusterClusterInvokerSettings } from '../../../common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';
import { validateBusterExecutionSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';
import { directCommandOptions, containerBuildOptions, networkHttpOptions, securityScanOptions } from './production-command-options.ts';
import { browserAxeOptions, browserLighthouseOptions, browserVisualOptions, browserPlaywrightOptions } from './production-browser-options.ts';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions, kubernetesRuntimeSecurityOptions } from './production-cluster-options.ts';
import { object, integer, validateRuntimeRoot, runtimeAuthority, runtimeRegistry } from './production-config-values.ts';
import { capabilitySources } from './production-capability-sources.ts';
import type { BusterPreparation } from './preparation-client.ts';
import { validateBusterDependencyReadinessSettings, type BusterSettings, type WorkerCoreSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';
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
): BusterRemotePlanRuntime {
  rejectLegacyClusterEnvironment(environment);
  const executionPolicy = validateBusterExecutionSettings(settings.execution);
  const clusterInvokers = validateBusterClusterInvokerSettings(settings.clusterInvokers);
  const securityScan = validateBusterSecurityScanSettings(settings.securityScan);
  const canonical = fs.realpathSync(file);
  const workerRevision = environment.KUBECLAW_BUILD_REVISION;
  if (!workerRevision || !/^[a-f0-9]{40,64}$/u.test(workerRevision)) {
    throw new Error('BUSTER_REMOTE_WORKER_REVISION_INVALID');
  }
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  validateRuntimeRoot(value);
  const registryClient = registryClientBinding(value.registryClient, directory, environment);
  const authority = runtimeAuthority(value, environment);
  const service = configuredService(value, directory, preparation, { buster: { ...settings, execution: executionPolicy, clusterInvokers, securityScan }, workerLocalRuntime }, workerRevision, authority.sourceAttestationPublicKey, registryClient);
  return configuredRuntime(value, directory, service, settings, authority);
}

function configuredService(value: Record<string, unknown>, directory: string,
  preparation: BusterPreparation, settings: { buster: BusterSettings; workerLocalRuntime: WorkerCoreSettings['localRuntime'] }, workerRevision: string, sourceAttestationPublicKey: string, registryClient: RegistryClientBinding | undefined) {
  const dependencyReadiness = validateBusterDependencyReadinessSettings(settings.buster.dependencyReadiness);
  const registry = runtimeRegistry(value, directory);
  const records = object(value.recordLimits, 'recordLimits');
  const allowedCapabilities = new Set(Array.isArray(value.allowedCapabilities)
    && value.allowedCapabilities.every((item) => typeof item === 'string') ? value.allowedCapabilities : (() => {
      throw new Error('BUSTER_REMOTE_CONFIG_INVALID:allowedCapabilities');
    })());
  const sources = capabilitySources(value, allowedCapabilities);
  const stateRoot = path.resolve(directory, value.stateRoot as string);
  const capabilities = configuredCapabilities(sources, directory, settings.buster, value.clusterBindings, registryClient);
  return new BusterRemotePlanService({
    preparation,
    store: new FileBusterPlanJobStore(stateRoot, {
      recordLimits: {
        maximumRecords: integer(records.maximumRecords, 'recordLimits.maximumRecords'),
        maximumBytes: integer(records.maximumBytes, 'recordLimits.maximumBytes'),
        maximumRecordBytes: integer(records.maximumRecordBytes, 'recordLimits.maximumRecordBytes'),
      },
      maximumResultBytes: integer(value.maximumResultBytes, 'maximumResultBytes'),
      maximumResultStoreBytes: integer(value.maximumResultStoreBytes, 'maximumResultStoreBytes'),
      trustedSourceAuthority: value.trustedSourceAuthority as string,
      sourceAttestationPublicKey,
    }),
    registry,
    dependencyReadiness,
    workerRevision,
    runtimeRoot: path.resolve(directory, value.runtimeRoot as string),
    admission: settings.buster.admission, workerLocalRuntime: settings.workerLocalRuntime, executionPolicy: settings.buster.execution,
    allowedCapabilities,
    ...capabilities,
  });
}

function configuredCapabilities(sources: ReturnType<typeof capabilitySources>, directory: string,
  settings: BusterSettings, bindingSource: unknown, registryClient: RegistryClientBinding | undefined) {
  const {
    directCommandSource, containerBuildSource,
    networkHttpSource, browserAxeSource, browserLighthouseSource, browserVisualSource,
    browserPlaywrightSource, securityScanEnabled,
    directCommandCgroup, allowSampledProcessLimit, browserPlaywrightCgroup,
  } = sources;
  return {
    ...directCommandOptions(directCommandSource, directory, directCommandCgroup, allowSampledProcessLimit),
    ...containerBuildOptions(containerBuildSource, directory, registryClient),
    ...configuredClusterCapabilities(sources, settings.clusterInvokers, bindingSource, registryClient),
    ...networkHttpOptions(networkHttpSource, registryClient),
    ...browserAxeOptions(browserAxeSource),
    ...browserLighthouseOptions(browserLighthouseSource),
    ...browserVisualOptions(browserVisualSource),
    ...browserPlaywrightOptions(browserPlaywrightSource, directory, browserPlaywrightCgroup),
    ...securityScanOptions(securityScanEnabled, settings.securityScan, registryClient),
  };
}

function configuredClusterCapabilities(sources: ReturnType<typeof capabilitySources>,
  policy: BusterClusterInvokerSettings, bindingSource: unknown, registryClient: RegistryClientBinding | undefined) {
  const { kubernetesFixtureEnabled, tailscaleExposureEnabled, kubernetesRuntimeSecurityEnabled } = sources;
  if (!kubernetesFixtureEnabled && !tailscaleExposureEnabled && !kubernetesRuntimeSecurityEnabled
    && bindingSource === undefined) return {};
  const binding = clusterRuntimeBinding(bindingSource, policy);
  return {
    ...kubernetesFixtureOptions(kubernetesFixtureEnabled, policy, binding, kubernetesFixtureEnabled
      ? requiredRegistryClient(registryClient).origin : undefined),
    ...tailscaleExposureOptions(tailscaleExposureEnabled, policy, binding),
    ...kubernetesRuntimeSecurityOptions(kubernetesRuntimeSecurityEnabled, policy, binding),
  };
}

function configuredRuntime(value: Record<string, unknown>, directory: string, service: BusterRemotePlanService,
  settings: BusterSettings, { trustedPeerSpiffeIds, token }: ReturnType<typeof runtimeAuthority>) {
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
    maximumRequestBytes: settings.preparation.maximumRequestBytes,
    maximumResponseBytes: integer(value.maximumResponseBytes, 'maximumResponseBytes'),
    maximumResultBytes: integer(value.maximumResultBytes, 'maximumResultBytes'),
    shutdownTimeoutMs: integer(value.shutdownTimeoutMs, 'shutdownTimeoutMs'),
    ...(tls ? { tls } : {}),
  });
}
