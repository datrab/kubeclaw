// ═══════════════════════════════════════════════════════════════
// Suite Runner — Deterministic Test Suite Orchestrator
// ═══════════════════════════════════════════════════════════════

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';

import {
  STATUS,
  SEVERITY,
  createSuiteVerdict,
  createRunnerVerdict,
  createFinding,
} from '../services/verdict-schema.ts';
import type { SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';

import { emitEvent, emitPluginEvent } from '../services/telemetry.ts';
import {
  BusterCapabilityDeniedError,
  assertBusterCapabilities,
  requiredCapabilitiesForSuite,
} from '../services/capabilities.ts';
import a11ySuite from '../suites/a11y.ts';
import apiSuite from '../suites/api.ts';
import buildSuite from '../suites/build.ts';
import bundleSuite from '../suites/bundle.ts';
import e2eSuite from '../suites/e2e.ts';
import healthSuite from '../suites/health.ts';
import k8sSuite from '../suites/k8s.ts';
import manifestSuite from '../suites/manifest.ts';
import perfSuite from '../suites/perf.ts';
import securitySuite from '../suites/security.ts';
import unitSuite from '../suites/unit.ts';
import { runVisualReg } from '../suites/visual-reg.ts';

const RESULTS_DIR = '/sandbox/results';

type SuiteFunction = (context: SuiteContext) => Promise<SuiteVerdict> | SuiteVerdict;

type LogSink = (entry: Record<string, unknown>) => void;

interface SuiteRunnerPayload {
  project?: string;
  test_config?: Record<string, unknown>;
  capabilities?: readonly string[];
  pipeline_log_path?: string;
  pipeline_run_log_path?: string;
  [key: string]: unknown;
}

interface SuiteRunnerOptions {
  payload?: SuiteRunnerPayload;
  moduleId?: string;
  attempt?: number;
  telemetryContext?: unknown;
  logDir?: string | null;
  capabilities?: readonly string[];
  pipelineLogPath?: string | null;
  pipelineRunLogPath?: string | null;
}

interface SuiteContext extends Record<string, unknown> {
  payload: SuiteRunnerPayload;
  moduleId: string;
  module: string;
  project: string;
  config: Record<string, unknown>;
  capabilities: readonly string[];
  resultsDir: string;
  testsLogDir: string | null;
  screenshotsDir: string;
  logDir: string | null;
  pipelineLogPath: string | null;
  pipelineRunLogPath: string | null;
  logSink: LogSink | null;
  attempt: number | undefined;
  telemetryContext: unknown;
  suiteAbortSignal?: AbortSignal;
  suiteDeadlineMs?: number;
}

type SuiteResult = SuiteVerdict & { duration_seconds?: number };

interface CapabilityDeniedLike extends Error {
  action?: string;
  missing_capabilities?: string[];
  details?: {
    blocked_action?: string;
    required_capabilities?: string[];
    configured_capabilities?: string[];
  };
}

interface SuiteRunnerValidationDetails {
  reason: string;
  unknown_suites?: string[];
  invalid_suites?: unknown[];
  missing_fields?: string[];
  field?: string;
  value?: unknown;
  suite?: string;
}

interface SuiteRunnerValidationError extends Error {
  code: 'BUSTER_SUITE_REQUEST_INVALID';
  details: SuiteRunnerValidationDetails;
}

function createSuiteRunnerValidationError(message: string, details: SuiteRunnerValidationDetails): SuiteRunnerValidationError {
  const error = new Error(message) as SuiteRunnerValidationError;
  error.name = 'SuiteRunnerValidationError';
  error.code = 'BUSTER_SUITE_REQUEST_INVALID';
  error.details = details;
  return error;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown');
}

function warnNonBlocking(classification: string, error: unknown, context: Record<string, unknown> = {}): void {
  const detail = errorDetail(error);
  const suffix = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.warn(`[SUITE-RUNNER] non-blocking ${classification}${suffix ? ` ${suffix}` : ''}: ${detail}`);
}

async function emitResultWriteDiagnostic(tctx: unknown, classification: string, error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error || 'unknown');
  await emitEvent(tctx, 'observability.degraded', {
    component: 'buster_suite_runner',
    surface: 'suite_results',
    reason: classification,
    detail,
    module_id: context.module || null,
    gate_id: context.gate_id || null,
    gate_type: context.gate_type || null,
    attempt: context.attempt ?? null,
    dispatch_id: context.dispatch_id || null,
    session_key: context.session_key || null,
    degraded_at: new Date().toISOString(),
  });
}

