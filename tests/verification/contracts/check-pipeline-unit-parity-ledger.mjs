import assert from 'node:assert/strict';
import fs from 'node:fs';

const baselinePath = 'docs/architecture/pipeline-test-gate-unit-baseline.md';
const ledgerPath = 'docs/architecture/pipeline-test-gate-unit-parity-ledger.json';
const baseline = fs.readFileSync(baselinePath, 'utf8');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const baselineIds = [...baseline.matchAll(/^- `(UNIT-[A-Z]+-[0-9]{3}[A-Z]?)`:/gmu)].map((match) => match[1]);
const ledgerIds = Object.keys(ledger.entries ?? {});
const uniqueSorted = (values) => [...new Set(values)].sort();
const dispositions = new Set(['preserved', 'improved', 'removed-defect', 'deferred', 'blocked']);
const statuses = new Set(['planned', 'proved', 'blocked']);

assert.equal(ledger.schemaVersion, 'pipeline-test-gate-unit-parity-ledger.v1');
assert.equal(ledger.suite, 'unit');
assert.equal(ledger.baseline, baselinePath);
assert.equal(baselineIds.length, uniqueSorted(baselineIds).length, 'baseline IDs must be unique');
assert.equal(ledgerIds.length, uniqueSorted(ledgerIds).length, 'ledger IDs must be unique');
assert.deepEqual(uniqueSorted(ledgerIds), uniqueSorted(baselineIds), 'ledger must exactly equal the unit baseline');
assert.equal(ledger.expectedItemCount, baselineIds.length);
assert.deepEqual(ledger.productionAcceptance, {
  status: 'pending-deployment', requiredCommand: './scripts/deploy.sh nova-unit-preflight',
  receipt: 'dist/verification/unit-production-receipt.json',
});
assert.deepEqual(ledger.cutover, {
  status: 'complete',
  scope: 'source',
  phase: 10,
  authority: 'replacement-only',
  proof: 'tests/verification/contracts/check-pipeline-phase10-cutover.mts',
});

for (const [id, entry] of Object.entries(ledger.entries)) {
  assert.equal(dispositions.has(entry.disposition), true, `${id} disposition is invalid`);
  assert.equal(statuses.has(entry.status), true, `${id} status is invalid`);
  assert.equal(typeof entry.rationale, 'string');
  assert.equal(entry.rationale.trim().length > 20, true, `${id} requires a useful rationale`);
  assert.equal(Array.isArray(entry.proof), true, `${id} proof must be an array`);
  assert.equal(entry.proof.length > 0, true, `${id} requires proof`);
  for (const proof of entry.proof) {
    assert.equal(typeof proof, 'string', `${id} proof path must be a string`);
    assert.equal(fs.existsSync(proof), true, `${id} proof path does not exist: ${proof}`);
  }
  if (entry.status === 'proved') assert.notEqual(entry.disposition, 'blocked', `${id} cannot be proved and blocked`);
  if (entry.disposition === 'removed-defect') assert.match(id, /^UNIT-DEF-/u,
    `${id} removed-defect is reserved for accepted baseline defects`);
}
assert.equal(Object.values(ledger.entries).every((entry) => entry.status === 'proved'), true,
  'Phase 9 closeout requires every unit parity item to be proved');

const counts = Object.values(ledger.entries).reduce((result, entry) => {
  result.dispositions[entry.disposition] = (result.dispositions[entry.disposition] ?? 0) + 1;
  result.statuses[entry.status] = (result.statuses[entry.status] ?? 0) + 1;
  return result;
}, { dispositions: {}, statuses: {} });

console.log(JSON.stringify({ ok: true, suite: 'unit', parityItems: baselineIds.length, ...counts }));
