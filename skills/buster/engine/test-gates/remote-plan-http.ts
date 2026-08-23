import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { validatePipelineTestGateContract, type RemotePlanJobV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { BusterRemotePlanService } from './remote-plan-service.ts';

function authorized(request: http.IncomingMessage, token: string): boolean {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return supplied.byteLength === expected.byteLength && crypto.timingSafeEqual(supplied, expected);
}

async function requestBody(request: http.IncomingMessage, maximumBytes: number): Promise<unknown> {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error('BUSTER_REMOTE_REQUEST_SIZE_EXCEEDED');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumBytes) throw new Error('BUSTER_REMOTE_REQUEST_SIZE_EXCEEDED');
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (error) { throw new Error('BUSTER_REMOTE_REQUEST_INVALID', { cause: error }); }
}

function send(response: http.ServerResponse, status: number, body: unknown, maximumBytes: number): void {
  const bytes = Buffer.from(JSON.stringify(body));
  if (bytes.byteLength > maximumBytes) {
    const fallback = Buffer.from(JSON.stringify({ error: 'BUSTER_REMOTE_RESPONSE_SIZE_EXCEEDED' }));
    response.writeHead(500, { 'content-type': 'application/json', 'content-length': fallback.byteLength });
    response.end(fallback);
    return;
  }
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': bytes.byteLength,
    'cache-control': 'no-store',
  });
  response.end(bytes);
}

function jobId(url: string | undefined): string | null {
  const match = url?.match(/^\/v1\/plan-jobs\/([^/?#]+)$/u);
  if (!match?.[1]) return null;
  try { return decodeURIComponent(match[1]); }
  catch { throw new Error('BUSTER_REMOTE_JOB_ID_INVALID'); }
}

function evidenceRoute(url: string | undefined): { jobId: string; digest: string } | null {
  const match = url?.match(/^\/v1\/plan-jobs\/([^/?#]+)\/evidence\/(sha256%3A|sha256:)([a-f0-9]{64})$/u);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  try { return { jobId: decodeURIComponent(match[1]), digest: `sha256:${match[3]}` }; }
  catch { throw new Error('BUSTER_REMOTE_JOB_ID_INVALID'); }
}

function resultRoute(url: string | undefined): { jobId: string; digest: string } | null {
  const match = url?.match(/^\/v1\/plan-jobs\/([^/?#]+)\/results\/(sha256%3A|sha256:)([a-f0-9]{64})$/u);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  try { return { jobId: decodeURIComponent(match[1]), digest: `sha256:${match[3]}` }; }
  catch { throw new Error('BUSTER_REMOTE_JOB_ID_INVALID'); }
}

export function createBusterRemotePlanHttpServer(options: {
  readonly service: BusterRemotePlanService;
  readonly token: string;
  readonly maximumRequestBytes: number;
  readonly maximumResponseBytes: number;
  readonly maximumResultBytes: number;
  readonly tls?: Readonly<{ key: string | Buffer; cert: string | Buffer }>;
}): http.Server {
  if (options.token.length < 32) throw new Error('BUSTER_REMOTE_TOKEN_INVALID');
  for (const limit of [options.maximumRequestBytes, options.maximumResponseBytes, options.maximumResultBytes]) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('BUSTER_REMOTE_HTTP_LIMIT_INVALID');
  }
  const handler: http.RequestListener = (request, response) => {
    void (async () => {
      if (request.method === 'GET' && request.url === '/healthz') {
        send(response, 200, { schemaVersion: 'buster-plan-health.v1', ready: true }, options.maximumResponseBytes);
        return;
      }
      if (!authorized(request, options.token)) {
        send(response, 401, { error: 'unauthorized' }, options.maximumResponseBytes);
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/plan-jobs') {
        const value = await requestBody(request, options.maximumRequestBytes);
        validatePipelineTestGateContract('remotePlanJob', value);
        const status = await options.service.submit(value as RemotePlanJobV1);
        send(response, status.state === 'accepted' ? 202 : 200, status, options.maximumResponseBytes);
        return;
      }
      const evidence = evidenceRoute(request.url);
      if (evidence && request.method === 'GET') {
        const bytes = await options.service.evidence(evidence.jobId, evidence.digest, options.maximumResponseBytes);
        response.writeHead(200, {
          'content-type': 'application/octet-stream', 'content-length': bytes.byteLength,
          'content-digest': evidence.digest, 'cache-control': 'private, immutable',
        });
        response.end(bytes);
        return;
      }
      const result = resultRoute(request.url);
      if (result && request.method === 'GET') {
        const bytes = await options.service.result(result.jobId, result.digest, options.maximumResultBytes);
        response.writeHead(200, {
          'content-type': 'application/json', 'content-length': bytes.byteLength,
          'content-digest': result.digest, 'cache-control': 'private, immutable',
        });
        response.end(bytes);
        return;
      }
      const id = jobId(request.url);
      if (id && request.method === 'GET') {
        send(response, 200, await options.service.status(id), options.maximumResponseBytes);
        return;
      }
      if (id && request.method === 'DELETE') {
        send(response, 200, await options.service.cancel(id), options.maximumResponseBytes);
        return;
      }
      send(response, 404, { error: 'not found' }, options.maximumResponseBytes);
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('NOT_FOUND') ? 404
        : message.includes('CONFLICT') ? 409
          : message.includes('SIZE_EXCEEDED') ? 413 : 400;
      if (!response.headersSent) send(response, status, { error: message }, options.maximumResponseBytes);
      else response.destroy();
    });
  };
  return options.tls ? https.createServer(options.tls, handler) : http.createServer(handler);
}