function suiteIcon(status: SuiteStatus): string {
  switch (status) {
    case 'PASS': return '✅';
    case 'FAIL': return '❌';
    case 'SKIP': return '⏭';
    case 'ERROR': return '💥';
  }
  const exhaustive: never = status;
  throw new Error(`Unsupported suite status: ${String(exhaustive)}`);
}

const SUITE_REGISTRY: Readonly<Record<string, SuiteFunction>> = Object.freeze({
  a11y: a11ySuite,
  api: apiSuite,
  build: buildSuite,
  bundle: bundleSuite,
  e2e: e2eSuite,
  health: healthSuite,
  k8s: k8sSuite,
  manifest: manifestSuite,
  perf: perfSuite,
  security: securitySuite,
  unit: unitSuite,
  'visual-reg': runVisualReg,
});

function hasSuite(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUITE_REGISTRY, name);
}

function loadSuite(name: string): SuiteFunction {
  const suite = SUITE_REGISTRY[name];
  if (!suite) {
    throw createSuiteRunnerValidationError(`Unknown Buster suite requested: ${name}`, {
      reason: 'unknown_suite',
      unknown_suites: [name],
    });
  }
  return suite;
}

export function validateSuiteNames(suites: readonly unknown[]): string[] {
  if (!Array.isArray(suites)) {
    throw createSuiteRunnerValidationError('Buster suites must be an array of suite names', {
      reason: 'invalid_suites_shape',
      invalid_suites: [suites],
    });
  }

  const invalidSuites: unknown[] = [];
  const suiteNames: string[] = [];
  for (const suite of suites) {
    if (typeof suite !== 'string' || suite.trim() === '') {
      invalidSuites.push(suite);
      continue;
    }
    suiteNames.push(suite.trim());
  }

  if (suiteNames.length === 0) {
    throw createSuiteRunnerValidationError('Buster suites must include at least one suite name', {
      reason: 'empty_suite_list',
      invalid_suites: suites,
    });
  }

  const unknownSuites = suiteNames.filter(suite => !hasSuite(suite));
  if (invalidSuites.length > 0 || unknownSuites.length > 0) {
    throw createSuiteRunnerValidationError(`Invalid Buster suite request: ${unknownSuites.concat(invalidSuites.map(String)).join(', ')}`, {
      reason: unknownSuites.length > 0 ? 'unknown_suite' : 'invalid_suite_name',
      unknown_suites: unknownSuites,
      invalid_suites: invalidSuites,
    });
  }

  return suiteNames;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function resolveSuiteTimeoutMs(config: Record<string, unknown>): number {
  if (!Object.prototype.hasOwnProperty.call(config, 'suite_timeout_ms')) {
    throw createSuiteRunnerValidationError('test_config.suite_timeout_ms is required', {
      reason: 'missing_suite_timeout_ms',
      missing_fields: ['test_config.suite_timeout_ms'],
    });
  }

  const value = config.suite_timeout_ms;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw createSuiteRunnerValidationError('test_config.suite_timeout_ms must be a positive integer', {
      reason: 'invalid_suite_timeout_ms',
      field: 'test_config.suite_timeout_ms',
      value,
    });
  }
  return value;
}

function createCapabilityDeniedVerdict(suiteName: string, error: CapabilityDeniedLike): SuiteVerdict {
  return createSuiteVerdict(suiteName, STATUS.ERROR, {
    critical: true,
    error: error.message,
    reason: 'buster_capability_denied',
    findings: [createFinding(SEVERITY.CRITICAL, error.message, { rule: 'buster-capability-denied' })],
    metadata: {
      blocked_action: error.action || error.details?.blocked_action || 'tool_execution',
      missing_capabilities: error.missing_capabilities || [],
      required_capabilities: error.details?.required_capabilities || [],
      configured_capabilities: error.details?.configured_capabilities || [],
    },
  });
}

function enforceSuiteCapabilities(suiteName: string, context: SuiteContext): void {
  const required = requiredCapabilitiesForSuite(suiteName, context);
  if (required.length === 0) return;
  assertBusterCapabilities(context, {
    suite: suiteName,
    action: `run ${suiteName} suite`,
    required,
  });
}

