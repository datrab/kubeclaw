// Suite Runner — deterministic registry and public orchestration boundary.
import a11ySuite from '../suites/a11y.js';
import apiSuite from '../suites/api.js';
import buildSuite from '../suites/build.js';
import bundleSuite from '../suites/bundle.js';
import e2eSuite from '../suites/e2e.js';
import healthSuite from '../suites/health.js';
import k8sSuite from '../suites/k8s.js';
import manifestSuite from '../suites/manifest.js';
import perfSuite from '../suites/perf.js';
import securitySuite from '../suites/security.js';
import tailscalePreviewSuite from '../suites/tailscale-preview.js';
import unitSuite from '../suites/unit.js';
import { runVisualReg } from '../suites/visual-reg.js';
import type { SuiteVerdict } from '../services/verdict-schema.js';
import { createSuiteRunnerValidationError } from './suite-runner-contracts.js';
import type { SuiteContext, SuiteFunction, SuiteResult, SuiteRunnerOptions } from './suite-runner-contracts.js';
import { resolveSuiteResultsDir } from './suite-runner-artifacts.js';
import { runSuiteWithTimeout } from './suite-runner-execution.js';
import { applyBuildRuntimePort, buildDetailedSuiteSummary, collectReadySuites as collectReady, executeSuites } from './suite-runner-graph.js';

const SUITE_REGISTRY: Readonly<Record<string, SuiteFunction>> = Object.freeze({
  a11y: a11ySuite, api: apiSuite, build: buildSuite, bundle: bundleSuite, e2e: e2eSuite,
  health: healthSuite, k8s: k8sSuite, manifest: manifestSuite, perf: perfSuite, security: securitySuite,
  'tailscale-preview': tailscalePreviewSuite, unit: unitSuite, 'visual-reg': runVisualReg,
}) as unknown as Readonly<Record<string, SuiteFunction>>;

export const EXECUTION_ORDER = ['manifest', 'build', 'health', 'k8s', 'tailscale-preview', 'a11y', 'perf', 'bundle', 'security', 'visual-reg', 'api', 'e2e', 'unit'];
export const DEPENDENCIES: Record<string, string[]> = { manifest: [], build: ['manifest'], health: ['build'], k8s: [],
  'tailscale-preview': ['k8s'], a11y: ['health'], perf: ['health'], bundle: ['build'], security: ['build'],
  'visual-reg': ['health'], api: ['health'], e2e: ['health'], unit: [] };

export function validateSuiteNames(suites: readonly unknown[]): string[] {
  if (!Array.isArray(suites)) throw createSuiteRunnerValidationError('Buster suites must be an array of suite names', { reason: 'invalid_suites_shape', invalid_suites: [suites] });
  const invalid = suites.filter((suite) => typeof suite !== 'string' || !suite.trim());
  const names = suites.filter((suite): suite is string => typeof suite === 'string' && Boolean(suite.trim())).map((suite) => suite.trim());
  if (!names.length) throw createSuiteRunnerValidationError('Buster suites must include at least one suite name', { reason: 'empty_suite_list', invalid_suites: [...suites] });
  const unsupported = names.filter((name) => !Object.prototype.hasOwnProperty.call(SUITE_REGISTRY, name));
  if (invalid.length || unsupported.length) throw createSuiteRunnerValidationError(`Invalid Buster suite request: ${unsupported.concat(invalid.map(String)).join(', ')}`, {
    reason: unsupported.length ? 'unsupported_suite' : 'invalid_suite_name', unsupported_suites: unsupported, invalid_suites: invalid,
  });
  return names;
}

export function resolveSuiteTimeoutMs(config: Record<string, unknown>): number {
  if (!Object.prototype.hasOwnProperty.call(config, 'suite_timeout_ms')) throw createSuiteRunnerValidationError('test_config.suite_timeout_ms is required', {
    reason: 'missing_suite_timeout_ms', missing_fields: ['test_config.suite_timeout_ms'],
  });
  const value = config.suite_timeout_ms;
  if (!Number.isInteger(value) || Number(value) <= 0) throw createSuiteRunnerValidationError('test_config.suite_timeout_ms must be a positive integer', {
    reason: 'invalid_suite_timeout_ms', field: 'test_config.suite_timeout_ms', value,
  });
  return Number(value);
}

export { applyBuildRuntimePort, buildDetailedSuiteSummary, resolveSuiteResultsDir, runSuiteWithTimeout };

export function collectReadySuites(suiteNames: readonly string[], completedResults: Record<string, SuiteVerdict> = {}): string[] {
  return collectReady(suiteNames, completedResults, DEPENDENCIES, EXECUTION_ORDER);
}

export async function runSuites(suites: readonly unknown[], opts: SuiteRunnerOptions): Promise<{ results: SuiteResult[]; suiteSummary: string; suiteDetailSummary: string; criticalFailed: boolean }> {
  return executeSuites({ registry: SUITE_REGISTRY, dependencies: DEPENDENCIES, executionOrder: EXECUTION_ORDER,
    validateNames: validateSuiteNames, resolveTimeout: resolveSuiteTimeoutMs }, suites, opts);
}

// Contract markers: unsupported statuses throw "Unsupported suite status";
// dependency declarations fail with missing_suite_dependencies and dynamic suite loading is intentionally absent.
