import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-review-'));
const server = http.createServer((_request, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({
    result: {
      status: 'PASS',
      critical_issues: [],
      deferred_issues: [],
      checked_contracts: ['contracts/plugin.json'],
      opened_artifacts: ['artifact:test-report'],
      failed_commands: [],
      unverified_requirements: [],
      summary: 'All acceptance evidence is present.',
    },
  }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server address unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const secretName = 'KUBECLAW_REVIEW_TEST_TOKEN';
process.env[secretName] = 'local-token';
const roots = [
  path.join(repository, 'skills/common/plugins'),
  path.join(repository, 'skills/nova/plugins'),
  path.join(repository, 'skills/buster/plugins'),
];
try {
  const snapshot = core.buildRegistry(core.discoverPackages({
    installationRoots: roots,
    trustPolicy: {
      trustedBuiltinRoots: roots,
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:review-live',
    },
    now: () => new Date('2026-07-26T00:00:00Z'),
  }));
  const granted = core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set(['kubeclaw.review:review']),
    providers: new Map([
      ['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
      ['network.http', 'kubeclaw.network-http:http'],
      ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
    ]),
    grants: new Map([
      ['kubeclaw.review:review', new Map([['runtime.dispatch', { allowedAgents: ['reviewer'] }]])],
      ['kubeclaw.runtime-dispatch:runtime', new Map([
        ['network.http', { allowedOrigins: [origin] }],
        ['secrets.read', { allowedNames: ['review-token'] }],
      ])],
    ]),
  });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.runtime-dispatch:runtime', {
        targets: {
          reviewer: {
            endpoint: `${origin}/dispatch`,
            tokenSecret: 'review-token',
          },
        },
      }],
      ['kubeclaw.network-http:http', {
        allowedOrigins: [origin],
        allowedMethods: ['POST'],
        allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'],
      }],
      ['kubeclaw.secret-resolver:secrets', { environment: { 'review-token': secretName } }],
    ]),
    effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, 'effects.jsonl'))),
    shutdownTimeoutMs: 1000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: 'pipeline:review-live',
        maxConcurrency: 1,
        stages: [{
          id: 'review',
          type: 'kubeclaw.decision.review',
          dependsOn: [],
          config: { agent: 'reviewer' },
          input: { task: 'Review the implementation.', evidence: { tests: 'artifact:test-report' } },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
        }],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(path.join(temporary, 'events.jsonl')),
    });
    const result = await runner.run('run:review-live');
    assert.equal(result.status, 'succeeded');
    assert.equal(result.stages.get('review')?.status, 'succeeded');
  } finally {
    await adapters.shutdown();
  }
} finally {
  delete process.env[secretName];
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'live-function' }));
