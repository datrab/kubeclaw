import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-container-build-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-container-build-parity-ledger.json', 'utf8'));
assert.equal(ledger.authority.legacy, 'removed');
assert.equal(ledger.authority.replacement, 'authoritative');
assert.deepEqual(ledger.productionAcceptance, {
  status: 'pending-deployment',
  reason: 'The real Nova-to-Buster BuildKit preflight must run after the current images are deployed.',
  requiredCommand: 'npm run verify:test-gate:container-build-live',
  requiredPreflight: './scripts/deploy.sh nova-buildkit-preflight',
  receipt: 'dist/verification/container-build-production-receipt.json',
});
assert.equal(ledger.items.length, 36);
assert.deepEqual(new Set(ledger.items.map((item: any) => item.id)), new Set(baseline.items.map((item: any) => item.id)));
const allowedDispositions = new Set(['preserved', 'improved', 'removed-defect']);
assert.equal(ledger.items.every((item: any) => allowedDispositions.has(item.disposition)), true);
assert.equal(ledger.items.every((item: any) => item.status === 'proved'
  && Array.isArray(item.proof) && item.proof.length > 0
  && item.proof.every((file: string) => fs.existsSync(file))), true);
assert.equal(new Set(ledger.items.map((item: any) => item.id)).size, 36);
const baselineById = new Map(baseline.items.map((item: any) => [item.id, item]));
for (const item of ledger.items) {
  const source: any = baselineById.get(item.id);
  assert(source);
  if (source.class === 'old-defect') assert.equal(item.disposition, 'removed-defect');
  else assert.notEqual(item.disposition, 'removed-defect');
}
assert.deepEqual(ledger.items.reduce((counts: any, item: any) => {
  counts[item.disposition] = (counts[item.disposition] ?? 0) + 1; return counts;
}, {}), { preserved: 10, improved: 23, 'removed-defect': 3 });

// The same committed Dockerfile fixture passes through the replacement. Before
// cutover, also prove that the deploy-coupled legacy implementation remains present.
// After cutover, retain the 36-item parity proof while requiring legacy absence.
execFileSync(process.execPath, ['tests/verification/contracts/check-pipeline-container-build-implementation.mts'], { stdio: 'pipe' });
const legacyPath = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/build.ts';
const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
if (fs.existsSync(legacyPath)) {
  const legacy = fs.readFileSync(legacyPath, 'utf8');
  assert.match(legacy, /return k8sSuite\(/u);
  assert.doesNotMatch(legacy, /startServicePortForward/u);
  assert.equal(bridge.suites.build.state, 'unmigrated');
} else assert.equal(bridge.suites.build.state, 'migrated');
assert.equal(bridge.suites.build.successor, 'kubeclaw.container-build@1');
console.log(JSON.stringify({ ok: true, phase: 'container-build-parity', items: 36,
  authority: `source-${bridge.suites.build.state}`, productionAcceptance: 'pending-deployment',
  differencesExplained: true }));
