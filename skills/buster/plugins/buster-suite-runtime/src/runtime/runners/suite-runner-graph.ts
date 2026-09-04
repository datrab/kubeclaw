import path from 'path';
import { resolveContextCapabilities } from '../services/capabilities.ts';
import { buildDependencyGraph, collectReadyItems, runBatch } from '../scheduler.ts';
import { createSuiteVerdict, STATUS } from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { createSuiteLogSink, cleanupSuiteResources, initializeSuiteResultsDir, RESULTS_DIR, writeSuiteResults } from './suite-runner-artifacts.ts';
import { createSuiteRunnerValidationError } from './suite-runner-contracts.ts';
import type { SuiteContext, SuiteFunction, SuiteResult, SuiteRunnerOptions, SuiteRunnerPayload } from './suite-runner-contracts.ts';
import { runOneSuite } from './suite-runner-execution.ts';
import { emitSuiteCompleted } from './suite-runner-telemetry.ts';

export interface SuiteGraphAuthority {
  registry: Readonly<Record<string, SuiteFunction>>; dependencies: Record<string, string[]>; executionOrder: string[];
  validateNames: (suites: readonly unknown[]) => string[]; resolveTimeout: (config: Record<string, unknown>) => number;
}
interface RunState {
  authority: SuiteGraphAuthority; payload: SuiteRunnerPayload; moduleId: string | undefined; attempt: number | undefined;
  telemetryContext: unknown; project: string; resolvedModuleId: string; ordered: string[]; timeoutMs: number;
  swarmResultsDir: string | null; results: SuiteResult[]; suiteMap: Record<string, SuiteVerdict>;
  cleanups: Array<() => Promise<void> | void>; context: SuiteContext; criticalFailed: boolean;
}

function identity(moduleId: unknown, project: unknown): { moduleId: string; project: string } {
  const normalizedModule = typeof moduleId === 'string' ? moduleId.trim() : '';
  const normalizedProject = typeof project === 'string' ? project.trim() : '';
  const missing = [...(!normalizedModule ? ['moduleId'] : []), ...(!normalizedProject ? ['payload.project'] : [])];
  if (missing.length) throw createSuiteRunnerValidationError('Buster suite runner requires explicit module and project identity', { reason: 'missing_suite_identity', missing_fields: missing });
  return { moduleId: normalizedModule, project: normalizedProject };
}

