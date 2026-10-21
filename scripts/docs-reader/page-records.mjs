import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyReaderRedirects, legacyReaderRoute, redirectClient} from './redirects.mjs';
import {readerSharedAssets, readerOutputLayout} from './renderer.mjs';
import {publicationAssets} from '../lib/docs-publication-assets.mjs';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inputPaths = Object.freeze({
  publication: 'docs/config/documentation-publication-manifest.json',
  ownership: 'docs/site/reference/generated-documentation-map.json',
  redirects: 'docs/site/reference/documentation-route-registry.json',
  baseline: 'scripts/docs-published-route-baseline.json',
});
function relative(value) {
  assert(typeof value === 'string' && value && value === path.posix.normalize(value)
    && !path.posix.isAbsolute(value) && !/[\\\u0000-\u001f:]/u.test(value)
    && !value.split('/').some(part => !part || part === '.' || part === '..'), 'Noncanonical publication source path');
  return value;
}
function physical(root, name, directory = false) {
  relative(name);
  const file = path.join(root, name);
  assert.equal(fs.realpathSync(file), file, 'Nonphysical publication input/output: ' + name);
  assert(directory ? fs.statSync(file).isDirectory() : fs.statSync(file).isFile(), 'Wrong publication input/output type: ' + name);
  return file;
}
// Resolve only the owner's declared paths with Git's public object/status APIs.
// This is not an inferred implementation closure or a custom filesystem walk.
function sourceReader(repositoryRoot, revision) {
  assert(/^[a-f0-9]{40,64}$/u.test(revision), 'Full publication revision required');
  const root = fs.realpathSync(repositoryRoot);
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, '--literal-pathspecs', ...args], {maxBuffer: 64 * 1024 * 1024});
  assert.equal(git('cat-file', '-t', revision).toString().trim(), 'commit');
  const selected = new Map();
  function read(name) {
    relative(name);
    if (selected.has(name)) return selected.get(name);
    const entry = /^(100644|100755|040000) (blob|tree) ([a-f0-9]{40,64})\t([^\0]+)\0$/u.exec(git('ls-tree', '-z', revision, '--', name).toString());
    assert(entry && entry[4] === name, 'Not a committed regular file/directory: ' + name);
    const bytes = git('cat-file', entry[2], entry[3]);
    const file = physical(root, name, entry[2] === 'tree');
    if (entry[2] === 'blob') assert(fs.readFileSync(file).equals(bytes), 'Current Source differs from publication revision: ' + name);
    const value = {path: name, revision, kind: entry[2] === 'blob' ? 'repository-file' : 'repository-tree',
      gitObjectId: entry[3], contentHash: {algorithm: 'sha256', value: sha256(bytes)}, bytes: bytes.length,
      hashRepresentation: entry[2] === 'blob' ? 'file-bytes' : 'git-tree-object-bytes'};
    selected.set(name, value);
    return value;
  }
  function json(name) { read(name); return JSON.parse(fs.readFileSync(physical(root, name), 'utf8')); }
  function current() {
    const names = [...selected.keys()].sort();
    // Only the finite declared scopes are inspected. Git's worktree diff can
    // hide flagged descendants or an index-only change with restored physical
    // bytes, so reject masking flags and compare the index independently.
    const indexed = git('ls-files', '--cached', '-v', '-z', '--', ...names).toString().split('\0').filter(Boolean);
    for (const entry of indexed) assert(entry.startsWith('H '),
      'Masked or unsupported Source index entry: ' + entry.slice(2));
    git('diff', '--cached', '--no-ext-diff', '--no-textconv', '--exit-code', '--quiet', revision, '--', ...names);
    git('diff', '--no-ext-diff', '--no-textconv', '--exit-code', '--quiet', revision, '--', ...names);
    // Installed/ignored dependencies are not committed Git Source.
    assert.equal(git('ls-files', '--others', '--exclude-standard', '-z', '--', ...names).length, 0,
      'Uncommitted Source below a declared dependency');
  }
  return {read, json, current};
}
function outputReader(outputRoot, manifest) {
  const outputs = new Map();
  for (const record of manifest.outputs) {
    relative(record.path);
    assert(!outputs.has(record.path), 'Duplicate mapped output: ' + record.path);
    outputs.set(record.path, record);
  }
  return name => {
    relative(name);
    const record = outputs.get(name);
    assert(record, 'Missing mapped output: ' + name);
    const bytes = fs.readFileSync(physical(outputRoot, name));
    assert.equal(bytes.length, record.bytes, 'Mapped output size drift: ' + name);
    assert.equal(sha256(bytes), record.sha256, 'Mapped output hash drift: ' + name);
    return {path: name, bytes: bytes.length, contentHash: {algorithm: 'sha256', value: sha256(bytes)}};
  };
}

