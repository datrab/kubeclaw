import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '../..');

function write(root, relative, value) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function run(root, args = []) {
  return execFileSync(process.execPath, ['scripts/docs-parity-batches.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function setup(patterns = ['^docs/old/.+\\.md$']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-batches-'));
  write(root, 'scripts/docs-parity-batches.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/docs-parity-batches.mjs'), 'utf8'));
  write(root, 'docs/config/documentation-parity-batches.json', `${JSON.stringify({
    schemaVersion: 'kubeclaw-documentation-parity-batches.v1',
    purpose: 'fixture',
    sourceSetAuthorityRevision: 'a'.repeat(40),
    sourceSetAuthoritySha256: 'b'.repeat(64),
    batches: [{ id: 'first-batch', owner: 'owner', patterns }],
  }, null, 2)}\n`);
  write(root, 'docs/config/documentation-tree-classification.json', `${JSON.stringify({
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1',
    files: [{
      path: 'docs/_legacy-source/old/example.md',
      class: 'legacy-extraction-source',
      originalPath: 'docs/old/example.md',
      expectedPath: 'docs/_legacy-source/old/example.md',
      introducedAfterBaseline: false,
    }],
  }, null, 2)}\n`);
  return root;
}

test('generates and checks one exact assignment', () => {
  const root = setup();
  run(root);
  assert.match(run(root, ['--check']), /1 sources in 1 batches/u);
});

test('rejects an extraction source without a batch', () => {
  const root = setup(['^docs/other/']);
  assert.throws(() => run(root), /matched none/u);
});

test('rejects an extraction source in two batches', () => {
  const root = setup();
  const configPath = path.join(root, 'docs/config/documentation-parity-batches.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.batches.push({ id: 'second-batch', owner: 'other-owner', patterns: ['example\\.md$'] });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  assert.throws(() => run(root), /matched first-batch, second-batch/u);
});

test('check mode rejects stale output', () => {
  const root = setup();
  run(root);
  fs.appendFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-batches.json'), 'stale\n');
  assert.throws(() => run(root, ['--check']), /is stale/u);
});

test('rejects duplicate classification paths and original identities', () => {
  const duplicatePath = setup();
  const classificationPath = path.join(duplicatePath, 'docs/config/documentation-tree-classification.json');
  const classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
  classification.files.push({ ...classification.files[0], originalPath: 'docs/old/other.md' });
  fs.writeFileSync(classificationPath, `${JSON.stringify(classification, null, 2)}\n`);
  assert.throws(() => run(duplicatePath), /duplicate path/u);

  const duplicateOriginal = setup();
  const secondPath = path.join(duplicateOriginal, 'docs/config/documentation-tree-classification.json');
  const second = JSON.parse(fs.readFileSync(secondPath, 'utf8'));
  second.files.push({ ...second.files[0], path: 'docs/_legacy-source/old/other.md',
    expectedPath: 'docs/_legacy-source/old/other.md' });
  fs.writeFileSync(secondPath, `${JSON.stringify(second, null, 2)}\n`);
  assert.throws(() => run(duplicateOriginal), /duplicate originalPath/u);
});

test('rejects symlinked output files and output ancestors without touching external files', () => {
  const output = setup();
  const outsideOutput = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-batches-output-')), 'outside.json');
  fs.writeFileSync(outsideOutput, 'external\n');
  const outputPath = path.join(output, 'docs/generated/inventory/documentation-parity-batches.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.symlinkSync(outsideOutput, outputPath);
  assert.throws(() => run(output), /symlinks are not allowed/u);
  assert.equal(fs.readFileSync(outsideOutput, 'utf8'), 'external\n');

  const ancestor = setup();
  const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-batches-ancestor-'));
  fs.mkdirSync(path.join(ancestor, 'docs/generated'), { recursive: true });
  fs.symlinkSync(outsideDirectory, path.join(ancestor, 'docs/generated/inventory'));
  assert.throws(() => run(ancestor), /symlinks are not allowed/u);
  assert.deepEqual(fs.readdirSync(outsideDirectory), []);
});
