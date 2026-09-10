import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assembleBaselineArchive, BASELINE_V1, BASELINE_V2, BASELINE_CHECKSUM_ENCODING} from '../../../contracts/prism/v1/src/baseline-archive.ts';
import {baselineInput} from '../../../contracts/prism/v1/tests/fixtures/baseline-input.mts';
import {ContentAddressedArtifactStore} from '../../../skills/prism/storage/artifacts.ts';
import {verifyBaselineArchive} from '../../../skills/nova/plugins/prism-design/src/archive.ts';

// Native CAS regression uses only current checkout sources and dependencies.
// The original Git-object static audit and its original results are preserved
// separately as historical evidence, not claimed as a fresh-checkout gate.

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-independent-retag-'));
try {
  const store = new ContentAddressedArtifactStore(root);
  const input = await baselineInput(store);
  for (const selected of [BASELINE_V1, BASELINE_V2]) {
    const original = assembleBaselineArchive({...input, profile:selected});
    const saved = await store.put(original.bytes);
    const archive = structuredClone(original.archive);
    const checksum = JSON.parse(archive.textFiles['checksums.json']);
    if (selected === BASELINE_V1) {
      archive.schema = BASELINE_V2; archive.manifest.schema = 'prism.baseline-bundle.v2';
      archive.manifest.checksumEncoding = BASELINE_CHECKSUM_ENCODING;
      archive.textFiles['checksums.json'] = JSON.stringify({algorithm:'sha256', encoding:BASELINE_CHECKSUM_ENCODING, files:checksum.files, schema:'prism.baseline-checksums.v2'});
    } else {
      archive.schema = BASELINE_V1; archive.manifest.schema = 'prism.baseline-bundle.v1';
      delete archive.manifest.checksumEncoding;
      archive.textFiles['checksums.json'] = JSON.stringify({algorithm:'sha256', files:checksum.files});
    }
    archive.textFiles['manifest.json'] = JSON.stringify(archive.manifest);
    const retag = await store.put(Buffer.from(JSON.stringify(archive)));
    const bytes = Buffer.from(await store.get(retag.artifactId));
    assert.throws(() => verifyBaselineArchive({...retag, bundleDigest:original.bundleDigest, archiveBase64:bytes.toString('base64')}, original.bundleDigest, 'project'), /PRISM_ARCHIVE_BUNDLE_DIGEST_MISMATCH/);
    assert.deepEqual(Buffer.from(await store.get(saved.artifactId)), original.bytes);
    console.log(JSON.stringify({originalProfile:selected, coherentPairedRetag:'denied without changing approval digest', originalCasUnchanged:true, fullControlEndpointClaimed:false}));
  }
} finally { fs.rmSync(root,{recursive:true}); }
