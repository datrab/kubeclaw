import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';
import path from 'node:path';
import {
  integer,
  stringArray,
  optionalStringArray,
  browserExecutableMap,
  integerArray,
} from './production-config-values.ts';
type Source = Record<string, unknown> | null;

/** Preserve the original Axe/Visual provider browser domain before confidential reads. */
function browserNames(value: unknown, label: string): readonly ('chromium' | 'firefox' | 'webkit')[] {
  const names = stringArray(value, label);
  if (names.some(name => !['chromium', 'firefox', 'webkit'].includes(name))) {
    throw new Error(`BUSTER_REMOTE_CONFIG_INVALID:${label}`);
  }
  return names as readonly ('chromium' | 'firefox' | 'webkit')[];
}

export function readBrowserAxePolicy(browserAxeSource: Record<string, unknown>) {
  return {
    allowedOrigins: optionalStringArray(browserAxeSource.allowedOrigins, 'browserAxe.allowedOrigins'),
    allowedBrowsers: browserNames(browserAxeSource.allowedBrowsers, 'browserAxe.allowedBrowsers'),
    maximumCombinations: integer(browserAxeSource.maximumCombinations, 'browserAxe.maximumCombinations'),
    maximumConcurrency: integer(browserAxeSource.maximumConcurrency, 'browserAxe.maximumConcurrency'),
    maximumExecutionMs: integer(browserAxeSource.maximumExecutionMs, 'browserAxe.maximumExecutionMs'),
    maximumResultBytes: integer(browserAxeSource.maximumResultBytes, 'browserAxe.maximumResultBytes'),
    maximumScreenshots: integer(browserAxeSource.maximumScreenshots, 'browserAxe.maximumScreenshots'),
    maximumScreenshotBytes: integer(browserAxeSource.maximumScreenshotBytes, 'browserAxe.maximumScreenshotBytes'),
  };
}

export function browserAxeOptions(browserAxeSource: Source): Pick<BusterCapabilityRuntimeOptions, 'browserAxe'> {
  return browserAxeSource
    ? {
        browserAxe: {
          ...readBrowserAxePolicy(browserAxeSource),
          browserExecutables: browserExecutableMap(
            browserAxeSource.browserExecutables,
            'browserAxe.browserExecutables',
          ),
        },
      }
    : {};
}

export function readBrowserLighthousePolicy(browserLighthouseSource: Record<string, unknown>) {
  return {
    allowedOrigins: optionalStringArray(
      browserLighthouseSource.allowedOrigins,
      'browserLighthouse.allowedOrigins',
    ),
    maximumRuns: integer(browserLighthouseSource.maximumRuns, 'browserLighthouse.maximumRuns'),
    maximumExecutionMs: integer(
      browserLighthouseSource.maximumExecutionMs,
      'browserLighthouse.maximumExecutionMs',
    ),
    maximumResultBytes: integer(
      browserLighthouseSource.maximumResultBytes,
      'browserLighthouse.maximumResultBytes',
    ),
  };
}

export function browserLighthouseOptions(
  browserLighthouseSource: Source,
): Pick<BusterCapabilityRuntimeOptions, 'browserLighthouse'> {
  return browserLighthouseSource
    ? {
        browserLighthouse: {
          ...readBrowserLighthousePolicy(browserLighthouseSource),
          chromeExecutable: browserExecutableMap(
            { chromium: browserLighthouseSource.chromeExecutable },
            'browserLighthouse.chromeExecutable',
          ).chromium!,
        },
      }
    : {};
}

export function readBrowserVisualPolicy(browserVisualSource: Record<string, unknown>) {
  return {
    allowedOrigins: optionalStringArray(browserVisualSource.allowedOrigins, 'browserVisual.allowedOrigins'),
    allowedBrowsers: browserNames(browserVisualSource.allowedBrowsers, 'browserVisual.allowedBrowsers'),
    maximumCombinations: integer(browserVisualSource.maximumCombinations, 'browserVisual.maximumCombinations'),
    maximumConcurrency: integer(browserVisualSource.maximumConcurrency, 'browserVisual.maximumConcurrency'),
    maximumExecutionMs: integer(browserVisualSource.maximumExecutionMs, 'browserVisual.maximumExecutionMs'),
    maximumResultBytes: integer(browserVisualSource.maximumResultBytes, 'browserVisual.maximumResultBytes'),
    maximumScreenshotBytes: integer(
      browserVisualSource.maximumScreenshotBytes,
      'browserVisual.maximumScreenshotBytes',
    ),
    maximumMasksPerCombination: integer(
      browserVisualSource.maximumMasksPerCombination,
      'browserVisual.maximumMasksPerCombination',
    ),
  };
}

