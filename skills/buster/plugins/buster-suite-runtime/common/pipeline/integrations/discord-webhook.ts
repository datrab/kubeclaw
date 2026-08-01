import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { StructuredOperationError } from '../operation-result.ts';
const MAX_ERROR_BODY_PREVIEW = 500;
const DISCORD_WEBHOOK_DELIVERY_FAILED = 'discord webhook delivery failed';

function headerValue(value: string | null): string {
  return value ?? '';
}

function optionHeaders(value: unknown): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {};
}

type DiscordWebhookDeliveryDetails = {
  status?: number;
  statusText?: string;
  bodyPreview?: string;
  cause?: unknown;
};

type DiscordWebhookOptions = {
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  signal?: AbortSignal | null;
  timeoutMs?: number;
};

type ValidatedDiscordWebhookOptions = {
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
  body: BodyInit | null;
  signal?: AbortSignal;
  cleanup(): void;
};

async function readJsonBody(response: Response) {
  const contentType = headerValue(selectDefinedValue(() => (response.headers?.get?.('content-type')), () => (null)));
  if (!/json/i.test(contentType)) return null;
  try {
    return await response.json();
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */
    return null;
  }
}

export class DiscordWebhookDeliveryError extends StructuredOperationError {
  status?: number;
  statusText?: string;
  bodyPreview?: string;

  constructor(message: string, details: DiscordWebhookDeliveryDetails = {}) {
    super('DISCORD_WEBHOOK_DELIVERY_FAILED', message, {
      kind: typeof details.status === 'number' && details.status >= 500 ? 'retryable' : 'terminal',
      diagnostics: {
        status: details.status,
        statusText: details.statusText,
        bodyPreview: details.bodyPreview,
      },
      cause: details.cause,
    });
    this.name = 'DiscordWebhookDeliveryError';
    if (typeof details.status === 'number') this.status = details.status;
    if (details.statusText) this.statusText = details.statusText;
    if (details.bodyPreview) this.bodyPreview = details.bodyPreview;
  }
}

async function readBodyPreview(response: Response) {
  try {
    const text = await response.text();
    return text ? text.slice(0, MAX_ERROR_BODY_PREVIEW) : '';
  } catch (_error) {
    return '';
  }
}

function timeoutSignal(timeoutMs: number) {
  if (selectTruthyValue(() => (!timeoutMs), () => (timeoutMs <= 0))) return { signal: undefined, cleanup: () => {} };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => {} };
  }
  if (typeof AbortController === 'undefined') return { signal: undefined, cleanup: () => {} };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`discord webhook timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

function requestAbortSignal(callerSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeout = timeoutSignal(timeoutMs);
  const signals = [callerSignal, timeout.signal].filter(Boolean) as AbortSignal[];
  if (signals.length === 0) return { signal: undefined, cleanup: timeout.cleanup };
  if (signals.length === 1) return { signal: signals[0], cleanup: timeout.cleanup };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(signals), cleanup: timeout.cleanup };
  }

  const controller = new AbortController();
  const listeningSignals: AbortSignal[] = [];
  const onAbort = (event: Event) => {
    const signal = event.target as AbortSignal;
    controller.abort(signal.reason);
  };
  const cleanup = () => {
    for (const signal of listeningSignals) signal.removeEventListener('abort', onAbort);
    timeout.cleanup();
  };
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      cleanup();
      return { signal: controller.signal, cleanup };
    }
    signal.addEventListener('abort', onAbort, { once: true });
    listeningSignals.push(signal);
  }
  return {
    signal: controller.signal,
    cleanup,
  };
}

function validatedWebhookOptions(options: DiscordWebhookOptions): ValidatedDiscordWebhookOptions {
  if (!Object.prototype.hasOwnProperty.call(options, 'body') || options.body === undefined) {
    throw new DiscordWebhookDeliveryError('discord webhook body is required');
  }
  const fetchImpl = fetchAuthority(options);
  if (typeof fetchImpl !== 'function') {
    throw new DiscordWebhookDeliveryError('fetch is unavailable for discord webhook delivery');
  }
  if (options.timeoutMs === undefined || options.timeoutMs === null) {
    throw new DiscordWebhookDeliveryError('discord webhook timeoutMs is required');
  }
  const timeoutMs = Number(options.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new DiscordWebhookDeliveryError('discord webhook timeoutMs must be a positive number');
  }
  const abort = requestAbortSignal(options.signal, timeoutMs);
  return {
    fetchImpl,
    headers: { ...optionHeaders(options.headers) },
    body: options.body,
    ...(abort.signal ? { signal: abort.signal } : {}),
    cleanup: abort.cleanup,
  };
}

async function sendWebhook(url: string, options: ValidatedDiscordWebhookOptions) {
  const request: RequestInit = { method: 'POST', headers: options.headers, body: options.body };
  if (options.signal) request.signal = options.signal;
  const response = await options.fetchImpl(url, request);
  if (!response?.ok) {
    const status = typeof response?.status === 'number' ? response.status : 0;
    const statusText = response?.statusText ?? '';
    const bodyPreview = response ? await readBodyPreview(response) : '';
    throw new DiscordWebhookDeliveryError(
      `discord webhook HTTP ${status}${statusText ? ` ${statusText}` : ''}`,
      { status, statusText, bodyPreview },
    );
  }
  return {
    ok: true,
    status: response.status,
    statusText: response.statusText ?? '',
    body: await readJsonBody(response),
  };
}

export async function postDiscordWebhook(url: string, options: DiscordWebhookOptions = {}) {
  if (!url || typeof url !== 'string') {
    throw new DiscordWebhookDeliveryError('discord webhook URL is required');
  }
  const validated = validatedWebhookOptions(options);
  try {
    return await sendWebhook(url, validated);
  } catch (error: any) {
    if (error instanceof DiscordWebhookDeliveryError) throw error;
    throw new DiscordWebhookDeliveryError(selectDefinedValue(() => (error?.message), () => (DISCORD_WEBHOOK_DELIVERY_FAILED)), { cause: error });
  } finally {
    validated.cleanup();
  }
}

function fetchAuthority(options: Record<string, any>): typeof fetch {
  if (options.fetchImpl) return options.fetchImpl;
  return globalThis.fetch;
}
