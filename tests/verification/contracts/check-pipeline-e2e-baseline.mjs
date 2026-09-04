import assert from 'node:assert/strict'; import fs from 'node:fs';
const baseline=JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-e2e-baseline.json','utf8'));
assert.equal(baseline.schemaVersion,'suite-baseline.v1'); assert.equal(baseline.legacySuite,'e2e'); assert.equal(baseline.expectedItemCount,30); assert.equal(baseline.items.length,30); assert.equal(new Set(baseline.items.map((item)=>item.id)).size,30);
console.log(JSON.stringify({ok:true,phase:'e2e-baseline',items:30}));
