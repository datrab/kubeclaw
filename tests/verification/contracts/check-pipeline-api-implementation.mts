import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';
import { TOOL_REGISTRY } from '../../../skills/nova/plugins/lint/src/engine/tool-registry.ts';

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'api-implementation',
} }));
for (const contract of ['kubeclaw.http@1', 'kubeclaw.api-flow@1', 'kubeclaw.openapi@1']) {
  const entry = registry.testProviderContracts.get(contract); assert.ok(entry, contract); assert.deepEqual(entry.registration.capabilities, ['network.http']);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-vertical-'));
for (const directory of ['workspace/repository', 'artifacts', 'observability']) fs.mkdirSync(path.join(root, directory), { recursive: true });
const server = http.createServer((request, response) => {
  const route = new URL(request.url ?? '/', 'http://localhost').pathname;
  response.setHeader('content-type', 'application/json'); response.setHeader('x-request-id', 'vertical');
  if (route === '/health') response.end('{"ready":true}'); else if (route === '/items/one') response.end('{"id":"one"}'); else if (route === '/echo' && request.method === 'POST') response.end('{"accepted":true}'); else response.writeHead(404).end('{}');
});
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address(); if (!address || typeof address === 'string') throw new Error('API_VERTICAL_BIND_FAILED'); const origin = `http://127.0.0.1:${address.port}`;
fs.writeFileSync(path.join(root, 'workspace/repository/flow.json'), JSON.stringify({ schemaVersion: 'kubeclaw.api-flow.v1', steps: [{ id: 'health', path: '/health', expect: { status: 200, json: { ready: true } } }] }));
fs.writeFileSync(path.join(root, 'workspace/repository/openapi.json'), JSON.stringify({ openapi: '3.1.0', paths: { '/items/{id}': { get: { operationId: 'getItem', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { headers: { 'x-request-id': { required: true } }, content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { const: 'one' } } } } } } } } }, '/echo': { post: { operationId: 'echoUntypedBody', requestBody: { required: true, content: { 'application/json': {} } }, responses: { 200: { content: { 'application/json': { schema: { type: 'object', required: ['accepted'], properties: { accepted: { const: true } } } } } } } } } } }));
const lint = TOOL_REGISTRY.find((tool: any) => tool.id === 'openapi-contract'); assert.ok(lint);
const lintContext: any = { repoRoot: path.join(root, 'workspace/repository'), projectRoot: path.join(root, 'workspace/repository'),
  tool: { targets: ['.'], include: ['**/openapi.json'], exclude: [], scope: 'project' }, changedFilesRequested: false,
  changedFiles: [], policy: { global_exclusions: [] }, policyProject: { discovery_max_depth: 8 } };
assert.equal((await lint.run(lintContext)).errors, 0);
const validOpenapi = fs.readFileSync(path.join(root, 'workspace/repository/openapi.json'));
fs.writeFileSync(path.join(root, 'workspace/repository/openapi.json'), '{"openapi":"2.0","paths":{}}');
assert.equal((await lint.run(lintContext)).errors > 0, true);
fs.writeFileSync(path.join(root, 'workspace/repository/openapi.json'), `openapi: 3.1.0
shared: &shared
  get:
    operationId: shared
    responses:
      200: { description: ok }
paths:
  /first: *shared
`);
const aliasResult = await lint.run(lintContext);
assert.equal(aliasResult.errors > 0, true);
assert.equal(aliasResult.findings.some((finding: any) => finding.code === 'openapi-syntax'), true);
fs.writeFileSync(path.join(root, 'workspace/repository/openapi.json'), '{"openapi":"3.1.0","paths":{"/broken":"not-a-path-item"}}');
const pathItemResult = await lint.run(lintContext);
assert.equal(pathItemResult.findings.some((finding: any) => finding.code === 'openapi-path-item'), true);
fs.writeFileSync(path.join(root, 'workspace/repository/openapi.json'), validOpenapi);
const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/api.v1.json', 'utf8'));
const declaration: any = { suites: { api: { uses: 'kubeclaw.api-suite@1', overrides: {
  http: { config: { url: origin, path: '/health', expectedStatuses: [200] } },
  flow: { config: { url: origin, flowFile: 'flow.json' } },
  openapi: { config: { url: origin, specFile: 'openapi.json', operations: [{ operationId: 'getItem', pathParameters: { id: 'one' }, expectedStatuses: [200] }, { operationId: 'echoUntypedBody', body: { freeform: true }, expectedStatuses: [200] }] } },
} } } };
const limits = { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024, artifactBytes: 4 * 1024 * 1024, artifactFiles: 8, processes: 4 };
const plan = resolveTestPlan({ planId: 'plan:api', runId: 'run:api', project: 'api-proof', scope: { moduleId: 'api', gateId: null }, createdAt: '2026-09-03T00:00:00.000Z', declaration, suiteTemplates: [suite], registry, facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' }, policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 60_000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 2, maximumMatrixSize: 8, maximumNodes: 8, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { http: 8, 'api-flow': 4 } } });
assert.deepEqual(plan.nodes.map((node) => node.provider.contractId).sort(), ['kubeclaw.api-flow@1', 'kubeclaw.http@1', 'kubeclaw.openapi@1']);
const capability = new NetworkHttpCapabilityInvoker({ allowedOrigins: [origin], allowedHostSuffixes: [], allowedPorts: [address.port], allowedMethods: ['GET', 'POST'], allowedRequestHeaders: ['accept', 'content-type'], maximumRequestBytes: 1024 * 1024, maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 30_000 });
try {
  const run = await new TestPlanRunner({ plan, registry, workspaceRoot: path.join(root, 'workspace'), repositoryRoot: path.join(root, 'workspace/repository'), artifactRoot: path.join(root, 'artifacts'), observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1, grants: new Map(plan.nodes.map((node) => [node.id, ['network.http']])), capabilityInvoker: capability }).run();
  assert.equal(run.nodes.every((node) => node.outcome === 'passed'), true, JSON.stringify(run));
  assert.equal(run.attempts.filter((attempt) => attempt.evidence.length > 0).length, 3);
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, phase: 'api-implementation', providers: 3, realHttp: true, isolatedRunner: true, mocks: 0 }));
