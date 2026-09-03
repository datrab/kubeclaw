import assert from 'node:assert/strict';
import fs from 'node:fs';
const inventory = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-lighthouse-cutover-inventory.json', 'utf8'));
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy perf file remains: ${file}`);
for (const file of inventory.replacementFilesRequired) assert.equal(fs.existsSync(file), true, `replacement missing: ${file}`);
assert.equal(inventory.authority.state, 'replacement-only'); assert.equal(inventory.parityItemCount, 40);
for (const check of inventory.requiredAbsence) {
  assert.equal(fs.readFileSync(check.file, 'utf8').includes(check.token), false, `legacy token remains: ${check.file}:${check.token}`);
}
const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
assert.equal(bridge.suites.perf.state, 'migrated'); assert.equal(bridge.suites.perf.successor, 'kubeclaw.lighthouse@1');
const protocol = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/protocol.ts', 'utf8'); assert.doesNotMatch(protocol, /'perf'/u);
const runner = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts', 'utf8'); assert.doesNotMatch(runner, /\bperf\b/u);
const scaffold = fs.readFileSync('skills/nova/project_setup/tools/progress-scaffold-discovery.ts', 'utf8');
assert.match(scaffold, /LEGACY_PERF_CONFIGURATION_RETIRED/u); assert.match(scaffold, /kubeclaw\.lighthouse@1/u);
const workspace = fs.readFileSync('tests/verification/e2e/real-run-workspace.mjs', 'utf8'); assert.match(workspace, /uses: 'kubeclaw\.lighthouse@1'/u);
const entrypoint = fs.readFileSync('docker/buster-runtime-entrypoint.sh', 'utf8'); assert.match(entrypoint, /browser\.lighthouse/u);
const role = JSON.parse(fs.readFileSync('packaging/runtime/roles/buster.json', 'utf8')); assert.equal(role.plugins.includes('kubeclaw.lighthouse'), true);
const deploy = fs.readFileSync('scripts/deploy.sh', 'utf8'); assert.match(deploy, /cmd_nova_lighthouse_preflight/u);
const status = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const suite = status.suites.find((item: any) => item.id === 'perf'); assert.equal(suite.sourceCutover, 'complete'); assert.equal(suite.productionAcceptance, 'pending');
console.log(JSON.stringify({ ok: true, phase: 'lighthouse-cutover', authority: 'provider-plan-only' }));
