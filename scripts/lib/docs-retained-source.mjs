import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const retainedConfigurationInputs = Object.freeze({
  runtimeInputs: 'docs/generated/inventory/configuration-runtime-inputs.json',
  configurationValues: 'docs/generated/inventory/configuration-values.json',
  configurationSchemas: 'docs/generated/inventory/configuration-schemas.json',
  deploy: 'docs/generated/inventory/deploy-script.json',
  secretSetup: 'docs/generated/inventory/secret-setup.json',
});

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fullRevision = value => assert.match(value, /^[a-f0-9]{40}$/u, 'RETAINED_SOURCE_FULL_REVISION_REQUIRED');
const generatedPath = value => value.startsWith('docs/generated/') || value.startsWith('docs/site/');
const completionPath = value => value === 'docs/blueprint/documentation-completion-matrix.json'
  || (value.startsWith('docs/blueprint/acceptance-evidence/') && value.endsWith('.json'));

function checkedPath(value) {
  assert.equal(typeof value, 'string', 'RETAINED_SOURCE_PATH_REQUIRED');
  assert(value && !value.includes('\0') && !value.includes('\\') && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value && !value.split('/').includes('..'), 'RETAINED_SOURCE_PATH_INVALID');
  assert(!completionPath(value), 'RETAINED_SOURCE_COMPLETION_RECORD_IS_NOT_AUTHORITY');
  return value;
}

function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024, ...options });
}

export function physicalGitRoot(directory) {
  const root = path.resolve(directory);
  assert.equal(fs.realpathSync(root), root, 'RETAINED_SOURCE_NONPHYSICAL_ROOT');
  assert.equal(path.resolve(git(root, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()), root,
    'RETAINED_SOURCE_NOT_WORKTREE_ROOT');
  return root;
}

function commit(root, revision) {
  fullRevision(revision);
  assert.equal(git(root, ['cat-file', '-t', revision], { encoding: 'utf8' }).trim(), 'commit',
    'RETAINED_SOURCE_COMMIT_REQUIRED');
}

function tree(root, revision) {
  return git(root, ['ls-tree', '-rz', '--full-tree', revision]).toString('utf8').split('\0').filter(Boolean)
    .map(record => {
      const separator = record.indexOf('\t');
      assert(separator > 0, 'RETAINED_SOURCE_TREE_RECORD_INVALID');
      const [mode, type, object] = record.slice(0, separator).split(' ');
      return { path: record.slice(separator + 1), mode, type, object };
    });
}

// A source commit and its retained output commit are distinct identities. Check
// the entire non-generated source tree, not a hand-picked set of unchanged files.
export function loadRetainedConfigurationSnapshot({ root: directory, artifactRevision, sourceRevision = null }) {
  const root = physicalGitRoot(directory);
  commit(root, artifactRevision);
  const inputs = new Map();
  const trees = new Map();
  const records = revision => {
    if (!trees.has(revision)) trees.set(revision, new Map(tree(root, revision).map(entry => [entry.path, entry])));
    return trees.get(revision);
  };
  const read = (revision, relative) => {
    checkedPath(relative);
    const entry = records(revision).get(relative);
    assert(entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode),
      `RETAINED_SOURCE_REGULAR_TRACKED_INPUT_REQUIRED: ${relative}`);
    // Size the pipe from the actual Git object. This is not a document-size cap.
    const size = Number(git(root, ['cat-file', '-s', entry.object], { encoding: 'utf8' }).trim());
    assert(Number.isSafeInteger(size) && size >= 0, 'RETAINED_SOURCE_OBJECT_SIZE_INVALID');
    const bytes = git(root, ['cat-file', 'blob', entry.object], { maxBuffer: size + 1024 });
    assert.equal(bytes.length, size, 'RETAINED_SOURCE_PARTIAL_OBJECT');
    inputs.set(`${revision}:${relative}`, { path: relative, revision, gitObject: entry.object,
      bytes: size, sha256: digest(bytes) });
    return bytes;
  };
  const readJson = (revision, relative) => JSON.parse(read(revision, relative).toString('utf8'));
  const lock = readJson(artifactRevision, 'docs/generated/inventory/documentation-source-revision.json');
  fullRevision(lock.revision);
  if (sourceRevision !== null) assert.equal(sourceRevision, lock.revision, 'RETAINED_SOURCE_LOCK_MISMATCH');
  sourceRevision = lock.revision;
  commit(root, sourceRevision);
  const originalSources = [...records(sourceRevision).values()].filter(entry => !generatedPath(entry.path) && !completionPath(entry.path));
  const artifactSources = [...records(artifactRevision).values()].filter(entry => !generatedPath(entry.path) && !completionPath(entry.path));
  assert.deepEqual(artifactSources, originalSources, 'RETAINED_SOURCE_ARTIFACT_SOURCE_TREE_MISMATCH');
  const inventories = Object.fromEntries(Object.entries(retainedConfigurationInputs)
    .map(([key, relative]) => [key, readJson(artifactRevision, relative)]));
  return {
    root, artifactRevision, sourceRevision, inventories,
    readSourceText: relative => read(sourceRevision, relative).toString('utf8'),
    readArtifactJson: relative => readJson(artifactRevision, relative),
    readArtifactText: relative => read(artifactRevision, relative).toString('utf8'),
    inputManifest: () => [...inputs.values()].sort((a, b) => `${a.revision}:${a.path}`.localeCompare(`${b.revision}:${b.path}`)),
    provenance: { artifactRevision, sourceRevision, sourceTreePaths: originalSources.length,
      sourceTreeSha256: digest(JSON.stringify(originalSources)), completeNonGeneratedSourceTreeEqual: true,
      currentDiscoveryPerformed: false, currentQualificationGranted: false },
  };
}

