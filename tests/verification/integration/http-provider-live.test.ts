import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider, testContract } from '../../../skills/buster/plugins/http/src/provider.js';

let contacts = 0;
let lastAccept: string | undefined;
let onContact: (() => void) | undefined;
const server = http.createServer((request, response) => {
  contacts++;
  lastAccept = request.headers.accept;
  onContact?.();
  if (request.url === '/ok') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('healthy marker');
  } else if (request.url === '/missing') {
    response.setHeader('content-type', 'text/plain');
    response.writeHead(404).end('not found');
  } else if (request.url === '/redirect') {
    response.writeHead(302, { location: '/ok' }).end();
  } else if (request.url === '/large') {
    response.end('x'.repeat(4096));
  } else if (request.url === '/stream') {
    response.write('x'.repeat(128));
    setTimeout(() => response.end('y'.repeat(128)), 50);
  } else if (request.url === '/body-wait') {
    response.write('first');
    setTimeout(() => response.end('last'), 250);
  } else if (request.url === '/disconnect') {
    request.socket.destroy();
  } else if (request.url === '/slow') {
    setTimeout(() => response.end('late'), 250);
  } else response.writeHead(503).end('unavailable');
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve());
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('HTTP_TEST_SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
  allowedPorts: [address.port], maximumResponseBytes: 1_048_576, maximumExecutionMs: 1000 });

function invocation(values: Record<string, unknown>, attempt: string, inputs: unknown[] = []) {
  return { schemaVersion: 'provider-invocation.v1', planId: 'plan:http', runId: 'run:http', moduleId: 'app', gateId: null,
    suiteInstanceId: null, nodeId: `http/${attempt}`, executionId: `plan:http:http/${attempt}`,
    testIdentity: `test:http:${attempt}`, nodeKind: 'test', attemptId: `attempt:${attempt}`, attemptNumber: 1,
    provider: {}, configuration: { values }, inputs, evidence: {}, grantedCapabilities: ['network.http'], timeoutMs: 1000,
    limits: { cpuMillis: 1000, memoryBytes: 64 * 1024 * 1024, logBytes: 1024 * 1024,
      artifactBytes: 1024 * 1024, artifactFiles: 1, processes: 1 },
    workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } } as any;
}

function context(signal = new AbortController().signal) {
  return { signal, workspaceRoot: process.cwd(), log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) };
}

