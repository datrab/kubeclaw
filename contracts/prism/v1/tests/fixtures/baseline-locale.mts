import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ContentAddressedArtifactStore } from '../../../../../skills/prism/storage/artifacts.ts';
import { verifyBaselineArchive } from '../../../../../skills/nova/plugins/prism-design/src/archive.ts';
import { assembleBaselineArchive, BASELINE_V1, BASELINE_V2 } from '../../src/baseline-archive.ts';
import { baselineInput, originalV1, hash } from './baseline-input.mts';

const [mode, directory, selected] = process.argv.slice(2);
assert(directory);
const store = new ContentAddressedArtifactStore(directory);
const referenceFile = path.join(directory, 'reference.json');
if (mode === 'produce') {
  assert(selected === BASELINE_V1 || selected === BASELINE_V2);
  const input = await baselineInput(store);
  const assembled = assembleBaselineArchive({...input, profile: selected});
  if (selected === BASELINE_V1) {
    const historical = await originalV1(input, store);
    assert.equal(historical.bundleDigest, assembled.bundleDigest);
    assert.deepEqual(Buffer.from(await store.get(historical.bundle.artifactId)), assembled.bytes);
  }
  const stored = await store.put(assembled.bytes);
  fs.writeFileSync(referenceFile, JSON.stringify({artifactId: stored.artifactId, bundleDigest: assembled.bundleDigest}));
  console.log(JSON.stringify({mode, locale: new Intl.Collator().resolvedOptions().locale, profile: selected, ...stored, bundleDigest: assembled.bundleDigest, historicalBytesIdentical: selected === BASELINE_V1}));
} else {
  assert.equal(mode, 'consume');
  const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));
  const bytes = Buffer.from(await store.get(reference.artifactId));
  assert.equal(reference.artifactId, `artifact:${hash(bytes)}`);
  let error: string | undefined;
  try { verifyBaselineArchive({...reference, archiveBase64: bytes.toString('base64')}, reference.bundleDigest, 'project'); }
  catch (caught) { error = (caught as Error).message; }
  assert.deepEqual(Buffer.from(await store.get(reference.artifactId)), bytes);
  console.log(JSON.stringify({mode, locale: new Intl.Collator().resolvedOptions().locale, artifactId: reference.artifactId, bundleDigest: reference.bundleDigest, imported: error === undefined, error: error ?? null, unchangedCasBytes: true}));
}
