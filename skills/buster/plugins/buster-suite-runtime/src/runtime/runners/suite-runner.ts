// Suite Runner — deterministic registry and public orchestration boundary.
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { createSuiteRunnerValidationError } from './suite-runner-contracts.ts';
import type { SuiteContext, SuiteFunction, SuiteResult, SuiteRunnerOptions } from './suite-runner-contracts.ts';
import { resolveSuiteResultsDir } from './suite-runner-artifacts.ts';
import { runSuiteWithTimeout } from './suite-runner-execution.ts';
import { buildDetailedSuiteSummary, collectReadySuites as collectReady, executeSuites } from './suite-runner-graph.ts';

const SUITE_REGISTRY: Readonly<Record<string, SuiteFunction>> = Object.freeze({
}) as unknown as Readonly<Record<string, SuiteFunction>>;

export const EXECUTION_ORDER: string[] = [];
export const DEPENDENCIES: Record<string, string[]> = {
};

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

export { buildDetailedSuiteSummary, resolveSuiteResultsDir, runSuiteWithTimeout };

export async function runSuites(suites: readonly unknown[], opts: SuiteRunnerOptions): Promise<{ results: SuiteResult[]; suiteSummary: string; suiteDetailSummary: string; criticalFailed: boolean }> {
  return executeSuites({ registry: SUITE_REGISTRY, dependencies: DEPENDENCIES, executionOrder: EXECUTION_ORDER,
    validateNames: validateSuiteNames, resolveTimeout: resolveSuiteTimeoutMs }, suites, opts);
}

// Contract markers: unsupported statuses throw "Unsupported suite status";
// dependency declarations fail with missing_suite_dependencies and dynamic suite loading is intentionally absent.
