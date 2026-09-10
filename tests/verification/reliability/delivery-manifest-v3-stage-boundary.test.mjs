import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { portableJson, sha256Text } from '@kubeclaw/plugin-sdk';

const child = fileURLToPath(new URL('./delivery-manifest-v3-stage-boundary-child.mjs', import.meta.url));

test('registered Summary v3 stored output is accepted by the original durable import consumer across locales', () => {
  const output = process.env.KUBECLAW_DELIVERY_MANIFEST_PROOF_OUTPUT ? path.resolve(process.env.KUBECLAW_DELIVERY_MANIFEST_PROOF_OUTPUT) : undefined;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-manifest-stage-boundary-'));
  try {
    const outputs = [];
    for (const [phase, locale] of [['produce', 'en_US.UTF-8'], ['consume-en', 'en_US.UTF-8'], ['consume-cs', 'cs_CZ.UTF-8'],
      ['consume-da', 'da_DK.UTF-8'], ['consume-tr', 'tr_TR.UTF-8'], ['consume-sv', 'sv_SE.UTF-8']]) {
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
    const czech = JSON.parse(fs.readFileSync(path.join(root, 'consume-cs-proof.json'), 'utf8'));
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      for (const name of ['producer-proof.json', 'consume-en-proof.json', 'consume-cs-proof.json', 'consume-da-proof.json', 'consume-tr-proof.json', 'consume-sv-proof.json']) fs.copyFileSync(path.join(root, name), path.join(output, name));
      fs.writeFileSync(path.join(output, 'phase-transcript.json'), JSON.stringify({ command: 'node --test tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs', expectedOverallExit: 0, expectedBoundary: 'real FileNovaGateImportStore verified import and original evidence adapter success', phases: outputs }, null, 2) + '\n');
    }
    assert.deepEqual(producer.manifest, JSON.parse(producer.storedJsonBytes));
    assert.deepEqual(producer.unsignedManifest, (({ digest, ...unsigned }) => unsigned)(producer.manifest));
    assert.equal(producer.manifest.schemaVersion, 'delivery-manifest.v3');
    assert.equal(producer.manifest.final.reviewStageId, 'review');
    assert.equal(producer.manifest.final.reviewArtifactEncoding, 'kubeclaw-json.utf16.v1');
    assert.equal(producer.manifest.final.reviewSemanticEncoding, 'review-semantics.utf16-v1');
    assert.equal(producer.manifest.evidence.length, 9);
    for (const ref of producer.manifest.evidence.slice(-2)) {
      assert.equal(ref.namespace, 'kubeclaw.review');
      assert.equal(ref.encoding, 'kubeclaw-json.utf16.v1');
    }
    assert.equal(producer.semanticDigest, sha256Text(portableJson(producer.unsignedManifest)));
    assert.equal(producer.summaryWrite.request.operation, 'put_json');
    assert.equal(producer.summaryWrite.request.payload.encoding, 'kubeclaw-json.utf16.v1');
    assert.deepEqual(producer.summaryWrite.request.payload.value, producer.manifest);
    assert.deepEqual(producer.summaryWrite.receipt.result.artifact, producer.storedArtifactRef);
    assert.equal(producer.boundary.importStoreSuccess, true);
    assert.equal(english.boundary.manifestIntegrityRejected, false);
    assert.equal(czech.parsedManifestMatchesProducer, true);
    for (const phase of ['consume-en', 'consume-cs', 'consume-da', 'consume-tr', 'consume-sv']) {
      const proof = JSON.parse(fs.readFileSync(path.join(root, `${phase}-proof.json`), 'utf8'));
      assert.equal(proof.outcome, 'succeeded');
      assert.equal(proof.boundary.manifestIntegrityRejected, false);
      assert.equal(proof.boundary.importStoreReached, true);
      assert.equal(proof.boundary.importedResultSuccess, true);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
