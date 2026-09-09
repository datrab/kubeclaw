import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';

let contacts = 0;
const server = http.createServer((_request, response) => { contacts++; response.end('ok'); });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'provider-semantics-remediation',
} }));
const limits = { cpuMillis: 60_000, memoryBytes: 256 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 4, processes: 4 };
async function run(uses: string, config: Record<string, any>, files: Record<string, unknown>) {
  const plan = resolveTestPlan({ planId: `plan:${crypto.randomUUID()}`, runId: `run:${crypto.randomUUID()}`,
    project: 'semantics', scope: { moduleId: 'app', gateId: null }, createdAt: '2026-09-09T00:00:00.000Z',
    declaration: { tests: { probe: { uses, mode: 'blocking', retries: 0, config } } }, suiteTemplates: [], registry,
    facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 5000, maximumTimeoutMs: 10000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 1, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: {} } });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-runner-semantics-'));
  try {
    for (const name of ['workspace/repository', 'artifacts', 'observability']) fs.mkdirSync(path.join(root, name), { recursive: true });
    for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, 'workspace/repository', name), JSON.stringify(value));
    const result = await new TestPlanRunner({ plan, registry, workspaceRoot: path.join(root, 'workspace'),
      repositoryRoot: path.join(root, 'workspace/repository'), artifactRoot: path.join(root, 'artifacts'),
      observabilityRoot: path.join(root, 'observability'), maximumConcurrency: 1,
      grants: new Map([['probe', ['network.http']]]), capabilityInvoker: new NetworkHttpCapabilityInvoker({
        allowedOrigins: [origin], allowedHostSuffixes: [], allowedPorts: [address.port],
        maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 10000,
      }) }).run();
    for (const attempt of result.attempts) if (attempt.summary === 'write EPIPE') {
      for (const evidence of attempt.evidence) if (evidence.type === 'log') {
        console.error(fs.readFileSync(new URL(evidence.artifact.storageUrl), 'utf8'));
      }
    }
    return result;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
try {
  const empty = await run('kubeclaw.api-flow@1', { url: origin, flowFile: 'flow.json' }, {
    'flow.json': { schemaVersion: 'kubeclaw.api-flow.v1', steps: [{ id: 'dependent', path: '/{{missing}}' }] },
  });
  assert.equal(empty.nodes[0].outcome, 'failed', JSON.stringify(empty)); assert.equal(contacts, 0);
  for (const kind of ['api-flow', 'openapi']) {
    const files = kind === 'api-flow' ? { 'flow.json': { schemaVersion: 'kubeclaw.api-flow.v1', steps: [{ id: 'probe', path: '/' }] } }
      : { 'spec.json': { openapi: '3.1.0', paths: { '/': { get: { operationId: 'probe', responses: { 200: { description: 'ok' } } } } } } };
    const config = kind === 'api-flow' ? { flowFile: 'flow.json' } : { specFile: 'spec.json', operations: [{ operationId: 'probe' }] };
    const denied = await run(`kubeclaw.${kind}@1`, { ...config, url: `http://127.0.0.2:${address.port}` }, files);
    assert.equal(denied.nodes[0].state, 'errored');
    assert.equal(denied.nodes[0].outcome, null);
    assert.equal(denied.attempts[0].executionState, 'errored');
    assert.match(denied.attempts[0].summary, /HTTP_REQUEST_ORIGIN_DENIED/u); assert.equal(contacts, 0);
  }
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
console.log(JSON.stringify({ ok: true, boundary: 'resolver-worker-runner-real-http', mocks: 0 }));
