import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
  for (const name of Object.keys(receipt.images).filter(name => name !== 'buster-runtime')) {
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
