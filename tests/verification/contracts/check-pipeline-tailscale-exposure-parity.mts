import assert from 'node:assert/strict';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-tailscale-exposure-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json', 'utf8'));
assert.equal(baseline.items.length, 38);
assert.deepEqual(Object.keys(ledger.entries).sort(), baseline.items.map((item: any) => item.id).sort());
assert.equal(Object.values(ledger.summary).reduce((total: number, value: any) => total + Number(value), 0), 38);
for (const [id, entry] of Object.entries(ledger.entries) as [string, any][]) {
  assert.ok(['proved', 'deferred'].includes(entry.status), `${id} has no result`);
  assert.ok(['preserved', 'improved', 'removed-defect', 'deferred'].includes(entry.disposition));
  assert.ok(Array.isArray(entry.proof) && entry.proof.length > 0, `${id} has no proof`);
  for (const proof of entry.proof) assert.equal(fs.existsSync(proof), true, `${id} proof is missing: ${proof}`);
  if (entry.status === 'deferred') {
    assert.equal(entry.disposition, 'deferred'); assert.ok(entry.decision); assert.ok(entry.acceptedOn); assert.ok(entry.proof?.length);
    assert.equal(entry.proofKind, 'closeout-gate');
    assert.equal(entry.proofState, 'planned');
  } else assert.ok(typeof entry.rationale === 'string' && entry.rationale.length > 0, `${id} has no rationale`);
}
assert.equal(Object.values(ledger.entries).filter((entry: any) => entry.status === 'deferred').length, 1);
assert.equal(ledger.acceptedDeferral.proofKind, 'closeout-gate');
assert.equal(ledger.acceptedDeferral.proofState, 'planned');
assert.equal(ledger.acceptedDeferral.proof, 'tests/verification/e2e/nova-tailscale-production-preflight.mts');
await import('./check-pipeline-tailscale-exposure-implementation.mts');
console.log(JSON.stringify({ ok: true, phase: 'tailscale-exposure-parity', items: 38,
  productionAcceptance: 'pending-deployment-and-live-proof', injectedExecutorVectors: true, nativeCluster: false }));
