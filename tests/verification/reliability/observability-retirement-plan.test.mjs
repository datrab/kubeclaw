import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { planRetirement } from '../../../scripts/observability-retirement-plan.mjs';
import { digest, Inventory } from '../../../scripts/observability-retirement/files.mjs';
import { runPipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { FileObservabilityAdmissionStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import { FileDurableAttemptStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import { canonicalJson, producerRecordDigest } from '../../../contracts/pipeline-observability/v1/src/index.ts';
import { remotePlanJobId } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import { budgetFixture } from './repair-budget-fixture.mjs';

const canary = 'CANARY_PLATFORM_TOKEN_DO_NOT_PRINT';
const producer = { producerId: 'worker:one', bootId: 'boot:one', producerType: 'buster' };
const recordLimits = { maximumRecords: 100, maximumBytes: 1000000, maximumRecordBytes: 100000 };
const admissionLimits = { maximumIngressBytes: 10000, maximumRecords: 10, maximumBytes: 100000, maximumQuarantineRecords: 5, maximumQuarantineBytes: 10000 };
const attemptLimits = { maximumEvidenceObjects: 10, maximumEvidenceBytes: 100000, maximumEvidenceObjectBytes: 10000, maximumResults: 10,
  maximumClosures: 10, maximumMetadataBytes: 100000, maximumPendingEvidenceAgeMs: 3600000 };
function snapshot(root) {
  const result = {};
  const walk = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name); const stat = fs.lstatSync(file);
      if (item.isDirectory()) walk(file);
      else result[file] = { bytes: stat.size, mtime: stat.mtimeMs, hash: item.isFile() ? digest(fs.readFileSync(file)) : fs.readlinkSync(file) };
    }
  };
  walk(root); return result;
}
async function fixture(t, failures = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const f = budgetFixture(root, failures); const runId = 'run:retirement';
  const result = await runPipelineV2(f.platform, f.definition, runId);
  const target = runRoot(f.platform.storageRoot, runId);
  fs.writeFileSync(path.join(target, 'final-report.txt'), canary);
  const scope = { schemaVersion: 'observability-retirement-scope.v1', runId, novaStorageRoot: f.platform.storageRoot,
    artifactRoots: [path.join(root, 'artifacts')], telemetryRoots: [], busterStores: [] };
  return { root, f, result, runId, target, scope };
}
function inspect(f) {
  const before = snapshot(f.root); const plan = planRetirement(f.scope);
  assert.deepEqual(snapshot(f.root), before, 'planning preserves bytes, mtimes and file set');
  assert.equal(plan.executable, false); assert.equal(plan.releaseBytes, 0);
  assert.ok(plan.files.every(file => file.disposition === 'retain'));
  assert.ok(!JSON.stringify(plan).includes(canary), 'payload and diagnostic secrets are omitted');
  return plan;
}
function codes(plan) { return new Set(plan.blockers.map(item => item.code)); }

test('actual completed native Git pipeline produces a read-only inventory with original artifact references', async t => {
  const f = await fixture(t); assert.equal(f.result.status, 'succeeded');
  const plan = inspect(f);
  assert.equal(plan.run.lifecycle, 'run.succeeded');
  assert.ok(plan.run.journals.some(item => item.path.endsWith('events.jsonl') && item.records > 0));
  assert.ok(plan.references.some(item => item.ownerRunId === f.runId && item.recordDigest.startsWith('sha256:')));
  assert.ok(plan.files.some(item => item.path.endsWith('final-report.txt') && item.hash === digest(canary)));
  assert.ok(codes(plan).has('SAFE_RELEASE_OPERATION_UNIMPLEMENTED'));
  assert.ok(codes(plan).has('DURABLE_CONSUMER_CHECKPOINT_NOT_PROVEN'));
  assert.ok(!codes(plan).has('RUN_ACTIVE_OR_WAITING'));
  assert.ok(!codes(plan).has('RUN_SNAPSHOT_MISSING'));
  assert.ok(plan.run.snapshot.digest.startsWith('sha256:'));
  assert.ok(!codes(plan).has('RUN_ARTIFACT_REFERENCE_UNKNOWN'));
});

test('actual waiting run and replayable unfinished journal prefix are protected', async t => {
  const f = await fixture(t, { lint: [1, 2, 3] }); assert.equal(f.result.status, 'waiting');
  assert.ok(codes(inspect(f)).has('RUN_ACTIVE_OR_WAITING'));
  const events = path.join(f.target, 'events.jsonl');
  const first = fs.readFileSync(events, 'utf8').split('\n')[0]; fs.writeFileSync(events, `${first}\n`);
  assert.ok(codes(inspect(f)).has('RUN_ACTIVE_OR_WAITING'));
});

