import { STATUS } from '../core/constants.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

const BUSTER_OUTPUT_ARTIFACT_FAILURES = new Set([
  'output_file_identity_mismatch',
  'output_file_missing',
]);

function isOneOf(value: unknown, candidates: string[]) {
  return typeof value === 'string' && candidates.includes(value);
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function resolveModuleBusterFailureClass(pollResult: AnyRecord = {}) {
  const explicit = typeof pollResult?.failure_class === 'string' ? pollResult.failure_class : null;
  if (explicit?.trim()) return explicit.trim().toLowerCase();
  const statusExplicit = typeof pollResult?.status?.failure_class === 'string' ? pollResult.status.failure_class : null;
  if (statusExplicit?.trim()) return statusExplicit.trim().toLowerCase();
  const reason = typeof pollResult?.reason === 'string' ? pollResult.reason.trim().toLowerCase() : '';
  if (['timeout', 'parse_corrupted', 'rate_limit_exhausted', 'agent_session_lifecycle_unstable', 'completion_archive_failed'].includes(reason)) return reason;
  if (BUSTER_OUTPUT_ARTIFACT_FAILURES.has(reason)) return reason;
  const redisReason = typeof pollResult?.status?._redis_entry?.reason === 'string'
    ? pollResult.status._redis_entry.reason.trim().toLowerCase()
    : '';
  if (BUSTER_OUTPUT_ARTIFACT_FAILURES.has(redisReason)) return redisReason;
  if (redisReason === 'completion_archive_failed') return redisReason;
  return null;
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
