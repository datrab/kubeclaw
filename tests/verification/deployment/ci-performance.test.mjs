import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { toolchainKey } from '../../../scripts/ci/toolchain.mjs';
import { stageGroups } from '../../../scripts/ci/stage-contracts.mjs';
import { timingReport, buildCacheMetrics, collectTimings } from '../../../scripts/ci/timings.mjs';

const workflow = name => YAML.parse(fs.readFileSync(`.github/workflows/${name}.yaml`, 'utf8'));
const main = workflow('build-images'), reliability = workflow('pipeline-reliability');

test('build and bundle preparation overlap tests, but every release consumer waits for gates', () => {
  assert.deepEqual(main.jobs.build.needs, ['detect-build-inputs']);
  assert.deepEqual(main.jobs['prepare-bundles'].needs, ['detect-build-inputs']);
  assert.deepEqual(main.jobs['prepare-bundles'].permissions, { contents: 'read', actions: 'read' });
  assert(!JSON.stringify(main.jobs['prepare-bundles']).includes('gh release'));
  for (const job of ['bundle-skills', 'preserve-receipts', 'prism-live-acceptance']) {
    assert(main.jobs[job].needs.includes('reliability'));
    assert(main.jobs[job].needs.includes('update-policy'));
    assert(main.jobs[job].needs.includes('build'));
  }
  assert(main.jobs['bundle-skills'].needs.includes('prepare-bundles'));
  assert.match(main.jobs['bundle-skills'].if, /needs.prepare-bundles.result == 'success'/u);
  const build = main.jobs.build.steps.find(step => step.id === 'build');
  assert.equal(build.with.provenance, 'mode=max');
  assert.equal(build.with.sbom, true);
  assert.match(build.with['build-args'], /KUBECLAW_TOOLCHAIN=.*toolchain-pin.outputs.image/u);
  assert.match(build.with['build-args'], /TRIVY_DATABASE_REFRESH=.*github.run_id/u);
});

test('all twelve original stage suites execute exactly once across required groups', () => {
  const expected = ['@kubeclaw/plugin-prism-design', '@kubeclaw/plugin-notification-observer',
    '@kubeclaw/plugin-human-approval', '@kubeclaw/plugin-project-summary', '@kubeclaw/plugin-lint',
    '@kubeclaw/plugin-implementation-agent', '@kubeclaw/plugin-buster-quality-gate',
    '@kubeclaw/plugin-runtime-dispatch', '@kubeclaw/plugin-operator-messaging',
    'skills/buster/plugins/http', 'skills/nova/plugins/delivery-lint', '@kubeclaw/plugin-review'];
  assert.deepEqual(Object.values(stageGroups).flat().map(args => args[1]).sort(), expected.sort());
  assert.deepEqual(reliability.jobs['stage-contracts'].strategy.matrix.group.sort(), Object.keys(stageGroups).sort());
  assert.deepEqual(reliability.jobs['core-reliability'].needs, ['core-source', 'core-contracts', 'stage-contracts']);
  const gate = reliability.jobs['core-reliability'].steps[0].run;
  for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
    const jobs = Object.fromEntries(['core-source', 'core-contracts', 'stage-contracts'].map(name => [name, { result: 'success' }]));
    jobs['stage-contracts'].result = result;
    assert.equal(spawnSync('bash', ['-c', gate], { env: { ...process.env, RESULTS: JSON.stringify(jobs) } }).status, result === 'success' ? 0 : 1);
  }
  const commands = Object.values(reliability.jobs).flatMap(job => job.steps ?? []).map(step => step.run ?? '').join('\n');
  for (const required of ['npm run typecheck:skills', 'npm run versions:check', 'npm run verify:reliability:contracts',
    'check-project-compiler.mts', 'production-graph-validation.test.mts', 'check-pipeline-remote-real-provider.mts',
    'check-review-bundle-tokenizer.mjs', 'check-role-chart.mjs', 'check-deployment-truth.mjs', 'helm lint charts/kubeclaw']) assert(commands.includes(required), required);
});

test('browser cache has exact platform, runner image and lock identity with no broad restores', () => {
  const steps = reliability.jobs['browser-reliability'].steps;
  const cached = steps.find(step => step.id === 'browsers');
  for (const key of ['runner.os', 'runner.arch', 'browser-key.outputs.image', "hashFiles('package-lock.json')"]) assert(cached.with.key.includes(key));
  assert.equal(cached.with['restore-keys'], undefined);
  assert(steps.some(step => step.run === 'node node_modules/playwright/cli.js install-deps chromium' && !step.if));
  assert(steps.some(step => step.run === 'node node_modules/playwright/cli.js install chromium' && step.if));
});

