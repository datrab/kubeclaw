import crypto from 'node:crypto';
import { canonicalJson } from './digest.ts';
import type { WorkerTrustEnvelopeV1 } from './types.ts';

export type UnsignedWorkerTrustEnvelopeV1 = Omit<WorkerTrustEnvelopeV1, 'algorithm' | 'signature'>;

function signingMessage(value: UnsignedWorkerTrustEnvelopeV1 | WorkerTrustEnvelopeV1): Buffer {
  const { algorithm: _algorithm, signature: _signature, ...unsigned } = value as WorkerTrustEnvelopeV1;
  return Buffer.from(`kubeclaw-worker-trust-v1\0${canonicalJson(unsigned)}`, 'utf8');
}

export function signWorkerTrustEnvelope(
  value: UnsignedWorkerTrustEnvelopeV1,
  privateKey: crypto.KeyLike,
): WorkerTrustEnvelopeV1 {
  const key = privateKey instanceof crypto.KeyObject ? privateKey : crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('WORKER_TRUST_PRIVATE_KEY_INVALID');
  return Object.freeze({
    ...value,
    algorithm: 'ed25519',
    signature: crypto.sign(null, signingMessage(value), key).toString('base64'),
  });
}

export function verifyWorkerTrustEnvelope(
  value: WorkerTrustEnvelopeV1,
  publicKey: crypto.KeyLike,
  expected: Readonly<{ issuer: string; audience: string; purpose: string }>,
  now = Date.now(),
): boolean {
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (value.schemaVersion !== 'worker-trust-envelope.v1' || value.algorithm !== 'ed25519'
    || value.issuer !== expected.issuer || value.audience !== expected.audience
    || value.purpose !== expected.purpose || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
    || expiresAt <= issuedAt || issuedAt > now || expiresAt <= now) return false;
  try {
    const key = publicKey instanceof crypto.KeyObject ? publicKey : crypto.createPublicKey(publicKey);
    return key.asymmetricKeyType === 'ed25519'
      && crypto.verify(null, signingMessage(value), key, Buffer.from(value.signature, 'base64'));
  } catch {
    return false;
  }
}
