import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

const child = fileURLToPath(new URL('./delivery-manifest-stage-boundary-child.mjs', import.meta.url));

test('registered Summary v2 stored output is accepted by the original downstream manifest reader across locales', () => {
  const output = process.env.KUBECLAW_DELIVERY_MANIFEST_PROOF_OUTPUT ? path.resolve(process.env.KUBECLAW_DELIVERY_MANIFEST_PROOF_OUTPUT) : undefined;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-stage-boundary-'));
  try {
    const outputs = [];
    for (const [phase, locale] of [['produce', 'en_US.UTF-8'], ['consume-en', 'en_US.UTF-8'], ['consume-portable-en', 'en_US.UTF-8'], ['consume-cs', 'cs_CZ.UTF-8']]) {
      const env = { ...process.env, LANG: locale, LC_ALL: locale };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [child, root, phase], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), env, encoding: 'utf8', timeout: 30000 });
      outputs.push({ phase, locale, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr });
      console.log(JSON.stringify(outputs.at(-1)));
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.signal, null);
    }
    const producer = JSON.parse(fs.readFileSync(path.join(root, 'producer-proof.json'), 'utf8'));
    const english = JSON.parse(fs.readFileSync(path.join(root, 'consume-en-proof.json'), 'utf8'));
    const portableEnglish = JSON.parse(fs.readFileSync(path.join(root, 'consume-portable-en-proof.json'), 'utf8'));
    const czech = JSON.parse(fs.readFileSync(path.join(root, 'consume-cs-proof.json'), 'utf8'));
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      for (const name of ['producer-proof.json', 'consume-en-proof.json', 'consume-portable-en-proof.json', 'consume-cs-proof.json']) fs.copyFileSync(path.join(root, name), path.join(output, name));
      fs.writeFileSync(path.join(output, 'phase-transcript.json'), JSON.stringify({ command: 'node --test tests/verification/reliability/delivery-manifest-stage-boundary.test.mjs', expectedOverallExit: 1, expectedFailure: 'cross-locale original v2 manifest integrity', phases: outputs }, null, 2) + '\n');
    }
    assert.deepEqual(producer.manifest, JSON.parse(producer.storedJsonBytes));
    assert.deepEqual(producer.unsignedManifest, (({ digest, ...unsigned }) => unsigned)(producer.manifest));
    assert.equal(producer.semanticDigest, sha256Text(canonicalJson(producer.unsignedManifest)));
    assert.equal(producer.summaryWrite.request.operation, 'put_json');
    assert.equal(Object.hasOwn(producer.summaryWrite.request.payload, 'encoding'), false);
    assert.deepEqual(producer.summaryWrite.request.payload.value, producer.manifest);
    assert.deepEqual(producer.summaryWrite.receipt.result.artifact, producer.storedArtifactRef);
    assert.equal(english.boundary.manifestIntegrityRejected, false, 'same-locale control must pass manifest integrity before the deliberately absent import record stops it');
    assert.equal(portableEnglish.boundary.manifestIntegrityRejected, false, 'existing v2 reader must retain valid tagged-portable outer ArtifactRef acceptance');
    assert.equal(producer.portableV2ReaderContractRef.encoding, 'kubeclaw-json.utf16.v1');
    assert.equal(czech.parsedManifestMatchesProducer, true);
    assert.notEqual(czech.recomputedSemanticDigest, producer.semanticDigest, 'another locale must expose the v2 inner digest mismatch on the identical parsed value');
    assert.equal(czech.boundary.manifestIntegrityRejected, false, 'the identical stored v2 manifest must cross the original downstream manifest-integrity boundary in another locale');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