try {
  assert.equal(testContract.configuration(invocation({ url: origin }, 'default-timeout')).requestTimeoutMs, 10_000);
  const acceptResult = await provider().execute(invocation({ url: origin, path: '/ok', accept: 'text/html' }, 'accept'), context());
  assert.equal(acceptResult.outcome, 'passed');
  assert.equal(lastAccept, 'text/html');
  const beforeInvalid = contacts;
  for (const [values, code] of [
    [{ accept: '' }, 'HTTP_CONFIG_ACCEPT_INVALID'],
    [{ accept: 'x'.repeat(513) }, 'HTTP_CONFIG_ACCEPT_INVALID'],
    [{ accept: 'text/html\r\nInjected: yes' }, 'HTTP_CONFIG_ACCEPT_INVALID'],
    [{ expectedText: '' }, 'HTTP_CONFIG_EXPECTED_TEXT_INVALID'],
    [{ expectedText: 42 }, 'HTTP_CONFIG_EXPECTED_TEXT_INVALID'],
    [{ expectedStatuses: [] }, 'HTTP_CONFIG_STATUSES_INVALID'],
    [{ path: 'relative' }, 'HTTP_CONFIG_PATH_INVALID'],
    [{ path: '/' + 'x'.repeat(2048) }, 'HTTP_CONFIG_PATH_INVALID'],
    [{ path: '//example.invalid/' }, 'HTTP_CONFIG_PATH_INVALID'],
  ] as const) {
    await assert.rejects(() => provider().execute(invocation({ url: origin, ...values }, 'invalid'), context()),
      { message: code });
  }
  assert.equal(contacts, beforeInvalid, 'invalid configuration must fail before TCP contact');
  const disconnected = await provider().execute(invocation({ url: origin, path: '/disconnect' }, 'connection'), context());
  assert.equal(disconnected.outcome, 'failed');
  assert.equal(disconnected.findings[0].rule, 'http.connection');
  assert.equal(disconnected.findings[0].severity, 'high');
  await assert.rejects(() => provider().execute(invocation({ url: origin, path: '/stream', maximumResponseBytes: 64 }, 'stream'), context()),
    /HTTP_RESPONSE_SIZE_EXCEEDED/u);
  // Cancel before headers only after the real server accepted the request.
  {
    const controller = new AbortController();
    onContact = () => { onContact = undefined; controller.abort(); };
    await assert.rejects(() => provider().execute(invocation({ url: origin, path: '/slow' }, 'in-flight-cancel'), context(controller.signal)),
      /HTTP_REQUEST_CANCELLED/u);
  }
  // Observe the original reader consuming real socket bytes, then cancel its
  // second, still-pending read. Instrument scheduling only; no synthetic fetch,
  // response, chunk, rejection or reader result authorizes this assertion.
  {
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;
    let consumedFirstChunk = false, pendingBodyRead = false, bodyReadRejected = false;
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      assert(response.body);
      const originalGetReader = response.body.getReader.bind(response.body);
      response.body.getReader = (() => {
        const reader = originalGetReader();
        const originalRead = reader.read.bind(reader);
        reader.read = async () => {
          const pending = originalRead();
          if (consumedFirstChunk) {
            pendingBodyRead = true;
            queueMicrotask(() => controller.abort());
          }
          const next = await pending.catch(error => {
            if (consumedFirstChunk) {
              assert(controller.signal.aborted);
              assert.equal((error as Error).name, 'AbortError');
              bodyReadRejected = true;
            }
            throw error;
          });
          if (!consumedFirstChunk) {
            assert.equal(next.done, false);
            assert.equal(Buffer.from(next.value!).toString(), 'first');
            consumedFirstChunk = true;
          }
          return next;
        };
        return reader;
      }) as typeof response.body.getReader;
      return response;
    };
    try {
      await assert.rejects(() => provider().execute(invocation({ url: origin, path: '/body-wait' }, 'body-cancel'), context(controller.signal)),
        /HTTP_REQUEST_CANCELLED/u);
      assert(consumedFirstChunk && pendingBodyRead && bodyReadRejected,
        'cancellation must abort the real pending read after first-chunk consumption');
    } finally { globalThis.fetch = originalFetch; }
  }

  const passed = await provider().execute(invocation({ url: origin, path: '/ok', expectedText: 'healthy',
    expectedContentType: 'text/html' }, 'passed'), context());
  assert.equal(passed.outcome, 'passed');
  assert.equal(passed.providerDetails.values.status, 200);
  assert.match(passed.providerDetails.values.bodyDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(passed).includes('healthy marker'), false, 'response content must not enter result records');

  const assertion = await provider().execute(invocation({ url: origin, path: '/ok', expectedText: 'absent' }, 'assertion'), context());
  assert.equal(assertion.outcome, 'failed');
  assert.equal(assertion.findings[0].rule, 'http.response-text');

  const wrongContentType = await provider().execute(invocation({ url: origin, path: '/ok',
    expectedContentType: 'application/json' }, 'content-type'), context());
  assert.equal(wrongContentType.outcome, 'failed');
  assert.equal(wrongContentType.findings[0].rule, 'http.content-type');

  const expected404 = await provider().execute(invocation({ url: origin, path: '/missing', expectedStatuses: [404],
    expectedText: 'not found' }, 'status'), context());
  assert.equal(expected404.outcome, 'passed');
  for (const values of [{ path: '/missing' }, { path: '/ok', expectedStatuses: [404] }]) {
    const rejectedStatus = await provider().execute(invocation({ url: origin, ...values }, 'wrong-status'), context());
    assert.equal(rejectedStatus.outcome, 'failed');
    assert.equal(rejectedStatus.findings[0].rule, 'http.status');
  }

  const deployment = { name: 'deployment', kind: 'value', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1',
    value: { schemaVersion: 'kubernetes-deployment-fixture.v1', expiresAt: new Date(Date.now() + 60_000).toISOString(), endpoints: [{ name: 'web', url: origin }] } };
  const linked = await provider().execute(invocation({ endpointName: 'web', path: '/ok' }, 'linked', [deployment]), context());
  assert.equal(linked.outcome, 'passed');

  const publicEndpoint = { name: 'endpoint', kind: 'value', schemaId: 'kubeclaw.public-endpoint-fixture@1',
    value: { schemaVersion: 'public-endpoint-fixture.v1', expiresAt: new Date(Date.now() + 60_000).toISOString(), provider: 'tailscale-ingress',
      url: `${origin}/ok`, hostname: 'preview.example.ts.net' } };
  const pluginRoot = fileURLToPath(new URL('../../../skills/buster/plugins/', import.meta.url));
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'http-endpoint-remediation',
  } }));
  const limits = { cpuMillis: 1000, memoryBytes: 64 * 1024 * 1024, logBytes: 1024 * 1024,
    artifactBytes: 1024 * 1024, artifactFiles: 1, processes: 1 };
  function resolved(values: Record<string, any>) {
    return resolveTestPlan({ planId: 'plan:http-resolved', runId: 'run:http-resolved', project: 'http',
      scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-09T00:00:00.000Z',
      declaration: { tests: { health: { uses: 'kubeclaw.http@1', mode: 'blocking', config: values } } },
      suiteTemplates: [], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
      policy: { defaultTimeoutMs: 1000, maximumTimeoutMs: 1000, defaultLimits: limits, maximumLimits: limits,
        maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1,
        maximumConcurrencyLimits: {} } }).nodes[0].configuration.values;
  }
  const resolvedConfig = resolved({});
  assert.equal(Object.hasOwn(resolvedConfig, 'path'), false);
  const publicLinked = await provider().execute(invocation(resolvedConfig, 'public-linked', [publicEndpoint]), context());
  assert.equal(publicLinked.outcome, 'passed');
  assert.equal(publicLinked.providerDetails.values.url, `${origin}/ok`);
  const override = await provider().execute(invocation(resolved({ path: '/missing', expectedStatuses: [404] }),
    'resolved-override', [publicEndpoint]), context());
  assert.equal(override.outcome, 'passed');
  assert.equal(override.providerDetails.values.url, `${origin}/missing`);
  const rootDefault = await provider().execute(invocation(resolved({ url: origin, expectedStatuses: [503] }),
    'resolved-root'), context());
  assert.equal(rootDefault.outcome, 'passed');
  assert.equal(rootDefault.providerDetails.values.url, `${origin}/`);


  const timeout = await provider().execute(invocation({ url: origin, path: '/slow', requestTimeoutMs: 25 }, 'timeout'), context());
  assert.equal(timeout.outcome, 'failed');
  assert.equal(timeout.findings[0].rule, 'http.timeout');

  await assert.rejects(() => provider().execute(invocation({ url: origin, path: '/redirect' }, 'redirect'), context()),
    /HTTP_RESPONSE_REDIRECT_DENIED/u);
  await assert.rejects(() => provider().execute(invocation({ url: origin, path: '/large', maximumResponseBytes: 64 }, 'large'), context()),
    /HTTP_RESPONSE_SIZE_EXCEEDED/u);
  await assert.rejects(() => provider().execute(invocation({ url: 'http://example.invalid', path: '/' }, 'origin'), context()),
    /HTTP_REQUEST_(?:PORT|ORIGIN)_DENIED/u);
  await assert.rejects(() => provider().execute(invocation({ url: origin, path: '//example.invalid/' }, 'path'), context()),
    /HTTP_CONFIG_PATH_INVALID/u);
  await assert.rejects(() => provider().execute(invocation({ url: origin, path: '/ok' }, 'ambiguous', [deployment]), context()),
    /HTTP_TARGET_AMBIGUOUS/u);

  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(() => capability.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` }, payload: {} } as any, cancelled.signal),
  /HTTP_REQUEST_CANCELLED/u);
  await assert.rejects(() => capability.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` }, payload: { method: 'POST' } } as any,
  new AbortController().signal), /HTTP_REQUEST_METHOD_DENIED/u);
  const websocketDenied = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [address.port], allowedMethods: ['GET'], allowedRequestHeaders: ['accept'],
    maximumRequestBytes: 1024, maximumResponseBytes: 1024, maximumExecutionMs: 1000 });
  await assert.rejects(() => websocketDenied.invoke('network.http', { operation: 'websocket',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` }, payload: {} } as any,
  new AbortController().signal), /HTTP_WEBSOCKET_DENIED/u);
  const suffixOnly = new NetworkHttpCapabilityInvoker({ allowedOrigins: [], allowedHostSuffixes: ['.0.0.1'],
    allowedPorts: [address.port], allowedMethods: ['GET', 'HEAD', 'POST'], allowedRequestHeaders: ['accept', 'authorization'],
    allowWebSocket: true, maximumRequestBytes: 1024, maximumResponseBytes: 1024, maximumExecutionMs: 1000 });
  const suffixUrl = `${origin}/ok`;
  const contactsBeforeDeniedRequests = contacts;
  await assert.rejects(() => suffixOnly.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: suffixUrl }, payload: { method: 'POST' } } as any,
  new AbortController().signal), /HTTP_REQUEST_EXACT_ORIGIN_REQUIRED:POST/u);
  await assert.rejects(() => suffixOnly.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: suffixUrl }, payload: { headers: { authorization: 'denied' } } } as any,
  new AbortController().signal), /HTTP_REQUEST_EXACT_ORIGIN_REQUIRED:GET/u);
  await assert.rejects(() => suffixOnly.invoke('network.http', { operation: 'websocket',
    resource: { type: 'network.url', canonicalId: suffixUrl }, payload: {} } as any,
  new AbortController().signal), /HTTP_WEBSOCKET_EXACT_ORIGIN_REQUIRED/u);
  await assert.rejects(() => suffixOnly.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: suffixUrl }, payload: { method: 'HEAD' } },
  new AbortController().signal), /HTTP_REQUEST_EXACT_ORIGIN_REQUIRED:HEAD/u);
  await assert.rejects(() => capability.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: suffixUrl }, payload: { headers: { authorization: 'denied' } } },
  new AbortController().signal), /HTTP_REQUEST_HEADER_DENIED/u);
  assert.equal(contacts, contactsBeforeDeniedRequests, 'denied origins, methods and headers never contact the real server');
  const deploymentInput = [{ name: 'deployment', kind: 'value', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1',
    value: { schemaVersion: 'kubernetes-deployment-fixture.v1', expiresAt: new Date(Date.now() + 60_000).toISOString(), endpoints: [{ name: 'api', url: origin }] } }] as any;
  const scopedMutation = await suffixOnly.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: suffixUrl },
    payload: { method: 'POST', headers: { authorization: 'test' }, body: '{}' } } as any,
  new AbortController().signal, deploymentInput);
  assert.equal(scopedMutation.status, 200);
  const noHeaders = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [address.port], allowedMethods: ['GET'], allowedRequestHeaders: [],
    maximumRequestBytes: 1024, maximumResponseBytes: 1024, maximumExecutionMs: 1000 });
  const noHeaderResult = await noHeaders.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` }, payload: {} } as any,
  new AbortController().signal);
  assert.equal(noHeaderResult.status, 200);
  const mixedCaseHeaderPolicy = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [address.port], allowedMethods: ['GET'], allowedRequestHeaders: ['Authorization'],
    maximumRequestBytes: 1024, maximumResponseBytes: 1024, maximumExecutionMs: 1000 });
  const mixedCaseResult = await mixedCaseHeaderPolicy.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` },
    payload: { headers: { authorization: 'Bearer test' } } } as any, new AbortController().signal);
  assert.equal(mixedCaseResult.status, 200);
  await assert.rejects(() => capability.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` }, payload: { headers: { authorization: 'denied' } } } as any,
  new AbortController().signal), /HTTP_REQUEST_HEADER_DENIED/u);
  const bounded = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [],
    allowedPorts: [address.port], allowedMethods: ['POST'], allowedRequestHeaders: ['content-type'],
    maximumRequestBytes: 4, maximumResponseBytes: 1024, maximumExecutionMs: 1000 });
  await assert.rejects(() => bounded.invoke('network.http', { operation: 'request',
    resource: { type: 'network.url', canonicalId: `${origin}/ok` }, payload: { method: 'POST', body: '12345' } } as any,
  new AbortController().signal), /HTTP_REQUEST_BODY_INVALID/u);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log(JSON.stringify({ ok: true, provider: 'http', boundary: 'real-local-http-server', syntheticResponses: 0,
  instrumentation: 'body-cancel observes original fetch/reader and schedules abort after first real chunk' }));
