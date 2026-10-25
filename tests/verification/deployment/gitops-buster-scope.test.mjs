import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { retainedGitOpsGroups } from '../../../scripts/gitops-buster-scope.mjs';

// Frozen real receipts exercise effective per-component provenance and the
// older immutable paths retained by production's unchanged child applications.
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-scope-'));
  try {
    const directory = JSON.parse(fs.readFileSync('gitops/production/selection.json')).directory;
    for (const file of ['gitops/production/selection.json', 'gitops/production/apps/applications.yaml']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(file, path.join(root, file));
    }
    // Copy all historical immutable inputs, never edit the real repository.
    fs.cpSync('releases/gitops', path.join(root, 'releases/gitops'), { recursive: true });
    const prior = JSON.parse(fs.readFileSync(path.join(root, directory, 'bundle.receipt')));
    // Build a coherent frozen selection independently of production rollback
    // pointers. Otherwise an unrelated active rollback masks the tested gate.
    const appsFile = path.join(root, 'gitops/production/apps/applications.yaml');
    const apps = yaml.loadAll(fs.readFileSync(appsFile, 'utf8')).filter(Boolean);
    for (const app of apps.filter(item => item.kind === 'Application')) {
      const group = prior.groups.find(item => item.name === app.metadata.name);
      if (group) app.spec.source.path = group.path;
    }
    fs.writeFileSync(appsFile, apps.map(item => yaml.dump(item)).join('---\n'));
    run(root, structuredClone(prior.receipt), directory);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const retain = (root, receipt) => retainedGitOpsGroups(root, receipt, 'kubeclaw', 'kubeclaw');

test('Buster-only export carries unchanged roles without invoking their renderer', () => fixture((root, receipt) => {
  receipt.images['buster-runtime'] = receipt.images['buster-runtime'].replace(/sha256:.*/, `sha256:${'a'.repeat(64)}`);
  receipt.code.bundles.buster.sha256 = 'b'.repeat(64);
  const groups = retain(root, receipt);
  assert.deepEqual([...groups.keys()], ['prism', 'nova']);
  for (const {manifest, group} of groups.values()) {
    assert.equal(manifest, fs.readFileSync(path.join(root, group.path, 'resources.yaml'), 'utf8'));
  }
}));

test('Buster-only export rejects unrelated images and provenance changes', () => fixture((root, receipt) => {
  for (const name of Object.keys(receipt.images).filter(name => !['buster-runtime', 'namespace-controller'].includes(name))) {
    const changed = structuredClone(receipt);
    changed.images[name] += 'bad';
    assert.throws(() => retain(root, changed), /SCOPE_IMAGE_CHANGED/);
    const provenance = structuredClone(receipt);
    provenance.imageSources[name].commit = 'a'.repeat(40);
    assert.throws(() => retain(root, provenance), /SCOPE_IMAGE_CHANGED/);
  }
}));

test('Buster-only export rejects unrelated code, including inherited provenance', () => fixture((root, receipt) => {
  for (const role of ['nova', 'prism']) {
    const changed = structuredClone(receipt);
    changed.code.bundles[role].sha256 = 'a'.repeat(64);
    assert.throws(() => retain(root, changed), /SCOPE_CODE_CHANGED/);
    const provenance = structuredClone(receipt);
    delete provenance.code.bundles[role].source;
    assert.throws(() => retain(root, provenance), /SCOPE_CODE_CHANGED/);
  }
}));

test('Buster-only export rejects corrupt retained manifests and inventories', () => fixture((root, receipt, directory) => {
  const file = path.join(root, directory, 'nova/resources.yaml');
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '\n# changed');
  assert.throws(() => retain(root, receipt), /MANIFEST_DIGEST_MISMATCH/);
  fs.writeFileSync(file, original);
  const receiptFile = path.join(root, directory, 'bundle.receipt');
  const bundle = JSON.parse(fs.readFileSync(receiptFile));
  bundle.groups.find(group => group.role === 'nova').resources.pop();
  fs.writeFileSync(receiptFile, JSON.stringify(bundle));
  assert.throws(() => retain(root, receipt), /INVENTORY_MISMATCH/);
}));

test('Buster-only carry-forward accepts a new namespace-controller without changing other role manifests', () => fixture((root, receipt) => {
  receipt.images['namespace-controller'] = receipt.images['namespace-controller'].replace(/sha256:.*/, 'sha256:'+'b'.repeat(64));
  receipt.imageSources['namespace-controller'].commit = 'a'.repeat(40);
  assert.deepEqual([...retain(root, receipt).keys()], ['prism', 'nova']);
}));


test('Buster-only export rejects an active retained-role rollback inconsistent with selected bundle', () => fixture((root, receipt) => {
  const file = path.join(root, 'gitops/production/apps/applications.yaml');
  const apps = yaml.loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
  const prism = apps.find(item => item.kind === 'Application' && item.metadata.name.endsWith('-prism'));
  const directory = 'releases/gitops/rollback-fixture/prism';
  fs.mkdirSync(path.join(root, directory), {recursive: true});
  fs.copyFileSync(path.join(root, prism.spec.source.path, 'resources.yaml'), path.join(root, directory, 'resources.yaml'));
  // A different immutable path alone is safe when the manifest is identical.
  prism.spec.source.path = directory;
  fs.writeFileSync(file, apps.map(item => yaml.dump(item)).join('---\n'));
  assert.deepEqual([...retain(root, receipt).keys()], ['prism', 'nova']);
  fs.appendFileSync(path.join(root, directory, 'resources.yaml'), '\n# different rollback content\n');
  assert.throws(() => retain(root, receipt), /GITOPS_MANIFEST_DIGEST_MISMATCH/);
}));


test('Buster-only retention rejects ambiguous or non-immutable active role sources', () => fixture((root, receipt) => {
  const file = path.join(root, 'gitops/production/apps/applications.yaml');
  const original = yaml.loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
  const cases = [
    app => { app.spec.sources = [structuredClone(app.spec.source)]; },
    app => { app.spec.destination.namespace = 'foreign'; },
    app => { app.spec.destination.server = 'https://foreign.invalid'; },
    app => { app.spec.source.targetRevision = 'feature/unreviewed'; },
    app => { app.spec.source.directory.include = '*.yaml'; },
    app => { app.spec.source.path = 'releases/gitops/../prism'; },
    app => { app.spec.source.path = app.spec.source.path.replace(/\/prism$/u, '/nova'); },
  ];
  for (const mutate of cases) {
    const documents = structuredClone(original);
    mutate(documents.find(item => item.kind === 'Application' && item.metadata.name === 'kubeclaw-prism'));
    fs.writeFileSync(file, documents.map(item => yaml.dump(item)).join('---\n'));
    assert.throws(() => retain(root, receipt), /GITOPS_ACTIVE_ROLE_PATH_INVALID/);
  }
  const duplicate = structuredClone(original);
  duplicate.push(structuredClone(duplicate.find(item => item.kind === 'Application' && item.metadata.name === 'kubeclaw-prism')));
  fs.writeFileSync(file, duplicate.map(item => yaml.dump(item)).join('---\n'));
  assert.throws(() => retain(root, receipt), /GITOPS_ACTIVE_ROLE_PATH_INVALID/);
  fs.writeFileSync(file, original.map(item => yaml.dump(item)).join('---\n'));
  assert.deepEqual([...retain(root, receipt).keys()], ['prism', 'nova']);
}));
