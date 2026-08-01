import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-architecture-'));
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ result: {
    verdict: 'passed',
    summary: 'Architecture requires operator review.',
    findings: [{
      id: 'ARCHITECTURE_BOUNDARY_RISK',
      severity: 'warn',
      scope: 'integration_boundary',
      paths: ['src/api.ts'],
      explanation: 'The integration boundary needs operator confirmation.',
      remediation: 'Confirm the API owner before implementation.',
    }],
    checkedFiles: ['docs/architecture.md'],
  } }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secretName = 'KUBECLAW_ARCHITECTURE_TEST_TOKEN';
process.env[secretName] = 'architecture-test-secret';
const roots = [
  path.join(repository, 'skills/common/plugins'), path.join(repository, 'skills/nova/plugins'),
  path.join(repository, 'skills/buster/plugins'),
];
try {
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
      verifierId: 'test:architecture-validator',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  const enabled = new Set(['kubeclaw.architecture-validator:architecture']);
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: enabled,
    providers: new Map([
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([
      ['kubeclaw.architecture-validator:architecture', new Map([
        ['runtime.dispatch', { allowedAgents: ['architect'] }],
        ['artifacts.write', { allowedNamespaces: ['kubeclaw.architecture-validator'] }],
      ])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['architecture.agent'] }],
      ])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const adapters = new core.AdapterRuntime({
    granted, activated,
    configs: new Map([
      ['kubeclaw.runtime-dispatch:runtime', { targets: {
        architect: { endpoint: `${origin}/dispatch`, tokenSecret: 'architecture.agent' },
      } }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin], allowedMethods: ['POST'],
        allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'],
      }],
      ['kubeclaw.secret-resolver:secrets', { environment: { 'architecture.agent': secretName } }],
      ['kubeclaw.artifact-store:artifact-store', { artifactRoot: path.join(temporary, 'artifacts') }],
    ]),
    effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, 'effects.jsonl')), undefined, undefined, new core.MemoryResourceLockManager()),
    shutdownTimeoutMs: 1000, async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2', id: 'pipeline:architecture', maxConcurrency: 1,
        stages: [{
          id: 'architecture', type: 'kubeclaw.validate.architecture', dependsOn: [],
          config: { agent: 'architect' }, input: { task: 'Validate architecture.', architecture: { services: ['api'] } },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
        }],
      },
      registry: granted, activated, adapters, journal: new core.FileJournal(path.join(temporary, 'events.jsonl')),
    });
    const result = await runner.run('run:architecture');
    assert.equal(result.status, 'succeeded');
    assert.equal(
      result.stages.get('architecture')?.facts?.['architecture.review'],
      'approval_required',
    );
    assert.match(fs.readFileSync(path.join(temporary, 'artifacts', 'catalog.jsonl'), 'utf8'), /architecture-validation/);
  } finally { await adapters.shutdown(); }
} finally {
  delete process.env[secretName];
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.architecture-validator', suite: 'live-function' }));
