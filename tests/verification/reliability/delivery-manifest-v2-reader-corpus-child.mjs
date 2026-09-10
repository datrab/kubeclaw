import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = process.env.KUBECLAW_REVIEW_SOURCE_ROOT;
const proofRoot = process.env.KUBECLAW_REVIEW_V2_PROOF_ROOT;
assert(sourceRoot && path.isAbsolute(sourceRoot));
assert(proofRoot && path.isAbsolute(proofRoot));
const contract = await import(pathToFileURL(path.join(sourceRoot, 'contracts/delivery-manifest/v3/src/index.ts')).href);
const proof = JSON.parse(fs.readFileSync(path.join(proofRoot, 'producer-proof.json'), 'utf8'));
const expectedRef = process.argv[2] === 'portable' ? proof.portableV2ReaderContractRef : proof.storedArtifactRef;
try {
  const parsed = contract.assertDeliveryManifestForRead(proof.manifest, {
    runId: proof.runId,
    manifestStageId: 'project-summary',
    gateStageId: 'final-test',
    expectedRef,
    bytes: proof.storedJsonBytes,
  });
  process.stdout.write(`${JSON.stringify({ accepted: true, same: JSON.stringify(parsed) === JSON.stringify(proof.manifest) })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ accepted: false, error: error instanceof Error ? error.message : String(error) })}\n`);
}
