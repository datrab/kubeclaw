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
  process.env.REAL_E2E_DEPLOYMENT_IMAGE = `registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx@sha256:${'a'.repeat(64)}`;
  try {
    fs.cpSync(new URL('./fixtures/nginx-project', import.meta.url), source, { recursive: true });
    const progress = buildProgress({ projectName, runId: 'run:production-graph' });
    writeRealE2ESwarmFiles(swarm, progress);
    fs.writeFileSync(path.join(swarm, 'progress.json'), JSON.stringify(progress));
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, '-c', 'user.name=Graph', '-c', 'user.email=graph@example.invalid', 'commit', '-qm', 'fixture']);
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
      assert.deepEqual(Object.keys(stage.input).sort(), ['gateId', 'providerPlan', 'task']);
    }
    assert.equal(fs.existsSync(path.join(swarm, 'v2-runtime/runs')), false);
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
