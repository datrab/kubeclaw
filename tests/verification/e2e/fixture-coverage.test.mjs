import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildProgress, normalizeRealE2ERuntimeDefaults, writeRealE2ESwarmFiles } from './real-run-workspace.mjs';
import { registryTestContract } from './registry-test-contract.mjs';

process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
process.env.REAL_E2E_DEPLOYMENT_IMAGE = 'registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';

test('actual Git baseline survives later commits and scoped resume without inventing coverage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-coverage-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  try {
    const source = path.join(root, 'Projects/scoped/src');
    const swarm = path.join(source, '.swarm');
    fs.cpSync(new URL('./fixtures/nginx-project', import.meta.url), source, { recursive: true });
    git('init', '-q'); git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'original fixture');
    const base = git('rev-parse', 'HEAD');
    const progress = buildProgress({ projectName: 'scoped', moduleIds: ['01-nginx'] });
    assert.throws(() => writeRealE2ESwarmFiles(swarm, progress), /REAL_E2E_COVERAGE_BASE_REQUIRED/u);
    progress.real_e2e.coverage_base_revision = base;
    writeRealE2ESwarmFiles(swarm, progress);
    const first = JSON.parse(fs.readFileSync(path.join(swarm, 'pipeline.json'), 'utf8'));
    assert.deepEqual(Object.keys(first.gates['final-buster'].suites.unit.add), ['command-01-nginx']);
    assert.deepEqual(first.gates['final-buster'].coverage.modules.map(module => module.moduleId), ['01-nginx']);
    const command = first.gates['final-buster'].suites.unit.add['command-01-nginx'].config;
    execFileSync(command.executable, command.args, { cwd: source, stdio: 'pipe' });
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'generated policy');
    assert.notEqual(git('rev-parse', 'HEAD'), base);
    const resumed = normalizeRealE2ERuntimeDefaults(structuredClone(progress), { scenarioId: 'approval-timeout' });
    assert.equal(resumed.real_e2e.coverage_base_revision, base);
    writeRealE2ESwarmFiles(swarm, resumed);
    const second = JSON.parse(fs.readFileSync(path.join(swarm, 'pipeline.json'), 'utf8'));
    assert.deepEqual(second.gates['final-buster'].coverage, first.gates['final-buster'].coverage);
    const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign);
    execFileSync('git', ['init', '-q', foreign]);
    fs.writeFileSync(path.join(foreign, 'contract.txt'), 'a distinct repository history');
    execFileSync('git', ['-C', foreign, 'add', '.']);
    execFileSync('git', ['-C', foreign, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'distinct repository']);
    const foreignHead = execFileSync('git', ['-C', foreign, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    git('fetch', foreign, 'HEAD');
    resumed.real_e2e.coverage_base_revision = foreignHead;
    assert.throws(() => writeRealE2ESwarmFiles(swarm, resumed));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(swarm, 'pipeline.json'), 'utf8')).gates['final-buster'].coverage, first.gates['final-buster'].coverage);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