test('shared artifact references, missing blobs and uncertain effects block retirement', async t => {
  const f = await fixture(t);
  const root = f.scope.artifactRoots[0]; const store = new FileDurableRecordStore(root, { ...recordLimits, maximumBytes: 10000000 });
  const original = (await store.read('artifacts/test.repair-budget'))[0].payload;
  await store.append('artifacts/test.repair-budget', 'other:reference', { ...original, producer: { ...original.producer, runId: 'run:other' } });
  const effects = new FileJournal(path.join(f.target, 'effects.jsonl'));
  effects.append({ type: 'accepted', request: { idempotencyKey: 'uncertain:side-effect', payload: { token: canary } } });
  const plan = inspect(f);
  assert.ok(codes(plan).has('ARTIFACT_SHARED_WITH_OTHER_RUN')); assert.ok(codes(plan).has('EXTERNAL_EFFECT_UNCERTAIN'));
  const item = plan.references.find(ref => ref.digest === original.digest); fs.unlinkSync(item.path);
  assert.ok(codes(inspect(f)).has('ARTIFACT_BLOB_MISSING_OR_CHANGED'));
});

test('original admission and attempt stores provide bounded identity and evidence inspection', async t => {
  const f = await fixture(t); const observation = path.join(f.target, 'observability');
  const admission = new FileObservabilityAdmissionStore(path.join(observation, 'admission'), admissionLimits);
  const unsigned = { schemaVersion: 'producer-record.v1', recordId: 'record:one', producer, sequence: 1, recordType: 'attempt.completed', occurredAt: '2026-08-09T12:00:01Z',
    correlation: { pipelineRunId: f.runId, moduleId: null, gateId: null, attemptId: 'attempt:one', claimId: 'claim:one', claimGeneration: 1, traceId: null, parentEventId: null }, payload: { token: canary } };
  await admission.admit(canonicalJson({ ...unsigned, recordDigest: producerRecordDigest(unsigned) }));
  const attempts = new FileDurableAttemptStore(path.join(observation, 'attempts'), attemptLimits);
  await attempts.storeEvidence({ pipelineRunId: f.runId, attemptId: 'attempt:one', claimGeneration: 1, producer, evidenceId: 'evidence:one', type: 'log', mediaType: 'text/plain' }, Buffer.from(canary));
  const plan = inspect(f);
  assert.equal(plan.observations[0].admission.records[0].recordId, 'record:one');
  assert.ok(plan.references.some(ref => ref.evidenceId === 'evidence:one' && ref.digest === digest(canary)));
  assert.ok(!codes(plan).has('STORE_OR_SCOPE_UNVERIFIED'));
});

test('shared Buster job identities and uncertain terminal outcome remain protected', async t => {
  const f = await fixture(t); const root = path.join(f.root, 'jobs'); const runtimeRoot = path.join(f.root, 'runtime');
  fs.mkdirSync(runtimeRoot);
  const store = new FileDurableRecordStore(root, recordLimits);
  const jobId = remotePlanJobId('job:key'); const requestDigest = digest('request');
  const jobRoot = path.join(runtimeRoot, digest(jobId).slice(7)); fs.mkdirSync(jobRoot);
  await store.append('buster-plan-jobs', 'job:key', { schemaVersion: 'buster-plan-job-record.v1', job: { jobId, requestDigest, idempotencyKey: 'job:key', plan: { runId: f.runId } },
    status: { jobId, requestDigest, state: 'uncertain', error: { message: canary } } });
  f.scope.busterStores.push({ root, runtimeRoot });
  const plan = inspect(f);
  assert.equal(plan.jobs[0].jobs[0].jobId, jobId);
  assert.equal(plan.jobs[0].jobs[0].root, jobRoot);
  assert.ok(codes(plan).has('JOB_ACTIVE_OR_UNCERTAIN'));
});

test('partial tails, corrupt stores, symlinks and inventory limits fail without repair or payload leakage', async t => {
  const f = await fixture(t);
  const events = path.join(f.target, 'events.jsonl'); fs.appendFileSync(events, '{"secret":"' + canary);
  assert.ok(codes(inspect(f)).has('JOURNAL_INCOMPLETE'));
  fs.writeFileSync(path.join(f.scope.artifactRoots[0], 'records/store.json'), '{"token":"' + canary);
  assert.ok(codes(inspect(f)).has('STORE_JSON_SYNTAX_INVALID'));
  fs.symlinkSync('/etc/passwd', path.join(f.target, 'foreign'));
  assert.ok(codes(inspect(f)).has('NON_REGULAR_PATH'));
  f.scope.inventoryLimits = { maximumFiles: 1, maximumTotalBytes: 1, maximumSnapshotBytes: 1 };
  const limited = inspect(f); assert.ok(codes(limited).has('INVENTORY_BYTE_LIMIT') || codes(limited).has('INVENTORY_FILE_LIMIT'));
});

