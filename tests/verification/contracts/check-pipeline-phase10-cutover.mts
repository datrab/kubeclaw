import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  JOB_SCHEMA,
  parseJob,
  sha256,
} from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { assertLegacyBridgeSelection } from '../../../skills/nova/core/test-gates/legacy-bridge.ts';

const inventory = JSON.parse(fs.readFileSync(
  'docs/architecture/pipeline-test-gate-unit-cutover-inventory.json', 'utf8')) as {
  schemaVersion: string;
  parityItemCount: number;
  legacyFilesToDelete: string[];
  legacyRuntimeFilesToClean: string[];
  replacementFilesRequired: string[];
  currentGuidesRequired: string[];
  legacyTokensForbidden: string[];
};
assert.equal(inventory.schemaVersion, 'pipeline-test-gate-unit-cutover-inventory.v1');
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy unit file remains: ${file}`);
for (const file of [...inventory.replacementFilesRequired, ...inventory.currentGuidesRequired]) {
  assert.equal(fs.existsSync(file), true, `required replacement surface is missing: ${file}`);
}

const parity = JSON.parse(fs.readFileSync(
  'docs/architecture/pipeline-test-gate-unit-parity-ledger.json', 'utf8')) as {
  expectedItemCount: number;
  cutover: { status: string; scope: string; phase: number; authority: string; proof: string };
  entries: Record<string, { status: string }>;
};
assert.equal(parity.expectedItemCount, inventory.parityItemCount);
assert.equal(Object.keys(parity.entries).length, inventory.parityItemCount);
assert.equal(Object.values(parity.entries).every((entry) => entry.status === 'proved'), true);
assert.deepEqual(parity.cutover, {
  status: 'complete', scope: 'source', phase: 10, authority: 'replacement-only',
  proof: 'tests/verification/contracts/check-pipeline-phase10-cutover.mts',
});

for (const file of inventory.legacyRuntimeFilesToClean) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of inventory.legacyTokensForbidden) {
    assert.equal(source.includes(token), false, `legacy unit token remains in ${file}: ${token}`);
  }
}

const bridge = JSON.parse(fs.readFileSync(
  'contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8')) as {
  suites: Record<string, { state: string; successor: string }>;
};
assert.deepEqual(bridge.suites.unit, { state: 'migrated', successor: 'kubeclaw.direct-command@1' });
const migrationStatus = JSON.parse(fs.readFileSync(
  'docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const unitStatus = migrationStatus.suites.find((item: any) => item.id === 'unit');
assert.deepEqual({ implementation: unitStatus.implementation, parity: unitStatus.parity,
  sourceCutover: unitStatus.sourceCutover, productionAcceptance: unitStatus.productionAcceptance,
  cutover: unitStatus.cutover }, { implementation: 'complete', parity: 'in-progress',
  sourceCutover: 'complete', productionAcceptance: 'pending', cutover: 'in-progress' });
assert.throws(() => assertLegacyBridgeSelection({ nodes: [] } as any, ['unit'], bridge.suites as any),
  /LEGACY_SUITE_ALREADY_MIGRATED:unit/u);

const archive = Buffer.from('archive');
const legacyJob = {
  schemaVersion: JOB_SCHEMA,
  jobId: `job:${'a'.repeat(32)}`,
  idempotencyKey: 'phase10:legacy-unit-denied',
  archive: { encoding: 'base64', sha256: sha256(archive), bytes: archive.byteLength,
    data: archive.toString('base64') },
  suites: ['unit'], testConfig: { suite_timeout_ms: 1000 }, task: {}, capabilities: [], timeoutMs: 1000,
};
assert.throws(() => parseJob(legacyJob, 1024), /BUSTER_JOB_SUITE_UNSUPPORTED/u);

const protocol = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/protocol.ts', 'utf8');
const runner = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts', 'utf8');
assert.doesNotMatch(protocol, /['"]unit['"]/u, 'legacy suite protocol still compiles unit');
assert.doesNotMatch(runner, /suites\/unit|\bunitSuite\b|\bunit:\s/u,
  'legacy suite runner still registers unit');

for (const file of [
  'skills/nova/project_setup/tools/progress-scaffold-values.ts',
  'skills/nova/project_setup/tools/progress-scaffold-discovery.ts',
  'skills/nova/project_setup/tools/progress-scaffold-test-config.ts',
]) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /unit\.test_cmd|test_config\.unit|suites\.includes\(['"]unit['"]\)|push\(['"]unit['"]\)/u,
    `project scaffold can recreate legacy unit configuration: ${file}`);
}

const scaffold = fs.readFileSync('skills/nova/project_setup/tools/progress-scaffold-discovery.ts', 'utf8');
assert.match(scaffold, /LEGACY_UNIT_CONFIGURATION_RETIRED/u,
  'project setup must reject a legacy unit request without a replacement node');
assert.match(scaffold, /kubeclaw\.direct-command@1/u,
  'project setup must recognize the explicit replacement authority');

const productionPipeline = fs.readFileSync('tests/verification/e2e/run-v2-production-pipeline.mts', 'utf8');
assert.match(productionPipeline, /test\.plan\.execute/u,
  'the production pipeline must route migrated provider plans');
assert.match(productionPipeline, /loadPipelineTestScope/u,
  'the production pipeline must load the declared provider plan');

const runtimeEntrypoint = fs.readFileSync('docker/buster-runtime-entrypoint.sh', 'utf8');
assert.match(runtimeEntrypoint, /'command\.execute'/u,
  'the deployed Buster plan runtime must allow direct-command execution');
assert.match(runtimeEntrypoint, /allowSampledProcessLimit: true/u,
  'the deployed Buster plan runtime must use the unprivileged sampled limit fallback');

const busterValues = fs.readFileSync('my-values/buster-values.yaml', 'utf8');
assert.doesNotMatch(busterValues, /BUSTER_DIRECT_COMMAND_CGROUP_ROOT|buster-command-cgroup/u,
  'the direct-command provider must not require host cgroup administration');
assert.doesNotMatch(busterValues, /^\s*(?:path|mountPath):\s*\/sys\/fs\/cgroup\s*$/mu,
  'the Buster deployment must not mount the host cgroup root');

for (const manifestPath of [
  'skills/buster/plugins/test-agent/plugin.json',
  'skills/nova/plugins/buster-quality-gate/plugin.json',
]) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    stages: Array<{ requiredCapabilities: string[] }>;
  };
  assert.equal(manifest.stages[0]?.requiredCapabilities.includes('test.plan.execute'), true,
    `${manifestPath} must execute the provider plan before its decision`);
}

const moduleGuide = fs.readFileSync('skills/nova/project_setup/module-files.md', 'utf8');
assert.doesNotMatch(moduleGuide, /unit\.ts/u, 'active setup guidance must not restore the deleted unit runner');

const unitPreflight = fs.readFileSync('tests/verification/e2e/nova-unit-production-preflight.mts', 'utf8');
assert.match(unitPreflight, /kubeclaw\.direct-command@1/u,
  'the production preflight must use the replacement provider');
assert.match(unitPreflight, /legacySuites:\s*\[\]/u,
  'the production preflight must not execute a legacy suite');
assert.match(unitPreflight, /nova-unit-production-preflight\.v2/u);
assert.match(unitPreflight, /workerRevision/u);
const deployScript = fs.readFileSync('scripts/deploy.sh', 'utf8');
assert.match(deployScript, /unit-production-receipt\.json/u);
assert.match(deployScript, /sign_and_store_production_receipt/u);

console.log(JSON.stringify({ ok: true, phase: 10, cutover: 'unit', parityItems: inventory.parityItemCount,
  legacyAuthority: 'absent', replacementAuthority: 'required' }));
