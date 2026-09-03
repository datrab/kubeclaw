import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attestProductionReceipt, verifyProductionReceipt } from '../../../scripts/production-receipt-attestation.mjs';

const keys = crypto.generateKeyPairSync('ed25519');
const revision = 'a'.repeat(40);
const busterRevision = 'e'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const unsigned = {
  schemaVersion: 'nova-tailscale-production-preflight.v1', ok: true, runtimeRevision: revision,
  busterRuntimeRevision: busterRevision,
  runId: 'run:fixture', jobId: 'job:fixture', planDigest: digest, resultDigest: digest,
  decisionDigest: digest, status: 'completed', decision: 'passed', evidenceDigests: [digest],
  evidenceImported: true, runnerCleanupVerified: true, cleanupVerified: true,
  clusterCleanupObserved: true, resources: { leaseName: 'lease', namespace: 'test-fixture',
    hostname: 'fixture.example.ts.net' }, mocks: 0, emulators: 0,
};
const signed = attestProductionReceipt(unsigned, keys.privateKey);
assert.deepEqual(verifyProductionReceipt(signed, keys.publicKey, {
  expectedRevision: revision, expectedBusterRevision: busterRevision,
}), []);
assert.match(signed.attestation.publicKeyFingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.ok(verifyProductionReceipt({ ...signed, cleanupVerified: false }, keys.publicKey,
  { expectedRevision: revision }).includes('cleanup or import proof is incomplete'));
assert.ok(verifyProductionReceipt({ ...signed, decisionDigest: `sha256:${'c'.repeat(64)}` }, keys.publicKey,
  { expectedRevision: revision }).includes('receipt signature is invalid'));
const otherKeys = crypto.generateKeyPairSync('ed25519');
assert.ok(verifyProductionReceipt(signed, otherKeys.publicKey, { expectedRevision: revision })
  .includes('trusted public key fingerprint differs'));
assert.ok(verifyProductionReceipt(signed, keys.publicKey, { expectedRevision: 'd'.repeat(40) })
  .includes('runtimeRevision does not match'));
assert.ok(verifyProductionReceipt(signed, keys.publicKey, { expectedRevision: '' })
  .includes('runtimeRevision does not match'));
assert.ok(verifyProductionReceipt(signed, keys.publicKey, { expectedBusterRevision: '' })
  .includes('busterRuntimeRevision does not match'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'production-receipt-attestation-'));
try {
  const unsignedPath = path.join(temporary, 'unsigned.json');
  const signedPath = path.join(temporary, 'signed.json');
  const privatePath = path.join(temporary, 'private.pem');
  const publicPath = path.join(temporary, 'public.pem');
  fs.writeFileSync(unsignedPath, JSON.stringify(unsigned));
  fs.writeFileSync(privatePath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(publicPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const script = fileURLToPath(new URL('../../../scripts/production-receipt-attestation.mjs', import.meta.url));
  execFileSync(process.execPath, [script, 'sign', unsignedPath, privatePath, revision, busterRevision, signedPath]);
  execFileSync(process.execPath, [script, 'verify', signedPath, publicPath, revision, busterRevision]);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, contract: 'production-receipt-attestation', algorithm: 'ed25519' }));
