import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createBusterRemotePlanHttpServer } from '../../../skills/buster/engine/test-gates/remote-plan-http.ts';
import type { BusterRemotePlanService } from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';

const token = 'response-boundary-token-000000000000';
const dependencyUnavailable = { schemaVersion: 'buster-plan-readiness.v1', ready: false, code: 'BUSTER_DEPENDENCY_UNAVAILABLE' };
const options = (service: unknown, maximumResponseBytes = 97) => ({ service: service as BusterRemotePlanService,
  token, maximumRequestBytes: 1024, maximumResponseBytes, maximumResultBytes: 1024 });

test('native HTTP rejects undersized full-control quotas before server/service effects', () => {
  const untouched = new Proxy({}, { get() { assert.fail('invalid quota must not touch the service'); } });
  assert.equal(Buffer.byteLength(JSON.stringify(dependencyUnavailable)), 97);
  for (const cap of [1, 48, 96, 0, -1, NaN, Infinity, 97.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createBusterRemotePlanHttpServer(options(untouched, cap)), /BUSTER_REMOTE_HTTP_LIMIT_INVALID/);
  }
  const server = createBusterRemotePlanHttpServer(options(untouched));
  assert.equal(server.listening, false);
  server.close();
});

test('real HTTP keeps whole UTF-8 success/error frames bounded and result quota distinct', async t => {
  let body: unknown = { value: 'é'.repeat(42) }; // 96 bytes, despite fewer UTF-16 code units.
  let error: string | undefined;
  const resultBytes = Buffer.from(JSON.stringify({ value: 'é'.repeat(100) }));
  const digest = 'sha256:' + 'a'.repeat(64);
  const service = {
    bootstrapReady: () => false,
    readiness: async () => dependencyUnavailable,
    status: async () => { if (error) throw new Error(error); return body; },
    cancel: async () => body,
    submit: async () => ({ state: 'accepted', ...(body as object) }),
    result: async (id: string, actualDigest: string, cap: number) => {
      assert.equal(id, 'job'); assert.equal(actualDigest, digest); assert.equal(cap, 1024);
      return resultBytes;
    },
  };
  const supplied = options(service);
  const server = createBusterRemotePlanHttpServer(supplied);
  // The admitted original wire limits survive caller mutation before listen.
  supplied.maximumResponseBytes = 10000;
  supplied.maximumResultBytes = 1;
  supplied.maximumRequestBytes = 1;
  supplied.token = "replacement-response-token-0000000000";
  supplied.service = new Proxy({} as BusterRemotePlanService, {
    get() { assert.fail("HTTP must retain the original service"); },
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close(err => err ? reject(err) : resolve());
  }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = (route: string, method = 'GET', authorized = true) => new Promise<{ status: number; bytes: Buffer }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, path: route, method, agent: false,
      headers: authorized ? { authorization: `Bearer ${token}` } : {} }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('error', reject);
      res.on('end', () => {
        const bytes = Buffer.concat(chunks); assert.equal(Number(res.headers['content-length']), bytes.length);
        resolve({ status: res.statusCode!, bytes });
      });
    }); req.on('error', reject); req.end();
  });
  for (const [route, status] of [['/healthz', 200], ['/bootstrapz', 503], ['/readyz', 503], ['/missing', 404]] as const) {
    const response = await request(route); assert.equal(response.status, status); assert.ok(response.bytes.length <= 97);
  }
  const denied = await request('/v1/plan-jobs/job', 'GET', false);
  assert.equal(denied.status, 401); assert.ok(denied.bytes.length <= 97);
  const within = await request('/v1/plan-jobs/job');
  assert.equal(within.status, 200); assert.deepEqual(JSON.parse(within.bytes.toString()), body);
  body = { value: 'a'.repeat(85) };
  const exact = await request('/v1/plan-jobs/job');
  assert.equal(exact.status, 200); assert.equal(exact.bytes.length, 97);
  assert.deepEqual(JSON.parse(exact.bytes.toString()), body);
  body = { value: 'é'.repeat(43) }; // 98 UTF-8 bytes, not 55 character bytes.
  for (const method of ['GET', 'DELETE', 'POST']) {
    const response = await request(method === 'POST' ? '/v1/plan-jobs' : '/v1/plan-jobs/job', method);
    assert.equal(response.status, 500); assert.ok(response.bytes.length <= 97);
    assert.deepEqual(JSON.parse(response.bytes.toString()), { error: 'BUSTER_REMOTE_RESPONSE_SIZE_EXCEEDED' });
  }
  error = 'é'.repeat(100);
  const failed = await request('/v1/plan-jobs/job');
  assert.equal(failed.status, 500); assert.ok(failed.bytes.length <= 97);
  error = undefined; body = { value: 'restored' };
  const restored = await request('/v1/plan-jobs/job');
  assert.equal(restored.status, 200); assert.deepEqual(JSON.parse(restored.bytes.toString()), body);
  const result = await request(`/v1/plan-jobs/job/results/${digest}`);
  assert.equal(result.status, 200); assert.ok(result.bytes.length > 97); assert.deepEqual(result.bytes, resultBytes);
});
