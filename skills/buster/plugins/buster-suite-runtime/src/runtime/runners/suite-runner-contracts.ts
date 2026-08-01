import type { SuiteVerdict } from '../services/verdict-schema.js';

export type SuiteFunction = (context: SuiteContext) => Promise<SuiteVerdict> | SuiteVerdict;
type LogSink = (entry: Record<string, unknown>) => void;
export type SuiteResult = SuiteVerdict & { duration_seconds?: number };

export interface SuiteRunnerPayload {
  project?: string; run_id?: string; module_id?: string; gate_id?: string; gate_type?: string;
  dispatch_id?: string; session_key?: string; test_config?: Record<string, unknown>;
  capabilities?: readonly string[]; pipeline_log_path?: string; pipeline_run_log_path?: string;
  [key: string]: unknown;
}

export interface SuiteRunnerOptions {
  repoRoot: string; payload?: SuiteRunnerPayload; moduleId?: string; attempt?: number; telemetryContext?: unknown;
  logDir?: string | null; capabilities?: readonly string[]; pipelineLogPath?: string | null; pipelineRunLogPath?: string | null;
}

export interface SuiteContext extends Record<string, unknown> {
  repoRoot: string; payload: SuiteRunnerPayload; moduleId: string; runId: string | null; gateId: string | null;
  gateType: string | null; dispatchId: string | null; sessionKey: string | null; project: string;
  config: Record<string, unknown>; capabilities: readonly string[]; resultsDir: string; testsLogDir: string | null;
  screenshotsDir: string; logDir: string | null; pipelineLogPath: string | null; pipelineRunLogPath: string | null;
  logSink: LogSink | null; attempt: number | undefined; telemetryContext: unknown; suiteResults: Record<string, SuiteVerdict>;
  registerRuntimeCleanup: (cleanup: () => Promise<void> | void) => void; suiteAbortSignal?: AbortSignal; suiteDeadlineMs?: number;
}

export interface CapabilityDeniedLike extends Error {
  action?: string; missing_capabilities?: string[];
  details?: { blocked_action?: string; required_capabilities?: string[]; configured_capabilities?: string[] };
}

export interface SuiteRunnerValidationDetails {
  reason: string; unsupported_suites?: string[]; invalid_suites?: unknown[]; missing_fields?: string[];
  field?: string; value?: unknown; suite?: string;
}

export interface SuiteRunnerValidationError extends Error {
  code: 'BUSTER_SUITE_REQUEST_INVALID'; details: SuiteRunnerValidationDetails;
}

export function createSuiteRunnerValidationError(message: string, details: SuiteRunnerValidationDetails): SuiteRunnerValidationError {
  const error = new Error(message) as SuiteRunnerValidationError;
  error.name = 'SuiteRunnerValidationError'; error.code = 'BUSTER_SUITE_REQUEST_INVALID'; error.details = details;
  return error;
}
