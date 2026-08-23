import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-kubernetes-fixture-baseline.json', 'utf8'));
assert.equal(baseline.schemaVersion, 'suite-baseline.v1');
assert.equal(baseline.legacySuite, 'k8s');
assert.equal(baseline.successor, 'kubeclaw.kubernetes-fixture@1');
assert.equal(baseline.items.length, baseline.expectedItemCount);
assert.equal(new Set(baseline.items.map((item) => item.id)).size, baseline.expectedItemCount);
for (const item of baseline.items) {
  assert.match(item.id, /^K8S-[A-Z]+-[0-9]{3}$/u);
  assert.equal(item.state, 'implementation-proved');
  assert.ok(item.requirement.endsWith('.'));
}
console.log(JSON.stringify({ ok: true, suite: 'k8s', successor: baseline.successor, items: baseline.expectedItemCount }));