test('actual CLI emits only metadata and leaves the scope untouched', async t => {
  const f = await fixture(t); const config = path.join(f.root, 'scope.json'); fs.writeFileSync(config, JSON.stringify(f.scope));
  const before = snapshot(f.root);
  const result = spawnSync(process.execPath, ['scripts/observability-retirement-plan.mjs', config], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.ok(!result.stdout.includes(canary));
  assert.equal(JSON.parse(result.stdout).executable, false); assert.deepEqual(snapshot(f.root), before);
});


test('scope cannot invent consumer acknowledgement or authorize project deletion', async t => {
  const f = await fixture(t);
  assert.throws(() => planRetirement({ ...f.scope, consumerAcknowledged: true }), /SCOPE_FIELDS_UNKNOWN/);
  assert.throws(() => planRetirement({ ...f.scope, deleteProject: true }), /SCOPE_FIELDS_UNKNOWN/);
  assert.throws(() => planRetirement({ ...f.scope, runId: 'valid/../../outside' }), /IDENTITY_INVALID/);
});

test('filesystem snapshot changes are explicit and the inspector never repairs them', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'state.json'); fs.writeFileSync(file, '{"version":1}');
  const inventory = new Inventory(); inventory.root(root, 'test-store');
  fs.writeFileSync(file, '{"version":2}');
  assert.throws(() => inventory.json(file), /SNAPSHOT_CHANGED/);
  inventory.verifyUnchanged(); assert.ok(inventory.blockers.some(item => item.code === 'SNAPSHOT_CHANGED'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{"version":2}');
});


test('legacy roots promoted to scanned roots detect new files on final inventory', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-legacy-rescan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inventory = new Inventory();
  inventory.root(root, 'nova-legacy-candidate', false);
  inventory.root(root, 'nova-run', true);
  fs.writeFileSync(path.join(root, 'late.json'), '{}');
  inventory.verifyUnchanged();
  assert.ok(inventory.blockers.some(item => item.code === 'SNAPSHOT_CHANGED'));
});

test('root and nested directory replacement by symlink invalidates the original inventory', t => {
  for (const nested of [false, true]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-directory-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const scope = path.join(root, 'scope'); const child = nested ? path.join(scope, 'child') : scope;
    fs.mkdirSync(child, { recursive: true }); fs.writeFileSync(path.join(child, 'state.json'), '{}');
    const inventory = new Inventory(); inventory.root(scope, 'artifact-store');
    const moved = path.join(root, 'moved'); fs.renameSync(child, moved); fs.symlinkSync(moved, child);
    assert.throws(() => inventory.text(path.join(child, 'state.json')), /SNAPSHOT_CHANGED/);
    inventory.verifyUnchanged();
    assert.ok(inventory.blockers.some(item => item.code === 'SNAPSHOT_CHANGED'));
  }
});

test('original legacy resolver enforces planner byte limits before identity scanning', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-legacy-budget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runId = 'run:legacy'; const legacy = path.join(root, 'runs', 'run_legacy'); fs.mkdirSync(legacy, { recursive: true });
  const events = path.join(legacy, 'events.jsonl');
  fs.writeFileSync(events, '{}\n'.repeat(750000) + JSON.stringify({ entry: { identity: { runId } } }) + '\n');
  assert.equal(runRoot(root, runId), legacy);
  assert.throws(() => runRoot(root, runId, { maximumLegacyBytes: 16 }), /LEGACY_SCAN_BYTE_LIMIT/);
  assert.throws(() => runRoot(root, runId, { maximumLegacyBytes: 0 }), /LEGACY_SCAN_LIMIT_INVALID/);
  const report = planRetirement({ schemaVersion: 'observability-retirement-scope.v1', runId, novaStorageRoot: root,
    artifactRoots: [], telemetryRoots: [], busterStores: [], inventoryLimits: { maximumTotalBytes: 16, maximumSnapshotBytes: 16 } });
  assert.ok(codes(report).has('LEGACY_SCAN_BYTE_LIMIT'));
  assert.equal(report.run, null);
  assert.ok(!report.files.some(file => file.path === events));
  fs.writeFileSync(events, JSON.stringify({ entry: { identity: { runId } } }) + '\n');
  assert.equal(runRoot(root, runId, { maximumLegacyBytes: fs.statSync(events).size }), legacy);
  const moved = path.join(root, 'events-moved'); fs.renameSync(events, moved); fs.symlinkSync(moved, events);
  assert.throws(() => runRoot(root, runId, { maximumLegacyBytes: 1024 }));
});


