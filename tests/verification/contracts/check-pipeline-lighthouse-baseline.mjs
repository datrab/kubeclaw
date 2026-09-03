import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-lighthouse-baseline.json', 'utf8'));
assert.equal(baseline.schemaVersion, 'suite-baseline.v1');
assert.equal(baseline.legacySuite, 'perf');
assert.equal(baseline.successor, 'kubeclaw.lighthouse@1');
assert.equal(baseline.items.length, baseline.expectedItemCount);
assert.equal(new Set(baseline.items.map((item) => item.id)).size, baseline.expectedItemCount);
console.log(JSON.stringify({ ok: true, phase: 'lighthouse-baseline', items: baseline.expectedItemCount }));
