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
  schemaVersion: 'nova-tailscale-production-preflight.v1', suite: 'tailscale-preview',
  ok: true, runtimeRevision: revision,
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
assert.ok(verifyProductionReceipt({ ...signed, suite: 'health' }, keys.publicKey,
  { expectedRevision: revision }).includes('suite identity is invalid'));
const httpUnsigned = {
  schemaVersion: 'nova-http-production-preflight.v1', suite: 'health',
  ok: true, runtimeRevision: revision,
  busterRuntimeRevision: busterRevision, runId: 'run:http', jobId: 'job:http', planDigest: digest,
  resultDigest: digest, decisionDigest: digest, status: 'completed', decision: 'passed',
  evidenceDigests: [digest], evidenceImported: true,
  runnerCleanupVerified: true, cleanupVerified: true, clusterCleanupObserved: true,
  resources: { leaseName: 'test-http', namespace: 'test-http', serviceName: 'http-preflight', servicePort: 80 },
  target: 'http://http-preflight.test-http.svc.cluster.local/', httpStatus: 200,
  networkRequestVerified: true, mocks: 0, emulators: 0,
};
const httpSigned = attestProductionReceipt(httpUnsigned, keys.privateKey);
assert.deepEqual(verifyProductionReceipt(httpSigned, keys.publicKey, {
  expectedRevision: revision, expectedBusterRevision: busterRevision,
}), []);
assert.ok(verifyProductionReceipt({ ...httpSigned, target: 'https://example.com/' }, keys.publicKey,
  { expectedRevision: revision }).includes('HTTP target is invalid'));
assert.ok(verifyProductionReceipt({ ...httpSigned,
  target: 'http://http-preflight.another-namespace.svc.cluster.local/' }, keys.publicKey,
{ expectedRevision: revision }).includes('HTTP target is invalid'));
assert.ok(verifyProductionReceipt(httpSigned, keys.publicKey, {
  expectedRevision: revision, expectedPublicKeyFingerprint: `sha256:${'f'.repeat(64)}`,
}).includes('receipt key fingerprint does not match the recorded trust anchor'));
const { cleanupVerified: _cleanupVerified, clusterCleanupObserved: _clusterCleanupObserved,
  ...nonClusterUnsigned } = httpUnsigned;
const unitSigned = attestProductionReceipt({ ...nonClusterUnsigned,
  schemaVersion: 'nova-unit-production-preflight.v2', suite: 'unit',
  clusterCleanupNotApplicable: true,
  realProcessVerified: true, junitReportVerified: true, resourceMetricsVerified: true,
}, keys.privateKey);
assert.deepEqual(verifyProductionReceipt(unitSigned, keys.publicKey, {
  expectedRevision: revision, expectedBusterRevision: busterRevision,
}), []);
const buildSigned = attestProductionReceipt({ ...nonClusterUnsigned,
  schemaVersion: 'nova-container-build-production-preflight.v4', suite: 'build',
  clusterCleanupNotApplicable: true,
  immutableImage: `registry.example.invalid/app@${digest}`, imageDigest: digest,
  registryPushVerified: true, manifestVerified: true,
}, keys.privateKey);
assert.deepEqual(verifyProductionReceipt(buildSigned, keys.publicKey, {
  expectedRevision: revision, expectedBusterRevision: busterRevision,
}), []);
const kubernetesSigned = attestProductionReceipt({ ...httpUnsigned,
  schemaVersion: 'kubernetes-fixture-production-preflight.v1', suite: 'k8s',
  namespaceDeleted: true, deploymentReadyVerified: true, podReadyVerified: true,
  manifestAppliedVerified: true, approvedSecretCopyVerified: true,
  resources: { leaseName: 'test-k8s', namespace: 'test-k8s', secretName: 'test-secret' },
  imageDigest: digest, manifestDigest: digest,
}, keys.privateKey);
assert.deepEqual(verifyProductionReceipt(kubernetesSigned, keys.publicKey, {
  expectedRevision: revision, expectedBusterRevision: busterRevision,
}), []);
const browserReceiptBase = { ...httpUnsigned, immutableImage: `registry.example.invalid/app@${digest}`,
  imageDigest: digest, resources: { leaseName: 'test-browser', namespace: 'test-browser',
    serviceName: 'browser-preflight', servicePort: 80 } };
for (const receipt of [
  { ...browserReceiptBase, schemaVersion: 'nova-a11y-production-preflight.v1', suite: 'a11y',
    browserEnginesVerified: ['chromium', 'firefox', 'webkit'] },
  { ...browserReceiptBase, schemaVersion: 'nova-lighthouse-production-preflight.v1', suite: 'perf',
    lighthouseVersion: '13.4.1', reportCount: 3 },
  { ...browserReceiptBase, schemaVersion: 'nova-visual-production-preflight.v1', suite: 'visual-reg',
    browserVersion: 'real-browser-version' },
]) {
  const browserSigned = attestProductionReceipt(receipt, keys.privateKey);
  assert.deepEqual(verifyProductionReceipt(browserSigned, keys.publicKey, {
    expectedRevision: revision, expectedBusterRevision: busterRevision,
  }), []);
  const wrongImage = attestProductionReceipt({ ...receipt, imageDigest: `sha256:${'c'.repeat(64)}` }, keys.privateKey);
  assert.ok(verifyProductionReceipt(wrongImage, keys.publicKey, { expectedRevision: revision })
    .includes('workload image proof is incomplete'));
  const noImport = attestProductionReceipt({ ...receipt, evidenceImported: false }, keys.privateKey);
  assert.ok(verifyProductionReceipt(noImport, keys.publicKey, { expectedRevision: revision })
    .includes('browser evidence import proof is incomplete'));
}
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
