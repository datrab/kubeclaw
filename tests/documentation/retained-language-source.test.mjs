import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildRetainedLanguageBundle } from '../../scripts/lib/docs-retained-language-bundle.mjs';
import { assertEditorialSourceRevision, loadRetainedConfigurationSnapshot, retainedConfigurationInputs,
  storeRetainedLanguageBundle, assertRetainedPageDestinations, writeRetainedPage } from '../../scripts/lib/docs-retained-source.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retained-language-source-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'repo');
  fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  const write = (relative, value) => {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, value);
  };
  const commit = () => {
    git('add', '.');
    // Synthetic, owned unit-test history, not a Reader or product commit.
    git('-c', 'user.name=Retained Source Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-m', 'Synthetic retained-source fixture');
    return git('rev-parse', 'HEAD');
  };
  write('scripts/owner.mjs', 'export const selected = "historical";\n');
  const sourceRevision = commit();
  for (const [name, filename] of Object.entries(retainedConfigurationInputs)) {
    write(filename, JSON.stringify({ name, unknown: { retained: true } }));
  }
  write('docs/generated/inventory/documentation-source-revision.json', JSON.stringify({ revision: sourceRevision }));
  const artifactRevision = commit();
  return { directory, root, sourceRevision, artifactRevision, git, write, commit };
}

test('retained inputs come from complete immutable Git objects, not mutable working inventories', t => {
  const f = fixture(t);
  f.write(retainedConfigurationInputs.runtimeInputs, '{"forged":true}');
  const snapshot = loadRetainedConfigurationSnapshot(f);
  assert.deepEqual(snapshot.inventories.runtimeInputs, { name: 'runtimeInputs', unknown: { retained: true } });
  assert.equal(snapshot.readSourceText('scripts/owner.mjs'), 'export const selected = "historical";\n');
  assert.equal(snapshot.provenance.completeNonGeneratedSourceTreeEqual, true);
  assert.equal(snapshot.provenance.currentQualificationGranted, false);
  const inputs = snapshot.inputManifest();
  assert.equal(inputs.length, 7);
  assert(inputs.every(input => /^[a-f0-9]{64}$/u.test(input.sha256) && input.bytes > 0));
  assert.throws(() => snapshot.readSourceText('../owner.mjs'), /PATH_INVALID/u);
  assert.throws(() => snapshot.readArtifactJson('docs/blueprint/documentation-completion-matrix.json'), /NOT_AUTHORITY/u);
});

test('a different source lock or changed artifact source cannot be relabelled as the old snapshot', t => {
  const f = fixture(t);
  assert.throws(() => loadRetainedConfigurationSnapshot({ ...f, sourceRevision: f.artifactRevision }), /LOCK_MISMATCH/u);
  f.write('scripts/owner.mjs', 'export const selected = "changed";\n');
  const changed = f.commit();
  assert.throws(() => loadRetainedConfigurationSnapshot({ ...f, artifactRevision: changed }), /SOURCE_TREE_MISMATCH/u);
});

test('tracked symlinks cannot supply retained JSON or source authorities', t => {
  const f = fixture(t);
  const selected = path.join(f.root, retainedConfigurationInputs.runtimeInputs);
  fs.unlinkSync(selected);
  fs.symlinkSync('configuration-values.json', selected);
  const artifactRevision = f.commit();
  assert.throws(() => loadRetainedConfigurationSnapshot({ ...f, artifactRevision }), /REGULAR_TRACKED_INPUT_REQUIRED/u);
});

test('ordinary current editorial source-first guards reject changed and untracked code', t => {
  const f = fixture(t);
  assert.equal(assertEditorialSourceRevision(f.root, f.artifactRevision), f.root);
  f.write('scripts/untracked.mjs', 'export const extra = true;\n');
  assert.throws(() => assertEditorialSourceRevision(f.root, f.artifactRevision), /EDITORIAL_SOURCE_DRIFT/u);
  fs.unlinkSync(path.join(f.root, 'scripts/untracked.mjs'));
  f.write('scripts/owner.mjs', 'export const changed = true;\n');
  assert.throws(() => assertEditorialSourceRevision(f.root, f.artifactRevision), /EDITORIAL_SOURCE_DRIFT/u);
});

test('bundle check and failed validation do not write output or canonical inventory', t => {
  const f = fixture(t);
  const output = path.join(f.directory, 'view.json');
  const bundle = { retained: true, facts: [1, 2], qualification: 'historical only' };
  const canonicalBefore = fs.readFileSync(path.join(f.root, retainedConfigurationInputs.runtimeInputs));
  assert.throws(() => storeRetainedLanguageBundle({ root: f.root, output, bundle, checkOnly: true }), /BUNDLE_DRIFT/u);
  assert.equal(fs.existsSync(output), false);
  const written = storeRetainedLanguageBundle({ root: f.root, output, bundle });
  const before = fs.readFileSync(output);
  const checked = storeRetainedLanguageBundle({ root: f.root, output, bundle, checkOnly: true });
  assert.equal(checked.sha256, written.sha256);
  assert.throws(() => storeRetainedLanguageBundle({ root: f.root, output, bundle: { changed: true }, checkOnly: true }), /BUNDLE_DRIFT/u);
  assert.deepEqual(fs.readFileSync(output), before);
  assert.deepEqual(fs.readFileSync(path.join(f.root, retainedConfigurationInputs.runtimeInputs)), canonicalBefore);
  assert.throws(() => storeRetainedLanguageBundle({ root: f.root,
    output: path.join(f.root, retainedConfigurationInputs.runtimeInputs), bundle }), /OUTSIDE_CHECKOUT/u);
  assert.equal(fs.readdirSync(f.directory).some(name => name.includes('.stage-')), false);
});

test('retained page preflight rejects symlink and hardlink aliases before writing either page', t => {
  const { root } = fixture(t);
  const paths = ['docs/site/reference/helm-values.md', 'docs/site/reference/environment-variables.md'];
  const parent = path.join(root, 'docs/site/reference');
  fs.mkdirSync(parent, { recursive: true });
  const target = path.join(root, 'docs/generated/inventory/configuration-values.json');
  const original = fs.readFileSync(target);
  const page = path.join(root, paths[1]);
  fs.symlinkSync(target, page);
  assert.throws(() => assertRetainedPageDestinations(root, paths), /UNALIASED_REGULAR/);
  assert.deepEqual(fs.readFileSync(target), original);
  assert(!fs.existsSync(path.join(root, paths[0])));
  fs.unlinkSync(page);
  fs.linkSync(target, page);
  assert.throws(() => assertRetainedPageDestinations(root, paths), /UNALIASED_REGULAR/);
  fs.unlinkSync(page);
  assertRetainedPageDestinations(root, paths);
  writeRetainedPage(page, 'complete page');
  assert.equal(fs.readFileSync(page, 'utf8'), 'complete page');
  assert.deepEqual(fs.readFileSync(target), original);
  assert(!fs.readdirSync(parent).some(name => name.includes('.stage-')));
  fs.renameSync(parent, parent + '-real');
  fs.symlinkSync(parent + '-real', parent);
  assert.throws(() => assertRetainedPageDestinations(root, paths), /PARENT_MUST_BE_PHYSICAL/);
});

test('the executing editorial owner cannot attest another checkout source tree', t => {
  const { root } = fixture(t);
  assert.throws(() => buildRetainedLanguageBundle({ root,
    editorialRevision: 'ae67b6204435bb104e00d85091969da53ede415c' }),
    /RETAINED_EDITORIAL_EXECUTING_ROOT_MISMATCH/);
});
