import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { NetworkHttpCapabilityInvoker } from '@kubeclaw/buster-engine';
import { provider } from '../src/provider.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-'));
for (const directory of ['repository', 'scratch', 'evidence']) fs.mkdirSync(path.join(root, directory));
const responseRef = { $ref: '#/components/responses/Item' };
const spec = {
  openapi: '3.1.0',
  paths: {
    '/items/{id}': { $ref: '#/components/pathItems/Item' },
    '/no-body': { get: { operationId: 'noBody', responses: { 200: responseRef } } },
    '/no-header': { get: { operationId: 'noHeader', responses: { 200: responseRef } } },
    '/false-body': { post: { operationId: 'falseBody', requestBody: { content: {
      'application/json': { schema: false },
    } }, responses: { 200: responseRef } } },
    '/locked-body': { post: { operationId: 'lockedBody', requestBody: { content: {
      'application/json': { schema: { type: 'object', additionalProperties: false } },
    } }, responses: { 200: responseRef } } },
    '/typed-map': { post: { operationId: 'typedMap', parameters: [
      { in: 'header', name: 'content-type', schema: { type: 'string' } },
    ], requestBody: { content: {
      'application/json': { schema: { type: 'object', additionalProperties: { type: 'string' } } },
    } }, responses: { 200: responseRef } } },
    '/untyped-body': { post: { operationId: 'untypedBody', requestBody: { content: {
      'application/json': {},
    } }, responses: { 200: responseRef } } },
    '/untyped-response': { get: { operationId: 'untypedResponse', responses: { 200: {
      description: 'untyped json', content: { 'application/json': {} },
    } } } },
    '/empty': { get: { operationId: 'emptyObject', responses: { 200: {
      description: 'non-empty object', content: { 'application/json': { schema: { type: 'object', minProperties: 1 } } },
    } } } },
    '/wildcard': { get: { operationId: 'wildcardMedia', responses: { 200: {
      description: 'json range', content: { 'application/*': { schema: { type: 'object' } } },
    } } } },
    '/false-response': { get: { operationId: 'falseResponse', responses: { 200: {
      description: 'denied response', content: { 'application/json': { schema: false } },
    } } } },
    '/html': { get: { operationId: 'getHtml', responses: { 200: {
      description: 'html', content: { 'text/html': { schema: { type: 'string' } } },
    } } } },
    '/cleanup': { delete: { operationId: 'cleanup', responses: { 200: { description: 'cleaned' } } } },
    '/bounded/{value}': { get: { operationId: 'bounded', parameters: [
      { in: 'path', name: 'value', required: true, schema: { type: 'number', minimum: 1, exclusiveMinimum: true } },
    ], responses: { 200: { description: 'bounded' } } } },
    '/unique': { post: { operationId: 'unique', requestBody: { content: { 'application/json': {
      schema: { type: 'array', uniqueItems: true },
    } } }, responses: { 200: responseRef } } },
    '/cookie': { get: { operationId: 'cookie', parameters: [
      { in: 'cookie', name: 'session', required: true, schema: { type: 'string' } },
    ], responses: { 200: responseRef } } },
    '/content-parameter': { get: { operationId: 'contentParameter', parameters: [
      { in: 'query', name: 'id', required: true, content: { 'application/json': { schema: { type: 'integer' } } } },
    ], responses: { 200: responseRef } } },
  },
  components: {
    pathItems: { Item: {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { const: 'wrong' } }],
      get: { operationId: 'getItem', parameters: [
        { in: 'path', name: 'id', required: true, schema: { const: 'one' } },
        { in: 'header', name: 'x-count', required: true, schema: { type: 'integer', minimum: 1 } },
      ], requestBody: { content: { 'application/json': {
        schema: { type: 'object', required: ['filter'] },
      } } }, responses: { '2XX': responseRef } },
    } },
    responses: { Item: {
      headers: {
        'x-request-id': { $ref: '#/components/headers/RequestId' },
        'content-length': { required: true, schema: { type: 'integer', minimum: 1 } },
        'x-rate-limit': { $ref: '#/components/headers/RateLimit' },
      },
      content: { 'application/json': { schema: {
        type: 'object', required: ['id', 'metadata'], additionalProperties: false,
        properties: { id: { type: 'string', minLength: 1 }, metadata: { const: { a: 1, b: 2 } } },
      } } },
    } },
    headers: {
      RequestId: { required: true, schema: { type: 'string', minLength: 1 } },
      RateLimit: { required: true, schema: { type: 'integer', minimum: 1 } },
    },
  },
};
fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify(spec)}\n`);
let htmlAccept = null; let typedMapContentType = null; let cleanupRequests = 0; let itemRequests = 0;
const server = http.createServer((request, response) => { const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/cleanup' && request.method === 'DELETE') cleanupRequests += 1;
  if (pathname.startsWith('/items/')) itemRequests += 1;
  if (pathname === '/html') { htmlAccept = request.headers.accept; response.setHeader('content-type', 'text/html'); response.end('<p>ok</p>'); return; }
  if (pathname === '/empty') { response.setHeader('content-type', 'application/json'); response.end('{}'); return; }
  if (pathname === '/typed-map') typedMapContentType = request.headers['content-type'];
  const id = pathname.split('/').pop(); const body = JSON.stringify({ id, metadata: { b: 2, a: 1 } });
  response.setHeader('content-type', 'application/json'); if (pathname !== '/no-header') response.setHeader('x-request-id', 'one');
  response.setHeader('x-rate-limit', '10'); response.setHeader('content-length', String(Buffer.byteLength(body))); response.end(body); });
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('OPENAPI_TEST_BIND_FAILED'); const origin = `http://127.0.0.1:${address.port}`;
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [], allowedPorts: [address.port], allowedMethods: ['GET', 'POST', 'DELETE'], allowedRequestHeaders: ['accept', 'content-type', 'x-count'], maximumRequestBytes: 1024 * 1024, maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 30_000 });
const invocation = { schemaVersion: 'provider-invocation.v1', planId: 'plan:openapi', runId: 'run:openapi', moduleId: 'api', gateId: null,
  suiteInstanceId: null, nodeId: 'openapi', executionId: 'plan:openapi:openapi', testIdentity: 'test:openapi', nodeKind: 'test', attemptId: 'attempt:openapi', attemptNumber: 1, provider: {},
  configuration: { values: { specFile: 'openapi.json', url: origin, operations: [{ operationId: 'getItem', pathParameters: { id: 'one' }, headers: { 'x-count': '10' }, expectedStatuses: [200] }] } }, inputs: [], evidence: {}, grantedCapabilities: ['network.http'], timeoutMs: 30_000,
  limits: { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 4 * 1024 * 1024, artifactFiles: 8, processes: 4 }, workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } } as any;
