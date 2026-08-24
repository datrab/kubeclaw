import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JOB_SCHEMA, parseJob, sha256 } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { assertLegacyBridgeSelection } from '../../../skills/nova/core/test-gates/legacy-bridge.ts';

const inventory = JSON.parse(fs.readFileSync(
  'docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json', 'utf8')) as any;
assert.equal(inventory.schemaVersion, 'pipeline-test-gate-manifest-lint-cutover-inventory.v1');
assert.equal(inventory.parityItemCount, 28);
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy manifest file remains: ${file}`);
for (const file of [...inventory.replacementFilesRequired, ...inventory.currentGuidesRequired]) {
  assert.equal(fs.existsSync(file), true, `required cutover surface is missing: ${file}`);
}

const parity = JSON.parse(fs.readFileSync(
  'docs/architecture/pipeline-test-gate-manifest-lint-parity-ledger.json', 'utf8')) as any;
assert.equal(parity.expectedItemCount, inventory.parityItemCount);
assert.equal(Object.keys(parity.entries).length, inventory.parityItemCount);
assert.equal(Object.values(parity.entries).every((entry: any) => entry.status === 'proved'), true);
assert.deepEqual(parity.authority, { old: 'deleted', replacement: 'authoritative' });
assert.deepEqual(parity.cutover, {
  status: 'complete', phase: 'manifest-to-lint-cutover', authority: 'replacement-only',
  proof: 'tests/verification/contracts/check-pipeline-manifest-lint-cutover.mts',
});

for (const file of inventory.legacyRuntimeFilesToClean) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of inventory.legacyTokensForbidden) {
    assert.equal(source.includes(token), false, `legacy manifest token remains in ${file}: ${token}`);
  }
}

const bridge = JSON.parse(fs.readFileSync(
  'contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8')) as any;
assert.deepEqual(bridge.suites.manifest, { state: 'migrated', successor: 'lint:kubernetes-policy' });
assert.throws(() => assertLegacyBridgeSelection({ nodes: [] } as any, ['manifest'], bridge.suites),
  /LEGACY_SUITE_ALREADY_MIGRATED:manifest/u);

const archive = Buffer.from('archive');
assert.throws(() => parseJob({
  schemaVersion: JOB_SCHEMA,
  jobId: `job:${'a'.repeat(32)}`,
  idempotencyKey: 'manifest-cutover:legacy-denied',
  archive: { encoding: 'base64', sha256: sha256(archive), bytes: archive.byteLength,
    data: archive.toString('base64') },
  suites: ['manifest'], testConfig: { suite_timeout_ms: 1000 }, task: {}, capabilities: [], timeoutMs: 1000,
}, 1024), /BUSTER_JOB_SUITE_UNSUPPORTED/u);

const protocol = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/protocol.ts', 'utf8');
const runner = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts', 'utf8');
assert.doesNotMatch(protocol, /['"]manifest['"]/u);
assert.doesNotMatch(runner, /suites\/manifest|\bmanifestSuite\b|\bmanifest:\s/u);

const lintPolicy = JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/lint-policy.json', 'utf8'));
assert.deepEqual(lintPolicy.experimental_tools, []);
assert.equal(lintPolicy.projects.some((project: any) => project.kubernetes?.raw_manifests?.length > 0), true);
assert.equal(lintPolicy.projects.some((project: any) => project.kubernetes?.policy_packs?.length > 0), true);

const scaffold = fs.readFileSync('skills/nova/project_setup/tools/progress-scaffold-discovery.ts', 'utf8');
assert.match(scaffold, /function lintDeclaration\(/u);
assert.match(scaffold, /delete config\.manifest/u);
assert.match(scaffold, /LEGACY_MANIFEST_DEPLOYMENT_MISSING/u);
const scaffoldProof = fs.readFileSync('tests/skills/nova/project_setup/progress-scaffold.test.mjs', 'utf8');
assert.match(scaffoldProof, /migrates the legacy manifest suite into Nova lint inputs/u);
assert.match(scaffoldProof, /rejects a legacy manifest selection without an explicit deployment input/u);

const workspaceGenerator = fs.readFileSync('tests/verification/e2e/real-run-workspace.mjs', 'utf8');
assert.match(workspaceGenerator, /uses: 'kubeclaw\.lint\.full'/u);
const productionRunner = fs.readFileSync('tests/verification/e2e/run-v2-production-pipeline.mts', 'utf8');
assert.match(productionRunner, /loadPipelineLintDeclaration/u);
assert.match(productionRunner, /id: 'manifest-lint'/u);
assert.match(productionRunner, /type: 'kubeclaw\.lint\.full'/u);
assert.match(productionRunner, /id: 'operator-approval'[\s\S]*dependsOn: \['manifest-lint'\]/u);
assert.match(productionRunner, /writeRunLintPolicy/u);

const activeSetupGuide = fs.readFileSync('skills/nova/project_setup/progress-json.md', 'utf8');
assert.doesNotMatch(activeSetupGuide, /`deployment_yaml`|`secret_yaml`|`test_config\.manifest`/u);

console.log(JSON.stringify({ ok: true, cutover: 'manifest-to-lint', parityItems: 28,
  legacyAuthority: 'absent', replacementAuthority: 'nova-lint',
  projectScaffolding: 'explicit', productionStage: 'authoritative' }));
