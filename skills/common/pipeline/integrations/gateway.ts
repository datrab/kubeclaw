import { abortSignalError, BudgetExhaustedError, sleep, type TimeBudget } from '../timing.ts';
import {
  assertValidGatewayInvokeResult,
  buildGatewayInvokeHttpError,
  normalizeGatewayInvokeResult,
} from '../services/acp-gateway-contract.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import {
  gatewayHeaders,
  optionalGatewayHeaders,
  resolveGatewayHealthUrl,
  resolveGatewayInvokeUrl,
  type GatewayHeaders,
} from './gateway-config.ts';
export {
  LOCAL_DEVELOPMENT_GATEWAY_BASE_URL,
  resolveGatewayBaseUrl,
  resolveGatewayHealthUrl,
  resolveGatewayInvokeUrl,
  resolveGatewayToken,
  resolveLocalDevelopmentGatewayBaseUrl,
} from './gateway-config.ts';

type GatewayBody = Record<string, unknown>;

type GatewayInvokeOptions = {
  gatewayUrl?: string | null;
  gatewayToken?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  body?: GatewayBody;
  extraHeaders?: GatewayHeaders;
  budget?: TimeBudget | null;
  signal?: AbortSignal | null;
  [key: string]: unknown;
};

type GatewayHealthOptions = {
  gatewayUrl?: string | null;
  gatewayToken?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal | null;
};

type NetworkLikeError = {
  httpStatus?: unknown;
  name?: string;
  code?: string;
  cause?: { code?: string } | null;
  message?: string;
};

function isNetworkError(err: unknown) {
  const error = err && typeof err === 'object' ? err as NetworkLikeError : {};
  if (error.httpStatus) return false;
  const codes = [error.code, error.cause?.code];
  return error.name === 'AbortError'
    || codes.some((code) => code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT')
    || /fetch failed|network|socket/i.test(error.message ?? '');
}

function throwIfCallerAborted(signal: AbortSignal | null | undefined, budget: TimeBudget | null | undefined) {
  if (signal?.aborted) throw abortSignalError(signal);
  if (budget?.signal?.aborted) throw abortSignalError(budget.signal);
  budget?.throwIfExhausted?.('gateway_invoke_budget_exhausted');
}

function bridgeAbort(controller: AbortController, signal: AbortSignal | null | undefined) {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(abortSignalError(signal));
    return () => {};
  }
  const onAbort = () => controller.abort(abortSignalError(signal));
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function validateGatewayRetryPolicy(
  timeoutMs: number | undefined,
  maxRetries: number | undefined,
  retryDelayMs: number | undefined,
): void {
  if (!Number.isFinite(timeoutMs) || Number(timeoutMs) < 0) {
    throw new Error('Gateway invoke timeoutMs must be explicit and non-negative');
  }
  if (!Number.isInteger(maxRetries) || Number(maxRetries) < 1) {
    throw new Error('Gateway invoke maxRetries must be explicit and at least 1');
  }
  if (!Number.isFinite(retryDelayMs) || Number(retryDelayMs) < 0) {
    throw new Error('Gateway invoke retryDelayMs must be explicit and non-negative');
  }
}

function createAttemptTimer(
  controller: AbortController,
  timeoutMs: number,
  budget: TimeBudget | null,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (budget?.remainingMs && budget.remainingMs() <= 0) {
      controller.abort(new BudgetExhaustedError('Gateway invoke budget exhausted', {
        deadlineMs: budget.deadlineMs,
        remainingMs: 0,
        reason: 'gateway_invoke_budget_exhausted',
      }));
      return;
    }
    controller.abort();
  }, timeoutMs);
}

async function parseGatewayResponse(tool: string, response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw buildGatewayInvokeHttpError(tool, response.status, response.statusText, text);
  }
  try {
    return assertValidGatewayInvokeResult(normalizeGatewayInvokeResult(JSON.parse(text)));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return assertValidGatewayInvokeResult(normalizeGatewayInvokeResult(text));
    }
    throw error;
  }
}

