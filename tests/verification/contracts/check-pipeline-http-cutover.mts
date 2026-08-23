import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEGACY_UNMIGRATED_SUITES, requiredCapabilitiesForSuites } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { DEPENDENCIES, EXECUTION_ORDER, validateSuiteNames } from '../../../skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts';

const inventory = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-http-cutover-inventory.json', 'utf8'));
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy HTTP file remains: ${file}`);
for (const file of inventory.replacementFilesRequired) assert.equal(fs.existsSync(file), true, `replacement file is missing: ${file}`);

assert.equal(LEGACY_UNMIGRATED_SUITES.includes('health' as never), false);
assert.equal(EXECUTION_ORDER.includes('health'), false);
assert.equal(Object.hasOwn(DEPENDENCIES, 'health'), false);
assert.equal(Object.values(DEPENDENCIES).flat().includes('health'), false);
assert.deepEqual(requiredCapabilitiesForSuites(['health']), []);
assert.throws(() => validateSuiteNames(['health']), /Invalid Buster suite request/u);

const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
assert.deepEqual(bridge.suites.health, { state: 'migrated', successor: 'kubeclaw.http@1' });
const status = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const suite = status.suites.find((entry: any) => entry.id === 'health');
assert.deepEqual([suite.implementation, suite.parity, suite.cutover], ['complete', 'complete', 'complete']);

const protocol = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/protocol.ts', 'utf8');
const runner = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts', 'utf8');
const capabilities = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/services/capabilities.ts', 'utf8');
const telemetry = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner-telemetry.ts', 'utf8');
assert.doesNotMatch(protocol, /['"]health['"]/u);
assert.doesNotMatch(runner, /suites\/health|\bhealthSuite\b|\bhealth:\s/u);
assert.doesNotMatch(capabilities, /case ['"]health['"]/u);
assert.doesNotMatch(telemetry, /suiteName === ['"]health['"]|\['health'/u);

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

await import('./check-pipeline-http-implementation.mts');
await import('./check-pipeline-http-parity.mts');
console.log(JSON.stringify({ ok: true, phase: 'http-cutover', authority: 'replacement-only',
  parityItems: 50, legacyDeleted: true, mocks: 0, wrappers: 0 }));
