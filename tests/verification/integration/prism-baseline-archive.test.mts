import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { portableJson } from '@kubeclaw/plugin-sdk';
import { ContentAddressedArtifactStore } from '../../../skills/prism/storage/artifacts.ts';
import { verifyBaselineArchive } from '../../../skills/nova/plugins/prism-design/src/archive.ts';
import { assembleBaselineArchive, baselineChecksumText, baselineChecksumDigest, BASELINE_V1, BASELINE_V2, BASELINE_CHECKSUM_ENCODING } from '../../../contracts/prism/v1/src/baseline-archive.ts';
import { baselineInput, hash } from './fixtures/prism-baseline-input.mts';

test('original production assembler and real CAS/import preserve v1 bytes and cross native locales with explicit v2', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-codec-locales-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const fixture = fileURLToPath(new URL('fixtures/prism-baseline-locale.mts', import.meta.url));
  const run = (mode: string, locale: string, root: string, selected?: string) => {
    const child = spawnSync(process.execPath, [fixture, mode, root, ...(selected ? [selected] : [])], {
      env: {...process.env, LANG: locale, LC_ALL: locale}, encoding: 'utf8', timeout: 15000,
    });
    process.stdout.write(child.stdout); process.stderr.write(child.stderr);
    assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const locales = ['en_US.UTF-8', 'da_DK.UTF-8', 'tr_TR.UTF-8', 'sv_SE.UTF-8'];
  const resolved = ['en-US', 'da-DK', 'tr-TR', 'sv-SE'];
  const digests = new Set<string>(), artifacts = new Set<string>();
  for (const [index, locale] of locales.entries()) {
    const root = path.join(directory, `v2-${index}`);
    const produced = run('produce', locale, root, BASELINE_V2);
    assert.equal(produced.locale, resolved[index]); digests.add(produced.bundleDigest); artifacts.add(produced.artifactId);
    for (const [consumer, consumerLocale] of locales.entries()) {
      const result = run('consume', consumerLocale, root);
      assert.equal(result.locale, resolved[consumer]); assert.equal(result.imported, true, result.error);
      assert.equal(result.bundleDigest, produced.bundleDigest); assert.equal(result.artifactId, produced.artifactId);
      assert.equal(result.unchangedCasBytes, true);
    }
  }
  assert.equal(digests.size, 1); assert.equal(artifacts.size, 1);
  for (const [index, locale] of locales.slice(0, 2).entries()) {
    const root = path.join(directory, `v1-${index}`);
    const produced = run('produce', locale, root, BASELINE_V1);
    assert.equal(produced.historicalBytesIdentical, true);
    assert.equal(run('consume', locale, root).imported, true);
    const cross = run('consume', locales[1 - index]!, root);
    assert.equal(cross.imported, false); assert.equal(cross.error, 'PRISM_ARCHIVE_BUNDLE_DIGEST_MISMATCH');
    assert.equal(cross.unchangedCasBytes, true);
  }
});

test('v2 closed checksum codec is exact UTF16 JSON and domain-bound, not legacy retagging or a generic fallback', () => {
  const files = Object.fromEntries(['2', '10', 'assets/az.png', 'assets/aa.png'].map(name => [name, hash(name)]));
  assert.equal(baselineChecksumText(files, BASELINE_V2), portableJson({schema: 'prism.baseline-checksums.v2', algorithm: 'sha256', encoding: BASELINE_CHECKSUM_ENCODING, files}));
  assert.notEqual(baselineChecksumDigest(files, BASELINE_V1), baselineChecksumDigest(files, BASELINE_V2));
  for (const value of [null, [], {value: undefined}, {value: 1}, {value: 'not-a-digest'}, Object.create({inherited: hash('x')})]) {
    assert.throws(() => baselineChecksumText(value, BASELINE_V2));
  }
  let invoked = false;
  assert.throws(() => baselineChecksumText({get value() { invoked = true; return hash('x'); }}, BASELINE_V2));
  assert.equal(invoked, false);
  assert.throws(() => baselineChecksumText(files, 'unknown' as never), /PRISM_ARCHIVE_SCHEMA_INVALID/u);
});

