const MAX_ERROR_BODY_PREVIEW = 500;

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

export class DiscordWebhookDeliveryError extends Error {
  code: string;
  status?: number;
  statusText?: string;
  bodyPreview?: string;
  cause?: unknown;

  constructor(message: string, details: DiscordWebhookDeliveryDetails = {}) {
    super(message);
    this.name = 'DiscordWebhookDeliveryError';
    this.code = 'DISCORD_WEBHOOK_DELIVERY_FAILED';
    if (typeof details.status === 'number') this.status = details.status;
    if (details.statusText) this.statusText = details.statusText;
    if (details.bodyPreview) this.bodyPreview = details.bodyPreview;
    if (details.cause) this.cause = details.cause;
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
  if (!timeoutMs || timeoutMs <= 0) return { signal: undefined, cleanup: () => {} };
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

export async function postDiscordWebhook(url: string, options: DiscordWebhookOptions = {}) {
  if (!url || typeof url !== 'string') {
    throw new DiscordWebhookDeliveryError('discord webhook URL is required');
  }
  if (!Object.prototype.hasOwnProperty.call(options, 'body') || options.body === undefined) {
    throw new DiscordWebhookDeliveryError('discord webhook body is required');
  }
  const body = options.body;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new DiscordWebhookDeliveryError('fetch is unavailable for discord webhook delivery');
  }

  const headers = { ...(options.headers || {}) };

  try {
    if (options.timeoutMs === undefined || options.timeoutMs === null) {
      throw new DiscordWebhookDeliveryError('discord webhook timeoutMs is required');
    }
    const timeoutMs = Number(options.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new DiscordWebhookDeliveryError('discord webhook timeoutMs must be a positive number');
    }
    const { signal, cleanup } = requestAbortSignal(options.signal, timeoutMs);
    try {
      const request: RequestInit = {
        method: 'POST',
        headers,
        body,
      };
      if (signal) request.signal = signal;
      const response = await fetchImpl(url, request);

      if (!response?.ok) {
        const status = typeof response?.status === 'number' ? response.status : 0;
        const statusText = response?.statusText || '';
        const bodyPreview = response ? await readBodyPreview(response) : '';
        throw new DiscordWebhookDeliveryError(
          `discord webhook HTTP ${status}${statusText ? ` ${statusText}` : ''}`,
          { status, statusText, bodyPreview },
        );
      }

      return { ok: true, status: response.status, statusText: response.statusText || '' };
    } finally {
      cleanup();
    }
  } catch (error: any) {
    if (error instanceof DiscordWebhookDeliveryError) throw error;
    throw new DiscordWebhookDeliveryError(error?.message || 'discord webhook delivery failed', { cause: error });
  }
}
