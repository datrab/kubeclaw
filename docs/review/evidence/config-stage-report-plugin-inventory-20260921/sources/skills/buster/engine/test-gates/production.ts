import { directCommandOptions, containerBuildOptions, networkHttpOptions, securityScanOptions } from './production-command-options.ts';
import { browserAxeOptions, browserLighthouseOptions, browserVisualOptions, browserPlaywrightOptions } from './production-browser-options.ts';
import { kubernetesFixtureOptions, tailscaleExposureOptions, kubernetesRuntimeSecurityOptions } from './production-cluster-options.ts';
import { object, integer, validateRuntimeRoot, runtimeAuthority, runtimeRegistry } from './production-config-values.ts';
import { capabilitySources } from './production-capability-sources.ts';
import type { BusterPreparation } from './preparation-client.ts';
import type { BusterSettings, WorkerCoreSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';
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
  const canonical = fs.realpathSync(file);
  const workerRevision = environment.KUBECLAW_BUILD_REVISION;
  if (!workerRevision || !/^[a-f0-9]{40,64}$/u.test(workerRevision)) {
    throw new Error('BUSTER_REMOTE_WORKER_REVISION_INVALID');
  }
  const directory = path.dirname(canonical);
  const value = object(JSON.parse(fs.readFileSync(canonical, 'utf8')), 'root');
  validateRuntimeRoot(value);
  const authority = runtimeAuthority(value, environment);
  const service = configuredService(value, directory, environment, preparation, { buster: settings, workerLocalRuntime }, workerRevision, authority.sourceAttestationPublicKey);
  return configuredRuntime(value, directory, service, settings, authority);
}

function configuredService(value: Record<string, unknown>, directory: string, environment: NodeJS.ProcessEnv,
  preparation: BusterPreparation, settings: { buster: BusterSettings; workerLocalRuntime: WorkerCoreSettings['localRuntime'] }, workerRevision: string, sourceAttestationPublicKey: string) {
  const registry = runtimeRegistry(value, directory);
  const records = object(value.recordLimits, 'recordLimits');
  const allowedCapabilities = new Set(Array.isArray(value.allowedCapabilities)
    && value.allowedCapabilities.every((item) => typeof item === 'string') ? value.allowedCapabilities : (() => {
      throw new Error('BUSTER_REMOTE_CONFIG_INVALID:allowedCapabilities');
    })());
  const sources = capabilitySources(value, allowedCapabilities, environment);
  const stateRoot = path.resolve(directory, value.stateRoot as string);
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
    ...(value.dependencyReadiness === undefined ? {} : { dependencyReadiness: {
      maximumExecutionMs: integer(object(value.dependencyReadiness, 'dependencyReadiness').maximumExecutionMs, 'dependencyReadiness.maximumExecutionMs'),
      maximumOutputBytes: integer(object(value.dependencyReadiness, 'dependencyReadiness').maximumOutputBytes, 'dependencyReadiness.maximumOutputBytes'),
    } }),
    workerRevision,
    runtimeRoot: path.resolve(directory, value.runtimeRoot as string),
    admission: settings.buster.admission, workerLocalRuntime: settings.workerLocalRuntime,
    allowedCapabilities,
    ...configuredCapabilities(sources, directory, environment),
  });
}

function configuredCapabilities(sources: ReturnType<typeof capabilitySources>, directory: string, environment: NodeJS.ProcessEnv) {
  const {
    directCommandSource, containerBuildSource, kubernetesFixtureSource, tailscaleExposureSource,
    networkHttpSource, browserAxeSource, browserLighthouseSource, browserVisualSource,
    browserPlaywrightSource, securityScanSource, kubernetesRuntimeSecuritySource,
    directCommandCgroup, allowSampledProcessLimit, registryUsername, registryPassword, browserPlaywrightCgroup,
  } = sources;
  return {
    ...directCommandOptions(directCommandSource, directory, directCommandCgroup, allowSampledProcessLimit),
    ...containerBuildOptions(containerBuildSource, directory, registryUsername, registryPassword),
    ...kubernetesFixtureOptions(kubernetesFixtureSource, directory),
    ...tailscaleExposureOptions(tailscaleExposureSource, directory),
    ...networkHttpOptions(networkHttpSource, containerBuildSource, registryUsername, registryPassword),
    ...browserAxeOptions(browserAxeSource),
    ...browserLighthouseOptions(browserLighthouseSource),
    ...browserVisualOptions(browserVisualSource),
    ...browserPlaywrightOptions(browserPlaywrightSource, directory, browserPlaywrightCgroup),
    ...securityScanOptions(securityScanSource, directory, environment),
    ...kubernetesRuntimeSecurityOptions(kubernetesRuntimeSecuritySource, directory),
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
