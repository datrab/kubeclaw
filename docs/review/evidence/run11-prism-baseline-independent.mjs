import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assembleBaselineArchive, BASELINE_V1, BASELINE_V2, BASELINE_CHECKSUM_ENCODING} from '../../../contracts/prism/v1/src/baseline-archive.ts';
import {baselineInput} from '../../../contracts/prism/v1/tests/fixtures/baseline-input.mts';
import {ContentAddressedArtifactStore} from '../../../skills/prism/storage/artifacts.ts';
import {verifyBaselineArchive} from '../../../skills/nova/plugins/prism-design/src/archive.ts';

const base = 'b3d2f7ba3ee35d121f26f67f737a400b3d034fb4';
const schema = 'contracts/prism/v1/schemas/prism-v1.schema.json';
assert.equal(fs.readFileSync(schema, 'utf8'), execFileSync('git', ['show', `${base}:${schema}`], {encoding:'utf8'}));
const old = execFileSync('git', ['show', `${base}:skills/prism/server/control-server.ts`], {encoding:'utf8'});
const current = fs.readFileSync('skills/prism/server/control-server.ts', 'utf8');
const section = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start)));
const start = '    if (url.pathname === "/v1/baselines" && request.method === "POST")';
assert.equal(section(current,start,'      const assembled ='), section(old,start,'      const checksums: Record<string, string>'));
const dispatch = '          bundleDigest: baseline.rows[0].bundle_digest,';
assert(current.includes(dispatch) && old.includes(dispatch));
const paths = execFileSync('git',['diff','--name-only',base,'60a03f8cb86b45f397aa144b2dc058a58cce5f3e'],{encoding:'utf8'}).trim().split('\n');
assert(paths.every(p => p.startsWith('contracts/prism/v1/') || p.startsWith('docs/review/') || p === 'skills/nova/plugins/prism-design/src/archive.ts' || p === 'skills/prism/server/control-server.ts'));
console.log(JSON.stringify({originalV1Schema:'byte-identical', originalControlPriorRowApprovalWorkerAssemblyInputs:'byte-identical', EnginePublishBusterAndStage:'unchanged source'}));

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
