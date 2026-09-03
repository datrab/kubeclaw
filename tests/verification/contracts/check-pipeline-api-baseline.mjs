import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-api-baseline.json', 'utf8'));
assert.equal(baseline.schemaVersion, 'suite-baseline.v1');
assert.equal(baseline.legacySuite, 'api');
assert.equal(baseline.items.length, baseline.expectedItemCount);
assert.equal(new Set(baseline.items.map((item) => item.id)).size, baseline.expectedItemCount);
assert.equal(baseline.items.every((item) => item.state === 'implementation-proved'), true);
console.log(JSON.stringify({ ok: true, phase: 'api-baseline', items: baseline.expectedItemCount }));
