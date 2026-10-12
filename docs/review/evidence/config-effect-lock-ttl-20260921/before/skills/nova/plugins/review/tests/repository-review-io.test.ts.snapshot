import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { FileDurableBlobStore, FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as core from '@kubeclaw/nova-core';

const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'review-real-io-'));
const project = path.join(temporary, 'repository');
fs.mkdirSync(project);
for (const relative of ['skills/nova/plugins/review/src/index.ts', 'skills/nova/plugins/unselected/src/index.ts',
  'skills/common/plugin-runtime/src/index.ts', 'skills/common/plugins/runtime-dispatch/src/index.ts', 'contracts/a.ts']) {
  const file = path.join(project, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export const value = 1;\n');
}
for (const args of [['init', '-q'], ['config', 'user.email', 'review@example.invalid'],
  ['config', 'user.name', 'Review'], ['add', '.'], ['commit', '-qm', 'source']]) {
  execFileSync('git', args, { cwd: project });
}
let connections = 0;
const unavailable = net.createServer((socket) => { connections++; socket.destroy(); });
await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
const address = unavailable.address(); if (!address || typeof address === 'string') throw new Error('SERVER_BIND_FAILED');
const origin = `http://127.0.0.1:${address.port}`;
const roots = ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'].map((item) => path.join(repository, item));
const snapshot = core.buildRegistry(core.discoverPackages({ installationRoots: roots, trustPolicy: {
  trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'review-real-io',
} }));
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['kubeclaw.review:repository-audit', 'kubeclaw.review:repository-revalidation']),
  providers: new Map([['runtime.dispatch', 'kubeclaw.runtime-dispatch:runtime'],
    ['network.http', 'kubeclaw.network-http:http'], ['secrets.read', 'kubeclaw.secret-resolver:secrets'],
    ['git.repository.read', 'kubeclaw.repository-adapter:repository'],
    ['artifacts.read', 'kubeclaw.artifact-store:artifact-store'], ['artifacts.write', 'kubeclaw.artifact-store:artifact-store']]),
  grants: new Map([
    ['kubeclaw.review:repository-audit', new Map<string, any>([
      ['runtime.dispatch', { allowedAgents: ['reviewer'] }], ['git.repository.read', { allowedPrefixes: ['.'] }],
      ['artifacts.read', { allowedNamespaces: ['kubeclaw.review'] }], ['artifacts.write', { allowedNamespaces: ['kubeclaw.review'] }],
    ])],
    ['kubeclaw.review:repository-revalidation', new Map<string, any>([
      ['runtime.dispatch', { allowedAgents: ['reviewer'] }], ['git.repository.read', { allowedPrefixes: ['.'] }],
      ['artifacts.read', { allowedNamespaces: ['kubeclaw.review'] }], ['artifacts.write', { allowedNamespaces: ['kubeclaw.review'] }],
    ])],
    ['kubeclaw.runtime-dispatch:runtime', new Map<string, any>([
      ['network.http', { allowedOrigins: [origin] }], ['secrets.read', { allowedNames: ['unused'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
const artifacts = path.join(temporary, 'artifacts');
const adapters = new core.AdapterRuntime({ granted, activated, configs: new Map<string, any>([
  ['kubeclaw.runtime-dispatch:runtime', { targets: { reviewer: { endpoint: `${origin}/dispatch`, authentication: 'spiffe-proxy' } } }],
  ['kubeclaw.network-http:http', { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'] }],
  ['kubeclaw.secret-resolver:secrets', { environment: {} }],
  ['kubeclaw.repository-adapter:repository', { repositoryRoot: project }],
  ['kubeclaw.artifact-store:artifact-store', { artifactRoot: artifacts }],
]), effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, 'effects.jsonl')),
  undefined, undefined, new core.MemoryResourceLockManager()), shutdownTimeoutMs: 1000,
  async emitDomainEvent(event: unknown) { fs.appendFileSync(path.join(temporary, 'domain.jsonl'), `${JSON.stringify(event)}\n`); },
});
try {
  await adapters.start();
  const records = new FileDurableRecordStore(artifacts, { maximumRecords: 100000, maximumBytes: 256 * 1024 * 1024, maximumRecordBytes: 64 * 1024 });
  const blobs = new FileDurableBlobStore(artifacts, 16 * 1024 * 1024, 256 * 1024 * 1024);
  const scopes = [
    { kind: 'plugin', names: ['review'], dependencyRadius: 0 },
    { kind: 'plugin', names: ['review'], dependencyRadius: 1 },
    { kind: 'path', prefixes: ['skills/nova/plugins/review/'] },
    { kind: 'path', prefixes: ['skills/nova/plugins/review'] },
  ];
  for (const [index, scope] of scopes.entries()) {
    const journal = new core.FileJournal(path.join(temporary, `events-${index}.jsonl`));
    const runner = new core.PipelineRunner({ definition: { schemaVersion: 'pipeline-definition.v2',
      id: `review-io-${index}`, maxConcurrency: 1, stages: [{ id: 'audit', type: 'kubeclaw.audit.repository-review',
        dependsOn: [], config: { agent: 'reviewer', reviewerModel: 'gpt-5.6-terra', profile: 'audit' }, input: { mode: 'plan', scope },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 15000 } }] },
    registry: granted, activated, adapters, journal });
    const result = await runner.run(`run:review-io-${index}`);
    assert.equal(result.status, 'succeeded', JSON.stringify(journal.records()));
    const effectRecords = fs.readFileSync(path.join(temporary, 'effects.jsonl'), 'utf8');
    assert.equal(effectRecords.includes('"operation":"dispatch"'), false, 'planning performs no model calls');
    const prepared = (await records.read<any>('artifacts/kubeclaw.review')).map((item) => item.payload)
      .findLast((item) => item.producer.runId === `run:review-io-${index}` && item.artifactId.startsWith('repository-review-prepared:'));
    assert.ok(prepared);
    const value = JSON.parse((await blobs.get(prepared.digest)).toString('utf8'));
    const included = value.snapshot.files.filter((file: any) => file.included).map((file: any) => file.path).sort();
    const expected = ['skills/nova/plugins/review/src/index.ts'];
    if (index === 1) expected.push('contracts/a.ts', 'skills/common/plugin-runtime/src/index.ts',
      'skills/common/plugins/runtime-dispatch/src/index.ts');
    assert.deepEqual(included, expected.sort(), 'only canonically scoped paths enter the real inventory');

  }
  const journal = new core.FileJournal(path.join(temporary, 'revalidation-events.jsonl'));
  const retry = new core.PipelineRunner({ definition: { schemaVersion: 'pipeline-definition.v2',
    id: 'review-storage-error', maxConcurrency: 1, stages: [{ id: 'revalidate',
      type: 'kubeclaw.audit.repository-review-revalidation', dependsOn: [], config: { agent: 'reviewer', reviewerModel: 'gpt-5.6-terra', profile: 'audit' },
      input: { baselineReport: { artifactId: `repository-review:${'0'.repeat(64)}`, digest: `sha256:${'0'.repeat(64)}`,
        sizeBytes: 1, namespace: 'kubeclaw.review', mediaType: 'application/json' },
      scope: { kind: 'plugin', names: ['review'], dependencyRadius: 0 } },
      execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 15000 } }] },
    registry: granted, activated, adapters, journal });
  const failed = await retry.run('run:review-storage-error');
  assert.equal(failed.status, 'blocked');
  const completed = journal.records().filter((item) => item.entry.type === 'attempt.completed');
  assert.equal(completed.length, 2, 'a real artifact-read failure reaches Core retry policy');
  for (const item of completed) assert.equal((item.entry.payload as any).outcome, 'retry');

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
  async function baseline(count: number) {
    const report = { schemaVersion: 'repository-review-report.v1', head, map: { relationsJsonl: '' },
      reduction: { confirmed: Array.from({ length: count }, (_, index) => ({
        fingerprint: sha256Text(`finding-${index}`), clusterId: sha256Text(`cluster-${index}`),
        finding: { priority: 'P1', locations: [{ path: 'skills/nova/plugins/review/src/index.ts' }] },
      })) } };
    const blob = await blobs.put(Buffer.from(canonicalJson(report)));
    const reference = { artifactId: `repository-review:${blob.digest.slice(7)}`, namespace: 'kubeclaw.review',
      mediaType: 'application/json', ...blob };
    await records.append('artifacts/kubeclaw.review', `baseline-${count}`, { ...reference,
      producer: { runId: 'run:baseline', stageId: 'audit', attemptId: 'baseline', attemptNumber: 1 } });
    return reference;
  }
  for (const test of [
    { id: 'jobs', count: 2, overrides: { maxVerificationJobs: 1 }, attempts: 1, calls: 0, reason: /job budget exceeded/u },
    { id: 'shared-retries', count: 1, overrides: { maxRetries: 1, maxRetryAttemptsPerPhase: 0 }, attempts: 1, calls: 1, reason: /core.effect_reconciliation_required/u },
    { id: 'transport', count: 1, overrides: { maxRetries: 0 }, attempts: 1, calls: 1, reason: /core.effect_reconciliation_required/u },
  ]) {
    const testJournal = new core.FileJournal(path.join(temporary, `${test.id}-events.jsonl`));
    const runner = new core.PipelineRunner({ definition: { schemaVersion: 'pipeline-definition.v2',
      id: `review-${test.id}`, maxConcurrency: 1, stages: [{ id: 'revalidate',
        type: 'kubeclaw.audit.repository-review-revalidation', dependsOn: [],
        config: { agent: 'reviewer', reviewerModel: 'gpt-5.6-terra', profile: 'audit' },
        input: { baselineReport: await baseline(test.count), scope: { kind: 'plugin', names: ['review'], dependencyRadius: 0 },
          overrides: test.overrides }, execution: { maxAttempts: test.attempts, maxRemediationCycles: 0, timeoutMs: 15000 } }] },
      registry: granted, activated, adapters, journal: testJournal });
    const before = connections;
    const result = await runner.run(`run:review-${test.id}`);
    assert.equal(result.status, 'blocked');
    assert.equal(connections - before, test.calls, JSON.stringify(testJournal.records()));
    const attempts = testJournal.records().filter((item) => item.entry.type === 'attempt.completed');
    assert.equal(attempts.length, test.attempts);
    if (test.reason) assert.match(JSON.stringify(attempts), test.reason);
    else for (const item of attempts) assert.equal((item.entry.payload as any).outcome, 'retry');
  }

  const auditJournal = new core.FileJournal(path.join(temporary, 'audit-transport.jsonl'));
  const auditRunner = new core.PipelineRunner({ definition: { schemaVersion: 'pipeline-definition.v2',
    id: 'audit-transport', maxConcurrency: 1, stages: [{ id: 'audit', type: 'kubeclaw.audit.repository-review',
      dependsOn: [], config: { agent: 'reviewer', reviewerModel: 'gpt-5.6-terra', profile: 'audit' },
      input: { mode: 'execute', scope: { kind: 'plugin', names: ['review'], dependencyRadius: 0 },
        overrides: { maxRetries: 1, maxRetryAttemptsPerPhase: 1 } },
      execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 30000 } }] },
  registry: granted, activated, adapters, journal: auditJournal });
  const auditBefore = connections;
  const auditResult = await auditRunner.run('run:audit-transport');
  assert.equal(auditResult.status, 'blocked');
  assert.equal(connections - auditBefore, 1, 'uncertain audit dispatch must not create a second effect');
  const auditAttempts = auditJournal.records().filter((item) => item.entry.type === 'attempt.completed');
  assert.equal(auditAttempts.length, 1);
  assert.match(JSON.stringify(auditAttempts), /core.effect_reconciliation_required/u);

} finally { await adapters.shutdown(); await new Promise<void>((resolve) => unavailable.close(() => resolve())); fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, boundary: 'original-core-stage-repository-and-artifact-adapters', scopeCases: 4, mocks: 0 }));