test('original importer retains approval, member, metadata, tag and corruption gates against actual CAS bytes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-codec-tamper-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const store = new ContentAddressedArtifactStore(root);
  const input = await baselineInput(store);
  const initial = structuredClone(input);
  const assembled = assembleBaselineArchive({...input, profile: BASELINE_V2});
  assert.deepEqual(input, initial);
  const stored = await store.put(assembled.bytes);
  const response = {...stored, bundleDigest: assembled.bundleDigest, archiveBase64: assembled.bytes.toString('base64')};
  assert.equal(verifyBaselineArchive(response, assembled.bundleDigest, 'project').bundleDigest, assembled.bundleDigest);
  const corrupt = async (label: string, mutate: (archive: any) => void, expected: RegExp) => {
    const archive = structuredClone(assembled.archive); mutate(archive);
    const bytes = Buffer.from(JSON.stringify(archive)); const persisted = await store.put(bytes);
    const loaded = Buffer.from(await store.get(persisted.artifactId));
    assert.throws(() => verifyBaselineArchive({...persisted, bundleDigest: assembled.bundleDigest, archiveBase64: loaded.toString('base64')}, assembled.bundleDigest, 'project'), expected, label);
    assert.deepEqual(Buffer.from(await store.get(persisted.artifactId)), bytes);
    assert.deepEqual(Buffer.from(await store.get(stored.artifactId)), assembled.bytes);
    console.log(JSON.stringify({rejected: label, originalCasUnchanged: true, mutatedCasUnchanged: true}));
  };
  const checksums = (archive: any, change: (value: any) => void) => { const value = JSON.parse(archive.textFiles['checksums.json']); change(value); archive.textFiles['checksums.json'] = JSON.stringify(value); };
  await corrupt('unknown archive', a => {a.schema = 'prism.baseline-archive.v99';}, /PRISM_ARCHIVE_SCHEMA_INVALID/u);
  await corrupt('mixed archive v1 manifest v2', a => {a.schema = BASELINE_V1;}, /PRISM_ARCHIVE_MANIFEST_MISMATCH/u);
  await corrupt('mixed archive v2 manifest v1', a => {a.manifest.schema = 'prism.baseline-bundle.v1';}, /PRISM_ARCHIVE_MANIFEST_MISMATCH/u);
  await corrupt('missing manifest encoding', a => {delete a.manifest.checksumEncoding;}, /PRISM_ARCHIVE_MANIFEST_MISMATCH/u);
  await corrupt('unknown manifest encoding', a => {a.manifest.checksumEncoding = 'unknown';}, /PRISM_ARCHIVE_MANIFEST_MISMATCH/u);
  await corrupt('missing checksum encoding', a => checksums(a, c => {delete c.encoding;}), /PRISM_ARCHIVE_CHECKSUM_ENCODING_INVALID/u);
  await corrupt('unknown checksum encoding', a => checksums(a, c => {c.encoding = 'unknown';}), /PRISM_ARCHIVE_CHECKSUM_ENCODING_INVALID/u);
  await corrupt('missing checksum schema', a => checksums(a, c => {delete c.schema;}), /PRISM_ARCHIVE_CHECKSUM_ENCODING_INVALID/u);
  await corrupt('unknown checksum schema', a => checksums(a, c => {c.schema = 'prism.baseline-checksums.v99';}), /PRISM_ARCHIVE_CHECKSUM_ENCODING_INVALID/u);
  await corrupt('unknown checksum field', a => checksums(a, c => {c.extra = true;}), /PRISM_ARCHIVE_CHECKSUM_ENCODING_INVALID/u);
  await corrupt('wrong algorithm', a => checksums(a, c => {c.algorithm = 'sha1';}), /PRISM_ARCHIVE_CHECKSUM_ALGORITHM_INVALID/u);
  await corrupt('modified checksum', a => checksums(a, c => {c.files['design-document.json'] = hash('foreign');}), /PRISM_ARCHIVE_FILE_DIGEST_MISMATCH/u);
  await corrupt('modified content', a => {a.textFiles['design-document.json'] += ' ';}, /PRISM_ARCHIVE_FILE_DIGEST_MISMATCH/u);
  await corrupt('missing member', a => {delete a.binaryFiles['assets/aa.png'];}, /PRISM_ARCHIVE_CHECKSUM_SET_INVALID/u);
  await corrupt('extra member', a => {a.textFiles['extra.txt'] = 'extra';}, /PRISM_ARCHIVE_CHECKSUM_SET_INVALID/u);
  await corrupt('duplicate member', a => {a.binaryFiles['design-document.json'] = Buffer.from('duplicate').toString('base64');}, /PRISM_ARCHIVE_FILE_SET_INVALID/u);
  await corrupt('embedded manifest mismatch', a => {a.textFiles['manifest.json'] = '{}';}, /PRISM_ARCHIVE_MANIFEST_MISMATCH/u);
  await corrupt('unsafe path', a => {a.textFiles['../foreign'] = 'foreign'; checksums(a, c => {c.files['../foreign'] = hash('foreign');});}, /PRISM_ARCHIVE_PATH_INVALID/u);
  await corrupt('binary encoding', a => {a.binaryFiles['assets/aa.png'] = '!';}, /PRISM_ARCHIVE_ENCODING_INVALID/u);
  await corrupt('file type', a => {a.textFiles['design-document.json'] = 1;}, /PRISM_ARCHIVE_FILE_INVALID/u);
  await corrupt('manifest assets', a => {a.manifest.assets.aa.digest = hash('wrong'); a.textFiles['manifest.json'] = JSON.stringify(a.manifest);}, /PRISM_ARCHIVE_ASSET_MISMATCH/u);
  await corrupt('required file reference', a => {a.manifest.designSpecification.path = 'absent'; a.textFiles['manifest.json'] = JSON.stringify(a.manifest);}, /PRISM_ARCHIVE_REQUIRED_FILE_MISSING/u);
  await corrupt('manifest revision', a => {a.manifest.revision++; a.textFiles['manifest.json'] = JSON.stringify(a.manifest);}, /PRISM_ARCHIVE_DOCUMENT_MISMATCH/u);
  assert.throws(() => verifyBaselineArchive(response, hash('unapproved'), 'project'), /PRISM_DESIGN_APPROVED_BUNDLE_MISMATCH/u);
  assert.throws(() => verifyBaselineArchive(response, assembled.bundleDigest, 'another-project'), /PRISM_ARCHIVE_MANIFEST_MISMATCH/u);
  assert.throws(() => verifyBaselineArchive({...response, artifactId: `artifact:${hash('different')}`}, assembled.bundleDigest, 'project'), /PRISM_ARCHIVE_DIGEST_MISMATCH/u);
  const reordered = structuredClone(assembled.archive);
  checksums(reordered, c => {c.files = Object.fromEntries(Object.entries(c.files).reverse());});
  const reorderedBytes = Buffer.from(JSON.stringify(reordered)); const reorderedCas = await store.put(reorderedBytes);
  assert.equal(verifyBaselineArchive({...reorderedCas, bundleDigest: assembled.bundleDigest, archiveBase64: Buffer.from(await store.get(reorderedCas.artifactId)).toString('base64')}, assembled.bundleDigest, 'project').bundleDigest, assembled.bundleDigest);
  console.log(JSON.stringify({reorderedChecksumMap: 'same v2 identity', originalCasUnchanged: true}));
});

