import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectReceipts } from '../../../scripts/updates/release-images.mjs';

test('release selection rejects missing, duplicate and cross-commit build receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-receipts-'));
  const commit = 'a'.repeat(40);
  const receipt = { name: 'nova', commit, image: `ghcr.io/datrab/kubeclaw-nova@sha256:${'b'.repeat(64)}` };
  // These exercise manifest validation; they are never published as build evidence.
  try {
    assert.throws(() => collectReceipts(root, commit, ['nova']), /missing/);
    fs.writeFileSync(path.join(root, 'nova.json'), JSON.stringify(receipt));
    assert.equal(collectReceipts(root, commit, ['nova']).images.nova, receipt.image);
    assert.throws(() => collectReceipts(root, 'c'.repeat(40), ['nova']), /cross-commit/);
    fs.writeFileSync(path.join(root, 'duplicate.json'), JSON.stringify(receipt));
    assert.throws(() => collectReceipts(root, commit, ['nova']), /duplicate/);
    fs.unlinkSync(path.join(root, 'duplicate.json'));
    receipt.image = 'ghcr.io/datrab/kubeclaw-nova:latest';
    fs.writeFileSync(path.join(root, 'nova.json'), JSON.stringify(receipt));
    assert.throws(() => collectReceipts(root, commit, ['nova']), /Invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('generated release values render actual Helm charts with immutable role and sidecar references', async () => {
  const { execFileSync } = await import('node:child_process');
  const { parseAllDocuments } = await import('yaml');
  const source = path.resolve(import.meta.dirname, '../../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-helm-'));
  try {
    fs.cpSync(path.join(source, 'my-values'), path.join(root, 'my-values'), { recursive: true });
    fs.mkdirSync(path.join(root, 'releases'));
    const names = ['nova', 'prism-agent', 'buster-gateway', 'buster-runtime', 'namespace-controller', 'archviewer', 'prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'];
    // Valid-shaped identifiers test rendering, not image availability or deployment.
    const images = Object.fromEntries(names.map((name, index) => [name, `ghcr.io/datrab/kubeclaw-${name}@sha256:${index.toString(16).repeat(64)}`]));
    fs.writeFileSync(path.join(root, 'releases/runtime-images.json'), JSON.stringify({ schemaVersion: 1, commit: 'a'.repeat(40), images }));
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs')], { cwd: root });
    execFileSync(process.execPath, [path.join(source, 'scripts/updates/materialize-release.mjs'), '--check'], { cwd: root });
    for (const role of ['nova', 'buster', 'prism-agent', 'prism']) {
      const output = execFileSync('helm', ['template', role, path.join(source, `charts/${role === 'prism' ? 'prism' : 'kubeclaw'}`), '-f', path.join(root, `releases/values/${role}.yaml`)], { encoding: 'utf8' });
      const docs = parseAllDocuments(output).map(doc => { assert.deepEqual(doc.errors, []); return doc.toJSON(); });
      const refs = docs.flatMap(doc => [...(doc?.spec?.template?.spec?.containers ?? []), ...(doc?.spec?.template?.spec?.initContainers ?? [])]).map(container => container.image).filter(image => image.startsWith('ghcr.io/datrab/kubeclaw-'));
      assert.ok(refs.length > 0, `No rendered runtime images for ${role}`);
      for (const ref of refs) assert.ok(Object.values(images).includes(ref), `Mutable or incorrect runtime reference: ${ref}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
