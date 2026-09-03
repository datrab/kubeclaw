import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-lighthouse-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json', 'utf8'));
assert.equal(ledger.expectedItemCount, baseline.expectedItemCount);
assert.deepEqual(new Set(Object.keys(ledger.entries)), new Set(baseline.items.map((item: any) => item.id)));
for (const entry of Object.values(ledger.entries) as any[]) {
  assert.equal(entry.status, 'proved'); assert.ok(entry.rationale.length > 10); assert.ok(entry.proof.length > 0);
  for (const proof of entry.proof) assert.equal(fs.existsSync(proof), true, `missing parity proof: ${proof}`);
}
assert.equal(ledger.authority.old, 'deleted'); assert.equal(ledger.authority.replacement, 'authoritative');
console.log(JSON.stringify({ ok: true, phase: 'lighthouse-parity', items: ledger.expectedItemCount, deferred: 0 }));
