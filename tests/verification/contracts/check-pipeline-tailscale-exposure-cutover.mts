import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPipelineTestScope } from '@kubeclaw/nova-core';
import { cleanupRealE2ERunWorkspace, createRealE2ERunWorkspace } from '../e2e/real-run-workspace.mjs';
import { LEGACY_UNMIGRATED_SUITES, requiredCapabilitiesForSuites } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { DEPENDENCIES, EXECUTION_ORDER, validateSuiteNames } from '../../../skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts';
import { buildScaffold } from '../../../skills/nova/project_setup/tools/progress-scaffold-discovery.ts';

const inventory = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-tailscale-exposure-cutover-inventory.json', 'utf8'));
assert.equal(inventory.parityItemCount, 38);
for (const file of inventory.legacyFilesToDelete) assert.equal(fs.existsSync(file), false, `legacy file remains: ${file}`);
for (const file of inventory.replacementFilesRequired) assert.equal(fs.existsSync(file), true, `replacement file missing: ${file}`);
assert.equal(LEGACY_UNMIGRATED_SUITES.includes('tailscale-preview' as never), false);
assert.equal(EXECUTION_ORDER.includes('tailscale-preview'), false);
assert.equal(Object.hasOwn(DEPENDENCIES, 'tailscale-preview'), false);
assert.deepEqual(requiredCapabilitiesForSuites(['tailscale-preview']), []);
assert.throws(() => validateSuiteNames(['tailscale-preview']), /Invalid Buster suite request/u);
const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
assert.deepEqual(bridge.suites['tailscale-preview'], { state: 'migrated', successor: 'kubeclaw.tailscale-exposure@1' });
const status = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-suite-migration-status.json', 'utf8'));
const suiteStatus = status.suites.find((item: any) => item.id === 'tailscale-preview');
assert.deepEqual([suiteStatus.implementation, suiteStatus.parity, suiteStatus.cutover], ['complete', 'complete', 'complete']);
for (const file of ['skills/buster/plugins/buster-suite-runtime/src/protocol.ts',
  'skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts',
  'tests/verification/e2e/run-v2-production-pipeline.mts']) {
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /['"]tailscale-preview['"]/u, `${file} keeps old authority`);
}

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
process.env.REAL_E2E_DEPLOYMENT_IMAGE = `registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx@sha256:${'b'.repeat(64)}`;
const workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
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
console.log(JSON.stringify({ ok: true, phase: 'tailscale-exposure-cutover', authority: 'replacement-only',
  productionAcceptance: 'pending-deployment', mocks: 0, emulators: 0 }));
