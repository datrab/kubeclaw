import { selectDefinedValue, selectTruthyValue } from '../../../optional-absence.ts';
import { workerControlMetadata as workerMetadata } from '../../../services/contracts/worker-control-accessors.ts';
import {
  handleCompletionConflictPollFailure,
  handleGitPollFailure,
  handleOutputContractPollFailure,
  handleRateLimitPollFailure,
} from './poll-failure-special.ts';
import { exhaustBusterPollFailure, retryBusterPollFailure } from './poll-failure-crash.ts';
type AnyRecord = Record<string, any>;

function requireText(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${field}: required non-empty string`);
}

function requirePositiveNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  throw new Error(`${field}: required positive number`);
}

function requiredCompletionIdentity(completionIdentity: AnyRecord) {
  return {
    runId: requireText(completionIdentity.runId, 'completionIdentity.runId'),
    attempt: requirePositiveNumber(completionIdentity.attempt, 'completionIdentity.attempt'),
    dispatchId: requireText(completionIdentity.dispatchId, 'completionIdentity.dispatchId'),
    gatewayLabel: requireText(completionIdentity.gateway_label, 'completionIdentity.gateway_label'),
    sessionKey: selectDefinedValue(() => (completionIdentity.sessionKey), () => (null)),
  };
}

function requiredRateLimitExitIdentity(rateLimitExit: AnyRecord) {
  return {
    runId: requireText(rateLimitExit.run_id, 'rateLimitExit.run_id'),
    attempt: requirePositiveNumber(rateLimitExit.attempt, 'rateLimitExit.attempt'),
    dispatchId: requireText(rateLimitExit.dispatch_id, 'rateLimitExit.dispatch_id'),
    gatewayLabel: requireText(rateLimitExit.gateway_label, 'rateLimitExit.gateway_label'),
    sessionKey: requireText(rateLimitExit.session_key, 'rateLimitExit.session_key'),
  };
}

function resolvePollFailureStatusAuthority({ busterWorkerControlResult, status }: AnyRecord = {}) {
  const metadata = workerMetadata(busterWorkerControlResult);
  if (metadata.final_status) {
    return {
      status: {
        ...status,
        ...metadata.final_status,
        validation: (selectDefinedValue(() => (metadata.final_status.validation), () => (null))),
        cost: (selectDefinedValue(() => (metadata.final_status.cost), () => (null))),
      },
      source: 'worker_final_status',
    };
  }
  return {
    status,
    source: 'in_memory_status',
    degraded: {
      code: 'poll_failure_status_authority_in_memory',
      message: 'Buster poll failure lacked worker final status; using active in-memory status with explicit authority evidence',
    },
  };
}

export async function handleFailedPollResult(context: AnyRecord = {}) {
  const { busterWorkerControlResult, status: initialStatus, completionIdentity } = context;
  const workerMeta = workerMetadata(busterWorkerControlResult);
  const statusAuthority = resolvePollFailureStatusAuthority({ busterWorkerControlResult, status: initialStatus });
  const status = statusAuthority.status;
  const identity = requiredCompletionIdentity(completionIdentity);
  const reasonCode = requireText(workerMeta.reason, 'busterWorkerControlResult.diagnostics.metadata.reason');
  const handlerContext = {
    ...context,
    status,
    workerMeta,
    statusAuthority,
    identity,
    reasonCode,
    requireRateLimitIdentity: requiredRateLimitExitIdentity,
  };
  if (reasonCode === 'rate_limit_exhausted') return handleRateLimitPollFailure(handlerContext);
  if (reasonCode === 'git_error') return handleGitPollFailure(handlerContext);
  if (reasonCode === 'completion_conflict') return handleCompletionConflictPollFailure(handlerContext);
  if (['output_file_identity_mismatch', 'output_file_missing'].includes(reasonCode)) {
    return handleOutputContractPollFailure(handlerContext);
  }
  if (!context.isLastBusterAttempt) return retryBusterPollFailure(handlerContext);
  return exhaustBusterPollFailure(handlerContext);
}
