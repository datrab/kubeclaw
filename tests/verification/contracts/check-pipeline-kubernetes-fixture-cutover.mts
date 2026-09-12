import { registryTestContract } from '../e2e/registry-test-contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPipelineTestScope, buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { cleanupRealE2ERunWorkspace, createRealE2ERunWorkspace } from '../e2e/real-run-workspace.mjs';
import { buildScaffold } from '../../../skills/nova/project_setup/tools/progress-scaffold-discovery.ts';

const inventory = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-kubernetes-fixture-cutover-inventory.json', 'utf8'));
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy Kubernetes file remains: ${file}`);
for (const file of inventory.replacementFilesRequired) assert.equal(fs.existsSync(file), true, `replacement file is missing: ${file}`);

assert.equal(fs.existsSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'), false);
assert.equal(fs.existsSync('skills/buster/plugins/buster-suite-runtime'), false);
const status = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const suite = status.suites.find((entry: any) => entry.id === 'k8s');
assert.deepEqual({ implementation: suite.implementation, parity: suite.parity,
  sourceCutover: suite.sourceCutover, productionAcceptance: suite.productionAcceptance,
  cutover: suite.cutover }, { implementation: 'complete', parity: 'in-progress',
  sourceCutover: 'complete', productionAcceptance: 'pending', cutover: 'in-progress' });

const scaffold = fs.readFileSync('skills/nova/project_setup/tools/progress-scaffold-discovery.ts', 'utf8');
assert.match(scaffold, /LEGACY_K8S_CONFIGURATION_RETIRED/u);
assert.doesNotMatch(scaffold, /sourceImage\.match|cleanup_policy/u);
const productionRunner = fs.readFileSync('tests/verification/e2e/run-v2-production-pipeline.mts', 'utf8');
assert.doesNotMatch(productionRunner.match(/ALL_SUITES[\s\S]*?\]\);/u)?.[0] ?? '', /['"]k8s['"]/u);
const deployScript = fs.readFileSync('scripts/deploy.sh', 'utf8');
assert.match(deployScript, /nova-kubernetes-fixture-preflight/u);
const kubernetesPreflight = deployScript.match(/cmd_nova_kubernetes_fixture_preflight\(\) \{[\s\S]*?\n\}/u)?.[0] ?? '';
assert.match(kubernetesPreflight,
  /local secret_name=\$\{3:-\$\{KUBECLAW_KUBERNETES_PREFLIGHT_SECRET:-kubeclaw-fixture-preflight\}\}/u,
  'the Kubernetes fixture preflight must honor its selected Secret argument and environment fallback');
assert.match(deployScript, /kubernetes-fixture-production-receipt\.json/u);
assert.match(deployScript, /deployment\/agent-nova[\s\S]*nova-kubernetes-fixture-production-preflight\.mts/u);
assert.match(deployScript, /approved Secret copying/u);
const livePreflight = fs.readFileSync(
  'tests/verification/e2e/nova-kubernetes-fixture-production-preflight.mts', 'utf8');
assert.match(livePreflight, /kubernetes-fixture-production-preflight\.v1/u);
assert.match(livePreflight, /createProductionNovaTestGate/u);
assert.match(livePreflight, /approvedSecretCopyVerified/u);
const runtimeEntrypoint = fs.readFileSync('docker/buster-runtime-entrypoint.sh', 'utf8');
assert.match(runtimeEntrypoint, /BUSTER_ALLOWED_SOURCE_SECRETS/u);
const busterValues = fs.readFileSync('my-values/buster-values.yaml', 'utf8');
assert.match(busterValues, /BUSTER_ALLOWED_SOURCE_SECRETS/u);

const scaffoldRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubernetes-fixture-scaffold-'));
try {
  fs.mkdirSync(path.join(scaffoldRoot, '.git'));
  const projectRoot = path.join(scaffoldRoot, 'Projects', 'fixture', 'src');
  const swarmDir = path.join(projectRoot, '.swarm');
  fs.mkdirSync(path.join(swarmDir, 'buster-test'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'k8s'), { recursive: true });
  fs.writeFileSync(path.join(swarmDir, 'buster-test', 'FINAL.md'), '# Final Buster\n');
  const digest = `sha256:${'a'.repeat(64)}`;
  const sourceImage = `registry-local.kubeclaw.svc.cluster.local:5001/fixture@${digest}`;
  fs.writeFileSync(path.join(projectRoot, 'k8s', 'deployment.yaml'), `apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n        - name: fixture\n          image: ${sourceImage}\n`);
  fs.writeFileSync(path.join(swarmDir, 'progress.json'), `${JSON.stringify({ project: 'fixture', version: 1,
    description: 'fixture', notes: [], defaults: {}, execution_order: ['gate:final'], modules: {}, gates: { final: {
      type: 'buster', title: 'Final', on_fail: 'fix_and_retest', instructions_file: 'buster-test/FINAL.md',
      output_file: 'buster-test/FINAL.json', test_suites: ['k8s'], test_config: { k8s: {
        manifests: ['Projects/fixture/src/k8s/deployment.yaml'], service_name: 'fixture', port: 80,
        source_image: sourceImage,
      } },
    } } }, null, 2)}\n`);
  const scaffoldInput = { repoRoot: scaffoldRoot, project: 'fixture', swarmDir,
    scaffoldFile: path.join(swarmDir, 'progress.scaffold.json'), progressFile: path.join(swarmDir, 'progress.json'),
    pipelineFile: path.join(swarmDir, 'pipeline.json') };
  assert.throws(() => buildScaffold(scaffoldInput), /LEGACY_K8S_CONFIGURATION_RETIRED:final/u);
  fs.writeFileSync(path.join(swarmDir, 'progress.json'), `${JSON.stringify({ project: 'fixture', version: 1,
    description: 'fixture', notes: [], defaults: {}, execution_order: ['gate:final'], modules: {}, gates: { final: {
      type: 'buster', title: 'Final', on_fail: 'fix_and_retest', instructions_file: 'buster-test/FINAL.md',
      output_file: 'buster-test/FINAL.json', test_suites: [],
    } } }, null, 2)}\n`);
  fs.writeFileSync(path.join(swarmDir, 'pipeline.json'), `${JSON.stringify({ project: 'fixture', modules: {}, gates: {
    final: { tests: { 'checked-manifest': { uses: 'kubeclaw.direct-command@1' } }, fixtures: {
      'kubernetes-deployment': { uses: 'kubeclaw.kubernetes-fixture@1', config: {
        image: { reference: sourceImage, digest }, serviceName: 'fixture', servicePort: 80,
      }, inputs: { 'checked-manifest': { from: 'checked-manifest', output: 'artifact-1' } } },
    } },
  } }, null, 2)}\n`);
  const generated = buildScaffold(scaffoldInput);
  const generatedFixture = generated.pipeline.gates.final.fixtures['kubernetes-deployment'];
  assert.equal(generatedFixture.uses, 'kubeclaw.kubernetes-fixture@1');
  assert.deepEqual(generatedFixture.config.image, {
    reference: sourceImage, digest,
  });
  assert.equal(generatedFixture.inputs.image, undefined);
  assert.equal(generatedFixture.inputs['checked-manifest'].from, 'checked-manifest');
} finally {
  fs.rmSync(scaffoldRoot, { recursive: true, force: true });
}

const priorImage = process.env.REAL_E2E_DEPLOYMENT_IMAGE;
process.env.REAL_E2E_DEPLOYMENT_IMAGE = 'registry.example.test:5443/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';
const priorRegistry = process.env.KUBECLAW_REGISTRY_CONFIG;
process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
const workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
if (priorRegistry === undefined) delete process.env.KUBECLAW_REGISTRY_CONFIG; else process.env.KUBECLAW_REGISTRY_CONFIG = priorRegistry;
if (priorImage === undefined) delete process.env.REAL_E2E_DEPLOYMENT_IMAGE;
else process.env.REAL_E2E_DEPLOYMENT_IMAGE = priorImage;
try {
  const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
  assert.equal(generatedProgress.gates['final-buster'].test_suites?.includes('k8s') ?? false, false);
  assert.equal(Object.hasOwn(generatedProgress.gates['final-buster'].test_config ?? {}, 'k8s'), false);
  const scope = loadPipelineTestScope(path.join(workspace.swarmDir, 'pipeline.json'),
    { moduleId: null, gateId: 'final-buster' });
  const fixture = scope.declaration.fixtures?.['kubernetes-deployment'];
  assert.equal(fixture?.uses, 'kubeclaw.kubernetes-fixture@1');
  assert.equal(fixture?.config?.image, undefined);
  assert.deepEqual(fixture?.inputs?.image, {
    from: 'container-build', output: 'image',
  });
  assert.equal(fixture?.inputs?.['checked-manifest']?.from, 'checked-manifest');
  const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'fixture-cutover',
  } }));
  assert.equal(registry.testProviderContracts.get('kubeclaw.container-build@1')?.registration.outputs.find(port => port.name === 'image')?.schemaId, 'kubeclaw.container-image@1');
  assert.equal(registry.testProviderContracts.get('kubeclaw.kubernetes-fixture@1')?.registration.inputs.find(port => port.name === 'image')?.schemaId, 'kubeclaw.container-image@1');
  const suiteRoot = path.resolve('contracts/pipeline-test-gate/v1/suites');
  const suiteTemplates = fs.readdirSync(suiteRoot).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(path.join(suiteRoot, file), 'utf8')));
  const limits = { cpuMillis: 1800000, memoryBytes: 8 * 1024 ** 3, logBytes: 16 * 1024 ** 2,
    artifactBytes: 64 * 1024 ** 2, artifactFiles: 256, processes: 128 };
  const resolve = (declaration: typeof scope.declaration) => resolveTestPlan({
    planId: 'fixture-cutover', runId: 'fixture-cutover', project: scope.project, scope: { moduleId: null, gateId: 'final-buster' },
    createdAt: new Date().toISOString(), declaration, suiteTemplates, registry,
    facts: { changedPaths: [], moduleType: 'service', pipelineStage: 'final-buster' },
    policy: { defaultTimeoutMs: 900000, maximumTimeoutMs: 1800000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 2, maximumMatrixSize: 16, maximumNodes: 128, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: declaration.concurrencyLimits ?? {} },
  });
  const plan = resolve(scope.declaration);
  assert.deepEqual(plan.links.find(link => link.to.nodeId === 'kubernetes-deployment' && link.to.input === 'image'), {
    schemaVersion: 'typed-link.v1', kind: 'value', from: { nodeId: 'container-build', output: 'image' },
    to: { nodeId: 'kubernetes-deployment', input: 'image' }, schemaId: 'kubeclaw.container-image@1',
  });
  const wrongSchema = structuredClone(scope.declaration);
  wrongSchema.fixtures!['kubernetes-deployment']!.inputs!.image = { from: 'tailscale-exposure', output: 'exposure' };
  assert.throws(() => resolve(wrongSchema), /TEST_PLAN_LINK_SCHEMA_MISMATCH/u);

  assert.equal(scope.declaration.tests?.health?.inputs?.deployment?.from, 'kubernetes-deployment');
} finally {
  await cleanupRealE2ERunWorkspace(workspace);
}

await import('./check-pipeline-kubernetes-fixture-implementation.mts');
await import('./check-pipeline-kubernetes-fixture-parity.mts');
console.log(JSON.stringify({ ok: true, phase: 'kubernetes-fixture-cutover', authority: 'replacement-only',
  parityItems: 48, legacyDeleted: true, injectedExecutorVectors: true, nativeCluster: false }));
