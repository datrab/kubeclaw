import { boolean, object } from './production-config-values.ts';
import { captureRegistryPeer, readRegistryPeerSource } from './production-registry-peer.ts';
type Config = Record<string, unknown>;

/** Decode one optional provider object; a declared capability makes it mandatory. */
function capabilitySource(value: Config, field: string, required: boolean, error: string) {
  const source = value[field] === undefined ? null : object(value[field], field);
  if (required && !source) throw new Error(error);
  if (!required && source) throw new Error(`BUSTER_INACTIVE_CAPABILITY_SOURCE:${field}`);
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

function commandSources(value: Config, allowedCapabilities: ReadonlySet<string>) {
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
  const allowSampledProcessLimit = directCommandSource?.allowSampledProcessLimit === undefined
    ? false : boolean(directCommandSource.allowSampledProcessLimit, 'directCommand.allowSampledProcessLimit');
  if (directCommandSource && !directCommandCgroup && !allowSampledProcessLimit) {
    throw new Error('BUSTER_DIRECT_COMMAND_ISOLATION_REQUIRED');
  }
  const containerBuildSource = capabilitySource(
    value,
    'containerBuild',
    allowedCapabilities.has('container.build'),
    'BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED',
  );
  return {
    directCommandSource,
    containerBuildSource,
    directCommandCgroup,
    allowSampledProcessLimit,
  };
}

function readCapabilitySources(value: Config, allowedCapabilities: ReadonlySet<string>) {
  const command = commandSources(value, allowedCapabilities);
  for (const key of ['kubernetesFixture', 'tailscaleExposure', 'kubernetesRuntimeSecurity']) {
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
  const kubernetesRuntimeSecurityEnabled = allowedCapabilities.has('kubernetes.runtime-security');
  readRegistryPeerSource(value, allowedCapabilities);
  return {
    ...command,
    kubernetesFixtureEnabled,
    tailscaleExposureEnabled,
    networkHttpSource,
    ...browser,
    securityScanSource,
    kubernetesRuntimeSecurityEnabled,
  };
}

/** Conditional public source closure is checked before source-key/token access,
 * registry discovery or provider/store construction. This is not a source grant
 * or a selected-generation receiver: v2/v10 admission remains separate.
 */
export function validateCapabilitySourceClosure(value: Config, allowedCapabilities: ReadonlySet<string>): void {
  readCapabilitySources(value, allowedCapabilities);
}

export function capabilitySources(value: Config, allowedCapabilities: ReadonlySet<string>, environment: NodeJS.ProcessEnv) {
  const sources = readCapabilitySources(value, allowedCapabilities);
  return { ...sources, capturedRegistryPeer: captureRegistryPeer(value, allowedCapabilities, environment) };
}
