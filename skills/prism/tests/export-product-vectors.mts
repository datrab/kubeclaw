// Real TypeScript signer vectors consumed by the controller's native Go verifier.
import { generateKeyPairSync } from 'node:crypto';
import { signProductIntent, type ProductConfig, type ProductIntent } from '../control/product-decisions.ts';
const {privateKey, publicKey} = generateKeyPairSync('ed25519');
const config: ProductConfig = {issuer: 'interop-product-authority', privateKey,
  operators: new Set(['operator@example.test']), origin: 'https://studio.example.test',
  controller: new URL('https://controller.example.test'), caFile: '', tokenFile: ''};
const now = Date.now();
const vectors = (['accept', 'extend'] as const).map((action, index) => {
  const intent: ProductIntent = {decisionId: `00000000-0000-4000-8000-00000000000${index + 1}`, action, reason: 'Native TypeScript to Go authority verification',
    subject: {leaseName: 'demo-interop', leaseUID: 'lease-interop', sourceRevision: 'a'.repeat(40),
      candidateDigest: `sha256:${'b'.repeat(64)}`, resultDigest: `sha256:${'c'.repeat(64)}`, readyDigest: `sha256:${'d'.repeat(64)}`,
      generation: 3, expectedExpiry: '2099-09-09T10:20:30.123456789Z', expectedRevision: '123', url: 'https://demo.example.test', runId: 'interop'},
    ...(action === 'extend' ? {extensionSeconds: 3600} : {})};
  const signed = signProductIntent(intent, {user: 'operator@example.test', expiresAt: now + 900_000}, config, now);
  const jwk = publicKey.export({format: 'jwk'});
  return {publicKey: Buffer.from(jwk.x!, 'base64url').toString('base64'), envelope: signed.envelope, expected: signed.payload};
});
process.stdout.write(JSON.stringify(vectors));
