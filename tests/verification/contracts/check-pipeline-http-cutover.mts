import assert from 'node:assert/strict';
import fs from 'node:fs';

const inventory = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-http-cutover-inventory.json', 'utf8'));
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy HTTP file remains: ${file}`);
for (const file of inventory.replacementFilesRequired) assert.equal(fs.existsSync(file), true, `replacement file is missing: ${file}`);

assert.equal(fs.existsSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'), false);
assert.equal(fs.existsSync('skills/buster/plugins/buster-suite-runtime'), false);
const status = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const suite = status.suites.find((entry: any) => entry.id === 'health');
assert.deepEqual({ implementation: suite.implementation, parity: suite.parity,
  sourceCutover: suite.sourceCutover, productionAcceptance: suite.productionAcceptance,
  cutover: suite.cutover }, { implementation: 'complete', parity: 'in-progress',
  sourceCutover: 'complete', productionAcceptance: 'pending', cutover: 'in-progress' });

for (const file of [
  'skills/nova/project_setup/tools/progress-scaffold-discovery.ts',
  'skills/nova/project_setup/tools/progress-scaffold-values.ts',
  'tests/verification/e2e/real-run-workspace.mjs',
  'tests/verification/e2e/run-v2-production-pipeline.mts',
  'tests/verification/e2e/nova-buildkit-production-preflight.mts',
]) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /test_suites\s*:\s*\[[^\]]*['"]health['"]/u, `${file} still selects the retired suite`);
}
const workspaceFixture = fs.readFileSync('tests/verification/e2e/real-run-workspace.mjs', 'utf8');
for (const field of ['health_path', 'health_retries', 'health_base_delay', 'health_timeout']) {
  assert.equal(workspaceFixture.includes(field), false, `real workspace still emits retired field ${field}`);
}
const decisions = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-decision-ledger.json', 'utf8'));
assert.equal(decisions.decisions['D-013'].state, 'implemented');
assert.equal(decisions.decisions['D-013'].targets.length > 0, true);
assert.equal(decisions.decisions['D-013'].proof.includes('tests/verification/contracts/check-pipeline-http-live.mts'), true);
assert.equal(decisions.decisions['D-013'].proof.includes('tests/verification/e2e/nova-http-production-preflight.mts'), true);
const productionPreflight = fs.readFileSync('tests/verification/e2e/nova-http-production-preflight.mts', 'utf8');
assert.match(productionPreflight, /createProductionNovaTestGate/u);
assert.match(productionPreflight, /kubeclaw\.http@1/u);
assert.match(productionPreflight, /kubeclaw\.kubernetes-fixture@1/u);
assert.match(productionPreflight, /remote-gate-imports/u);
assert.match(productionPreflight, /workerRevision/u);
assert.match(productionPreflight, /networkRequestVerified: true/u);
assert.match(productionPreflight, /suite: 'health'/u);
const deployScript = fs.readFileSync('scripts/deploy.sh', 'utf8');
assert.match(deployScript, /nova-http-preflight/u);
assert.match(deployScript, /http-production-receipt\.json/u);
assert.match(deployScript, /production-receipt-attestation\.mjs.*sign/su);
assert.match(deployScript, /production-receipt-attestation\.mjs.*verify/su);
assert.match(deployScript, /\/etc\/kubeclaw\/production-receipt-authority\.pub/u);
const migrationWorkflow = fs.readFileSync('scripts/check-suite-migration-workflow.mjs', 'utf8');
assert.match(migrationWorkflow, /receipt identity does not match/u);
assert.match(migrationWorkflow, /before all source cutovers/u);
assert.match(deployScript, /kubectl wait --for=delete "namespace\/\$namespace_name"/u);
await import('./check-production-receipt-attestation.mjs');

await import('./check-pipeline-http-implementation.mts');
await import('./check-pipeline-http-parity.mts');
console.log(JSON.stringify({ ok: true, phase: 'http-cutover', authority: 'replacement-only',
  parityItems: 50, legacyDeleted: true, mocks: 0, wrappers: 0 }));
