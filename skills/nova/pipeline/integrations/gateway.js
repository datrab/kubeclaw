import { log } from '../core/logger.js';

export const GATEWAY_URL = 'http://127.0.0.1:18789/tools/invoke';
export const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

export async function gatewayInvoke(tool, args, timeoutMs = 30000, opts = {}, extraHeaders = {}) {
  const maxRetries = 3;
  const retryDelayMs = 5000;
  log('DEBUG', `Gateway invoke: ${tool}`, { timeout_ms: timeoutMs });
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(GATEWAY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(GATEWAY_TOKEN ? { Authorization: `Bearer ${GATEWAY_TOKEN}` } : {}), ...extraHeaders }, body: JSON.stringify({ tool, args, ...opts }), signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const err = new Error(`Gateway ${tool} failed: ${response.status} ${response.statusText}`);
        err.httpStatus = response.status;
        err.httpBody = text;
        throw err;
      }
      log('DEBUG', `Gateway ${tool} OK (attempt ${attempt})`);
      try { return JSON.parse(text); } catch { return { raw: text }; }
    } catch (e) {
      const isNetworkError = !e.httpStatus && (e.name === 'AbortError' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNRESET' || /fetch failed|network|socket/i.test(e.message));
      if (!isNetworkError || attempt >= maxRetries) throw e;
      log('WARN', `Gateway ${tool} network error (attempt ${attempt}/${maxRetries}): ${e.message} — retrying in ${retryDelayMs / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    } finally { clearTimeout(timer); }
  }
}
