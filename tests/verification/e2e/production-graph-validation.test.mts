import { coverageCheckStatuses } from '@kubeclaw/pipeline-test-gate-contract';
import { registryTestContract } from './registry-test-contract.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { buildProgress, writeRealE2ESwarmFiles } from './real-run-workspace.mjs';

// Validate the actual production graph against installed schemas; no adapters,
// agents, model outputs or provider success results are substituted.
test('production harness validates native module gates and rejects counter-based repair fixtures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'production-graph-'));
  const repo = path.join(root, 'repo');
  const projectName = 'graph-proof';
  const source = path.join(repo, 'Projects', projectName, 'src');
  const swarm = path.join(source, '.swarm');
  const oldRegistry = process.env.KUBECLAW_REGISTRY_CONFIG;
  process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
  const oldImage = process.env.REAL_E2E_DEPLOYMENT_IMAGE;
  process.env.REAL_E2E_DEPLOYMENT_IMAGE = `registry.example.test:5443/library/nginx@sha256:${'a'.repeat(64)}`;
  try {
    fs.cpSync(new URL('./fixtures/nginx-project', import.meta.url), source, { recursive: true });
    const progress = buildProgress({ projectName, runId: 'run:production-graph' });
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, '-c', 'user.name=Graph', '-c', 'user.email=graph@example.invalid', 'commit', '-qm', 'fixture']);
    progress.real_e2e.coverage_base_revision = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeRealE2ESwarmFiles(swarm, progress);
    fs.writeFileSync(path.join(swarm, 'progress.json'), JSON.stringify(progress));
    const run = () => spawnSync(process.execPath, [new URL('./run-v2-production-pipeline.mts', import.meta.url).pathname,
      '--project', projectName, '--repo', repo, '--dry-run', 'true'], { encoding: 'utf8',
      env: { ...process.env, OPENCLAW_GATEWAY_TOKEN: 'unused-dry-run', BUSTER_V2_TOKEN: 'unused-dry-run',
        BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY: 'unused-dry-run', BUSTER_GATEWAY_TOKEN: 'unused-dry-run',
        BUSTER_GATEWAY_REPOSITORY_ROOT: repo, DISCORD_WEBHOOK: 'http://127.0.0.1:9/unused',
        KUBECLAW_CAPABILITY_PROVIDERS: JSON.stringify({ buster: { agentRole: 'buster', capabilities: {
          'test.plan.execute': { adapter: 'buster-plan-v1', endpoint: 'http://127.0.0.1:9' },
          'runtime.dispatch': { adapter: 'openclaw', endpoint: 'http://127.0.0.1:9' },
        } } }) }, timeout: 30000 });
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr + valid.stdout);
    const graph = JSON.parse(fs.readFileSync(path.join(swarm, 'v2-runtime/pipeline.json'), 'utf8'));
    assert.equal(graph.maxConcurrency, 1);
    for (const stage of graph.stages.filter((stage: any) => stage.id.startsWith('buster-'))) {
      assert.equal(stage.type, 'kubeclaw.test.quality-evaluation');
      assert.deepEqual(Object.keys(stage.input).sort(), ['expectedCoverage', 'gateId', 'providerPlan', 'task']);
    }
    assert.equal(fs.existsSync(path.join(swarm, 'v2-runtime/runs')), false);
    const final = graph.stages.find((stage: any) => stage.id === 'final-buster');
    const modules = Object.keys(progress.modules);
    assert.deepEqual(final.input.expectedCoverage.modules.map((module: any) => module.moduleId), modules);
    assert.ok(coverageCheckStatuses(final.input.providerPlan.plan).every(check => check.state === 'ready'));
    const declarationPath = path.join(swarm, 'pipeline.json');
    const declaration = JSON.parse(fs.readFileSync(declarationPath, 'utf8'));
    const originalDeclaration = structuredClone(declaration);
    for (const moduleId of modules) {
      const command = declaration.gates['final-buster'].suites.unit.add[`command-${moduleId}`].config;
      assert.deepEqual(command.args, ['run', `verify:${moduleId}`]);
      execFileSync(command.executable, command.args, { cwd: source, stdio: 'pipe' });
    }
    const originalDigest = declaration.gates['final-buster'].coverage.policyDigest;
    delete declaration.gates['final-buster'].suites.unit.add['command-01-nginx'];
    fs.writeFileSync(declarationPath, JSON.stringify(declaration));
    const missing = run();
    assert.equal(missing.status, 0, missing.stderr + missing.stdout);
    const missingGraph = JSON.parse(fs.readFileSync(path.join(swarm, 'v2-runtime/pipeline.json'), 'utf8'));
    const missingFinal = missingGraph.stages.find((stage: any) => stage.id === 'final-buster');
    assert.equal(missingFinal.input.expectedCoverage.policyDigest, originalDigest);
    assert.ok(coverageCheckStatuses(missingFinal.input.providerPlan.plan).some(check => check.checkId === 'contract-01-nginx' && check.state === 'missing'));
    declaration.gates['final-buster'].suites.unit.add['command-01-nginx'] = {
      ...originalDeclaration.gates['final-buster'].suites.unit.add['command-01-nginx'], mode: 'advisory',
    };
    fs.writeFileSync(declarationPath, JSON.stringify(declaration));
    const advisory = run();
    assert.equal(advisory.status, 0, advisory.stderr + advisory.stdout);
    const advisoryGraph = JSON.parse(fs.readFileSync(path.join(swarm, 'v2-runtime/pipeline.json'), 'utf8'));
    assert.ok(coverageCheckStatuses(advisoryGraph.stages.find((stage: any) => stage.id === 'final-buster').input.providerPlan.plan)
      .some(check => check.checkId === 'contract-01-nginx' && check.state === 'advisory'));
    fs.writeFileSync(declarationPath, JSON.stringify(originalDeclaration));

    progress.modules['01-nginx'].real_e2e_command_suites = [{ kind: 'fail-once', suite: 'retry-fixture' }];
    fs.writeFileSync(path.join(swarm, 'progress.json'), JSON.stringify(progress));
    const rejected = run();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /RETRY_FIXTURE_REQUIRES_COMMITTED_DEFECT/);
  } finally {
    if (oldRegistry === undefined) delete process.env.KUBECLAW_REGISTRY_CONFIG; else process.env.KUBECLAW_REGISTRY_CONFIG = oldRegistry;
    if (oldImage === undefined) delete process.env.REAL_E2E_DEPLOYMENT_IMAGE; else process.env.REAL_E2E_DEPLOYMENT_IMAGE = oldImage;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
