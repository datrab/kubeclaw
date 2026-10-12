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
import type { TestProviderCapabilityInvoker } from './runner.ts';

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
  const routes = new Map<string, TestProviderCapabilityInvoker>();
  const add = <T extends TestProviderCapabilityInvoker>(capability: string, create: () => T): T | undefined => {
    if (!options.allowedCapabilities.has(capability)) return undefined;
    const invoker = create(); routes.set(capability, invoker); return invoker;
  };
  const directCommand = add('command.execute', () => new DirectCommandCapabilityInvoker({
    ...required(options.directCommand, 'BUSTER_DIRECT_COMMAND_CONFIG_REQUIRED'), workspaceRoot,
  }));
  add('container.build', () => new ContainerBuildCapabilityInvoker({
    ...required(options.containerBuild, 'BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED'), workspaceRoot,
  }));
  add('kubernetes.fixture', () => new KubernetesFixtureCapabilityInvoker({
    ...required(options.kubernetesFixture, 'BUSTER_KUBERNETES_FIXTURE_CONFIG_REQUIRED'), workspaceRoot: jobRoot,
  }));
  add('kubernetes.exposure', () => new TailscaleExposureCapabilityInvoker(
    required(options.tailscaleExposure, 'BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED')));
  add('network.http', () => new NetworkHttpCapabilityInvoker(
    required(options.networkHttp, 'BUSTER_NETWORK_HTTP_CONFIG_REQUIRED')));
  add('browser.axe', () => new BrowserAxeCapabilityInvoker(
    required(options.browserAxe, 'BUSTER_BROWSER_AXE_CONFIG_REQUIRED')));
  add('browser.lighthouse', () => new BrowserLighthouseCapabilityInvoker(
    required(options.browserLighthouse, 'BUSTER_BROWSER_LIGHTHOUSE_CONFIG_REQUIRED')));
  add('browser.visual', () => new BrowserVisualCapabilityInvoker(
    required(options.browserVisual, 'BUSTER_BROWSER_VISUAL_CONFIG_REQUIRED')));
  add('browser.playwright', () => new BrowserPlaywrightCapabilityInvoker({
    ...required(options.browserPlaywright, 'BUSTER_BROWSER_PLAYWRIGHT_CONFIG_REQUIRED'), workspaceRoot,
  }));
  add('security.scan', () => new SecurityScanCapabilityInvoker({
    ...required(options.securityScan, 'BUSTER_SECURITY_SCAN_CONFIG_REQUIRED'), workspaceRoot: jobRoot,
  }));
  add('kubernetes.runtime-security', () => new KubernetesRuntimeSecurityCapabilityInvoker({
    ...required(options.kubernetesRuntimeSecurity, 'BUSTER_KUBERNETES_RUNTIME_SECURITY_CONFIG_REQUIRED'), workspaceRoot: jobRoot,
  }));
  const invoker = routes.size ? new CompositeTestProviderCapabilityInvoker(routes) : null;
  return { invoker, async shutdown(): Promise<void> { await directCommand?.shutdown(); } };
}

function required<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined || value === null) throw new Error(errorCode);
  return value;
}
