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

export function browserAxeOptions(browserAxeSource: Source): Pick<BusterCapabilityRuntimeOptions, 'browserAxe'> {
  return browserAxeSource
    ? {
        browserAxe: {
          allowedOrigins: optionalStringArray(browserAxeSource.allowedOrigins, 'browserAxe.allowedOrigins'),
          allowedBrowsers: stringArray(browserAxeSource.allowedBrowsers, 'browserAxe.allowedBrowsers') as (
            'chromium' | 'firefox' | 'webkit'
          )[],
          browserExecutables: browserExecutableMap(
            browserAxeSource.browserExecutables,
            'browserAxe.browserExecutables',
          ),
          maximumCombinations: integer(browserAxeSource.maximumCombinations, 'browserAxe.maximumCombinations'),
          maximumConcurrency: integer(browserAxeSource.maximumConcurrency, 'browserAxe.maximumConcurrency'),
          maximumExecutionMs: integer(browserAxeSource.maximumExecutionMs, 'browserAxe.maximumExecutionMs'),
          maximumResultBytes: integer(browserAxeSource.maximumResultBytes, 'browserAxe.maximumResultBytes'),
          maximumScreenshots: integer(browserAxeSource.maximumScreenshots, 'browserAxe.maximumScreenshots'),
          maximumScreenshotBytes: integer(browserAxeSource.maximumScreenshotBytes, 'browserAxe.maximumScreenshotBytes'),
        },
      }
    : {};
}

export function browserLighthouseOptions(
  browserLighthouseSource: Source,
): Pick<BusterCapabilityRuntimeOptions, 'browserLighthouse'> {
  return browserLighthouseSource
    ? {
        browserLighthouse: {
          allowedOrigins: optionalStringArray(
            browserLighthouseSource.allowedOrigins,
            'browserLighthouse.allowedOrigins',
          ),
          chromeExecutable: browserExecutableMap(
            { chromium: browserLighthouseSource.chromeExecutable },
            'browserLighthouse.chromeExecutable',
          ).chromium!,
          maximumRuns: integer(browserLighthouseSource.maximumRuns, 'browserLighthouse.maximumRuns'),
          maximumExecutionMs: integer(
            browserLighthouseSource.maximumExecutionMs,
            'browserLighthouse.maximumExecutionMs',
          ),
          maximumResultBytes: integer(
            browserLighthouseSource.maximumResultBytes,
            'browserLighthouse.maximumResultBytes',
          ),
        },
      }
    : {};
}

export function browserVisualOptions(
  browserVisualSource: Source,
): Pick<BusterCapabilityRuntimeOptions, 'browserVisual'> {
  return browserVisualSource
    ? {
        browserVisual: {
          allowedOrigins: optionalStringArray(browserVisualSource.allowedOrigins, 'browserVisual.allowedOrigins'),
          allowedBrowsers: stringArray(browserVisualSource.allowedBrowsers, 'browserVisual.allowedBrowsers') as (
            'chromium' | 'firefox' | 'webkit'
          )[],
          browserExecutables: browserExecutableMap(
            browserVisualSource.browserExecutables,
            'browserVisual.browserExecutables',
          ),
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
        },
      }
    : {};
}

export function browserPlaywrightOptions(
  browserPlaywrightSource: Source,
  directory: string,
  browserPlaywrightCgroup: string | undefined,
): Pick<BusterCapabilityRuntimeOptions, 'browserPlaywright'> {
  return browserPlaywrightSource
    ? {
        browserPlaywright: {
          allowedOrigins: optionalStringArray(
            browserPlaywrightSource.allowedOrigins,
            'browserPlaywright.allowedOrigins',
          ),
          allowedTargetPorts: integerArray(
            browserPlaywrightSource.allowedTargetPorts,
            'browserPlaywright.allowedTargetPorts',
            65535,
          ),
          playwrightExecutable: path.resolve(directory, String(browserPlaywrightSource.playwrightExecutable)),
          sandboxExecutable: path.resolve(directory, String(browserPlaywrightSource.sandboxExecutable)),
          runtimeNodeModules: path.resolve(directory, String(browserPlaywrightSource.runtimeNodeModules)),
          browsersPath: path.resolve(directory, String(browserPlaywrightSource.browsersPath)),
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
          cgroupRoot: path.resolve(directory, browserPlaywrightCgroup!),
          runAsUid: integer(browserPlaywrightSource.runAsUid, 'browserPlaywright.runAsUid'),
          runAsGid: integer(browserPlaywrightSource.runAsGid, 'browserPlaywright.runAsGid'),
        },
      }
    : {};
}