export function browserVisualOptions(
  browserVisualSource: Source,
): Pick<BusterCapabilityRuntimeOptions, 'browserVisual'> {
  return browserVisualSource
    ? {
        browserVisual: {
          ...readBrowserVisualPolicy(browserVisualSource),
          browserExecutables: browserExecutableMap(
            browserVisualSource.browserExecutables,
            'browserVisual.browserExecutables',
          ),
        },
      }
    : {};
}

export function readBrowserPlaywrightPolicy(browserPlaywrightSource: Record<string, unknown>) {
  return {
    allowedOrigins: optionalStringArray(
      browserPlaywrightSource.allowedOrigins,
      'browserPlaywright.allowedOrigins',
    ),
    allowedTargetPorts: integerArray(
      browserPlaywrightSource.allowedTargetPorts,
      'browserPlaywright.allowedTargetPorts',
      65535,
    ),
    readOnlyRoots: stringArray(browserPlaywrightSource.readOnlyRoots, 'browserPlaywright.readOnlyRoots'),
    maximumWorkers: integer(browserPlaywrightSource.maximumWorkers, 'browserPlaywright.maximumWorkers'),
    maximumExecutionMs: integer(
      browserPlaywrightSource.maximumExecutionMs,
      'browserPlaywright.maximumExecutionMs',
    ),
    maximumOutputBytes: integer(
      browserPlaywrightSource.maximumOutputBytes,
      'browserPlaywright.maximumOutputBytes',
    ),
    maximumResultBytes: integer(
      browserPlaywrightSource.maximumResultBytes,
      'browserPlaywright.maximumResultBytes',
    ),
    maximumArtifactBytes: integer(
      browserPlaywrightSource.maximumArtifactBytes,
      'browserPlaywright.maximumArtifactBytes',
    ),
    maximumArtifactFiles: integer(
      browserPlaywrightSource.maximumArtifactFiles,
      'browserPlaywright.maximumArtifactFiles',
    ),
    maximumProcesses: integer(browserPlaywrightSource.maximumProcesses, 'browserPlaywright.maximumProcesses'),
    maximumMemoryBytes: integer(
      browserPlaywrightSource.maximumMemoryBytes,
      'browserPlaywright.maximumMemoryBytes',
    ),
    maximumCpuMillis: integer(browserPlaywrightSource.maximumCpuMillis, 'browserPlaywright.maximumCpuMillis'),
    terminationGraceMs: integer(
      browserPlaywrightSource.terminationGraceMs,
      'browserPlaywright.terminationGraceMs',
    ),
    runAsUid: integer(browserPlaywrightSource.runAsUid, 'browserPlaywright.runAsUid'),
    runAsGid: integer(browserPlaywrightSource.runAsGid, 'browserPlaywright.runAsGid'),
  };
}

export function browserPlaywrightOptions(
  browserPlaywrightSource: Source,
  directory: string,
  browserPlaywrightCgroup: string | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'browserPlaywright'> {
  return browserPlaywrightSource
    ? {
        browserPlaywright: {
          ...readBrowserPlaywrightPolicy(browserPlaywrightSource),
          playwrightExecutable: path.resolve(directory, String(browserPlaywrightSource.playwrightExecutable)),
          sandboxExecutable: path.resolve(directory, String(browserPlaywrightSource.sandboxExecutable)),
          runtimeNodeModules: path.resolve(directory, String(browserPlaywrightSource.runtimeNodeModules)),
          browsersPath: path.resolve(directory, String(browserPlaywrightSource.browsersPath)),
          cgroupRoot: path.resolve(directory, browserPlaywrightCgroup!),
        },
      }
    : {};
}