test('toolchain key changes for tools, defaults, platform and ignores downstream app payload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-key-'));
  try {
    fs.mkdirSync(path.join(root, 'docker'), { recursive: true });
    fs.writeFileSync(path.join(root, '.dockerignore'), 'node_modules\n');
    fs.writeFileSync(path.join(root, 'docker/lock.txt'), 'a');
    const dockerfile = 'FROM pinned AS toolchain\nCOPY docker/lock.txt /tools/lock\n# Stable tools can be supplied by a content-keyed, digest-pinned CI image.\nFROM runtime\n';
    fs.writeFileSync(path.join(root, 'docker/Dockerfile.nova'), dockerfile);
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'add', '.']);
    const key = toolchainKey(root, 'nova');
    assert.notEqual(key, toolchainKey(root, 'nova', 'linux/arm64'));
    fs.appendFileSync(path.join(root, 'docker/Dockerfile.nova'), 'COPY application /application\n');
    assert.equal(key, toolchainKey(root, 'nova'));
    fs.writeFileSync(path.join(root, 'docker/lock.txt'), 'b');
    assert.notEqual(key, toolchainKey(root, 'nova'));
    fs.writeFileSync(path.join(root, 'docker/lock.txt'), 'a');
    fs.writeFileSync(path.join(root, 'docker/Dockerfile.nova'), dockerfile.replace('pinned', 'new-pinned'));
    assert.notEqual(key, toolchainKey(root, 'nova'));
    fs.writeFileSync(path.join(root, 'docker/Dockerfile.nova'), dockerfile.replace('COPY docker/lock.txt', 'COPY docker/*.txt'));
    assert.throws(() => toolchainKey(root, 'nova'), /Unsupported toolchain input/u);
    fs.writeFileSync(path.join(root, 'docker/Dockerfile.nova'), dockerfile.replace('docker/lock.txt', 'missing'));
    assert.throws(() => toolchainKey(root, 'nova'), /Missing toolchain input/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  for (const role of ['nova', 'buster-runtime']) assert.match(toolchainKey(process.cwd(), role), /^[a-f0-9]{64}$/u);
  assert.equal(toolchainKey(process.cwd(), 'archviewer'), undefined);
});

test('timing reports count elapsed wall time, not summed parallel jobs or skipped timestamps', () => {
  const run = { run_started_at: '2026-01-01T00:00:00Z', html_url: 'run', run_attempt: 2 };
  const jobs = [{ name: 'a', started_at: '2026-01-01T00:00:05Z', completed_at: '2026-01-01T00:00:20Z', conclusion: 'success' },
    { name: 'b', started_at: '2026-01-01T00:00:05Z', completed_at: '2026-01-01T00:00:30Z', conclusion: 'success' },
    { name: 'skipped', completed_at: '2026-01-01T00:01:00Z', conclusion: 'skipped' }];
  const report = timingReport(run, jobs);
  assert.equal(report.workloadSeconds, 30);
  assert.equal(report.jobs.length, 2);
  assert.deepEqual(report.jobs.map(job => job.seconds), [15, 25]);
  assert.deepEqual(buildCacheMetrics('#1 CACHED\n#1 CACHED\n#2 exporting to GitHub Actions Cache\n#2 DONE 269.2s'),
    { cachedSteps: 1, cacheExports: [{ kind: 'gha', seconds: 269.2 }] });
});

test('timing collector paginates and requests only the current attempt', async () => {
  const urls = [];
  const request = async url => {
    urls.push(url);
    if (!url.includes('/jobs?')) return { ok: true, json: async () => ({ run_attempt: 3, run_started_at: '2026-01-01T00:00:00Z' }) };
    return { ok: true, json: async () => ({ jobs: new URL(url).searchParams.get('page') === '1' ? Array.from({ length: 100 }, () => ({ conclusion: 'skipped' })) : [] }) };
  };
  await collectTimings('owner/repo', 1, undefined, request);
  assert(urls[1].includes('/attempts/3/jobs?'));
  assert(urls[2].endsWith('page=2'));
});

test('runner skips SDK removal when capacity suffices and never accepts insufficient disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-capacity-'));
  try {
    for (const [name, body] of Object.entries({
      df: '#!/bin/bash\nif [[ "$1" == --output=avail ]]; then echo Avail; cat "$SPACE_FILE"; else echo disk; fi\n',
      sudo: '#!/bin/bash\necho "$*" >> "$CALLS"\nif [[ "${RECOVER:-}" == true ]]; then echo 40000000000 > "$SPACE_FILE"; fi\n',
    })) fs.writeFileSync(path.join(root, name), body, { mode: 0o755 });
    const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', SPACE_FILE: path.join(root, 'space'), CALLS: path.join(root, 'calls') };
    const run = () => spawnSync('bash', ['scripts/prepare-image-build-runner.sh'], { env, encoding: 'utf8' });
    fs.writeFileSync(env.SPACE_FILE, '40000000000\n');
    assert.equal(run().status, 0);
    assert.equal(fs.existsSync(env.CALLS), false);
    fs.writeFileSync(env.SPACE_FILE, '1\n');
    env.RECOVER = 'true';
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(env.CALLS, 'utf8').trim().split('\n').length, 1);
    fs.writeFileSync(env.SPACE_FILE, '1\n');
    env.RECOVER = 'false';
    assert.notEqual(run().status, 0);
    env.RUNNER_ENVIRONMENT = 'self-hosted';
    assert.notEqual(run().status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
