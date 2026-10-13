import type { IncomingMessage, ServerResponse } from 'node:http';
import { open, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { prismProxyResponseHeaders } from './proxy-headers.ts';

export interface StudioOptions {
  readonly root: string;
  readonly control: URL;
  readonly ingressSecret: string;
  readonly controlTimeoutMs: number;
}
class StudioRequestError extends Error {
  readonly status: number;
  constructor(status: number, code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause }); this.status = status;
  }
}
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function errorDetails(error: unknown): { message: string; code?: string; cause?: string } {
  if (!(error instanceof Error)) return { message: String(error) };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return { message: error.message, ...(code ? { code } : {}),
    ...(error.cause instanceof Error ? { cause: error.cause.message } : {}) };
}
export function studioRequestFailed(error: unknown, response: ServerResponse): void {
  const causes = []; const seen = new Set<unknown>(); let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current); causes.push({ ...errorDetails(current), stack: current.stack }); current = current.cause;
  }
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', component: 'prism-studio',
    event: 'PRISM_STUDIO_REQUEST_FAILED', error: errorDetails(error), causes })}\n`);
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(error instanceof Error ? error : new Error(String(error))); return; }
  const status = error instanceof StudioRequestError ? error.status : 500;
  for (const name of response.getHeaderNames()) response.removeHeader(name);
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: errorDetails(error),
    ...(error instanceof Error && error.cause !== undefined ? { cause: errorDetails(error.cause) } : {}) }));
}

async function requestBody(request: IncomingMessage): Promise<Buffer<ArrayBuffer> | undefined> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new StudioRequestError(413, 'PRISM_STUDIO_REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}
function upstreamHeaders(request: IncomingMessage, secret: string): Headers {
  const headers = new Headers();
  for (const name of ['origin', 'content-type', 'cookie', 'x-prism-csrf', 'idempotency-key', 'tailscale-user-login', 'tailscale-user-name', 'tailscale-user-profile-pic']) {
    const value = request.headers[name]; if (typeof value === 'string') headers.set(name, value);
  }
  headers.set('x-prism-ingress-secret', secret);
  return headers;
}
async function forwardBody(upstream: Response, response: ServerResponse, signal: AbortSignal): Promise<void> {
  const reader = upstream.body?.getReader();
  try {
    if (!reader) { response.end(); return; }
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      if (!response.write(part.value)) await once(response, 'drain', { signal });
    }
    response.end();
  } finally {
    if (reader) {
      try { await reader.cancel(); }
      catch { /* INTENTIONAL_NONCRITICAL(upstream_already_failed): Preserve the primary fetch/stream error. */ }
      reader.releaseLock();
    }
  }
}
async function proxy(request: IncomingMessage, response: ServerResponse, url: URL, options: StudioOptions): Promise<void> {
  if (!options.ingressSecret) throw new StudioRequestError(503, 'PRISM_STUDIO_PROXY_NOT_CONFIGURED');
  const body = await requestBody(request);
  const controller = new AbortController();
  const timeoutError = new Error('PRISM_STUDIO_CONTROL_TIMEOUT');
  const timer = setTimeout(() => controller.abort(timeoutError), options.controlTimeoutMs);
  const disconnected = () => { if (!response.writableEnded) controller.abort(new Error('PRISM_STUDIO_CLIENT_DISCONNECTED')); };
  const responseFailed = (error: Error) => controller.abort(error);
  response.once('close', disconnected);
  response.once('error', responseFailed);
  try {
    if (response.destroyed) { disconnected(); controller.signal.throwIfAborted(); }
    const upstream = await fetch(new URL(`${url.pathname}${url.search}`, options.control), {
      method: request.method, headers: upstreamHeaders(request, options.ingressSecret), body, redirect: 'manual', signal: controller.signal,
    });
    response.statusCode = upstream.status;
    const forwarded = prismProxyResponseHeaders(upstream.headers);
    for (const [name, value] of forwarded.ordinary) response.setHeader(name, value);
    if (forwarded.setCookies.length) response.setHeader('set-cookie', forwarded.setCookies);
    await forwardBody(upstream, response, controller.signal);
  } catch (error) {
    throw new StudioRequestError(controller.signal.reason === timeoutError ? 504 : 502,
      controller.signal.reason === timeoutError ? 'PRISM_STUDIO_CONTROL_TIMEOUT' : 'PRISM_STUDIO_UPSTREAM_FAILED', error);
  } finally { clearTimeout(timer); response.off('close', disconnected); response.off('error', responseFailed); }
}

async function staticFile(url: URL, response: ServerResponse, options: StudioOptions): Promise<void> {
  let requested: string;
  try { requested = decodeURIComponent(url.pathname).replace(/^\/+/, ''); }
  catch (error) { throw new StudioRequestError(400, 'PRISM_STUDIO_PATH_ENCODING_INVALID', error); }
  const root = resolve(options.root); let file = resolve(root, requested || 'index.html');
  if (file !== root && !file.startsWith(`${root}${sep}`)) throw new StudioRequestError(403, 'PRISM_STUDIO_PATH_OUTSIDE_ROOT');
  try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    file = resolve(root, 'index.html');
  }
  let handle;
  try { handle = await open(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StudioRequestError(404, 'PRISM_STUDIO_STATIC_NOT_FOUND', error);
    throw error;
  }
  try {
    response.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
    response.setHeader('content-security-policy', "default-src 'self'; frame-src 'self'; connect-src 'self' https:; object-src 'none'; base-uri 'none'");
    await pipeline(handle.createReadStream(), response);
  } finally { await handle.close(); }
}

export async function handleStudioRequest(request: IncomingMessage, response: ServerResponse, options: StudioOptions): Promise<void> {
  let url: URL;
  try { url = new URL(request.url ?? '/', 'http://studio'); }
  catch (error) { throw new StudioRequestError(400, 'PRISM_STUDIO_URL_INVALID', error); }
  if (url.pathname === '/health' || url.pathname === '/ready') {
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"status":"ready"}'); return;
  }
  if (url.pathname.startsWith('/v1/')) await proxy(request, response, url, options);
  else await staticFile(url, response, options);
}