// Positive pages and source dependency declarations come from the existing
// publication/ownership authorities. No page, dependency or history is guessed.
export function compileReaderPageRecords({repositoryRoot, outputRoot, manifest}) {
  assert.equal(manifest.schemaVersion, 'kubeclaw-reader-artifact.v1');
  outputRoot = fs.realpathSync(outputRoot);
  const source = sourceReader(repositoryRoot, manifest.revision);
  const publication = source.json(inputPaths.publication), ownership = source.json(inputPaths.ownership);
  const registry = source.json(inputPaths.redirects), baseline = source.json(inputPaths.baseline);
  assert.equal(publication.schemaVersion, 'kubeclaw-publication-manifest.v1');
  assert.equal(ownership.schemaVersion, 'kubeclaw-documentation-map.v1');
  assert(Array.isArray(publication.pages) && Array.isArray(ownership.pages));
  assert.equal(publication.pages.length, manifest.pageCount, 'Positive page-count drift');
  assert.equal(ownership.pageCount, ownership.pages.length, 'Owner page-count drift');
  const owners = new Map();
  for (const row of ownership.pages) {
    relative(row.page);
    assert(!owners.has(row.page), 'Duplicate owner page: ' + row.page);
    owners.set(row.page, row);
  }
  const selected = new Set(), routes = new Set();
  const pages = publication.pages.map(row => {
    relative(row.sourcePath);
    assert(row.sourcePath.startsWith('docs/site/') && row.sourcePath.endsWith('.md'), 'Non-reader positive page');
    const name = row.sourcePath.slice('docs/site/'.length), route = '/' + name.slice(0, -3) + '.html';
    assert.equal(row.route, route, 'Noncanonical artifact route');
    assert.equal(row.canonicalUrl, route, 'Canonical URL must be the artifact-local HTML route');
    assert(!selected.has(row.sourcePath) && !routes.has(route), 'Duplicate positive source/route');
    selected.add(row.sourcePath); routes.add(route);
    const owner = owners.get(row.sourcePath);
    assert(owner && typeof owner.owner === 'string' && owner.owner.trim(), 'Missing actual page owner');
    assert.equal(owner.route, legacyReaderRoute(name), 'Owner route differs from positive page');
    assert(Array.isArray(owner.sourceDependencies) && owner.sourceDependencies.every(x => typeof x === 'string'), 'Invalid declared dependency list');
    assert.equal(new Set(owner.sourceDependencies).size, owner.sourceDependencies.length, 'Duplicate declared source dependency');
    return {relative: name, owner: owner.owner, row, dependencies: [...owner.sourceDependencies].sort()};
  });
  assert.equal(owners.size, selected.size, 'Owner/positive page-set drift');
  const readOutput = outputReader(outputRoot, manifest);
  assert.equal(manifest.redirectManifest, 'redirect-manifest.json', 'Missing redirect binding');
  readOutput(manifest.redirectManifest);
  // Reuse the normal positive asset selector and renderer layout. Generated
  // SVG paths are already output-bound; their fresh-render proof stays with
  // the existing diagram checker, not this page/dependency mapping.
  const assets = publicationAssets(path.join(fs.realpathSync(repositoryRoot), 'docs/site'));
  const generated = manifest.outputs.filter(record => /^diagrams\/diagram-[a-f0-9]{16}\.svg$/u.test(record.path)).map(record => record.path);
  const {htmlOutputs: reservedOutputs} = readerOutputLayout({pages, assets: [...assets, ...generated]});
  const plan = verifyReaderRedirects({outputRoot, pages, registry, baseline, reservedOutputs});
  assert.deepEqual(JSON.parse(fs.readFileSync(physical(outputRoot, manifest.redirectManifest), 'utf8')),
    {...plan, revision: manifest.revision}, 'Redirect plan/source drift');
  const sharedOutputs = [...readerSharedAssets(), {path: 'reader-redirect.js', text: redirectClient}].map(asset => {
    const record = readOutput(asset.path);
    assert(fs.readFileSync(physical(outputRoot, asset.path)).equals(Buffer.from(asset.text)),
      'Shared output differs from Source-owned bytes: ' + asset.path);
    return record;
  });
  const redirects = [...plan.redirects.map(entry => ({kind: 'registered', ...entry})), {kind: 'entry-point', ...plan.entryPoint}];
  const records = pages.map(page => ({
    sourcePath: page.row.sourcePath, route: page.row.route, canonicalUrl: page.row.canonicalUrl,
    source: source.read(page.row.sourcePath), html: readOutput(page.row.route.slice(1)),
    sourceDependencies: page.dependencies.map(declaration => /^https?:\/\//u.test(declaration) || declaration.startsWith('[')
      ? {declaration, kind: 'unacquired-reference', contentHash: null}
      : source.read(declaration)),
    redirects: redirects.filter(entry => entry.to === page.row.route).map(entry => ({...entry, artifact: readOutput(entry.output)})),
  })).sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0);
  source.current();
  return {
    schemaVersion: 'kubeclaw-reader-page-records.v1',
    authority: Object.fromEntries(Object.entries(inputPaths).map(([kind, name]) => [kind, source.read(name)])),
    dependencyScope: 'Exact owner-map declarations, not a complete implementation, installed dependency, citation or build-input closure. Repository trees hash Git tree-object bytes; ignored files are outside this committed-Source binding. External reference content is not acquired.',
    canonicalUrlScope: 'Artifact-local HTML paths only; no deployment origin or public hosting assertion.',
    sharedOutputs,
    pages: records,
  };
}
export function appendReaderPageRecords(options) {
  const pageRecords = compileReaderPageRecords(options);
  const next = {...options.manifest, pageRecords};
  fs.writeFileSync(path.join(options.outputRoot, 'reader-manifest.json'), JSON.stringify(next, null, 2) + '\n');
  return next;
}
export function verifyReaderPageRecords({repositoryRoot, outputRoot, manifest}) {
  assert(manifest.pageRecords, 'Production publication is missing pageRecords');
  assert.deepEqual(manifest.pageRecords, compileReaderPageRecords({repositoryRoot, outputRoot, manifest}), 'Page/source/artifact records drift');
  return {pages: manifest.pageRecords.pages.length, scope: manifest.pageRecords.dependencyScope};
}
