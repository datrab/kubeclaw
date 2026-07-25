import { STATUS } from '../../core/constants.ts';
import { selectDefinedValue } from '../../optional-absence.ts';

type AnyRecord = Record<string, any>;

export function isBusterPhaseActive(status: AnyRecord): boolean {
  if (status.status === STATUS.READY_FOR_TESTING) return true;
  return status.status === STATUS.TESTING && status.current_phase === 'buster';
}

export function normalizedStatusText(value: unknown): string {
  return String(selectDefinedValue(() => value, () => '')).trim().toUpperCase();
}

export function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveBusterSessionKey(metadata: AnyRecord, sessionKey: unknown): string | null {
  const metadataKey = nonEmptyString(metadata.session_key);
  const outcomeKey = nonEmptyString(sessionKey);
  if (metadataKey && outcomeKey && metadataKey !== outcomeKey) {
    throw new Error('Buster worker returned conflicting session key authorities');
  }
  return metadataKey || outcomeKey;
}

export function mergeWorkerStatus(current: AnyRecord | null, worker: AnyRecord | null): AnyRecord | null {
  if (!worker) return current;
  return {
    ...(current && typeof current === 'object' ? current : {}), ...worker,
    validation: selectDefinedValue(() => worker.validation, () => null),
    cost: selectDefinedValue(() => worker.cost, () => null),
  };
}

export function statusAfterWorkerDispatch(current: AnyRecord, worker: AnyRecord | null): AnyRecord {
  return mergeWorkerStatus(current, worker) ?? current;
}

export function startupRateLimitPauseCountAuthority(metadata: AnyRecord, current: number): number {
  if (metadata.rate_limit_pauses === undefined || metadata.rate_limit_pauses === null) return current + 1;
  const count = Number(metadata.rate_limit_pauses);
  if (Number.isFinite(count) && count >= 0) return count;
  throw new Error('Buster worker rate_limit_pauses must be a non-negative number');
}

export function statusAfterPollFailure(current: AnyRecord, failure: AnyRecord): AnyRecord {
  return failure?.status && typeof failure.status === 'object' ? failure.status : current;
}

export function statusAfterTerminalFailure(current: AnyRecord, failure: AnyRecord): AnyRecord {
  return failure?.status && typeof failure.status === 'object' ? failure.status : current;
}
