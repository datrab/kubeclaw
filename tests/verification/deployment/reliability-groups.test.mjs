import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { selectTests, nativeTests, serviceTests } from '../../../scripts/reliability-tests.mjs';

test('CI groups cover every reliability test exactly once, including newly added core tests', () => {
  const files = fs.readdirSync('tests/verification/reliability').filter(file => /\.test\.(mts|mjs)$/.test(file));
  files.push('future-regression.test.mts');
  const groups = [...Array.from({ length: 4 }, (_, i) => selectTests(files, 'core', i + 1, 4)),
    selectTests(files, 'native'), selectTests(files, 'services')];
  assert.deepEqual(groups.flat().sort(), files.sort());
  assert.equal(new Set(groups.flat()).size, files.length);
  assert.deepEqual(groups[4], [...nativeTests].sort());
  assert.deepEqual(groups[5], [...serviceTests].sort());
  assert.throws(() => selectTests(files.filter(file => file !== nativeTests[0]), 'core'), /missing/);
  assert.throws(() => selectTests(files, 'core', 0, 4), /Invalid shard/);
});

test('real-root filesystem and fixed-UID originals run only in the native authority scope', () => {
  const files = fs.readdirSync('tests/verification/reliability').filter(file => /\.test\.(mts|mjs)$/.test(file));
  for (const name of ["buster-admission-cli.test.mjs", "buster-historical-import.test.mts", "buster-historical-identities.test.mts", "original-boot-admission.test.mts", "original-boot-metadata.test.mts", "original-initial-state.test.mts", "original-native-host.test.mjs", "pipeline-boot.test.mjs", "pipeline-role-readback.test.mjs", "buster-cluster-entrypoint.test.mjs", "pipeline-v10-input-set.test.mts"]) {
    assert.ok(selectTests(files, 'native').includes(name), `Missing real-root prerequisite: ${name}`);
    for (let shard = 1; shard <= 4; shard++) assert.ok(!selectTests(files, 'core', shard, 4).includes(name));
  }
});


test('original corpus pool diagnostic pipeline preserves failure status and complete output', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/remediation-native.yaml', 'utf8'));
  const steps = workflow.jobs.postgres.steps;
  const index = steps.findIndex(step => step.name === 'Original corpus pool interleaving and rollback acceptance');
  const step = steps[index];
  assert.equal(step.shell, 'bash');
  assert.equal(step.id, 'corpus_pool');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-pool-pipeline-'));
  try {
    const bin = path.join(temporary, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh
[ "$*" = 'run test:corpus-pool --workspace @kubeclaw/prism' ] || exit 99
printf 'original stdout\n'
printf 'original stderr\n' >&2
exit "$CORPUS_STUB_EXIT"
`, { mode: 0o755 });
    for (const exit of [0, 23]) {
      const result = spawnSync('bash', ['-c', step.run], { encoding: 'utf8', env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: temporary, CORPUS_STUB_EXIT: String(exit),
      } });
      assert.ifError(result.error);
      assert.equal(result.status, exit, result.stderr);
      assert.equal(fs.readFileSync(path.join(temporary, 'corpus-pool.log'), 'utf8'), 'original stdout\noriginal stderr\n');
    }
    // A passing original command must not hide a failed diagnostic write.
    // Use an actual directory at the log path so tee fails independently of
    // UID/DAC capabilities; do not substitute a fake tee or database result.
    const failedWrite = path.join(temporary, 'failed-write');
    fs.mkdirSync(path.join(failedWrite, 'corpus-pool.log'), { recursive: true });
    const writeFailure = spawnSync('bash', ['-c', step.run], { encoding: 'utf8', env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: failedWrite, CORPUS_STUB_EXIT: '0',
    } });
    assert.ifError(writeFailure.error);
    assert.notEqual(writeFailure.status, 0, 'log write failure must fail the diagnostic step');
    assert.ok(fs.statSync(path.join(failedWrite, 'corpus-pool.log')).isDirectory());
    const artifact = steps[index + 1];
    // An install/checkout failure does not produce a corpus log; do not add a
    // misleading upload failure before the original command was attempted.
    assert.equal(artifact.if, "${{ failure() && steps.corpus_pool.outcome == 'failure' }}");
    assert.equal(artifact.with.path, '${{ runner.temp }}/corpus-pool.log');
    assert.equal(artifact.with.name, 'corpus-pool-failure-${{ github.sha }}');
    for (const mode of ['transactions', 'worker-readiness']) {
      const original = steps.find(candidate => candidate.run === `node skills/prism/tests/native/postgres-suite.mts ${mode}`);
      assert.ok(original);
      assert.equal(original.if, '${{ !cancelled() }}');
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('workflow inventory preserves the original corpus workspace through diagnostic continuation', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-command-inventory-'));
  try {
    const inputs = new Set(['scripts/docs-inventory.mjs', 'scripts/docs-secret-inventory.mjs', 'scripts/docs-yaml-inventory.mjs']);
    for (const name of ['deploy-script', 'secret-setup', 'helm-values']) {
      const inventory = JSON.parse(fs.readFileSync(`docs/generated/inventory/${name}.json`, 'utf8'));
      for (const source of inventory.generatedFrom) inputs.add(source);
    }
    inputs.add('.github/workflows/remediation-native.yaml');
    for (const source of inputs) {
      const target = path.join(temporary, source);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    const result = spawnSync(process.execPath, ['scripts/docs-inventory.mjs'], { cwd: temporary, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(fs.readFileSync(path.join(temporary, 'docs/generated/inventory/workflows.json'), 'utf8'));
    const workflow = inventory.workflows.find(item => item.path === '.github/workflows/remediation-native.yaml');
    assert.ok(workflow.commandAndActionRefs.includes('npm run test:corpus-pool --workspace @kubeclaw/prism'));
    assert.ok(!workflow.commandAndActionRefs.includes('npm run test:corpus-pool'), 'do not document a different root-workspace command');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
