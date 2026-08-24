import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-tailscale-exposure-baseline.json', 'utf8'));
assert.equal(baseline.schemaVersion, 'suite-baseline.v1');
assert.equal(baseline.legacySuite, 'tailscale-preview');
assert.equal(baseline.successor, 'kubeclaw.tailscale-exposure@1');
assert.equal(baseline.expectedItemCount, 38);
assert.equal(baseline.items.length, 38);
assert.equal(new Set(baseline.items.map((item) => item.id)).size, 38);
for (const item of baseline.items) {
  assert.match(item.id, /^TSX-[A-Z]+-[0-9]{3}$/u);
  assert.equal(item.state, 'implementation-proved');
  assert.ok(item.requirement.endsWith('.'));
}
console.log(JSON.stringify({ ok: true, suite: 'tailscale-preview', successor: baseline.successor, items: 38 }));
