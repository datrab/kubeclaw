#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const GIT_REVISION = /^[a-f0-9]{40,64}$/u;
const MESSAGE_PREFIX = 'kubeclaw-production-receipt-v1\0';

function encodeString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('RFC8785_INVALID_UNICODE');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError('RFC8785_INVALID_UNICODE');
  }
  return JSON.stringify(value);
}

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return encodeString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('RFC8785_INVALID_NUMBER');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('RFC8785_INVALID_TYPE');
  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('RFC8785_INVALID_ARRAY');
      items.push(canonicalJson(value[index]));
    }
    return `[${items.join(',')}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('RFC8785_INVALID_OBJECT');
  return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => `${encodeString(key)}:${canonicalJson(child)}`).join(',')}}`;
}

function unsignedReceipt(value) {
  const { attestation: _attestation, ...unsigned } = value;
  return unsigned;
}

function receiptMessage(value) {
  return Buffer.from(`${MESSAGE_PREFIX}${canonicalJson(unsignedReceipt(value))}`, 'utf8');
}

function publicKeyFingerprint(key) {
  const der = key.export({ type: 'spki', format: 'der' });
  return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

export function attestProductionReceipt(value, privateKey, authority = 'kubeclaw:production-operator') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, 'attestation')) {
    throw new Error('PRODUCTION_RECEIPT_SIGNING_INPUT_INVALID');
  }
  const key = privateKey instanceof crypto.KeyObject ? privateKey : crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('PRODUCTION_RECEIPT_PRIVATE_KEY_INVALID');
  const publicKey = crypto.createPublicKey(key);
  return Object.freeze({ ...value, attestation: Object.freeze({
    schemaVersion: 'production-receipt-attestation.v1',
    algorithm: 'ed25519',
    authority,
    publicKeyFingerprint: publicKeyFingerprint(publicKey),
    signature: crypto.sign(null, receiptMessage(value), key).toString('base64'),
  }) });
}

export function verifyProductionReceipt(value, publicKey, options = {}) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['receipt is not an object'];
  const expectedAuthority = options.expectedAuthority ?? 'kubeclaw:production-operator';
  if (value.schemaVersion !== 'nova-tailscale-production-preflight.v1') errors.push('schemaVersion is invalid');
  if (value.ok !== true || value.status !== 'completed' || value.decision !== 'passed') errors.push('result is not successful');
  if (value.evidenceImported !== true || value.runnerCleanupVerified !== true
    || value.cleanupVerified !== true || value.clusterCleanupObserved !== true) errors.push('cleanup or import proof is incomplete');
  if (value.mocks !== 0 || value.emulators !== 0) errors.push('mock or emulator evidence is not permitted');
  if (!GIT_REVISION.test(value.runtimeRevision ?? '')) errors.push('runtimeRevision is invalid');
  if (!GIT_REVISION.test(value.busterRuntimeRevision ?? '')) errors.push('busterRuntimeRevision is invalid');
  if (Object.hasOwn(options, 'expectedRevision') && value.runtimeRevision !== options.expectedRevision) {
    errors.push('runtimeRevision does not match');
  }
  if (Object.hasOwn(options, 'expectedBusterRevision')
    && value.busterRuntimeRevision !== options.expectedBusterRevision) {
    errors.push('busterRuntimeRevision does not match');
  }
  for (const field of ['planDigest', 'resultDigest', 'decisionDigest']) {
    if (!DIGEST.test(value[field] ?? '')) errors.push(`${field} is invalid`);
  }
  if (!Array.isArray(value.evidenceDigests) || value.evidenceDigests.length < 1
    || value.evidenceDigests.some((digest) => !DIGEST.test(digest))) errors.push('evidenceDigests are invalid');
  if (!value.resources?.leaseName || !value.resources?.namespace || !value.resources?.hostname) {
    errors.push('resource identity is incomplete');
  }
  const attestation = value.attestation;
  if (attestation?.schemaVersion !== 'production-receipt-attestation.v1'
    || attestation.algorithm !== 'ed25519' || attestation.authority !== expectedAuthority
    || !DIGEST.test(attestation.publicKeyFingerprint ?? '') || typeof attestation.signature !== 'string') {
    errors.push('attestation metadata is invalid');
    return errors;
  }
  try {
    const key = publicKey instanceof crypto.KeyObject ? publicKey : crypto.createPublicKey(publicKey);
    if (key.asymmetricKeyType !== 'ed25519') errors.push('trusted public key is not Ed25519');
    else if (attestation.publicKeyFingerprint !== publicKeyFingerprint(key)) errors.push('trusted public key fingerprint differs');
    else if (!crypto.verify(null, receiptMessage(value), key, Buffer.from(attestation.signature, 'base64'))) {
      errors.push('receipt signature is invalid');
    }
  } catch { errors.push('trusted public key is invalid'); }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, receiptPath, keyPath, expectedRevision, expectedBusterRevision, outputPath] = process.argv.slice(2);
  if (!['sign', 'verify'].includes(command) || !receiptPath || !keyPath || !expectedRevision
    || !expectedBusterRevision || (command === 'sign' && !outputPath)) {
    process.stderr.write('Usage: production-receipt-attestation.mjs sign RECEIPT PRIVATE_KEY EXPECTED_REVISION EXPECTED_BUSTER_REVISION OUTPUT\n');
    process.stderr.write('   or: production-receipt-attestation.mjs verify RECEIPT PUBLIC_KEY EXPECTED_REVISION EXPECTED_BUSTER_REVISION\n');
    process.exit(2);
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (command === 'sign') {
    if (receipt.runtimeRevision !== expectedRevision
      || receipt.busterRuntimeRevision !== expectedBusterRevision || receipt.cleanupVerified !== true
      || receipt.clusterCleanupObserved !== true || Object.hasOwn(receipt, 'attestation')) {
      process.stderr.write('production receipt: unsigned operator observation is invalid\n');
      process.exit(1);
    }
    const signed = attestProductionReceipt(receipt, fs.readFileSync(keyPath));
    fs.writeFileSync(outputPath, `${JSON.stringify(signed, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write('production receipt signed by operator authority\n');
    process.exit(0);
  }
  const errors = verifyProductionReceipt(receipt, fs.readFileSync(keyPath), {
    expectedRevision, expectedBusterRevision,
  });
  if (errors.length) {
    for (const error of errors) process.stderr.write(`production receipt: ${error}\n`);
    process.exit(1);
  }
  process.stdout.write('production receipt attestation verified\n');
}
