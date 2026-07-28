import { STATUS } from '../core/constants.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

const BUSTER_OUTPUT_ARTIFACT_FAILURES = new Set([
  'output_file_identity_mismatch',
  'output_file_missing',
]);
const DIRECT_FAILURE_CLASSES = new Set([
  'timeout',
  'parse_corrupted',
  'rate_limit_exhausted',
  'agent_session_lifecycle_unstable',
  'completion_archive_failed',
]);

function isOneOf(value: unknown, candidates: string[]) {
  return typeof value === 'string' && candidates.includes(value);
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizedFailureClass(value: unknown): string {
  return textValue(value).trim().toLowerCase();
}

function recognizedFailureClass(reason: string): string | null {
  return DIRECT_FAILURE_CLASSES.has(reason) || BUSTER_OUTPUT_ARTIFACT_FAILURES.has(reason) ? reason : null;
}

export function resolveModuleBusterFailureClass(pollResult: AnyRecord = {}) {
  const explicit = normalizedFailureClass(pollResult?.failure_class);
  if (explicit) return explicit;
  const statusExplicit = normalizedFailureClass(pollResult?.status?.failure_class);
  if (statusExplicit) return statusExplicit;
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  const recognizedReason = recognizedFailureClass(reason);
  if (recognizedReason) return recognizedReason;
  const redisReason = normalizedFailureClass(pollResult?.status?._redis_entry?.reason);
  return recognizedFailureClass(redisReason);
}

export function forgeControlForPollResult(pollResult: AnyRecord = {}) {
  if (pollResult?.ok === true) return { nextAction: 'pass', issueType: null, outcomeClass: 'passed' };
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  if (reason === 'timeout') {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying' };
  }
  if (isOneOf(reason, ['agent_ended_missing', 'agent_session_lifecycle_unstable', 'forge_completion_artifact_missing'])) {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying' };
  }
  if (isOneOf(reason, ['session_ended_no_changes', 'agent_ended_no_meaningful_diff', 'session_ended_no_meaningful_diff', 'invalid_forge_completion'])) {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested' };
  }
  if (reason === 'rate_limit_exhausted') return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited' };
  if (isOneOf(reason, ['parse_corrupted', 'git_error'])) return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error' };
  if (!reason) return { nextAction: 'block', issueType: 'environment', outcomeClass: 'error' };
  return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested' };
}

export function busterControlForPollResult(pollResult: AnyRecord = {}, failureClass: string | null = null) {
  const terminalStatus = String(selectDefinedValue(() => pollResult?.status?.status, () => '')).trim().toUpperCase();
  if (pollResult?.ok === true && terminalStatus !== STATUS.FAIL && terminalStatus !== STATUS.BLOCKED) {
    return { nextAction: 'pass', issueType: null, outcomeClass: 'passed', failureClass: 'pass' };
  }
  if (isOneOf(failureClass, ['timeout', 'parse_corrupted', 'agent_session_lifecycle_unstable', 'infra_crash', 'pretest_infra', 'pretest_config'])) {
    return { nextAction: 'retry', issueType: 'environment', outcomeClass: 'retrying', failureClass };
  }
  if (isOneOf(failureClass, ['verdict_fail', 'pretest_code'])) {
    return { nextAction: 'request_fix', issueType: 'code', outcomeClass: 'fix_requested', failureClass };
  }
  if (failureClass === 'rate_limit_exhausted') return { nextAction: 'block', issueType: 'environment', outcomeClass: 'rate_limited', failureClass };
  const knownInfrastructureFailure = selectTruthyValue(
    () => isOneOf(failureClass, ['spawn_failed', 'completion_archive_failed']),
    () => BUSTER_OUTPUT_ARTIFACT_FAILURES.has(textValue(failureClass)),
  );
  return {
    nextAction: 'block', issueType: 'environment', outcomeClass: 'error',
    failureClass: knownInfrastructureFailure ? failureClass : failureClass ?? 'poll_failure_class_missing',
  };
}