function sorted(names: string[], order: string[]): string[] {
  return [...names].sort((left, right) => {
    const leftIndex = order.indexOf(left); const rightIndex = order.indexOf(right);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function contextForRun(opts: SuiteRunnerOptions, payload: SuiteRunnerPayload, resolved: { moduleId: string; project: string },
  config: Record<string, unknown>, suiteMap: Record<string, SuiteVerdict>, cleanups: Array<() => Promise<void> | void>, resultsDir: string | null): SuiteContext {
  const logPath = resultsDir ? path.join(resultsDir, 'suites.jsonl') : null;
  return { repoRoot: opts.repoRoot.trim(), payload, moduleId: resolved.moduleId, runId: payload.run_id ?? null,
    gateId: payload.gate_id ?? null, gateType: payload.gate_type ?? null, dispatchId: payload.dispatch_id ?? null,
    sessionKey: payload.session_key ?? null, project: resolved.project, config,
    capabilities: resolveContextCapabilities({ capabilities: opts.capabilities, payload }), resultsDir: RESULTS_DIR,
    testsLogDir: resultsDir,
    logDir: opts.logDir ?? null, pipelineLogPath: opts.pipelineLogPath ?? null, pipelineRunLogPath: opts.pipelineRunLogPath ?? null,
    logSink: createSuiteLogSink(logPath, opts.moduleId), attempt: opts.attempt, telemetryContext: opts.telemetryContext,
    suiteResults: suiteMap, registerRuntimeCleanup: (cleanup) => cleanups.push(cleanup) };
}

function prepare(authority: SuiteGraphAuthority, suites: readonly unknown[], opts: SuiteRunnerOptions): RunState {
  const payload = opts.payload ?? {};
  const resolved = identity(opts.moduleId, payload.project);
  const repoRoot = opts.repoRoot?.trim();
  if (![Boolean(repoRoot), path.isAbsolute(repoRoot ?? '')].every(Boolean)) throw createSuiteRunnerValidationError('Buster suite runner requires an absolute synchronized repository root', {
    reason: 'invalid_suite_repo_root', field: 'repoRoot', value: opts.repoRoot,
  });
  if (!isRecord(payload.test_config)) throw createSuiteRunnerValidationError('Buster payload test_config must be an object', {
    reason: 'invalid_test_config_shape', field: 'test_config', value: payload.test_config ?? null,
  });
  const resultsDir = opts.logDir ? path.join(opts.logDir, 'tests') : null;
  initializeSuiteResultsDir(resultsDir, opts.moduleId);
  const suiteMap: Record<string, SuiteVerdict> = {};
  const cleanups: Array<() => Promise<void> | void> = [];
  return { authority, payload, moduleId: opts.moduleId, attempt: opts.attempt, telemetryContext: opts.telemetryContext,
    project: resolved.project, resolvedModuleId: resolved.moduleId, ordered: sorted(authority.validateNames(suites), authority.executionOrder),
    timeoutMs: authority.resolveTimeout(payload.test_config), swarmResultsDir: resultsDir, results: [], suiteMap, cleanups,
    context: contextForRun(opts, payload, resolved, payload.test_config, suiteMap, cleanups, resultsDir), criticalFailed: false };
}

function dependencyFailure(state: RunState, suiteName: string): string | null {
  const dependencies = state.authority.dependencies[suiteName];
  if (!dependencies) throw createSuiteRunnerValidationError(`Missing dependency declaration for Buster suite: ${suiteName}`, { reason: 'missing_suite_dependencies', suite: suiteName });
  for (const dependency of dependencies) {
    const result = state.suiteMap[dependency];
    if (result?.status === STATUS.FAIL && result.critical) return `${dependency} failed`;
    if (result?.status === STATUS.ERROR) return `${dependency} errored`;
  }
  return null;
}

async function skipBlocked(state: RunState, pending: Set<string>): Promise<void> {
  for (const suiteName of state.ordered.filter((name) => pending.has(name))) {
    const reason = dependencyFailure(state, suiteName);
    if (!reason) continue;
    const verdict = createSuiteVerdict(suiteName, STATUS.SKIP, { reason });
    state.suiteMap[suiteName] = verdict; state.results.push(verdict); pending.delete(suiteName);
    await emitSuiteCompleted(state.telemetryContext, state.moduleId, suiteName, verdict, state.attempt, Date.now());
  }
}

function readySuites(state: RunState, candidates: string[]): string[] {
  const requested = new Set(state.ordered);
  const graph = buildDependencyGraph(state.ordered.map((id) => ({ id, dependencies: (state.authority.dependencies[id] ?? []).filter((dep) => requested.has(dep)) })));
  return collectReadyItems({ orderedIds: candidates, dependencyIds: (id) => graph.dependencyIds(id),
    isCandidateReady: (_id, value) => value.dependencyIds.every((dep) => Boolean(state.suiteMap[dep])) });
}

async function executeBatch(state: RunState, ready: string[]): Promise<void> {
  const batch = await runBatch({ batchId: `buster-suite:${state.resolvedModuleId}:${state.results.length + 1}`, itemIds: ready,
    executor: (suiteName) => runOneSuite({ suiteName, suiteFn: state.authority.registry[suiteName]!, context: state.context,
      timeoutMs: state.timeoutMs, telemetryContext: state.telemetryContext, moduleId: state.moduleId, attempt: state.attempt }) });
  for (const entry of batch.results) {
    const result: SuiteResult = entry.status === 'fulfilled' ? entry.result as SuiteResult : createSuiteVerdict(entry.item_id, STATUS.ERROR, {
      critical: true, error: entry.reason ?? 'Suite scheduler execution failed', reason: entry.reason_code ?? 'suite_scheduler_execution_failed', findings: [],
    });
    if (entry.status !== 'fulfilled') await emitSuiteCompleted(state.telemetryContext, state.moduleId, entry.item_id, result, state.attempt, Date.now());
    if (new Set<SuiteVerdict['status']>([STATUS.ERROR, STATUS.FAIL]).has(result.status)) state.criticalFailed = true;
    state.suiteMap[entry.item_id] = result; state.results.push(result); state.context.suiteResults[entry.item_id] = result;
  }
}

async function executeGraph(state: RunState): Promise<void> {
  const pending = new Set(state.ordered);
  while (pending.size) {
    await skipBlocked(state, pending);
    const candidates = state.ordered.filter((name) => pending.has(name));
    if (!candidates.length) return;
    const ready = readySuites(state, candidates);
    if (!ready.length) throw createSuiteRunnerValidationError('Buster suite dependency graph has no ready suites', { reason: 'suite_dependency_deadlock', invalid_suites: candidates });
    await executeBatch(state, ready);
    ready.forEach((name) => pending.delete(name));
  }
}

function detail(result: SuiteVerdict): string | null {
  const finding = result.findings?.[0]?.message;
  if (typeof finding === 'string') return finding;
  if (typeof result.error === 'string') return result.error;
  return typeof result.reason === 'string' ? result.reason : null;
}
function suiteIcon(status: SuiteVerdict['status']): string {
  switch (status) {
    case STATUS.PASS: return '✅';
    case STATUS.FAIL: return '❌';
    case STATUS.SKIP: return '⏭';
    case STATUS.ERROR: return '💥';
  }
  const exhaustive: never = status;
  throw new Error(`Unsupported suite status: ${String(exhaustive)}`);
}
export function buildDetailedSuiteSummary(results: readonly SuiteVerdict[]): string { return results.map((result) => `${result.suite}: ${result.status}${detail(result) ? ` - ${detail(result)}` : ''}`).join(' | '); }
export function collectReadySuites(names: readonly string[], completed: Record<string, SuiteVerdict>, dependencies: Record<string, string[]>, order: string[]): string[] {
  const state = { authority: { dependencies, executionOrder: order }, ordered: sorted([...names], order), suiteMap: completed } as RunState;
  return readySuites(state, state.ordered.filter((name) => !completed[name]));
}

export async function executeSuites(authority: SuiteGraphAuthority, suites: readonly unknown[], opts: SuiteRunnerOptions): Promise<{ results: SuiteResult[]; suiteSummary: string; suiteDetailSummary: string; criticalFailed: boolean }> {
  const state = prepare(authority, suites, opts);
  try {
    await executeGraph(state);
    await writeSuiteResults({ suiteMap: state.suiteMap, moduleId: state.resolvedModuleId, project: state.project,
      swarmResultsDir: state.swarmResultsDir, attempt: state.attempt, telemetryContext: state.telemetryContext });
    return { results: state.results, suiteSummary: state.results.map((result) => `${suiteIcon(result.status)} ${result.suite}`).join(' '),
      suiteDetailSummary: buildDetailedSuiteSummary(state.results), criticalFailed: state.criticalFailed };
  } finally { await cleanupSuiteResources(state.cleanups, { module: state.resolvedModuleId, project: state.project }); }
}