const signal = new AbortController().signal;
try {
  const context = { signal, workspaceRoot: root, log() {}, invoke: (name: string, request: any) => capability.invoke(name, request, signal) } as any;
  const result = await provider().execute(invocation, context); assert.equal(result.outcome, 'passed'); assert.deepEqual(result.counts, { total: 1, passed: 1, failed: 0, skipped: 0 }); assert.equal(result.evidenceFiles[0].file, 'openapi-runtime-result.json');
  const requestsBeforeDuplicates = itemRequests;
  const duplicateOperations = await provider().execute({ ...invocation, testIdentity: 'test:openapi-duplicate-operations',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'getItem', pathParameters: { id: 'one' }, headers: { 'x-count': '10' } },
      { operationId: 'getItem', pathParameters: { id: 'one' }, headers: { 'x-count': '10' } },
    ] } } } as any, context);
  assert.equal(duplicateOperations.outcome, 'passed');
  assert.equal(itemRequests - requestsBeforeDuplicates, 2);
  const undeclared = await provider().execute({ ...invocation, testIdentity: 'test:openapi-undeclared',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'getItem', pathParameters: { id: 'one' }, query: { hidden: 'value' } },
    ] } } } as any, context);
  assert.equal(undeclared.outcome, 'failed');
  assert.match(undeclared.findings[0].message, /query parameter hidden is not declared/u);
  const bodyNotDeclared = await provider().execute({ ...invocation, testIdentity: 'test:openapi-body',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'noBody', body: { hidden: true } },
    ] } } } as any, context);
  assert.equal(bodyNotDeclared.outcome, 'failed');
  assert.match(bodyNotDeclared.findings[0].message, /JSON request body is not declared/u);
  const contentTypeOverride = await provider().execute({ ...invocation, testIdentity: 'test:openapi-content-type-override',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'typedMap', headers: { 'content-type': 'text/plain' }, body: { value: 'ok' } },
    ] } } } as any, context);
  assert.equal(contentTypeOverride.outcome, 'failed');
  assert.match(contentTypeOverride.findings[0].message, /content-type request header is provider-controlled/u);
  const typedMap = await provider().execute({ ...invocation, testIdentity: 'test:openapi-typed-map-valid',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'typedMap', body: { value: 'ok' } },
    ] } } } as any, context);
  assert.equal(typedMap.outcome, 'passed'); assert.equal(typedMapContentType, 'application/json');
  for (const [operationId, body] of [['untypedBody', { value: true }], ['untypedResponse', undefined]] as const) {
    const untyped = await provider().execute({ ...invocation, testIdentity: `test:openapi-${operationId}`,
      configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
        { operationId, ...(body === undefined ? {} : { body }) },
      ] } } } as any, context);
    assert.equal(untyped.outcome, 'passed');
  }
  const emptyObject = await provider().execute({ ...invocation, testIdentity: 'test:openapi-empty-object',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'emptyObject' },
    ] } } } as any, context);
  assert.equal(emptyObject.outcome, 'failed'); assert.match(emptyObject.findings[0].message, /response has too few properties/u);
  const wildcardMedia = await provider().execute({ ...invocation, testIdentity: 'test:openapi-wildcard-media',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'wildcardMedia' },
    ] } } } as any, context);
  assert.equal(wildcardMedia.outcome, 'passed');
  for (const [operationId, body, expected] of [
    ['falseBody', { value: true }, /request is denied by the schema/u],
    ['lockedBody', { value: true }, /request.value is not allowed/u],
    ['typedMap', { value: 1 }, /request.value must have type string/u],
  ] as const) {
    const deniedBody = await provider().execute({ ...invocation, testIdentity: `test:openapi-${operationId}`,
      configuration: { values: { specFile: 'openapi.json', url: origin, operations: [{ operationId, body }] } } } as any,
    context);
    assert.equal(deniedBody.outcome, 'failed'); assert.match(deniedBody.findings[0].message, expected);
  }
  const deniedResponse = await provider().execute({ ...invocation, testIdentity: 'test:openapi-false-response',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [{ operationId: 'falseResponse' }] } } } as any,
  context);
  assert.equal(deniedResponse.outcome, 'failed'); assert.match(deniedResponse.findings[0].message, /response is denied by the schema/u);
  const html = await provider().execute({ ...invocation, testIdentity: 'test:openapi-html',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [{ operationId: 'getHtml' }] } } } as any,
  context);
  assert.equal(html.outcome, 'passed'); assert.equal(htmlAccept, 'text/html');
  const missingHeader = await provider().execute({ ...invocation, testIdentity: 'test:openapi-header',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'noHeader' },
    ] } } } as any, context);
  assert.equal(missingHeader.outcome, 'failed');
  assert.match(missingHeader.findings[0].message, /Required response header x-request-id is missing/u);
  const cleanupAfterValidationFailure = await provider().execute({ ...invocation,
    testIdentity: 'test:openapi-cleanup-after-validation-failure', configuration: { values: {
      specFile: 'openapi.json', url: origin, operations: [
        { operationId: 'getItem' }, { operationId: 'cleanup', cleanup: true },
      ],
    } } } as any, context);
  assert.equal(cleanupAfterValidationFailure.outcome, 'failed');
  assert.match(cleanupAfterValidationFailure.findings[0].message, /OPENAPI_PATH_PARAMETER_MISSING:getItem/u);
  assert.equal(cleanupRequests, 1);
  const openapi30 = structuredClone(spec); openapi30.openapi = '3.0.3';
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify(openapi30)}\n`);
  const exclusiveBound = await provider().execute({ ...invocation, testIdentity: 'test:openapi-30-exclusive',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'bounded', pathParameters: { value: 1 } },
    ] } } } as any, context);
  assert.equal(exclusiveBound.outcome, 'failed');
  assert.match(exclusiveBound.findings[0].message, /path.value must exceed the minimum/u);
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify(spec)}\n`);
  const duplicateItems = await provider().execute({ ...invocation, testIdentity: 'test:openapi-unique-items',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'unique', body: [{ a: 1, b: 2 }, { b: 2, a: 1 }] },
    ] } } } as any, context);
  assert.equal(duplicateItems.outcome, 'failed');
  assert.match(duplicateItems.findings[0].message, /request has duplicate items/u);
  const requiredCookie = await provider().execute({ ...invocation, testIdentity: 'test:openapi-cookie',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'cookie' },
    ] } } } as any, context);
  assert.equal(requiredCookie.outcome, 'failed');
  assert.match(requiredCookie.findings[0].message, /cookie parameter session is required but cookie parameters are unsupported/u);
  const contentParameter = await provider().execute({ ...invocation, testIdentity: 'test:openapi-content-parameter',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [
      { operationId: 'contentParameter', query: { id: 'not-an-integer' } },
    ] } } } as any, context);
  assert.equal(contentParameter.outcome, 'failed');
  assert.match(contentParameter.findings[0].message, /query parameter id uses unsupported content serialization/u);
  await assert.rejects(() => provider().execute({ ...invocation, testIdentity: 'test:openapi-missing',
    configuration: { values: { specFile: 'missing.json', url: origin, operations: [{ operationId: 'getItem' }] } } } as any,
  context), /OPENAPI_FILE_DENIED/u);
  const deepSchemas = Object.fromEntries(Array.from({ length: 67 }, (_, index) => [
    `Depth${index}`, index === 66 ? { type: 'object' } : { $ref: `#/components/schemas/Depth${index + 1}` },
  ]));
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify({ openapi: '3.1.0', paths: {
    '/deep': { get: { operationId: 'deep', responses: { 200: { content: {
      'application/json': { schema: { $ref: '#/components/schemas/Depth0' } },
    } } } } },
  }, components: { schemas: deepSchemas } })}\n`);
  const deepResult = await provider().execute({ ...invocation, testIdentity: 'test:openapi-depth',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [{ operationId: 'deep' }] } } } as any,
  context);
  assert.equal(deepResult.outcome, 'failed');
  assert.match(deepResult.findings[0].message, /OPENAPI_SCHEMA_DEPTH_EXCEEDED/u);
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify(spec)}\n`);
  const unsafePattern = structuredClone(spec);
  (unsafePattern.components.responses.Item.content['application/json'].schema.properties.id as Record<string, unknown>).pattern = '^(a+)+$';
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify(unsafePattern)}\n`);
  const unsafeResult = await provider().execute(invocation, context);
  assert.equal(unsafeResult.outcome, 'failed');
  assert.match(unsafeResult.findings[0].message, /OPENAPI_SCHEMA_PATTERN_UNSAFE/u);
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify(spec)}\n`);
  fs.writeFileSync(path.join(root, 'repository/openapi.json'), `${JSON.stringify({ openapi: '3.1.0', paths: {
    '//other.svc.cluster.local/path': { get: { operationId: 'escape', responses: { 200: { description: 'denied' } } } },
  } })}\n`);
  await assert.rejects(() => provider().execute({ ...invocation, testIdentity: 'test:openapi-origin',
    configuration: { values: { specFile: 'openapi.json', url: origin, operations: [{ operationId: 'escape' }] } } } as any,
  context), /OPENAPI_PATH_INVALID/u);
}
finally { await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, provider: 'openapi', realHttp: true, mocks: 0, wrappers: 0 }));
