import { setTimeout as delay } from 'node:timers/promises';

const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);

// GitHub release redirects can retain a failing cached response even with no-store.
// Retry the same public asset through a fresh URL; never rewrite signed URLs.
export function upstreamAttemptUrl(url, attempt) {
  const retry = new URL(url);
  if (attempt === 1 || retry.protocol !== 'https:' || retry.hostname !== 'github.com'
      || retry.username || retry.password || retry.search
      || !/^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/.+/.test(retry.pathname)) return url;
  retry.searchParams.set('download', '1');
  retry.searchParams.set('kubeclaw_retry', `${Date.now()}-${attempt}`);
  return retry.href;
}

// One deadline covers all attempts and waits. Callers still verify release bytes.
export async function fetchUpstream(url, {
  headers = {}, attempts = 5, retryDelayMs = 2000, timeoutMs = 120000,
} = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetch(upstreamAttemptUrl(url, attempt), { headers, signal, cache: 'no-store' });
    } catch (error) {
      if (signal.aborted || attempt === attempts || !(error instanceof TypeError)) throw error;
      await delay(retryDelayMs * 2 ** (attempt - 1), undefined, { signal });
      continue;
    }
    if (response.ok) return response;
    await response.body?.cancel();
    if (!transientStatuses.has(response.status) || attempt === attempts) {
      throw new Error(`${response.status}: ${url}`);
    }
    await delay(retryDelayMs * 2 ** (attempt - 1), undefined, { signal });
  }
  throw new Error(`Upstream request exhausted its attempts: ${url}`);
}
