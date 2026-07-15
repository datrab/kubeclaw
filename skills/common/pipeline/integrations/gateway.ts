import { BudgetExhaustedError, sleep, type TimeBudget } from '../timing.ts';
import {
  assertValidGatewayInvokeResult,
  buildGatewayInvokeHttpError,
  normalizeGatewayInvokeResult,
} from '../services/acp-gateway-contract.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
declare const process: {
  env: Record<string, string | undefined>;
};

export const LOCAL_DEVELOPMENT_GATEWAY_BASE_URL = 'http://127.0.0.1:18789';

type GatewayHeaders = Record<string, string>;
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

function trimGatewayUrl(value: unknown) {
  return String(selectDefinedValue(() => (value), () => (''))).trim().replace(/\/$/, '');
}

function stripInvokeSuffix(value: unknown) {
  return trimGatewayUrl(value).replace(/\/tools\/invoke$/, '');
}

function configuredGatewayUrl(override?: string | null) {
  const raw = override !== undefined && override !== null
    ? override
    : process.env.OPENCLAW_GATEWAY_URL;
  const base = stripInvokeSuffix(raw);
  if (!base) {
    throw new Error('Gateway URL is required; provide gatewayUrl or OPENCLAW_GATEWAY_URL');
  }
  return base;
}

export function resolveLocalDevelopmentGatewayBaseUrl() {
  return LOCAL_DEVELOPMENT_GATEWAY_BASE_URL;
}

export function resolveGatewayBaseUrl(override?: string | null) {
  const raw = configuredGatewayUrl(override);
  const base = stripInvokeSuffix(raw);
  return base;
}

export function resolveGatewayInvokeUrl(override?: string | null) {
  const raw = trimGatewayUrl(configuredGatewayUrl(override));
  if (raw.endsWith('/tools/invoke')) return raw;
  return `${stripInvokeSuffix(raw)}/tools/invoke`;
}

export function resolveGatewayHealthUrl(override?: string | null) {
  const raw = trimGatewayUrl(configuredGatewayUrl(override));
  return `${stripInvokeSuffix(raw)}/health`;
}

export function resolveGatewayToken(override?: string | null) {
  if (override !== undefined && override !== null) return String(override);
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (token === undefined) {
    throw new Error('Gateway token policy is required; provide gatewayToken or OPENCLAW_GATEWAY_TOKEN');
  }
  return token;
}

function gatewayHeaders(gatewayToken: string | null | undefined, extraHeaders: GatewayHeaders = {}) {
  const token = resolveGatewayToken(gatewayToken);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function optionalGatewayHeaders(gatewayToken: string | null | undefined, extraHeaders: GatewayHeaders = {}) {
  const token = gatewayToken !== undefined && gatewayToken !== null
    ? String(gatewayToken)
    : process.env.OPENCLAW_GATEWAY_TOKEN;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function isNetworkError(err: unknown) {
  const error = (selectDefinedValue(() => (err), () => ({}))) as NetworkLikeError;
  return !error.httpStatus && (
    selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (error.name === 'AbortError'), () => (error.code === 'ECONNREFUSED'))), () => (error.code === 'ECONNRESET'))), () => (error.code === 'ETIMEDOUT'))), () => (error.cause?.code === 'ECONNREFUSED'))), () => (error.cause?.code === 'ECONNRESET'))), () => (/fetch failed|network|socket/i.test(selectDefinedValue(() => (error.message), () => ('')))))
  );
}

function abortError(signal: AbortSignal | null | undefined) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(reason ? String(reason) : 'Operation aborted') as Error & { code?: string };
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  return err;
}

function throwIfCallerAborted(signal: AbortSignal | null | undefined, budget: TimeBudget | null | undefined) {
  if (signal?.aborted) throw abortError(signal);
  if (budget?.signal?.aborted) throw abortError(budget.signal);
  budget?.throwIfExhausted?.('gateway_invoke_budget_exhausted');
}

function bridgeAbort(controller: AbortController, signal: AbortSignal | null | undefined) {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(abortError(signal));
    return () => {};
  }
  const onAbort = () => controller.abort(abortError(signal));
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
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
  if (selectTruthyValue(() => (!Number.isFinite(timeoutMs)), () => (Number(timeoutMs) < 0))) {
    throw new Error('Gateway invoke timeoutMs must be explicit and non-negative');
  }
  if (selectTruthyValue(() => (!Number.isInteger(maxRetries)), () => (Number(maxRetries) < 1))) {
    throw new Error('Gateway invoke maxRetries must be explicit and at least 1');
  }
  if (selectTruthyValue(() => (!Number.isFinite(retryDelayMs)), () => (Number(retryDelayMs) < 0))) {
    throw new Error('Gateway invoke retryDelayMs must be explicit and non-negative');
  }
  const url = resolveGatewayInvokeUrl(gatewayUrl);
  const headers = gatewayHeaders(gatewayToken, extraHeaders);

  for (let attempt = 1; attempt <= Number(maxRetries); attempt += 1) {
    throwIfCallerAborted(signal, budget);
    const controller = new AbortController();
    const timeoutBudgetMs = budget?.remainingMs ? budget.remainingMs() : Infinity;
    const attemptTimeoutMs = Math.min(Number(timeoutMs), timeoutBudgetMs);
    const timer = setTimeout(() => {
      if (budget?.remainingMs && budget.remainingMs() <= 0) {
        controller.abort(new BudgetExhaustedError('Gateway invoke budget exhausted', {
          deadlineMs: budget.deadlineMs,
          remainingMs: 0,
          reason: 'gateway_invoke_budget_exhausted',
        }));
        return;
      }
      controller.abort();
    }, attemptTimeoutMs);
    const cleanupAbort = [bridgeAbort(controller, signal), bridgeAbort(controller, budget?.signal)];
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tool, args, ...body }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw buildGatewayInvokeHttpError(tool, response.status, response.statusText, text);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (_error) {
        return assertValidGatewayInvokeResult(normalizeGatewayInvokeResult(text));
      }
      return assertValidGatewayInvokeResult(normalizeGatewayInvokeResult(parsed));
    } catch (err) {
      const abortReason = controller.signal.reason;
      if (abortReason instanceof BudgetExhaustedError) throw abortReason;
      throwIfCallerAborted(signal, budget);
      if (selectTruthyValue(() => (!isNetworkError(err)), () => (attempt >= Number(maxRetries)))) throw err;
      await sleep(retryDelayMs, { budget, signal });
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
  } = selectDefinedValue(() => (opts), () => ({}));

  return invokeGatewayTool(tool, args, {
    gatewayUrl,
    gatewayToken,
    timeoutMs: gatewayTimeoutAuthority(optTimeoutMs, timeoutMs),
    maxRetries,
    retryDelayMs,
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
