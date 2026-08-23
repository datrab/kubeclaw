import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-http-baseline.json', 'utf8'));
assert.equal(baseline.schemaVersion, 'suite-baseline.v1');
assert.equal(baseline.legacySuite, 'health');
assert.equal(baseline.successor, 'kubeclaw.http@1');
assert.equal(baseline.items.length, baseline.expectedItemCount);
assert.equal(new Set(baseline.items.map((item) => item.id)).size, baseline.expectedItemCount);
for (const item of baseline.items) {
  assert.match(item.id, /^HEALTH-[A-Z]+-[0-9]{3}$/u);
  assert.equal(item.state, 'implementation-proved');
  assert.ok(item.requirement.endsWith('.'));
}
console.log(JSON.stringify({ ok: true, suite: 'health', successor: baseline.successor, items: baseline.expectedItemCount }));
