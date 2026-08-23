import assert from 'node:assert/strict';
import fs from 'node:fs';

const inventory = JSON.parse(fs.readFileSync(
  new URL('../../../docs/architecture/pipeline-observability-phase-5-7-a-inventory.json', import.meta.url),
  'utf8',
));

assert.equal(inventory.schemaVersion, 'pipeline-observability-inventory.v1');
assert.equal(inventory.phase, '5.7-A');
assert.ok(Array.isArray(inventory.records) && inventory.records.length >= 19);

const required = [
  'id', 'producer', 'recordClass', 'authority', 'currentTransport',
  'currentStore', 'durableOwner', 'retention', 'clawdeckView', 'status', 'gap',
];
const ids = new Set();
for (const record of inventory.records) {
  for (const field of required) {
    assert.equal(typeof record[field], 'string', `${record.id ?? 'unknown'} missing ${field}`);
    assert.ok(record[field].length > 0, `${record.id ?? 'unknown'} has empty ${field}`);
  }
  assert.ok(Array.isArray(record.sourceRefs) && record.sourceRefs.length > 0, `${record.id} missing sourceRefs`);
  for (const ref of record.sourceRefs) {
    const [file, anchor] = ref.split('#');
    const source = new URL(`../../../${file}`, import.meta.url);
    assert.ok(fs.existsSync(source), `${record.id} source missing: ${file}`);
    if (anchor) assert.ok(fs.readFileSync(source, 'utf8').includes(anchor), `${record.id} anchor missing: ${ref}`);
  }
  assert.ok(!ids.has(record.id), `duplicate inventory id: ${record.id}`);
  ids.add(record.id);
}

const expectedIds = [
  'nova.pipeline-journal', 'nova.pipeline-events', 'worker.attempt-lifecycle',
  'worker.runtime-logs', 'worker.attempt-result', 'buster.legacy-job-status',
  'buster.legacy-runtime-result', 'buster.legacy-suite-evidence',
  'test-provider.evidence', 'plugin.artifact-store', 'plugin.state-store',
  'plugin.wait-store', 'plugin.notification-projections',
  'plugin.telemetry-store', 'plugin.redis-transport',
  'openclaw.agent-events', 'application.logs-metrics-traces',
  'observability.admission', 'observability.completeness',
];
assert.deepEqual([...ids].sort(), [...expectedIds].sort(), 'producer inventory changed without an audited manifest update');

const notifications = inventory.records.find((record) => record.id === 'plugin.notification-projections');
assert.equal(notifications?.authority, 'none; derived delivery only');
assert.equal(notifications?.status, 'retain-as-derived-projection');
for (const migratedRecordId of [
  'plugin.artifact-store', 'plugin.state-store', 'plugin.wait-store', 'plugin.telemetry-store',
]) {
  const record = inventory.records.find((entry) => entry.id === migratedRecordId);
  assert.match(record?.currentStore ?? '', /durable-record/u, `${migratedRecordId} must use the shared durable-record interface`);
  assert.match(record?.status ?? '', /pipeline-cutover-complete/u, `${migratedRecordId} cutover is not recorded`);
}

assert.ok(Array.isArray(inventory.legacyDeletionTargets) && inventory.legacyDeletionTargets.length >= 5);
const deletionIds = new Set();
for (const target of inventory.legacyDeletionTargets) {
  for (const field of ['id', 'recordId', 'replacementProof', 'cutoverPhase']) {
    assert.equal(typeof target[field], 'string', `deletion target missing ${field}`);
    assert.ok(target[field].length > 0, `deletion target has empty ${field}`);
  }
  assert.ok(ids.has(target.recordId), `deletion target references unknown record: ${target.recordId}`);
  assert.ok(Array.isArray(target.sourceTargets) && target.sourceTargets.length > 0, `${target.id} has no source target`);
  for (const source of target.sourceTargets) {
    assert.equal(typeof source.path, 'string', `${target.id} source path missing`);
    assert.equal(typeof source.anchor, 'string', `${target.id} source anchor missing`);
    const file = new URL(`../../../${source.path}`, import.meta.url);
    assert.ok(fs.existsSync(file), `${target.id} source missing: ${source.path}`);
    assert.ok(fs.readFileSync(file, 'utf8').includes(source.anchor), `${target.id} anchor missing: ${source.path}#${source.anchor}`);
  }
  assert.ok(!deletionIds.has(target.id), `duplicate deletion target: ${target.id}`);
  deletionIds.add(target.id);
}

assert.ok(Array.isArray(inventory.stagePolicies) && inventory.stagePolicies.length >= 3);
const stages = new Map(inventory.stagePolicies.map((stage) => [stage.stageClass, stage]));
assert.equal(stages.get('development-work')?.incompletePolicy, 'continue-when-safe');
assert.equal(stages.get('safety-critical')?.incompletePolicy, 'stop');
assert.equal(stages.get('authoritative-final-gate')?.incompletePolicy, 'block');
assert.equal(stages.get('authoritative-final-gate')?.final, true);
for (const stage of inventory.stagePolicies) {
  assert.ok(Array.isArray(stage.requiredEvidence) && stage.requiredEvidence.length > 0);
  assert.equal(typeof stage.policyAuthority, 'string');
}

console.log(JSON.stringify({ ok: true, phase: '5.7-A', records: inventory.records.length }));
