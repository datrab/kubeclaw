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

function rateLimitEvidence(pollResult: AnyRecord | null, status: AnyRecord | null): AnyRecord | null {
  const explicit = objectOrNull(pollResult?.rate_limit_status);
  if (explicit) return explicit;
  return isRateLimitReason(pollResult?.reason) ? status : null;
}

function pollingGitEvidence(pollResult: AnyRecord | null, status: AnyRecord | null): AnyRecord | null {
  if (pollResult?.reason !== 'git_error') return null;
  return objectOrNull(status?.details) ?? status;
}

function normalizedStatusText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function statusEvidenceFields(pollResult: AnyRecord | null = null): AnyRecord {
  const status = pollStatus(pollResult);
  const redisEntry = pollRedisEntry(pollResult);
  return {
    statusDetail: normalizedStatusText(status?.detail),
    statusMessage: normalizedStatusText(status?.message),
    statusErrors: Array.isArray(status?.errors) ? status.errors : null,
    pollingGit: pollingGitEvidence(pollResult, status),
    completionConflict: pollResult?.reason === 'completion_conflict' ? (status ?? null) : null,
    redisEntry,
    rateLimitStatus: rateLimitEvidence(pollResult, status),
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
  const pollTerminal = terminalStatusText(pollStatus?.status);
  const terminal = pollTerminal ?? terminalStatusText(redisEntry?.status);
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
