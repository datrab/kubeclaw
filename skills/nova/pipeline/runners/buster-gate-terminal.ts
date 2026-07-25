import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { createBusterGateTerminalContext } from './buster-gate-terminal-context.ts';
import { handleBusterGatePass } from './buster-gate-terminal-pass.ts';
import {
  handleInvalidBusterGateContract,
  handleNonVerdictBusterGateFailure,
  handleSimpleBusterGateFailure,
} from './buster-gate-terminal-failures.ts';
import { handleBusterGateRateLimit } from './buster-gate-terminal-rate-limit.ts';
import { handleBusterGateVerdictFailure } from './buster-gate-terminal-verdict.ts';

export const BUSTER_GATE_EVALUATION_RESULT_TYPES = Object.freeze({
  PASS: 'pass',
  CONFIG_INVALID: 'config_invalid',
  COMMIT_HASH_MISSING: 'commit_hash_missing',
  SPAWN_FAILED: 'spawn_failed',
  INVALID_CONTRACT: 'invalid_contract',
  PARSE_CORRUPTED: 'parse_corrupted',
  TIMEOUT: 'timeout',
  GIT_ERROR: 'git_error',
  RATE_LIMIT_EXHAUSTED: 'rate_limit_exhausted',
  COMPLETION_ARCHIVE_FAILED: 'completion_archive_failed',
  COMPLETION_CONFLICT: 'completion_conflict',
  COMPLETION_EVENT_ADAPTER_FAILED: 'completion_event_adapter_failed',
  COMPLETION_EVENT_UNRESOLVED: 'completion_event_unresolved',
  VERDICT_FAIL: 'verdict_fail',
});

const REASON_TYPES = Object.freeze({
  config_invalid: BUSTER_GATE_EVALUATION_RESULT_TYPES.CONFIG_INVALID,
  commit_hash_missing: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMMIT_HASH_MISSING,
  spawn_failed: BUSTER_GATE_EVALUATION_RESULT_TYPES.SPAWN_FAILED,
  invalid_contract: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
  parse_corrupted: BUSTER_GATE_EVALUATION_RESULT_TYPES.PARSE_CORRUPTED,
  timeout: BUSTER_GATE_EVALUATION_RESULT_TYPES.TIMEOUT,
  git_error: BUSTER_GATE_EVALUATION_RESULT_TYPES.GIT_ERROR,
  rate_limit_exhausted: BUSTER_GATE_EVALUATION_RESULT_TYPES.RATE_LIMIT_EXHAUSTED,
  completion_archive_failed: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_ARCHIVE_FAILED,
  completion_conflict: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_CONFLICT,
  completion_event_adapter_failed: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_ADAPTER_FAILED,
  completion_event_unresolved: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_UNRESOLVED,
  verdict_fail: BUSTER_GATE_EVALUATION_RESULT_TYPES.VERDICT_FAIL,
});

const NON_VERDICT_TYPES = new Set([
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_ARCHIVE_FAILED,
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_CONFLICT,
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_ADAPTER_FAILED,
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_UNRESOLVED,
]);

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function invalidEvaluation(result: any, status: any, invalidReason: string, rawReason: string, message: string) {
  return Object.freeze({
    type: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
    result,
    status: {
      ...status,
      reason: selectDefinedValue(() => status?.reason, () => message),
      invalid_reason: invalidReason,
      raw_reason: selectTruthyValue(() => rawReason, () => null),
    },
    reason: selectTruthyValue(() => rawReason, () => null),
  });
}

function assertPassResult(result: any, status: any) {
  const reason = nonEmptyString(result?.reason) ?? '';
  const statusValue = (nonEmptyString(status?.status) ?? '').toUpperCase();
  if (reason === 'target_reached' && statusValue === 'PASS') {
    return Object.freeze({ type: BUSTER_GATE_EVALUATION_RESULT_TYPES.PASS, result, status, reason: null });
  }
  const reasonDisplay = reason || '(missing)';
  const statusDisplay = statusValue || '(missing)';
  return invalidEvaluation(result, status, 'invalid_pass_payload', reason, `Buster gate pass payload invalid: reason=${reasonDisplay} status=${statusDisplay}`);
}

export function assertBusterGateEvaluationResult(result: any = {}) {
  const status: any = objectRecord(result?.status) ?? {};
  if (result?.ok === true) return assertPassResult(result, status);
  const rawReason = nonEmptyString(result?.reason) ?? '';
  const type = REASON_TYPES[rawReason as keyof typeof REASON_TYPES];
  if (!type) {
    const invalidReason = rawReason ? 'unsupported_reason' : 'missing_reason';
    return invalidEvaluation(result, status, invalidReason, rawReason, `Buster gate result has ${invalidReason}: ${rawReason || '(missing)'}`);
  }
  return Object.freeze({ type, result, status, reason: rawReason || null });
}

async function dispatchEvaluation(ctx: any) {
  const type = ctx.evaluation.type;
  if (type === BUSTER_GATE_EVALUATION_RESULT_TYPES.PASS) return handleBusterGatePass(ctx);
  if (type === BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT) return handleInvalidBusterGateContract(ctx);
  if (type === BUSTER_GATE_EVALUATION_RESULT_TYPES.RATE_LIMIT_EXHAUSTED) return handleBusterGateRateLimit(ctx);
  if (NON_VERDICT_TYPES.has(type)) return handleNonVerdictBusterGateFailure(ctx);
  const simpleFailure = await handleSimpleBusterGateFailure(ctx);
  return simpleFailure ?? handleBusterGateVerdictFailure(ctx);
}

export async function handleBusterGateEvaluationResult(input: any) {
  const evaluation = assertBusterGateEvaluationResult(input.result);
  return dispatchEvaluation(createBusterGateTerminalContext(input, evaluation));
}