function checkDependencies(suiteName: string, completedResults: Record<string, SuiteVerdict>): string | null {
  const deps = DEPENDENCIES[suiteName];
  if (!deps) {
    throw createSuiteRunnerValidationError(`Missing dependency declaration for Buster suite: ${suiteName}`, {
      reason: 'missing_suite_dependencies',
      suite: suiteName,
    });
  }

  for (const dep of deps) {
    const depResult = completedResults[dep];
    if (!depResult) continue;
    if (depResult.status === STATUS.FAIL && depResult.critical) return `${dep} failed`;
    if (depResult.status === STATUS.ERROR) return `${dep} errored`;
  }

  return null;
}

function sortSuites(suiteNames: readonly string[]): string[] {
  return [...suiteNames].sort((a, b) => {
    const posA = EXECUTION_ORDER.indexOf(a);
    const posB = EXECUTION_ORDER.indexOf(b);
    return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
  });
}

function requireSuiteIdentity(moduleId: unknown, project: unknown): { moduleId: string; project: string } {
  const missing: string[] = [];
  const normalizedModuleId = typeof moduleId === 'string' ? moduleId.trim() : '';
  const normalizedProject = typeof project === 'string' ? project.trim() : '';
  if (!normalizedModuleId) missing.push('moduleId');
  if (!normalizedProject) missing.push('payload.project');
  if (missing.length > 0) {
    throw createSuiteRunnerValidationError('Buster suite runner requires explicit module and project identity', {
      reason: 'missing_suite_identity',
      missing_fields: missing,
    });
  }
  return { moduleId: normalizedModuleId, project: normalizedProject };
}

function safeArtifactSegment(value: string): string {
  const segment = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  if (!segment) {
    throw createSuiteRunnerValidationError('Buster suite artifact segment must be non-empty after sanitization', {
      reason: 'invalid_suite_artifact_segment',
      field: 'moduleId',
      value,
    });
  }
  return segment;
}

export function resolveSandboxResultsDir(moduleId: string, attempt: number | undefined): string {
  const suffix = attempt ? `-attempt-${attempt}` : '';
  return path.join(RESULTS_DIR, `${safeArtifactSegment(moduleId)}${suffix}`);
}

// KEEP_TYPED_POLICY: suite result artifacts are observability side effects and
// write failures must not override verdict execution.
async function writeResults(suiteMap: Record<string, SuiteVerdict>, moduleId: string, project: string, swarmResultsDir: string | null, attempt: number | undefined, tctx: unknown): Promise<void> {
  const runnerVerdict = createRunnerVerdict(moduleId, project, suiteMap);
  const sandboxResultsDir = resolveSandboxResultsDir(moduleId, attempt);
  const telemetryCtx = tctx && typeof tctx === 'object' ? tctx as Record<string, any> : {};
  const diagnosticContext = {
    module: telemetryCtx.gateId ? null : moduleId,
    gate_id: telemetryCtx.gateId || null,
    gate_type: telemetryCtx.gateType || null,
    attempt,
    dispatch_id: telemetryCtx.dispatchId || null,
    session_key: telemetryCtx.sessionKey || null,
  };

  try {
    if (!fs.existsSync(sandboxResultsDir)) fs.mkdirSync(sandboxResultsDir, { recursive: true });
    for (const [name, suite] of Object.entries(suiteMap)) {
      fs.writeFileSync(path.join(sandboxResultsDir, `${name}-verdict.json`), JSON.stringify(suite, null, 2));
    }
    fs.writeFileSync(path.join(sandboxResultsDir, 'runner-verdict.json'), JSON.stringify(runnerVerdict, null, 2));
  } catch (error: unknown) {
    warnNonBlocking('sandbox_results_write_failed', error, { module: moduleId, project });
    await emitResultWriteDiagnostic(tctx, 'sandbox_results_write_failed', error, diagnosticContext);
  }

  if (swarmResultsDir) {
    try {
      if (!fs.existsSync(swarmResultsDir)) fs.mkdirSync(swarmResultsDir, { recursive: true });
      const suffix = attempt ? `-attempt-${attempt}` : '';
      fs.writeFileSync(path.join(swarmResultsDir, `verdict${suffix}.json`), JSON.stringify(runnerVerdict, null, 2));
      for (const [name, suite] of Object.entries(suiteMap)) {
        fs.writeFileSync(path.join(swarmResultsDir, `${name}-verdict${suffix}.json`), JSON.stringify(suite, null, 2));
      }
    } catch (error: unknown) {
      warnNonBlocking('swarm_results_write_failed', error, { module: moduleId, project, swarmResultsDir });
      await emitResultWriteDiagnostic(tctx, 'swarm_results_write_failed', error, diagnosticContext);
    }
  }
}

