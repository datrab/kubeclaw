import assert from 'node:assert/strict'; import fs from 'node:fs';
const ledger=JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-visual-parity-ledger.json','utf8'));
const baseline=JSON.parse(fs.readFileSync(ledger.baseline,'utf8')); assert.equal(Object.keys(ledger.entries).length,baseline.expectedItemCount);
for(const item of baseline.items){const entry=ledger.entries[item.id];assert.ok(entry,`missing ${item.id}`);assert.equal(entry.status,'proved');assert.ok(entry.rationale.length>=20);for(const proof of entry.proof){assert.equal(fs.existsSync(proof),true,`missing proof ${proof}`);}}
console.log(JSON.stringify({ok:true,phase:'visual-parity',items:baseline.expectedItemCount}));
