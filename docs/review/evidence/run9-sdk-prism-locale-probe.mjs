// Read-only production-source audit. Generated files live only in an owned temp directory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { PNG } from 'pngjs';
import { validatePrism } from '@kubeclaw/prism-contracts-v1';
import { ContentAddressedArtifactStore } from '../../../skills/prism/storage/artifacts.ts';
import { verifyBaselineArchive } from '../../../skills/nova/plugins/prism-design/src/archive.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const self = fileURLToPath(import.meta.url);
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const producerPath = 'skills/prism/server/control-server.ts';
const producerText = fs.readFileSync(path.join(root, producerPath), 'utf8');
const start = producerText.indexOf('const stableRecord = ');
const end = producerText.indexOf('const userKey = ', start);
assert(start >= 0 && end > start);
const extracted = producerText.slice(start, end);
assert.match(extracted, /a\.localeCompare\(b\)/);
// This is explicitly an extracted original helper, NOT the full Control HTTP publisher.
// No exported checksum helper exists; the HTTP path requires DB approval and live rendering.
const { stableRecord } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(`${extracted}\nexport {stableRecord};`)).toString('base64')}`);

async function makeArchive(directory) {
  const store = new ContentAddressedArtifactStore(directory);
  const png = new PNG({ width: 1, height: 1 }); png.data.fill(255);
  const pngBytes = PNG.sync.write(png);
  const asset = await store.put(pngBytes);
  const document = JSON.parse(fs.readFileSync(path.join(root, 'contracts/prism/v1/fixtures/minimal-web.json'), 'utf8'));
  document.meta.projectId = 'project';
  for (const id of ['aa', 'az']) document.assets[id] = { kind: 'image', artifact: asset.artifactId, mediaType: 'image/png', role: 'illustration' };
  validatePrism('designDocument', document);
  const textFiles = {
    'design-document.json': JSON.stringify(document),
    'design-specification.md': '# Approved design',
    'acceptance-criteria.json': JSON.stringify({ schema: 'prism.acceptance-criteria.v1', criteria: [{ id: 'home-visible', category: 'visual', requirement: 'Home is visible.', targets: [{ view: 'home', state: 'default' }], priority: 'required', verification: ['visual'] }] }),
    'previews/home.aria.txt': 'Home',
    'previews/index.json': JSON.stringify({ schema: 'prism.preview-index.v1', previews: [{ id: 'home', view: 'home', state: 'default', viewport: 'wide', path: 'previews/home.png', width: 1, height: 1, digest: hash(pngBytes), fidelity: 'intent', ariaPath: 'previews/home.aria.txt', ariaDigest: hash('Home'), renderer: { name: 'contract-fixture' } }] }),
  };
  const binaryFiles = { 'previews/home.png': pngBytes.toString('base64') };
  const manifestAssets = {};
  // Same admitted asset ID -> path mapping as original Control producer lines 731-759.
  for (const [id, value] of Object.entries(document.assets)) {
    const bytes = Buffer.from(await store.get(value.artifact));
    const name = `assets/${id}.png`;
    binaryFiles[name] = bytes.toString('base64');
    manifestAssets[id] = { path: name, mediaType: value.mediaType, digest: hash(bytes) };
  }
  const checksums = {};
  for (const [name, value] of Object.entries(textFiles)) checksums[name] = hash(value);
  for (const [name, value] of Object.entries(binaryFiles)) checksums[name] = hash(Buffer.from(value, 'base64'));
  const checksumBytes = stableRecord(checksums);
  const bundleDigest = hash(checksumBytes);
  const manifest = { schema: 'prism.baseline-bundle.v1', digest: bundleDigest, projectId: 'project', bundleId: 'baseline', revision: 1, createdAt: '2026-09-06T00:00:00Z', designDocument: { path: 'design-document.json', schema: 'prism.design-document.v1', revision: 1 }, designSpecification: { path: 'design-specification.md' }, acceptanceCriteria: { path: 'acceptance-criteria.json' }, previews: { path: 'previews/index.json' }, assets: manifestAssets };
  validatePrism('baselineManifest', manifest);
  textFiles['checksums.json'] = JSON.stringify({ algorithm: 'sha256', files: JSON.parse(checksumBytes) });
  textFiles['manifest.json'] = JSON.stringify(manifest);
  const bytes = Buffer.from(JSON.stringify({ schema: 'prism.baseline-archive.v1', manifest, textFiles, binaryFiles }));
  const stored = await store.put(bytes);
  fs.writeFileSync(path.join(directory, 'reference.json'), JSON.stringify({ artifactId: stored.artifactId, bundleDigest }));
  return { artifactId: stored.artifactId, bundleDigest, checksumBytes, documentValidated: true, manifestValidated: true };
}

if (process.argv[2] === 'produce') {
  console.log(JSON.stringify({ phase: 'producer-helper-and-real-cas', locale: new Intl.Collator().resolvedOptions().locale, ...await makeArchive(process.argv[3]) }));
} else if (process.argv[2] === 'consume') {
  const directory = process.argv[3];
  const reference = JSON.parse(fs.readFileSync(path.join(directory, 'reference.json'), 'utf8'));
  const store = new ContentAddressedArtifactStore(directory);
  const bytes = Buffer.from(await store.get(reference.artifactId));
  const archive = JSON.parse(bytes.toString('utf8'));
  // Validate exact archived inputs independently before invoking the actual original importer.
  validatePrism('designDocument', JSON.parse(archive.textFiles['design-document.json']));
  validatePrism('baselineManifest', archive.manifest);
  let error;
  try { verifyBaselineArchive({ ...reference, archiveBase64: bytes.toString('base64') }, reference.bundleDigest, 'project'); }
  catch (caught) { error = caught.message; }
  console.log(JSON.stringify({ phase: 'original-cas-reopen-and-nova-import', locale: new Intl.Collator().resolvedOptions().locale, artifactDigestVerified: hash(bytes) === reference.artifactId.slice('artifact:'.length), documentValidated: true, manifestValidated: true, imported: error === undefined, error: error ?? null }));
} else {
  console.log(JSON.stringify({ auditedRemote: 'a43aa256bdce35d7f9c44d5d661e59c4055e562e', producerPath, producerSourceDigest: hash(producerText), extractedHelperDigest: hash(extracted), helperFirstLine: producerText.slice(0, start).split('\n').length, producerBoundary: 'verbatim extracted original helper, not full Control HTTP publisher', consumerBoundary: 'actual original validator, file CAS, and Nova archive importer', rendering: false, deployment: false }));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-prism-locale-audit-'));
  const run = (phase, locale) => {
    const child = spawnSync(process.execPath, [self, phase, directory], { cwd: root, env: { ...process.env, LANG: locale, LC_ALL: locale }, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    process.stdout.write(child.stdout); process.stderr.write(child.stderr);
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim());
  };
  try {
    const produced = run('produce', 'en_US.UTF-8'); assert.equal(produced.locale, 'en-US');
    const same = run('consume', 'en_US.UTF-8'); assert.equal(same.imported, true);
    const cross = run('consume', 'da_DK.UTF-8'); assert.equal(cross.locale, 'da-DK');
    assert.equal(cross.imported, false); assert.equal(cross.error, 'PRISM_ARCHIVE_BUNDLE_DIGEST_MISMATCH');
    assert.equal(cross.artifactDigestVerified, true);
    console.log(JSON.stringify({ reproduced: true, preservedRealArtifact: true, sourceUnchanged: true, productionFix: false, completeFinding: false }));
  } finally { fs.rmSync(directory, { recursive: true }); }
}
