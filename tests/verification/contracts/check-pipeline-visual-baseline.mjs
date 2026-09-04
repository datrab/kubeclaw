import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline=JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-visual-baseline.json','utf8'));
assert.equal(baseline.schemaVersion,'suite-baseline.v1'); assert.equal(baseline.legacySuite,'visual-reg');
assert.equal(baseline.successor,'kubeclaw.visual@1'); assert.equal(baseline.items.length,baseline.expectedItemCount);
assert.equal(new Set(baseline.items.map((item)=>item.id)).size,baseline.expectedItemCount);
console.log(JSON.stringify({ok:true,phase:'visual-baseline',items:baseline.expectedItemCount}));
