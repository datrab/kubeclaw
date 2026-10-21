import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('original generator separates review records from source freshness without allowing their citation', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-source-freshness-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'checkout');
  // An independent local checkout preserves all real imports and inventories.
  // No test mutation changes the caller's checkout, Git index or worktrees.
  execFileSync('git', ['clone', '--shared', '--quiet', '--no-hardlinks', repository, root]);
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '\n/node_modules\n');
  const script = 'scripts/docs-generate.mjs';
  const original = fs.readFileSync(path.join(repository, script));
  fs.writeFileSync(path.join(root, script), original);
  assert.deepEqual(fs.readFileSync(path.join(root, script)), original);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['add', script]);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'fixture source baseline']);
  const revision = git(['rev-parse', 'HEAD']);
  const run = check => spawnSync(process.execPath,
    [script, '--only', 'plugin-configuration', '--revision', revision, ...(check ? ['--check'] : [])],
    { cwd: root, encoding: 'utf8', timeout: 60_000 });
  let result = run(false);
  assert.equal(result.status, 0, result.stderr);
  const page = path.join(root, 'docs/site/reference/plugin-configuration.md');
  const baseline = fs.readFileSync(page);
  const matrix = path.join(root, 'docs/blueprint/documentation-completion-matrix.json');
  fs.appendFileSync(matrix, '\n');
  const review = 'docs/blueprint/acceptance-evidence/freshness-fixture/review.json';
  fs.mkdirSync(path.dirname(path.join(root, review)), { recursive: true });
  fs.writeFileSync(path.join(root, review), '{}\n');
  result = run(true);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(page), baseline);

  const schema = path.join(root, 'skills/buster/plugins/api-flow/schemas/config.schema.json');
  const schemaBytes = fs.readFileSync(schema);
  fs.appendFileSync(schema, '\n');
  result = run(true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source revision does not match.*api-flow\/schemas\/config\.schema\.json/u);
  fs.writeFileSync(schema, schemaBytes);

  const executable = path.join(root, 'docs/blueprint/acceptance-evidence/freshness-fixture/producer.mjs');
  fs.writeFileSync(executable, 'console.log("not a review record");\n');
  result = run(true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source revision does not match.*producer\.mjs/u);
  fs.unlinkSync(executable);

  const inventoryFile = path.join(root, 'docs/generated/inventory/configuration-schemas.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  for (const source of [review, 'docs/blueprint/documentation-completion-matrix.json',
    'docs/blueprint/acceptance-evidence/freshness-fixture/../freshness-fixture/review.json']) {
    inventory.files[0].fields[0].meaning.evidence = source;
    fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
    result = run(false);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /completion record is not a documentation source authority/u);
    assert.deepEqual(fs.readFileSync(page), baseline, 'rejection must precede output replacement');
  }
});
