import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';
import { balancedShards, selectTests } from '../../../scripts/reliability-tests.mjs';
const read = name => YAML.parse(fs.readFileSync(`.github/workflows/${name}.yaml`, 'utf8'));

test('superseded PRs cancel per workflow but main and reusable callers cannot cancel one another', () => {
  const groups = [];
  for (const file of ['pipeline-reliability', 'role-images', 'update-checks', 'remediation-native', 'docs-checks', 'build-ops-mcp']) {
    const { concurrency } = read(file);
    assert.equal(concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}");
    assert(concurrency.group.includes('github.workflow'));
    assert(concurrency.group.includes(`-ci-${file}-`));
    assert(concurrency.group.includes('github.event.pull_request.number || github.run_id'));
    groups.push(concurrency.group);
  }
  assert.equal(new Set(groups).size, groups.length);
  assert.equal(read('build-images').jobs.build.strategy['max-parallel'], 4);
  assert.equal(read('role-images').jobs.image.strategy['max-parallel'], 4);
});

test('longest-first sharding balances weighted work without losing future or unknown files', () => {
  const weights = { a: 100, b: 90, c: 80, d: 70, e: 10, f: 10, g: 10, h: 10 };
  const files = Object.keys(weights);
  const bins = balancedShards(files, 4, weights);
  assert.deepEqual(bins.flat().sort(), files.sort());
  assert.deepEqual(balancedShards([...files].reverse(), 4, weights), bins);
  const loads = bins.map(bin => bin.reduce((n, file) => n + weights[file], 0));
  assert(Math.max(...loads) - Math.min(...loads) <= 10);
  assert.equal(balancedShards([...files, 'future'], 4, weights).flat().filter(file => file === 'future').length, 1);
  assert.throws(() => balancedShards(files, 0, weights), /Invalid shard/);
  assert.throws(() => balancedShards(files, 4, { a: -1 }), /Invalid reliability weight/);
  const actual = fs.readdirSync('tests/verification/reliability').filter(file => /\.test\.(mts|mjs)$/u.test(file));
  const current = Array.from({ length: 4 }, (_, i) => selectTests(actual, 'core', i + 1, 4)).flat();
  assert.equal(new Set(current).size, current.length);
});

test('the real reporter preserves test failure exit status and records per-file timing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-reporter-'));
  try {
    const output = path.join(root, 'timings.json');
    const fixture = path.join(root, 'fixture.test.mjs');
    for (const failed of [false, true]) {
      fs.writeFileSync(fixture, `import test from 'node:test'; import assert from 'node:assert/strict'; test('parent', async t => { await t.test('nested', () => assert.equal(${failed}, false)); });\n`);
      const env = { ...process.env, KUBECLAW_RELIABILITY_TIMINGS: output };
      delete env.NODE_TEST_CONTEXT; // launch an actual independent CLI runner, not a nested worker
      const result = spawnSync(process.execPath, ['--test', '--test-reporter=./scripts/ci/reliability-reporter.mjs', fixture], { encoding: 'utf8', env });
      assert.equal(result.status, failed ? 1 : 0, result.stderr);
      const measured = JSON.parse(fs.readFileSync(output, 'utf8')).files;
      assert.deepEqual(Object.keys(measured), ['fixture.test.mjs']);
      assert(measured['fixture.test.mjs'].seconds > 0);
      assert.equal(measured['fixture.test.mjs'].success, !failed);
      assert(result.stdout.includes('CI_FILE_TIMING'));
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('all three image proofs start independently and failure of any proof rejects acceptance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-image-proofs-'));
  try {
    fs.writeFileSync(path.join(root, 'docker'), `#!/bin/bash
if [[ "$1" != run ]]; then exit 0; fi
mode="\${!#}"
printf '%s\\n' "$*" >> "$PROOF_TEST_DIR/commands"
touch "$PROOF_TEST_DIR/$mode"
for ((i=0; i<100; i++)); do
  if [[ -f "$PROOF_TEST_DIR/plugins" && -f "$PROOF_TEST_DIR/tools" && -f "$PROOF_TEST_DIR/runtime" ]]; then
    if [[ "$FAIL_PROOF" == "$mode" ]]; then exit 42; fi
    exit 0
  fi
  sleep 0.01
done
exit 43
`, { mode: 0o755 });
    for (const fail of ['', 'plugins', 'tools', 'runtime']) {
      const state = path.join(root, fail || 'success'); fs.mkdirSync(state);
      const result = spawnSync('bash', ['scripts/check-built-runtime-image.sh', 'nova', `example/image@sha256:${'a'.repeat(64)}`], {
        encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, PROOF_TEST_DIR: state, FAIL_PROOF: fail },
      });
      assert.equal(result.status, fail ? 1 : 0, result.stdout + result.stderr);
      for (const mode of ['plugins', 'tools', 'runtime']) assert(fs.existsSync(path.join(state, mode)));
      const commands = fs.readFileSync(path.join(state, 'commands'), 'utf8').trim().split('\n');
      assert.equal(commands.length, 3);
      for (const command of commands) { assert(command.includes('--network none')); assert(command.includes('--pull never')); }
      assert.equal(commands.filter(command => command.includes('--user 0')).length, 2);
      assert.equal((result.stdout.match(/IMAGE_PROOF /gu) ?? []).length, 3);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('cache comparison uses separate remote namespaces and a fresh warm builder, never releases', () => {
  const caller = read('cache-benchmark'), worker = read('cache-benchmark-case');
  assert.deepEqual(caller.jobs.gha.strategy.matrix.profile, ['gha-min', 'gha-max']);
  assert.equal(caller.jobs.gha.strategy['max-parallel'], 1);
  assert.equal(caller.permissions.packages, undefined);
  assert.equal(caller.jobs.registry.permissions.packages, 'write');
  assert(caller.jobs.registry.if.includes("github.ref == 'refs/heads/main'"));
  assert(caller.jobs.registry.if.includes("github.event_name != 'pull_request'"));
  const steps = worker.jobs.measure.steps;
  const cold = steps.find(step => step.name === 'Cold cache-only build');
  const warm = steps.find(step => step.name === 'Warm cache-only build');
  assert.equal(cold.with.outputs, 'type=cacheonly');
  assert.equal(warm.with.outputs, 'type=cacheonly');
  assert.equal(cold.with['cache-from'], undefined);
  assert.equal(warm.with['cache-from'], '${{ steps.cache.outputs.from }}');
  assert.notEqual(cold.with.builder, warm.with.builder);
  assert.equal(cold.with['build-args'], warm.with['build-args']);
  assert.equal(steps.filter(step => step.uses?.startsWith('docker/setup-buildx-action@')).length, 2);
  assert(!JSON.stringify(worker).includes('gh release'));
  assert(!JSON.stringify(worker).includes('candidate-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-cache-profile-'));
  try {
    for (const profile of ['gha-min', 'gha-max', 'registry-max']) {
      const output = path.join(root, profile);
      const result = spawnSync(process.execPath, ['scripts/ci/cache-profile.mjs', 'buster-gateway', profile, 'bench-123-1'], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_REPOSITORY_OWNER: 'owner' } });
      assert.equal(result.status, 0, result.stderr);
      const value = fs.readFileSync(output, 'utf8');
      assert(value.includes('bench-123-1'));
      assert(value.includes('ignore-error=false'));
      if (profile === 'registry-max') assert(value.includes('ghcr.io/owner/kubeclaw-buster-gateway:build-cache-bench-123-1-amd64'));
      assert(!value.includes('kubeclaw-buster-gateway:candidate'));
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