test('original size/member gates reject before unsafe transport acceptance', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-codec-limits-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const input = await baselineInput(new ContentAddressedArtifactStore(root));
  const assembled = assembleBaselineArchive({...input, profile: BASELINE_V2});
  const response = {artifactId: `artifact:${hash(assembled.bytes)}`, bundleDigest: assembled.bundleDigest, archiveBase64: assembled.bytes.toString('base64')};
  // The original outer transport gate runs before CAS/content inspection; no
  // oversized temporary file or substituted store is necessary for rejection.
  assert.throws(() => verifyBaselineArchive({...response, archiveBase64: 'A'.repeat(Math.ceil(32 * 1024 * 1024 / 3) * 4 + 1)}, assembled.bundleDigest, 'project'), /PRISM_ARCHIVE_SIZE_EXCEEDED/u);
  const archive = structuredClone(assembled.archive);
  for (let i = 0; i < 4097; i++) archive.textFiles[`file-${i}`] = '';
  const bytes = Buffer.from(JSON.stringify(archive));
  assert.throws(() => verifyBaselineArchive({artifactId: `artifact:${hash(bytes)}`, bundleDigest: assembled.bundleDigest, archiveBase64: bytes.toString('base64')}, assembled.bundleDigest, 'project'), /PRISM_ARCHIVE_FILE_SET_INVALID/u);
  assert.throws(() => assembleBaselineArchive({...input, profile: BASELINE_V2, textFiles: {...input.textFiles, 'checksums.json': '{}'}}), /PRISM_ARCHIVE_FILE_SET_INVALID/u);
});

