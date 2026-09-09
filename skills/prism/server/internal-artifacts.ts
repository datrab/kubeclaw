import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { authorizeProxiedSpiffePeer } from '@kubeclaw/worker-core';
import type { ContentAddressedArtifactStore } from '../storage/artifacts.ts';

export interface InternalArtifactOptions {
  readonly artifacts: ContentAddressedArtifactStore;
  readonly spiffeEnabled: boolean;
  readonly workerSecret: string;
  readonly trustedWorkerSpiffeId: string;
  readonly trustedControlSpiffeId: string;
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value));
}
function authorized(request: IncomingMessage, options: InternalArtifactOptions): boolean {
  if (options.spiffeEnabled) {
    try {
      authorizeProxiedSpiffePeer(request.headers, request.socket.remoteAddress,
        new Set([options.trustedWorkerSpiffeId, options.trustedControlSpiffeId]));
      return true;
    } catch { return false; }
  }
  const supplied = Buffer.from(String(request.headers.authorization ?? '').replace(/^Bearer /u, ''));
  const expected = Buffer.from(options.workerSecret);
  return expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
/** The actual Control artifact route, shared with native HTTP integration tests. */
export async function handleInternalArtifact(request: IncomingMessage, response: ServerResponse,
  url: URL, options: InternalArtifactOptions): Promise<boolean> {
  const match = /^\/v1\/internal\/artifacts\/(sha256:[a-f0-9]{64})$/u.exec(url.pathname);
  if (!match) return false;
  if (!authorized(request, options)) { json(response, 401, { error: 'unauthorized' }); return true; }
  if (url.search || url.hash) throw new Error('Prism artifact URL must be canonical');
  if (request.method === 'GET') {
    const bytes = await options.artifacts.get(`artifact:${match[1]}`);
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(bytes); return true;
  }
  if (request.method === 'POST') {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 134_217_728) throw new Error('evidence is too large');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== match[1]) throw new Error('evidence digest does not match URL');
    const stored = await options.artifacts.put(bytes); json(response, 201, stored); return true;
  }
  json(response, 405, { error: 'method not allowed' }); return true;
}
