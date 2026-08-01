import { isBudgetExhaustedError } from '../timing.ts';
import type { TimeBudget } from '../timing.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { writeRuntimeLog } from '../runtime-log.ts';

export type AnyRecord = Record<string, any>;
export type AnyFunction = (...args: any[]) => any;

export function sessionLifecycleLog(level: unknown, message: unknown): void {
  writeRuntimeLog(
    String(level).toLowerCase() as 'debug' | 'info' | 'warn' | 'error',
    'common/agent-lifecycle',
    String(message),
  );
}

export function sessionErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function requireFiniteMs(value: unknown, fieldName: string, { min = 0 }: AnyRecord = {}): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    throw new Error(`${fieldName} must be explicit and >= ${min}`);
  }
  return Math.round(number);
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${fieldName} must be explicit and >= 1`);
  }
  return number;
}

export function requireGatewayPolicy(value: unknown, fieldName: string): AnyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be explicit session gateway policy`);
  }
  const policy = value as AnyRecord;
  return {
    timeoutMs: requireFiniteMs(policy.timeoutMs, `${fieldName}.timeoutMs`),
    maxRetries: requirePositiveInteger(policy.maxRetries, `${fieldName}.maxRetries`),
    retryDelayMs: requireFiniteMs(policy.retryDelayMs, `${fieldName}.retryDelayMs`),
  };
}

export function resolveKillPolicy(opts: AnyRecord, isSubagent: boolean): AnyRecord {
  const policy = opts.killPolicy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('killSession requires explicit opts.killPolicy from swarm.config.json');
  }
  const confirmField = isSubagent ? 'subagentConfirmTimeoutMs' : 'acpConfirmTimeoutMs';
  return {
    confirmTimeoutMs: requireFiniteMs(policy[confirmField], `killPolicy.${confirmField}`),
    confirmPollMs: requireFiniteMs(policy.confirmPollMs, 'killPolicy.confirmPollMs', { min: 1 }),
    cleanupConfirmTimeoutMs: policy.cleanupConfirmTimeoutMs,
    statusTimeoutMs: requireFiniteMs(policy.statusTimeoutMs, 'killPolicy.statusTimeoutMs'),
    requestTimeoutMs: requireFiniteMs(policy.requestTimeoutMs, 'killPolicy.requestTimeoutMs'),
    stopRequestTimeoutMs: requireFiniteMs(policy.stopRequestTimeoutMs, 'killPolicy.stopRequestTimeoutMs'),
    listTimeoutMs: requireFiniteMs(policy.listTimeoutMs, 'killPolicy.listTimeoutMs'),
    statusGateway: requireGatewayPolicy(policy.statusGateway, 'killPolicy.statusGateway'),
    requestGateway: requireGatewayPolicy(policy.requestGateway, 'killPolicy.requestGateway'),
    stopGateway: requireGatewayPolicy(policy.stopGateway, 'killPolicy.stopGateway'),
    listGateway: requireGatewayPolicy(policy.listGateway, 'killPolicy.listGateway'),
    acpxTimeoutMs: requireFiniteMs(policy.acpxTimeoutMs, 'killPolicy.acpxTimeoutMs'),
    stopMessage: requiredNonEmptyString(policy.stopMessage, 'killPolicy.stopMessage'),
  };
}

function normalizeGatewayError(endpoint: string, error: unknown): unknown {
  const message = sessionErrorMessage(error);
  const statusMatch = message.match(/(?:^|[^\d])([45]\d\d)(?:[^\d]|$)/);
  const gatewayMatch = message.match(/Gateway returned (\d+)/);
  const status = gatewayMatch?.[1] ?? statusMatch?.[1];
  if (!status) return error;
  const normalized = new Error(gatewayMatch ? `Gateway ${endpoint} returned ${status}` : message) as Error & {
    gatewayStatus?: number;
  };
  normalized.gatewayStatus = Number(status);
  return normalized;
}

export function isNonRetryableGatewayContractError(error: unknown): boolean {
  const record = error as AnyRecord;
  return [
    Number(record?.gatewayStatus) === 400,
    /\b400\b.*Bad Request|Bad Request.*\b400\b/i.test(sessionErrorMessage(error)),
  ].includes(true);
}

export async function requestGateway(
  operation: AnyFunction,
  endpoint: string,
  operationArg: unknown,
  timeoutMs: number,
  waitOptions: AnyRecord = {},
): Promise<AnyRecord> {
  requireFiniteMs(timeoutMs, `gateway ${endpoint} timeoutMs`);
  try {
    return await operation(operationArg, timeoutMs, waitOptions);
  } catch (error) {
    throw normalizeGatewayError(endpoint, error);
  }
}

export function isCallerAbort(error: unknown, signal: AbortSignal | null, budget: TimeBudget | null): boolean {
  return [signal?.aborted, budget?.signal?.aborted, isBudgetExhaustedError(error)].includes(true);
}

function abortError(signal: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(reason ? String(reason) : 'Operation aborted') as Error & { code?: string };
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

export function throwIfCallerAbort(signal: AbortSignal | null, budget: TimeBudget | null): void {
  if (signal?.aborted) throw abortError(signal);
  if (budget?.signal?.aborted) throw abortError(budget.signal);
  budget?.throwIfExhausted?.('kill_session_budget_exhausted');
}

export function resolveAbortSignal(signal: AbortSignal | null, budgetSignal: AbortSignal | null): AnyRecord {
  if (!signal || !budgetSignal || signal === budgetSignal) {
    return { signal: signal ?? budgetSignal, cleanup: () => {} };
  }
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  const onSignalAbort = () => abortFrom(signal);
  const onBudgetAbort = () => abortFrom(budgetSignal);
  signal.addEventListener('abort', onSignalAbort, { once: true });
  budgetSignal.addEventListener('abort', onBudgetAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      signal.removeEventListener('abort', onSignalAbort);
      budgetSignal.removeEventListener('abort', onBudgetAbort);
    },
  };
}

function parseGatewayToolText(raw: AnyRecord): unknown {
  const text = raw?.result?.content?.find?.((entry: AnyRecord) => entry?.type === 'text')?.text;
  if (typeof text !== 'string' || !text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): malformed optional gateway text is explicit absence. */
    return null;
  }
}

export function requireGatewayDetails(raw: AnyRecord, endpoint: string): AnyRecord {
  if (raw?.result?.details && typeof raw.result.details === 'object') return raw.result.details;
  if (raw?.details && typeof raw.details === 'object') return raw.details;
  const parsed = parseGatewayToolText(raw);
  if (parsed && typeof parsed === 'object') return parsed as AnyRecord;
  throw new Error(`Gateway ${endpoint} response missing typed details`);
}

export function requiredNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`spawnSession requires explicit ${fieldName}`);
  }
  return value.trim();
}
