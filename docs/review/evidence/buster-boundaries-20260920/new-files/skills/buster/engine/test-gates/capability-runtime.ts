import { DirectCommandCapabilityInvoker, type DirectCommandCapabilityInvokerOptions } from './direct-command-runtime.ts';
import { ContainerBuildCapabilityInvoker, type ContainerBuildCapabilityInvokerOptions } from './container-build-runtime.ts';
import { KubernetesFixtureCapabilityInvoker, type KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-runtime.ts';
import { TailscaleExposureCapabilityInvoker, type TailscaleExposureCapabilityInvokerOptions } from './tailscale-exposure-runtime.ts';
import { NetworkHttpCapabilityInvoker, type NetworkHttpCapabilityInvokerOptions } from './network-http-runtime.ts';
import { BrowserAxeCapabilityInvoker, type BrowserAxeCapabilityInvokerOptions } from './browser-axe-runtime.ts';
import { BrowserLighthouseCapabilityInvoker, type BrowserLighthouseCapabilityInvokerOptions } from './browser-lighthouse-runtime.ts';
import { BrowserVisualCapabilityInvoker, type BrowserVisualCapabilityInvokerOptions } from './browser-visual-runtime.ts';
import { BrowserPlaywrightCapabilityInvoker, type BrowserPlaywrightCapabilityInvokerOptions } from './browser-playwright-runtime.ts';
import { SecurityScanCapabilityInvoker, type SecurityScanCapabilityInvokerOptions } from './security-scan-runtime.ts';
import { KubernetesRuntimeSecurityCapabilityInvoker,
  type KubernetesRuntimeSecurityCapabilityInvokerOptions } from './kubernetes-runtime-security.ts';
import { CompositeTestProviderCapabilityInvoker } from './composite-capability-runtime.ts';

export interface BusterCapabilityRuntimeOptions {
  readonly allowedCapabilities: ReadonlySet<string>;
  readonly directCommand?: Omit<DirectCommandCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly containerBuild?: Omit<ContainerBuildCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly kubernetesFixture?: Omit<KubernetesFixtureCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly tailscaleExposure?: TailscaleExposureCapabilityInvokerOptions;
  readonly networkHttp?: NetworkHttpCapabilityInvokerOptions;
  readonly browserAxe?: BrowserAxeCapabilityInvokerOptions;
  readonly browserLighthouse?: BrowserLighthouseCapabilityInvokerOptions;
  readonly browserVisual?: BrowserVisualCapabilityInvokerOptions;
  readonly browserPlaywright?: Omit<BrowserPlaywrightCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly securityScan?: Omit<SecurityScanCapabilityInvokerOptions, 'workspaceRoot'>;
  readonly kubernetesRuntimeSecurity?: Omit<KubernetesRuntimeSecurityCapabilityInvokerOptions, 'workspaceRoot'>;
}

/** Construct the complete local capability owner in the process that executes work.
 * The service currently owns this process; native cutover must move this single
 * construction boundary into the attempt host, without parent-side RPC work. */
export function createBusterCapabilityRuntime(options: BusterCapabilityRuntimeOptions,
  paths: Readonly<{ jobRoot: string; workspaceRoot: string }>) {
  const { jobRoot, workspaceRoot } = paths;
  const directCommand = options.allowedCapabilities.has('command.execute')
    ? new DirectCommandCapabilityInvoker({
      ...(options.directCommand ?? (() => { throw new Error('BUSTER_DIRECT_COMMAND_CONFIG_REQUIRED'); })()),
      workspaceRoot,
    })
    : null;
  const containerBuild = options.allowedCapabilities.has('container.build')
    ? new ContainerBuildCapabilityInvoker({
      ...(options.containerBuild ?? (() => { throw new Error('BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED'); })()),
      workspaceRoot,
    })
    : null;
  const kubernetesFixture = options.allowedCapabilities.has('kubernetes.fixture')
    ? new KubernetesFixtureCapabilityInvoker({
      ...(options.kubernetesFixture ?? (() => { throw new Error('BUSTER_KUBERNETES_FIXTURE_CONFIG_REQUIRED'); })()),
      workspaceRoot: jobRoot,
    })
    : null;
  const tailscaleExposure = options.allowedCapabilities.has('kubernetes.exposure')
    ? new TailscaleExposureCapabilityInvoker(options.tailscaleExposure
      ?? (() => { throw new Error('BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED'); })())
    : null;
  const networkHttp = options.allowedCapabilities.has('network.http')
    ? new NetworkHttpCapabilityInvoker(options.networkHttp
      ?? (() => { throw new Error('BUSTER_NETWORK_HTTP_CONFIG_REQUIRED'); })())
    : null;
  const browserAxe = options.allowedCapabilities.has('browser.axe')
    ? new BrowserAxeCapabilityInvoker(options.browserAxe
      ?? (() => { throw new Error('BUSTER_BROWSER_AXE_CONFIG_REQUIRED'); })())
    : null;
  const browserLighthouse = options.allowedCapabilities.has('browser.lighthouse')
    ? new BrowserLighthouseCapabilityInvoker(options.browserLighthouse
      ?? (() => { throw new Error('BUSTER_BROWSER_LIGHTHOUSE_CONFIG_REQUIRED'); })())
    : null;
  const browserVisual = options.allowedCapabilities.has('browser.visual')
    ? new BrowserVisualCapabilityInvoker(options.browserVisual
      ?? (() => { throw new Error('BUSTER_BROWSER_VISUAL_CONFIG_REQUIRED'); })())
    : null;
  const browserPlaywright = options.allowedCapabilities.has('browser.playwright')
    ? new BrowserPlaywrightCapabilityInvoker({
      ...(options.browserPlaywright ?? (() => { throw new Error('BUSTER_BROWSER_PLAYWRIGHT_CONFIG_REQUIRED'); })()),
      workspaceRoot,
    }) : null;
  const securityScan = options.allowedCapabilities.has('security.scan')
    ? new SecurityScanCapabilityInvoker({
      ...(options.securityScan ?? (() => { throw new Error('BUSTER_SECURITY_SCAN_CONFIG_REQUIRED'); })()),
      workspaceRoot: jobRoot,
    }) : null;
  const kubernetesRuntimeSecurity = options.allowedCapabilities.has('kubernetes.runtime-security')
    ? new KubernetesRuntimeSecurityCapabilityInvoker({
      ...(options.kubernetesRuntimeSecurity
        ?? (() => { throw new Error('BUSTER_KUBERNETES_RUNTIME_SECURITY_CONFIG_REQUIRED'); })()),
      workspaceRoot: jobRoot,
    }) : null;
  const routes = new Map();
  if (directCommand) routes.set('command.execute', directCommand);
  if (containerBuild) routes.set('container.build', containerBuild);
  if (kubernetesFixture) routes.set('kubernetes.fixture', kubernetesFixture);
  if (tailscaleExposure) routes.set('kubernetes.exposure', tailscaleExposure);
  if (networkHttp) routes.set('network.http', networkHttp);
  if (browserAxe) routes.set('browser.axe', browserAxe);
  if (browserLighthouse) routes.set('browser.lighthouse', browserLighthouse);
  if (browserVisual) routes.set('browser.visual', browserVisual);
  if (browserPlaywright) routes.set('browser.playwright', browserPlaywright);
  if (securityScan) routes.set('security.scan', securityScan);
  if (kubernetesRuntimeSecurity) routes.set('kubernetes.runtime-security', kubernetesRuntimeSecurity);
  const capabilities = routes.size ? new CompositeTestProviderCapabilityInvoker(routes) : null;
  return { invoker: capabilities, async shutdown(): Promise<void> { await directCommand?.shutdown(); } };
}