test('actual CLI identifies invalid scope and JSON causes without leaking input excerpts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-cli-diagnostics-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'scope.json');
  const scope = { schemaVersion: 'observability-retirement-scope.v1', runId: 'run:cli', novaStorageRoot: root,
    artifactRoots: [], telemetryRoots: [], busterStores: [] };
  const cases = [
    [{ ...scope, unexpectedSecret: canary }, 'SCOPE_FIELDS_UNKNOWN', 'plan-retirement'],
    [{ ...scope, artifactRoots: canary }, 'EXPLICIT_STORE_SCOPE_REQUIRED', 'plan-retirement'],
    [{ ...scope, inventoryLimits: { maximumFiles: canary } }, 'INVENTORY_LIMIT_INVALID', 'plan-retirement'],
    [{ ...scope, runId: `invalid/${canary}` }, 'IDENTITY_INVALID', 'plan-retirement'],
    [{ ...scope, schemaVersion: canary }, 'SCOPE_VERSION_INVALID', 'plan-retirement'],
    ['{"secret":"' + canary, 'SCOPE_JSON_SYNTAX_INVALID', 'parse-scope'],
    ['{"secret":"' + canary + 'x'.repeat(1024 * 1024), 'SCOPE_FILE_BYTE_LIMIT', 'read-scope'],
  ];
  for (const [value, code, operation] of cases) {
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    const before = snapshot(root);
    const result = spawnSync(process.execPath, ['scripts/observability-retirement-plan.mjs', file], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), { code, operation, file, noDataChanged: true });
    assert.ok(!result.stderr.includes(canary)); assert.deepEqual(snapshot(root), before);
  }
});

test('actual CLI preserves bounded legacy scan cause in report without printing journal secrets', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retirement-cli-budget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'runs', 'run_cli'); fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'events.jsonl'), JSON.stringify({ identity: { runId: 'run:cli' }, secret: canary }) + '\n');
  const file = path.join(root, 'scope.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 'observability-retirement-scope.v1', runId: 'run:cli', novaStorageRoot: root,
    artifactRoots: [], telemetryRoots: [], busterStores: [], inventoryLimits: { maximumSnapshotBytes: 16 } }));
  const before = snapshot(root);
  const result = spawnSync(process.execPath, ['scripts/observability-retirement-plan.mjs', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.blockers.some(item => item.code === 'LEGACY_SCAN_BYTE_LIMIT' && item.subject === 'nova-run-root'));
  assert.equal(report.executable, false); assert.equal(report.releaseBytes, 0);
  assert.ok(!result.stdout.includes(canary)); assert.deepEqual(snapshot(root), before);
});


test('retirement inventory validates original current and captured legacy snapshots with the shared Core codec', async t => {
  const f = await fixture(t), file = path.join(f.target, 'run-snapshot.json');
  const original = fs.readFileSync(file), current = JSON.parse(original);
  assert.equal(current.schemaVersion, 'run-snapshot.v4');
  assert.deepEqual(current.runtimeDispatchProfile, {schemaVersion:'runtime-dispatch-profile.v1',encoding:'json-utf16-v1'});
  assert.equal(inspect(f).run.snapshot.digest, current.digest);
  // Captured old-writer bytes exercise the inventory's snapshot codec only;
  // they do not represent a replay of this fixture's graph.
  const legacy = fs.readFileSync(new URL('./fixtures/legacy-source-snapshots/ascii/run-snapshot.json', import.meta.url));
  fs.writeFileSync(file, legacy);
  assert.equal(inspect(f).run.snapshot.digest, JSON.parse(legacy).digest);
  assert.deepEqual(fs.readFileSync(file), legacy);
  for (const changed of [
    {...current, schemaVersion:'run-snapshot.v99'},
    {...current, registry:{...current.registry, corrupted:true}},
    {...current, graph:{...current.graph, schemaVersion:'execution-graph-snapshot.v99'}},
  ]) {
    fs.writeFileSync(file, JSON.stringify(changed));
    const rejected = inspect(f);
    assert.equal(rejected.run, null);
    assert.ok(codes(rejected).has('RUN_SNAPSHOT_INTEGRITY_INVALID'));
  }
  fs.writeFileSync(file, original);
  assert.equal(inspect(f).run.snapshot.digest, current.digest);
});