// Retained facts do not authorize dirty, untracked or unrelated current owner
// code. The ordinary source-first rule still applies to the editorial program.
export function assertEditorialSourceRevision(directory, revision) {
  const root = physicalGitRoot(directory);
  commit(root, revision);
  const changed = git(root, ['diff', '--name-only', '-z', revision, '--', '.']).toString('utf8').split('\0');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0');
  const mismatch = [...new Set([...changed, ...untracked].filter(Boolean)
    .filter(relative => !generatedPath(relative) && !completionPath(relative)))].sort();
  assert.equal(mismatch.length, 0, `RETAINED_EDITORIAL_SOURCE_DRIFT: ${mismatch.join(', ')}`);
  return root;
}

// Current explanations have their own provenance. Never relabel retained fact links.
export function retainedSemanticSourceManifest(directory, revision, receivers, ownerPaths) {
  const root = assertEditorialSourceRevision(directory, revision);
  const records = new Map(tree(root, revision).map(entry => [entry.path, entry]));
  const expected = new Map(receivers.map(entry => [entry.path, entry.sha256]));
  const selected = [...new Set([...expected.keys(), ...ownerPaths])].sort();
  return selected.map(relative => {
    checkedPath(relative);
    const entry = records.get(relative);
    assert(entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode),
      `RETAINED_SEMANTIC_SOURCE_NOT_REGULAR_TRACKED: ${relative}`);
    const filename = path.join(root, relative);
    const stat = fs.lstatSync(filename);
    assert(stat.isFile() && fs.realpathSync(filename) === filename,
      `RETAINED_SEMANTIC_SOURCE_NOT_PHYSICAL: ${relative}`);
    const bytes = fs.readFileSync(filename);
    const committed = git(root, ['cat-file', 'blob', entry.object], { maxBuffer: bytes.length + 1024 });
    assert(bytes.equals(committed), `RETAINED_SEMANTIC_SOURCE_DRIFT: ${relative}`);
    if (expected.has(relative)) assert.equal(digest(bytes), expected.get(relative),
      `RETAINED_SEMANTIC_RECEIVER_BODY_DRIFT: ${relative}`);
    const text = bytes.toString('utf8');
    return { path: relative, revision, gitObject: entry.object, bytes: bytes.length,
      sha256: digest(bytes), lines: text.split('\n').length - Number(text.endsWith('\n')) };
  });
}

export function stableBundleText(bundle) {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

// One staged file is the complete bundle. A failed projection or a failed check
// must not replace an older bundle, inventory, source lock or authority registry.
export function storeRetainedLanguageBundle({ root: directory, output, bundle, checkOnly = false }) {
  const root = physicalGitRoot(directory);
  const target = path.resolve(output);
  const relative = path.relative(root, target);
  assert(relative.startsWith(`..${path.sep}`), 'RETAINED_LANGUAGE_OUTPUT_MUST_BE_OUTSIDE_CHECKOUT');
  const parent = path.dirname(target);
  assert(fs.existsSync(parent) && fs.realpathSync(parent) === parent, 'RETAINED_LANGUAGE_OUTPUT_PARENT_MUST_BE_PHYSICAL');
  if (fs.existsSync(target)) assert(fs.lstatSync(target).isFile() && !fs.lstatSync(target).isSymbolicLink(),
    'RETAINED_LANGUAGE_OUTPUT_MUST_BE_REGULAR');
  const text = stableBundleText(bundle);
  if (checkOnly) {
    assert(fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text, 'RETAINED_LANGUAGE_BUNDLE_DRIFT');
    return { checked: true, bytes: Buffer.byteLength(text), sha256: digest(text) };
  }
  const stage = `${target}.stage-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(stage, text, { flag: 'wx', mode: 0o600 });
    fs.renameSync(stage, target);
  } finally {
    if (fs.existsSync(stage)) fs.unlinkSync(stage);
  }
  return { checked: false, bytes: Buffer.byteLength(text), sha256: digest(text) };
}

// Validate the complete selected output set before any page is read or written.
// No retained publication may alias a canonical inventory through a symlink.
export function assertRetainedPageDestinations(directory, paths, { semantic = false } = {}) {
  const root = physicalGitRoot(directory);
  const allowed = new Set(['docs/site/reference/helm-values.md', 'docs/site/reference/environment-variables.md']);
  if (semantic) allowed.add('docs/site/reference/secrets.md');
  assert.deepEqual(new Set(paths), allowed, 'RETAINED_PAGE_OUTPUT_SET_INVALID');
  for (const relative of paths) {
    const filename = path.join(root, relative);
    const parent = path.dirname(filename);
    assert(fs.existsSync(parent) && fs.realpathSync(parent) === parent,
      `RETAINED_PAGE_PARENT_MUST_BE_PHYSICAL: ${relative}`);
    try {
      const stat = fs.lstatSync(filename);
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
        `RETAINED_PAGE_MUST_BE_UNALIASED_REGULAR: ${relative}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function writeRetainedPage(filename, text) {
  const stage = `${filename}.stage-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(stage, text, { flag: 'wx', mode: 0o644 });
    fs.renameSync(stage, filename);
  } finally {
    if (fs.existsSync(stage)) fs.unlinkSync(stage);
  }
}
