import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-a11y-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-a11y-parity-ledger.json', 'utf8'));
assert.equal(ledger.expectedItemCount, baseline.expectedItemCount);
assert.deepEqual(new Set(Object.keys(ledger.entries)), new Set(baseline.items.map((item: any) => item.id)));
assert.equal(Object.values(ledger.entries).every((entry: any) => entry.status === 'proved' && entry.proof.length > 0), true);
assert.equal(ledger.authority.old, 'deleted'); assert.equal(ledger.authority.replacement, 'authoritative');
console.log(JSON.stringify({ ok: true, phase: 'a11y-parity', items: ledger.expectedItemCount, deferred: 0 }));
