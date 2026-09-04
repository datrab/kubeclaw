import assert from 'node:assert/strict';
import fs from 'node:fs';

const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-security-parity-ledger.json', 'utf8'));
const baseline = JSON.parse(fs.readFileSync(ledger.baseline, 'utf8'));
assert.equal(Object.keys(ledger.entries).length, baseline.expectedItemCount);
for (const item of baseline.items) {
  const entry = ledger.entries[item.id];
  assert.ok(entry, `missing ${item.id}`);
  assert.equal(entry.status, 'proved');
  assert.ok(entry.rationale.length >= 20);
  assert.ok(entry.proof.length > 0);
  for (const proof of entry.proof) assert.equal(fs.existsSync(proof), true, `missing proof ${proof}`);
}

const real = fs.readFileSync('skills/buster/plugins/security-providers/tests/live-function.test.ts', 'utf8');
for (const token of ['realHttp', 'realTrivy', 'realAdvisoryDatabase', 'realImage', 'mocks: 0', 'emulators: 0']) assert.match(real, new RegExp(token));

const lintTools = fs.readFileSync('skills/nova/plugins/lint/src/engine/tool-registry-dependency-tools.ts', 'utf8');
assert.doesNotMatch(lintTools, /npm-audit|pip-audit/u, 'generic lint retained duplicate vulnerability authority');

const workspace = fs.readFileSync('tests/verification/e2e/real-run-workspace.mjs', 'utf8');
for (const id of ['security-headers', 'dependency-security', 'image-security', 'kubernetes-policy-security', 'kubernetes-runtime-security']) {
  assert.match(workspace, new RegExp(`'${id}'`), `production workspace omits ${id}`);
}
assert.doesNotMatch(workspace, /test_suites:\s*\['security'\]/u);
assert.doesNotMatch(workspace, /test_config:\s*\{[\s\S]{0,200}security:/u);
assert.match(workspace, /inputs:\s*\{\s*image:\s*\{\s*from:\s*'container-build'/u);

const remote = fs.readFileSync('tests/verification/contracts/check-pipeline-security-remote-vertical.mts', 'utf8');
for (const token of ['BusterRemotePlanService', 'createProductionNovaTestGate', 'imports/records/store.json']) assert.match(remote, new RegExp(token));

console.log(JSON.stringify({ ok: true, phase: 'security-parity', items: baseline.expectedItemCount, deferred: 0, duplicateAuthorities: 0 }));