export async function runSuiteWithTimeout(suiteName: string, suiteFn: SuiteFunction, context: SuiteContext, suiteTimeout: number): Promise<SuiteVerdict> {
  if (typeof suiteTimeout !== 'number' || !Number.isFinite(suiteTimeout) || !Number.isInteger(suiteTimeout) || suiteTimeout <= 0) {
    throw createSuiteRunnerValidationError('suiteTimeout must be a positive integer', {
      reason: 'invalid_suite_timeout_ms',
      field: 'suiteTimeout',
      value: suiteTimeout,
    });
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();
  let acceptSuiteEffects = true;
  const guardedLogSink = context.logSink
    ? (entry: Record<string, unknown>): void => {
        if (!acceptSuiteEffects || controller.signal.aborted) return;
        context.logSink?.(entry);
      }
    : null;
  const suiteContext = {
    ...context,
    logSink: guardedLogSink,
    suiteAbortSignal: controller.signal,
    suiteDeadlineMs: Date.now() + suiteTimeout,
  };
  try {
    return await Promise.race([
      suiteFn(suiteContext),
      new Promise<SuiteVerdict>((_, reject) => {
        timeoutId = setTimeout(
          () => {
            controller.abort();
            reject(new Error(`Suite "${suiteName}" timed out after ${suiteTimeout / 1000}s (safety limit)`));
          },
          suiteTimeout,
        );
      }),
    ]);
  } finally {
    acceptSuiteEffects = false;
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

async function emitSuiteCompleted(tctx: unknown, moduleId: string | undefined, suiteName: string, result: SuiteVerdict, attempt: number | undefined, startMs: number): Promise<void> {
  const telemetryCtx = tctx && typeof tctx === 'object' ? tctx as Record<string, any> : null;
  const gateId = telemetryCtx?.gateId || null;
  await emitPluginEvent(tctx, 'suite_completed', {
    module_id: gateId ? null : moduleId,
    ...(gateId ? { gate_id: gateId, gate_type: telemetryCtx?.gateType ?? null } : {}),
    suite: suiteName,
    attempt,
    status: result.status,
    duration_seconds: Math.round((Date.now() - startMs) / 1000),
    checks_passed: result.checks_passed ?? 0,
    checks_failed: result.checks_failed ?? 0,
    critical: result.critical ?? false,
    reason: result.reason ?? null,
    error: result.error ?? null,
    top_finding: result.findings?.[0]?.message ?? result.reason ?? result.error ?? null,
  });
}

export function buildSuiteSummary(results: readonly SuiteVerdict[]): string {
  return results
    .map((result) => `${suiteIcon(result.status)} ${result.suite}`)
    .join(' ');
}

export function buildDetailedSuiteSummary(results: readonly SuiteVerdict[]): string {
  return results
    .map((result) => {
      const detail = result.findings?.[0]?.message
        || result.error
        || result.reason
        || null;
      return detail
        ? `${result.suite}: ${result.status} - ${detail}`
        : `${result.suite}: ${result.status}`;
    })
    .join(' | ');
}

export async function runSuites(suites: readonly unknown[], opts: SuiteRunnerOptions = {}): Promise<{ results: SuiteResult[]; suiteSummary: string; suiteDetailSummary: string; criticalFailed: boolean }> {
  const { payload = {}, moduleId, attempt, telemetryContext: tctx, logDir = null } = opts;
  const suiteIdentity = requireSuiteIdentity(moduleId, payload.project);

  const suiteNames = validateSuiteNames(suites);
  if (!isRecord(payload.test_config)) {
    throw createSuiteRunnerValidationError('Buster payload test_config must be an object', {
      reason: 'invalid_test_config_shape',
      field: 'test_config',
      value: payload.test_config ?? null,
    });
  }
  const config = payload.test_config;
  const suiteTimeout = resolveSuiteTimeoutMs(config);
  const project = suiteIdentity.project;
  const resolvedModuleId = suiteIdentity.moduleId;
  const ordered = sortSuites(suiteNames);
  const swarmResultsDir = logDir ? path.join(logDir, 'tests') : null;
  if (swarmResultsDir) {
    try {
      fs.mkdirSync(swarmResultsDir, { recursive: true });
    } catch (error: unknown) {
      warnNonBlocking('swarm_results_dir_init_failed', error, { module: moduleId, swarmResultsDir });
    }
  }
  const logPath = swarmResultsDir ? path.join(swarmResultsDir, 'suites.jsonl') : null;
  const logSink: LogSink | null = logPath ? (entry) => {
    try {
      fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    } catch (error: unknown) {
      warnNonBlocking('suite_jsonl_append_failed', error, { module: moduleId, logPath });
    }
  } : null;

  const context: SuiteContext = {
    payload,
    moduleId: resolvedModuleId,
    module: resolvedModuleId,
    project,
    config,
    capabilities: opts.capabilities || payload.capabilities || [],
    resultsDir: RESULTS_DIR,
    testsLogDir: swarmResultsDir,
    screenshotsDir: swarmResultsDir ? path.join(swarmResultsDir, 'visual-reg') : path.join(RESULTS_DIR, 'visual-reg'),
    logDir,
    pipelineLogPath: opts.pipelineLogPath || payload.pipeline_log_path || null,
    pipelineRunLogPath: opts.pipelineRunLogPath || payload.pipeline_run_log_path || null,
    logSink,
    attempt,
    telemetryContext: tctx,
  };

  const results: SuiteResult[] = [];
  const suiteMap: Record<string, SuiteVerdict> = {};
  let criticalFailed = false;

  for (const suiteName of ordered) {
    const skipReason = checkDependencies(suiteName, suiteMap);
    if (skipReason) {
      const verdict = createSuiteVerdict(suiteName, STATUS.SKIP, { reason: skipReason });
      suiteMap[suiteName] = verdict;
      results.push(verdict);
      await emitSuiteCompleted(tctx, moduleId, suiteName, verdict, attempt, Date.now());
      continue;
    }

    try {
      enforceSuiteCapabilities(suiteName, context);
    } catch (error: unknown) {
      if (!(error instanceof BusterCapabilityDeniedError)) throw error;
      const verdict = createCapabilityDeniedVerdict(suiteName, error);
      criticalFailed = true;
      suiteMap[suiteName] = verdict;
      results.push(verdict);
      await emitSuiteCompleted(tctx, moduleId, suiteName, verdict, attempt, Date.now());
      continue;
    }

    const suiteFn = loadSuite(suiteName);

    const startMs = Date.now();
    const telemetryCtx = tctx && typeof tctx === 'object' ? tctx as Record<string, any> : null;
    const gateId = telemetryCtx?.gateId || null;
    await emitPluginEvent(tctx, 'suite_started', {
      module_id: gateId ? null : moduleId,
      ...(gateId ? { gate_id: gateId, gate_type: telemetryCtx?.gateType ?? null } : {}),
      suite: suiteName,
      attempt,
    });

    let result: SuiteVerdict;
    try {
      result = await runSuiteWithTimeout(suiteName, suiteFn, context, suiteTimeout);
      if (!result.duration_ms) result.duration_ms = Date.now() - startMs;
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      result = createSuiteVerdict(suiteName, STATUS.ERROR, {
        critical: suiteName === 'build' || suiteName === 'health',
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : 'Suite threw an unexpected error',
        findings: [],
      });
    }

    await emitSuiteCompleted(tctx, moduleId, suiteName, result, attempt, startMs);

    if ((result.status === STATUS.FAIL || result.status === STATUS.ERROR) && result.critical) {
      criticalFailed = true;
    }

    suiteMap[suiteName] = result;
    results.push({ ...result, duration_seconds: Math.round((Date.now() - startMs) / 1000) });
  }

  await writeResults(suiteMap, resolvedModuleId, project, swarmResultsDir, attempt, tctx);

  const suiteSummary = buildSuiteSummary(results);
  const suiteDetailSummary = buildDetailedSuiteSummary(results);

  return { results, suiteSummary, suiteDetailSummary, criticalFailed };
}

export const EXECUTION_ORDER = [
  'manifest',
  'build', 'health',
  'k8s',
  'a11y', 'perf', 'bundle', 'security', 'visual-reg',
  'api', 'e2e', 'unit',
];

export const DEPENDENCIES: Record<string, string[]> = {
  manifest: [],
  build: ['manifest'],
  health: ['build'],
  k8s: [],
  a11y: ['health'],
  perf: ['health'],
  bundle: ['build'],
  security: ['build'],
  'visual-reg': ['health'],
  api: ['health'],
  e2e: ['health'],
  unit: [],
};