async function invokeGatewayTool(tool: string, args: unknown, {
  gatewayUrl,
  gatewayToken,
  timeoutMs,
  maxRetries,
  retryDelayMs,
  body = {},
  extraHeaders = {},
  budget = null,
  signal = null,
}: GatewayInvokeOptions = {}) {
  validateGatewayRetryPolicy(timeoutMs, maxRetries, retryDelayMs);
  const retryCount = Number(maxRetries);
  const retryDelay = Number(retryDelayMs);
  const url = resolveGatewayInvokeUrl(gatewayUrl);
  const headers = gatewayHeaders(gatewayToken, extraHeaders);

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    throwIfCallerAborted(signal, budget);
    const controller = new AbortController();
    const timeoutBudgetMs = budget?.remainingMs ? budget.remainingMs() : Infinity;
    const attemptTimeoutMs = Math.min(Number(timeoutMs), timeoutBudgetMs);
    const timer = createAttemptTimer(controller, attemptTimeoutMs, budget);
    const cleanupAbort = [bridgeAbort(controller, signal), bridgeAbort(controller, budget?.signal)];
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tool, args, ...body }),
        signal: controller.signal,
      });
      return parseGatewayResponse(tool, response);
    } catch (err) {
      const abortReason = controller.signal.reason;
      if (abortReason instanceof BudgetExhaustedError) throw abortReason;
      throwIfCallerAborted(signal, budget);
      if (selectTruthyValue(() => (!isNetworkError(err)), () => (attempt >= retryCount))) throw err;
      await sleep(retryDelay, { budget, signal });
    } finally {
      clearTimeout(timer);
      for (const cleanup of cleanupAbort) cleanup();
    }
  }
  throw new Error('gateway invoke exhausted without result');
}

export async function gatewayInvoke(
  tool: string,
  args: unknown,
  timeoutMs: number,
  opts: GatewayInvokeOptions = {},
  extraHeaders: GatewayHeaders = {},
) {
  const {
    gatewayUrl,
    gatewayToken,
    body = {},
    extraHeaders: optHeaders = {},
    timeoutMs: optTimeoutMs,
    maxRetries,
    retryDelayMs,
    budget = null,
    signal = null,
    ...bodyFields
  } = opts;

  return invokeGatewayTool(tool, args, {
    ...(gatewayUrl !== undefined ? { gatewayUrl } : {}),
    ...(gatewayToken !== undefined ? { gatewayToken } : {}),
    timeoutMs: gatewayTimeoutAuthority(optTimeoutMs, timeoutMs),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
    ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
    budget,
    signal,
    body: {
      ...body,
      ...bodyFields,
    },
    extraHeaders: {
      ...optHeaders,
      ...extraHeaders,
    },
  });
}

function gatewayTimeoutAuthority(optTimeoutMs: number | null | undefined, timeoutMs: number): number {
  if (optTimeoutMs !== undefined && optTimeoutMs !== null) return optTimeoutMs;
  return timeoutMs;
}

export async function getGatewaySessionStatus(sessionKey: string, timeoutMs: number, opts: GatewayInvokeOptions = {}) {
  return gatewayInvoke('session_status', { sessionKey }, timeoutMs, {
    ...opts,
  });
}

export async function spawnGatewaySession(args: unknown, timeoutMs: number, opts: GatewayInvokeOptions = {}) {
  return gatewayInvoke('sessions_spawn', args, timeoutMs, {
    ...opts,
  });
}

export async function sendGatewaySessionMessage(sessionKey: string, message: string, timeoutMs: number, opts: GatewayInvokeOptions = {}) {
  const {
    sessionSendArgs = {},
    timeoutSeconds,
    ...invokeOpts
  } = opts;
  const extraArgs = sessionSendArgs && typeof sessionSendArgs === 'object' && !Array.isArray(sessionSendArgs)
    ? sessionSendArgs
    : {};
  return gatewayInvoke('sessions_send', {
    sessionKey,
    message,
    ...extraArgs,
    ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
  }, timeoutMs, {
    ...invokeOpts,
  });
}

export async function sendGatewayChannelMessage(channelId: string, message: string, timeoutMs: number, opts: GatewayInvokeOptions = {}) {
  return gatewayInvoke('message', { action: 'send', channelId, message }, timeoutMs, {
    ...opts,
  });
}

export async function killGatewaySubagent(target: string, timeoutMs: number, opts: GatewayInvokeOptions = {}) {
  return gatewayInvoke('subagents', { action: 'kill', target }, timeoutMs, {
    ...opts,
  });
}

export async function listGatewaySubagents(timeoutMs: number, opts: GatewayInvokeOptions = {}) {
  return gatewayInvoke('subagents', { action: 'list' }, timeoutMs, {
    ...opts,
  });
}

export async function checkGatewayHealth({ gatewayUrl, gatewayToken, timeoutMs, signal = null }: GatewayHealthOptions = {}) {
  if (selectTruthyValue(() => (!Number.isFinite(timeoutMs)), () => (Number(timeoutMs) < 0))) {
    throw new Error('Gateway health timeoutMs must be explicit and non-negative');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));
  const cleanupAbort = bridgeAbort(controller, signal);
  const url = resolveGatewayHealthUrl(gatewayUrl);
  const headers = optionalGatewayHeaders(gatewayToken, {});
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeout);
    cleanupAbort();
  }
}
