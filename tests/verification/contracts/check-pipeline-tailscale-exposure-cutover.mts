import { registryTestContract } from '../e2e/registry-test-contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPipelineTestScope } from '@kubeclaw/nova-core';
import { cleanupRealE2ERunWorkspace, createRealE2ERunWorkspace } from '../e2e/real-run-workspace.mjs';
import { buildScaffold } from '../../../skills/nova/project_setup/tools/progress-scaffold-discovery.ts';

const inventory = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-tailscale-exposure-cutover-inventory.json', 'utf8'));
assert.equal(inventory.parityItemCount, 38);
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy file remains: ${file}`);
for (const file of inventory.replacementFilesRequired) assert.equal(fs.existsSync(file), true, `replacement file missing: ${file}`);
assert.equal(fs.existsSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'), false);
assert.equal(fs.existsSync('skills/buster/plugins/buster-suite-runtime'), false);
const status = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const suiteStatus = status.suites.find((item: any) => item.id === 'tailscale-preview');
assert.deepEqual({ implementation: suiteStatus.implementation, parity: suiteStatus.parity,
  sourceCutover: suiteStatus.sourceCutover, productionAcceptance: suiteStatus.productionAcceptance,
  cutover: suiteStatus.cutover }, { implementation: 'complete', parity: 'in-progress',
  sourceCutover: 'complete', productionAcceptance: 'pending', cutover: 'in-progress' });
for (const file of ['tests/verification/e2e/run-v2-production-pipeline.mts']) {
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /['"]tailscale-preview['"]/u, `${file} keeps old authority`);
}
const productionPreflight = fs.readFileSync('tests/verification/e2e/nova-tailscale-production-preflight.mts', 'utf8');
assert.match(productionPreflight, /createProductionNovaTestGate/u);
assert.match(productionPreflight, /resolveProviderCapability\(parseCapabilityProviders\(\), 'buster', 'test\.plan\.execute'\)/u);
assert.match(productionPreflight, /kubeclaw\.kubernetes-fixture@1/u);
assert.match(productionPreflight, /kubeclaw\.tailscale-exposure@1/u);
assert.match(productionPreflight, /kubeclaw\.http@1/u);
assert.match(productionPreflight, /remote-gate-imports/u);
assert.match(productionPreflight, /test-execution-graphs/u);
assert.match(productionPreflight, /remoteResult\.cleanupErrors\.length, 0/u);
assert.match(productionPreflight, /\.swarm', '\.gitkeep/u);
assert.doesNotMatch(productionPreflight, /attestProductionReceipt|sign-receipt/u);
assert.match(productionPreflight, /clusterCleanupObserved: false/u);
assert.match(productionPreflight, /busterRuntimeRevision/u);
assert.match(productionPreflight, /suite: 'tailscale-preview'/u);
assert.doesNotMatch(productionPreflight, /TailscaleExposureCapabilityInvoker|NetworkHttpCapabilityInvoker/u,
  'production acceptance must not bypass the normal provider plan');
const deployScript = fs.readFileSync('scripts/deploy.sh', 'utf8');
assert.match(deployScript, /nova-tailscale-preflight/u);
assert.match(deployScript, /kubectl wait --for=delete.*namespace/u);
assert.match(deployScript, /kubectl wait --for=delete.*busternamespacelease/u);
assert.match(deployScript, /get namespace.*--ignore-not-found/u);
assert.match(deployScript, /get busternamespacelease.*--ignore-not-found/u);
assert.match(deployScript, /production-receipt-attestation\.mjs.*verify/su);
assert.match(deployScript, /production-receipt-attestation\.mjs.*sign/su);
assert.match(deployScript, /KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE/u);
assert.match(deployScript, /\/etc\/kubeclaw\/production-receipt-authority\.pub/u);
assert.match(deployScript, /JSON\.parse\(fs\.readFileSync/u);
assert.match(deployScript, /value\.busterRuntimeRevision/u);
const migrationWorkflow = fs.readFileSync('scripts/check-suite-migration-workflow.mjs', 'utf8');
assert.match(migrationWorkflow, /productionRequiredSuites\.has\(suite\.id\).*productionAcceptance === undefined/su);
assert.match(migrationWorkflow, /productionRequiredSuites\.has\(suite\.id\).*suite\.parity === 'complete'/su);
assert.match(migrationWorkflow, /productionBusterRevision/u);
assert.match(migrationWorkflow, /productionReceiptKeyFingerprint/u);
assert.match(migrationWorkflow, /receipt identity does not match/u);
assert.match(migrationWorkflow, /before all source cutovers/u);
assert.match(migrationWorkflow, /trusted public key must be outside the repository/u);
const busterDockerfile = fs.readFileSync('docker/Dockerfile.buster-runtime', 'utf8');
assert.match(busterDockerfile, /KUBECLAW_BUILD_REVISION/u);
const imageWorkflow = fs.readFileSync('.github/workflows/build-images.yaml', 'utf8');
assert.match(imageWorkflow, /KUBECLAW_BUILD_REVISION=\$\{\{ github\.sha \}\}/u);
await import('./check-production-receipt-attestation.mjs');
const packageScripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
assert.equal(packageScripts['verify:test-gate:tailscale-exposure-live'],
  'node tests/verification/e2e/nova-tailscale-production-preflight.mts');
assert.match(packageScripts['verify:test-gate:tailscale-exposure-capability-live'],
  /check-pipeline-tailscale-exposure-live\.mts/u);

const scaffoldRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tailscale-exposure-scaffold-'));
try {
  fs.mkdirSync(path.join(scaffoldRoot, '.git'));
  const projectRoot = path.join(scaffoldRoot, 'Projects', 'fixture', 'src'); const swarmDir = path.join(projectRoot, '.swarm');
  fs.mkdirSync(path.join(swarmDir, 'buster-test'), { recursive: true });
  fs.writeFileSync(path.join(swarmDir, 'buster-test', 'FINAL.md'), '# Final\n');
  fs.writeFileSync(path.join(swarmDir, 'progress.json'), `${JSON.stringify({ project: 'fixture', version: 1, description: 'fixture',
    execution_order: ['gate:final'], modules: {}, gates: { final: { type: 'buster', title: 'Final', on_fail: 'fix_and_retest',
      instructions_file: 'buster-test/FINAL.md', output_file: 'buster-test/FINAL.json', test_suites: ['tailscale-preview'],
      test_config: { tailscale_preview: { expected_text: 'ready', max_time_seconds: 45,
        smoke_paths: ['/assets/app.js'], smoke_expected_text: { '/assets/app.js': 'bundle-ready' } } } } } }, null, 2)}\n`);
  const digest = `sha256:${'a'.repeat(64)}`;
  fs.writeFileSync(path.join(swarmDir, 'pipeline.json'), `${JSON.stringify({ project: 'fixture', modules: {}, gates: { final: {
    tests: {}, fixtures: { deployment: { uses: 'kubeclaw.kubernetes-fixture@1', config: { image: {
      reference: `registry.local/app@${digest}`, digest }, serviceName: 'web', servicePort: 80 }, inputs: {} } } } } }, null, 2)}\n`);
  const generated = buildScaffold({ repoRoot: scaffoldRoot, project: 'fixture', swarmDir,
    scaffoldFile: path.join(swarmDir, 'progress.scaffold.json'), progressFile: path.join(swarmDir, 'progress.json'),
    pipelineFile: path.join(swarmDir, 'pipeline.json') });
  assert.equal(generated.pipeline.gates.final.fixtures['tailscale-exposure'].uses, 'kubeclaw.tailscale-exposure@1');
  assert.equal(generated.pipeline.gates.final.tests['public-http-health'].uses, 'kubeclaw.http@1');
  assert.equal(generated.pipeline.gates.final.tests['public-http-health'].config.expectedText, 'ready');
  assert.equal(generated.pipeline.gates.final.tests['public-http-health'].config.requestTimeoutMs, 45_000);
  assert.equal(generated.pipeline.gates.final.tests['public-smoke-1'].config.path, '/assets/app.js');
  assert.equal(generated.pipeline.gates.final.tests['public-smoke-1'].config.expectedText, 'bundle-ready');
} finally { fs.rmSync(scaffoldRoot, { recursive: true, force: true }); }

const prior = process.env.REAL_E2E_DEPLOYMENT_IMAGE;
process.env.REAL_E2E_DEPLOYMENT_IMAGE = `registry.example.test:5443/library/nginx@sha256:${'b'.repeat(64)}`;
const priorRegistry = process.env.KUBECLAW_REGISTRY_CONFIG;
process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
const workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
if (priorRegistry === undefined) delete process.env.KUBECLAW_REGISTRY_CONFIG; else process.env.KUBECLAW_REGISTRY_CONFIG = priorRegistry;
if (prior === undefined) delete process.env.REAL_E2E_DEPLOYMENT_IMAGE; else process.env.REAL_E2E_DEPLOYMENT_IMAGE = prior;
try {
  const scope = loadPipelineTestScope(path.join(workspace.swarmDir, 'pipeline.json'), { moduleId: null, gateId: 'final-buster' });
  const exposure = scope.declaration.fixtures?.['tailscale-exposure'];
  assert.equal(exposure?.uses, 'kubeclaw.tailscale-exposure@1');
  assert.equal(exposure?.inputs?.deployment?.from, 'kubernetes-deployment');
  const http = scope.declaration.tests?.['public-http-health'];
  assert.equal(http?.uses, 'kubeclaw.http@1'); assert.equal(http?.inputs?.endpoint?.from, 'tailscale-exposure');
} finally { await cleanupRealE2ERunWorkspace(workspace); }

await import('./check-pipeline-tailscale-exposure-parity.mts');
console.log(JSON.stringify({ ok: true, phase: 'tailscale-exposure-source-cutover', authority: 'replacement-only',
  productionAcceptance: 'pending-deployment-and-live-proof', injectedExecutorVectors: true, nativeCluster: false }));