test('original semantic document and preview gates reject self-consistently hashed archives from the production assembler', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-codec-semantic-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const store = new ContentAddressedArtifactStore(root);
  const input = await baselineInput(store);
  const reject = async (label: string, file: string, mutate: (value: any) => void, expected: RegExp) => {
    const candidate = structuredClone(input);
    const value = JSON.parse(candidate.textFiles[file]!); mutate(value);
    candidate.textFiles[file] = JSON.stringify(value);
    const assembled = assembleBaselineArchive({...candidate, profile: BASELINE_V2});
    const stored = await store.put(assembled.bytes);
    const bytes = Buffer.from(await store.get(stored.artifactId));
    assert.throws(() => verifyBaselineArchive({...stored, bundleDigest: assembled.bundleDigest, archiveBase64: bytes.toString('base64')}, assembled.bundleDigest, 'project'), expected, label);
    assert.deepEqual(Buffer.from(await store.get(stored.artifactId)), assembled.bytes);
    console.log(JSON.stringify({semanticRejected: label, realCasUnchanged: true}));
  };
  await reject('document project', 'design-document.json', d => {d.meta.projectId = 'foreign';}, /PRISM_ARCHIVE_DOCUMENT_MISMATCH/u);
  await reject('document revision', 'design-document.json', d => {d.meta.revision++;}, /PRISM_ARCHIVE_DOCUMENT_MISMATCH/u);
  await reject('preview image digest', 'previews/index.json', p => {p.previews[0].digest = hash('foreign');}, /PRISM_ARCHIVE_PREVIEW_MISMATCH/u);
  await reject('preview ARIA digest', 'previews/index.json', p => {p.previews[0].ariaDigest = hash('foreign');}, /PRISM_ARCHIVE_PREVIEW_MISMATCH/u);
  await reject('preview unknown state', 'previews/index.json', p => {p.previews[0].state = 'absent';}, /PRISM_ARCHIVE_PREVIEW_MISMATCH/u);
  await reject('preview unknown view', 'previews/index.json', p => {p.previews[0].view = 'absent';}, /PRISM_ARCHIVE_PREVIEW_MISMATCH/u);
  await reject('preview image member', 'previews/index.json', p => {p.previews[0].path = 'previews/absent.png';}, /PRISM_ARCHIVE_PREVIEW_MISMATCH/u);
  await reject('preview ARIA member', 'previews/index.json', p => {p.previews[0].ariaPath = 'previews/absent.txt';}, /PRISM_ARCHIVE_PREVIEW_MISMATCH/u);
});
