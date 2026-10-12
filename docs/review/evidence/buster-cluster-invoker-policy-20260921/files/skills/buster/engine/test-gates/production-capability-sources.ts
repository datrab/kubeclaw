import { object, optionalEnvironmentSecret } from './production-config-values.ts';
type Config = Record<string, unknown>;

/** Decode one optional provider object; a declared capability makes it mandatory. */
function capabilitySource(value: Config, field: string, required: boolean, error: string) {
  const source = value[field] === undefined ? null : object(value[field], field);
  if (required && !source) throw new Error(error);
  return source;
}

function browserSources(value: Config, allowedCapabilities: ReadonlySet<string>) {
  const browserAxeSource = capabilitySource(
    value,
    'browserAxe',
    allowedCapabilities.has('browser.axe'),
    'BUSTER_BROWSER_AXE_CONFIG_REQUIRED',
  );
  const browserLighthouseSource = capabilitySource(
    value,
    'browserLighthouse',
    allowedCapabilities.has('browser.lighthouse'),
    'BUSTER_BROWSER_LIGHTHOUSE_CONFIG_REQUIRED',
  );
  const browserVisualSource = capabilitySource(
    value,
    'browserVisual',
    allowedCapabilities.has('browser.visual'),
    'BUSTER_BROWSER_VISUAL_CONFIG_REQUIRED',
  );
  const browserPlaywrightSource = capabilitySource(
    value,
    'browserPlaywright',
    allowedCapabilities.has('browser.playwright'),
    'BUSTER_BROWSER_PLAYWRIGHT_CONFIG_REQUIRED',
  );
  const browserPlaywrightCgroup =
    typeof browserPlaywrightSource?.cgroupRoot === 'string' && browserPlaywrightSource.cgroupRoot.length > 0
      ? browserPlaywrightSource.cgroupRoot
      : undefined;
  if (browserPlaywrightSource && !browserPlaywrightCgroup) throw new Error('BUSTER_BROWSER_PLAYWRIGHT_CGROUP_REQUIRED');
  return {
    browserAxeSource,
    browserLighthouseSource,
    browserVisualSource,
    browserPlaywrightSource,
    browserPlaywrightCgroup,
  };
}

function commandSources(value: Config, allowedCapabilities: ReadonlySet<string>, environment: NodeJS.ProcessEnv) {
  const directCommandSource = capabilitySource(
    value,
    'directCommand',
    allowedCapabilities.has('command.execute'),
    'BUSTER_DIRECT_COMMAND_CONFIG_REQUIRED',
  );
  const directCommandCgroup =
    typeof directCommandSource?.cgroupRoot === 'string' && directCommandSource.cgroupRoot.length > 0
      ? directCommandSource.cgroupRoot
      : undefined;
  const allowSampledProcessLimit = directCommandSource?.allowSampledProcessLimit === true;
  if (directCommandSource && !directCommandCgroup && !allowSampledProcessLimit) {
    throw new Error('BUSTER_DIRECT_COMMAND_ISOLATION_REQUIRED');
  }
  const containerBuildSource = capabilitySource(
    value,
    'containerBuild',
    allowedCapabilities.has('container.build'),
    'BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED',
  );
  const registryUsername = containerBuildSource
    ? optionalEnvironmentSecret(containerBuildSource, 'registryUsernameEnvironmentVariable', environment)
    : undefined;
  const registryPassword = containerBuildSource
    ? optionalEnvironmentSecret(containerBuildSource, 'registryPasswordEnvironmentVariable', environment)
    : undefined;
  if ((registryUsername === undefined) !== (registryPassword === undefined))
    throw new Error('BUSTER_CONTAINER_BUILD_REGISTRY_CREDENTIALS_INCOMPLETE');
  return {
    directCommandSource,
    containerBuildSource,
    directCommandCgroup,
    allowSampledProcessLimit,
    registryUsername,
    registryPassword,
  };
}

export function capabilitySources(
  value: Config,
  allowedCapabilities: ReadonlySet<string>,
  environment: NodeJS.ProcessEnv,
) {
  const command = commandSources(value, allowedCapabilities, environment);
  for (const key of ['kubernetesFixture', 'tailscaleExposure']) {
    if (Object.hasOwn(value, key)) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}`);
  }
  const kubernetesFixtureEnabled = allowedCapabilities.has('kubernetes.fixture');
  const tailscaleExposureEnabled = allowedCapabilities.has('kubernetes.exposure');
  const networkHttpSource = capabilitySource(
    value,
    'networkHttp',
    allowedCapabilities.has('network.http'),
    'BUSTER_NETWORK_HTTP_CONFIG_REQUIRED',
  );
  const browser = browserSources(value, allowedCapabilities);
  const securityScanSource = capabilitySource(
    value,
    'securityScan',
    allowedCapabilities.has('security.scan'),
    'BUSTER_SECURITY_SCAN_CONFIG_REQUIRED',
  );
  const kubernetesRuntimeSecuritySource = capabilitySource(
    value,
    'kubernetesRuntimeSecurity',
    allowedCapabilities.has('kubernetes.runtime-security'),
    'BUSTER_KUBERNETES_RUNTIME_SECURITY_CONFIG_REQUIRED',
  );
  return {
    ...command,
    kubernetesFixtureEnabled,
    tailscaleExposureEnabled,
    networkHttpSource,
    ...browser,
    securityScanSource,
    kubernetesRuntimeSecuritySource,
  };
}
