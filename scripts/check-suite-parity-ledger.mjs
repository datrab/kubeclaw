import assert from 'node:assert/strict';
import fs from 'node:fs';

const [, , baselinePath, ledgerPath] = process.argv;
assert.ok(baselinePath, 'baseline path is required');
assert.ok(ledgerPath, 'ledger path is required');

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const baselineIds = baseline.items.map((item) => item.id);
const ledgerIds = Object.keys(ledger.entries ?? {});
const sorted = (values) => [...values].sort();
const dispositions = new Set(['preserved', 'improved', 'removed-defect', 'deferred', 'blocked']);
const statuses = new Set(['planned', 'proved', 'deferred', 'blocked']);

assert.equal(ledger.schemaVersion, 'pipeline-test-gate-suite-parity-ledger.v1');
assert.equal(ledger.baseline, baselinePath);
assert.equal(ledger.expectedItemCount, baseline.expectedItemCount);
assert.equal(new Set(baselineIds).size, baselineIds.length, 'baseline IDs must be unique');
assert.equal(new Set(ledgerIds).size, ledgerIds.length, 'ledger IDs must be unique');
assert.deepEqual(sorted(ledgerIds), sorted(baselineIds), 'ledger must exactly match the baseline');
const cutoverComplete = ledger.cutover?.status === 'complete';
const acceptedDeferral = ledger.acceptedDeferral;
assert.deepEqual(ledger.authority, cutoverComplete
  ? { old: 'deleted', replacement: 'authoritative' }
  : { old: 'authoritative', replacement: 'shadow-only' });
if (cutoverComplete) {
  assert.equal(ledger.cutover.authority, 'replacement-only');
  assert.equal(typeof ledger.cutover.proof, 'string');
  assert.equal(fs.existsSync(ledger.cutover.proof), true, `cutover proof does not exist: ${ledger.cutover.proof}`);
}
if (Object.values(ledger.entries).some((entry) => entry.status === 'deferred')) {
  assert.equal(acceptedDeferral?.status, 'open', 'deferred parity requires an open accepted deferral');
  assert.equal(acceptedDeferral?.acceptedBy, 'project-owner', 'deferred parity requires project-owner acceptance');
  assert.match(acceptedDeferral?.acceptedOn ?? '', /^\d{4}-\d{2}-\d{2}$/u, 'accepted deferral requires a date');
  assert.equal(typeof acceptedDeferral?.condition, 'string', 'accepted deferral requires a closeout condition');
  assert.equal(fs.existsSync(acceptedDeferral?.proof ?? ''), true, 'accepted deferral proof does not exist');
}

for (const [id, entry] of Object.entries(ledger.entries)) {
  assert.equal(dispositions.has(entry.disposition), true, `${id} disposition is invalid`);
  assert.equal(statuses.has(entry.status), true, `${id} status is invalid`);
  assert.equal(typeof entry.rationale, 'string');
  assert.equal(entry.rationale.trim().length > 24, true, `${id} requires a useful rationale`);
  assert.equal(Array.isArray(entry.proof), true, `${id} proof must be an array`);
  assert.equal(entry.proof.length > 0, true, `${id} requires proof`);
  for (const proof of entry.proof) {
    assert.equal(typeof proof, 'string', `${id} proof path must be a string`);
    assert.equal(fs.existsSync(proof), true, `${id} proof path does not exist: ${proof}`);
  }
  if (entry.status === 'proved') assert.notEqual(entry.disposition, 'blocked', `${id} cannot be proved and blocked`);
  if (entry.status === 'deferred') {
    assert.equal(entry.disposition, 'deferred', `${id} deferred status requires a deferred disposition`);
    assert.match(entry.rationale, /await|pending|after|until/u, `${id} deferred rationale must identify the pending condition`);
  }
  if (entry.disposition === 'deferred') assert.equal(entry.status, 'deferred', `${id} deferred disposition cannot be marked proved`);
  if (entry.disposition === 'removed-defect') assert.match(id, /-DEFECT-/u, `${id} is not a baseline defect`);
}

assert.equal(Object.values(ledger.entries).every((entry) => entry.status === 'proved' || entry.status === 'deferred'), true,
  `${ledger.suite} parity closeout requires every item to be proved or explicitly deferred`);
assert.equal(Object.values(ledger.entries).some((entry) => entry.disposition === 'blocked'), false,
  `${ledger.suite} parity closeout cannot contain blocked dispositions`);

const counts = Object.values(ledger.entries).reduce((result, entry) => {
  result[entry.disposition] = (result[entry.disposition] ?? 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({ ok: true, suite: ledger.suite, parityItems: ledgerIds.length, dispositions: counts, authority: ledger.authority }));
