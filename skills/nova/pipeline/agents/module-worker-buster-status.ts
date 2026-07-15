import { STATUS } from '../core/constants.ts';

type AnyRecord = Record<string, any>;

function objectRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function objectOrNull(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? value as AnyRecord : null;
}

function isRateLimitReason(reason: unknown) {
  return typeof reason === 'string' && ['rate_limit_exhausted', 'rate_limited'].includes(reason);
}

export function pollStatus(pollResult: AnyRecord | null = null): AnyRecord | null {
  return objectOrNull(pollResult?.status);
}

export function pollRedisEntry(pollResult: AnyRecord | null = null): AnyRecord | null {
  return objectOrNull(pollStatus(pollResult)?._redis_entry);
}

function terminalStatusText(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(normalized) ? normalized : null;
}

function selectPresentValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

export function statusEvidenceFields(pollResult: AnyRecord | null = null): AnyRecord {
  const status = pollStatus(pollResult);
  const redisEntry = pollRedisEntry(pollResult);
  let rateLimitStatus = objectOrNull(pollResult?.rate_limit_status);
  if (rateLimitStatus === null && isRateLimitReason(pollResult?.reason)) {
    rateLimitStatus = status;
  }
  return {
    statusDetail: typeof status?.detail === 'string' && status.detail.trim() ? status.detail.trim() : null,
    statusMessage: typeof status?.message === 'string' && status.message.trim() ? status.message.trim() : null,
    statusErrors: Array.isArray(status?.errors) ? status.errors : null,
    pollingGit: pollResult?.reason === 'git_error'
      ? (status?.details ? status.details : status ? status : null)
      : null,
    completionConflict: pollResult?.reason === 'completion_conflict' ? (status || null) : null,
    redisEntry,
    rateLimitStatus,
    rateLimitPauses: pollResult?.rate_limit_pauses ?? null,
    maxRateLimitPauses: pollResult?.max_rate_limit_pauses ?? null,
  };
}

export function terminalBusterFinalStatus({
  finalStatus,
  pollStatus,
  redisEntry,
  failureClass,
  pollReason,
}: {
  finalStatus: AnyRecord | null;
  pollStatus: AnyRecord | null;
  redisEntry: AnyRecord | null;
  failureClass: string | null;
  pollReason: unknown;
}): AnyRecord | null {
  const terminal = terminalStatusText(pollStatus?.status) || terminalStatusText(redisEntry?.status);
  if (!terminal) return finalStatus;
  return {
    ...objectRecord(finalStatus),
    ...objectRecord(pollStatus),
    status: terminal,
    completion_summary: selectPresentValue(pollStatus?.completion_summary, pollStatus?.summary, redisEntry?.summary, pollReason),
    reason: selectPresentValue(pollStatus?.reason, redisEntry?.reason, pollReason),
    failure_class: selectPresentValue(failureClass, pollStatus?.failure_class, redisEntry?.failure_class),
  };
}
