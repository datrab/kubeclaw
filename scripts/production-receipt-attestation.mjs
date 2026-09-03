#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const GIT_REVISION = /^[a-f0-9]{40,64}$/u;
const MESSAGE_PREFIX = 'kubeclaw-production-receipt-v1\0';
const RECEIPT_SCHEMAS = new Set([
  'kubernetes-fixture-production-preflight.v1',
  'nova-container-build-production-preflight.v4',
  'nova-http-production-preflight.v1',
  'nova-tailscale-production-preflight.v1',
  'nova-unit-production-preflight.v2',
]);

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

function validateProductionReceiptPayload(value, options = {}) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['receipt is not an object'];
  if (!RECEIPT_SCHEMAS.has(value.schemaVersion)) errors.push('schemaVersion is invalid');
  if (value.ok !== true || value.status !== 'completed' || value.decision !== 'passed') errors.push('result is not successful');
  if (value.evidenceImported !== true) errors.push('evidence import proof is incomplete');
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
  if (value.schemaVersion === 'nova-unit-production-preflight.v2') {
    if (value.suite !== 'unit') errors.push('suite identity is invalid');
    if (value.runnerCleanupVerified !== true || value.clusterCleanupNotApplicable !== true
      || value.cleanupVerified === true || value.clusterCleanupObserved === true) {
      errors.push('unit cleanup scope is invalid');
    }
    if (value.realProcessVerified !== true || value.junitReportVerified !== true
      || value.resourceMetricsVerified !== true) errors.push('unit execution proof is incomplete');
  } else if (value.schemaVersion === 'nova-container-build-production-preflight.v4') {
    if (value.suite !== 'build') errors.push('suite identity is invalid');
    if (value.runnerCleanupVerified !== true || value.clusterCleanupNotApplicable !== true
      || value.cleanupVerified === true || value.clusterCleanupObserved === true) {
      errors.push('container-build cleanup scope is invalid');
    }
    if (typeof value.immutableImage !== 'string' || !DIGEST.test(value.imageDigest ?? '')
      || !value.immutableImage.endsWith(`@${value.imageDigest}`)
      || value.registryPushVerified !== true || value.manifestVerified !== true) {
      errors.push('container image proof is incomplete');
    }
  } else if (value.schemaVersion === 'kubernetes-fixture-production-preflight.v1') {
    if (value.suite !== 'k8s') errors.push('suite identity is invalid');
    if (value.runnerCleanupVerified !== true || value.cleanupVerified !== true
      || value.clusterCleanupObserved !== true) errors.push('cleanup or import proof is incomplete');
    if (value.namespaceDeleted !== true || value.deploymentReadyVerified !== true
      || value.podReadyVerified !== true || value.manifestAppliedVerified !== true
      || value.approvedSecretCopyVerified !== true || !DIGEST.test(value.imageDigest ?? '')
      || !DIGEST.test(value.manifestDigest ?? '') || !value.resources?.leaseName
      || !value.resources?.namespace || !value.resources?.secretName) {
      errors.push('Kubernetes fixture proof is incomplete');
    }
  } else if (value.schemaVersion === 'nova-tailscale-production-preflight.v1') {
    if (value.suite !== 'tailscale-preview') errors.push('suite identity is invalid');
    if (value.runnerCleanupVerified !== true || value.cleanupVerified !== true
      || value.clusterCleanupObserved !== true) errors.push('cleanup or import proof is incomplete');
    if (!value.resources?.leaseName || !value.resources?.namespace || !value.resources?.hostname) {
      errors.push('resource identity is incomplete');
    }
  } else if (value.schemaVersion === 'nova-http-production-preflight.v1') {
    if (value.suite !== 'health') errors.push('suite identity is invalid');
    if (value.runnerCleanupVerified !== true || value.cleanupVerified !== true
      || value.clusterCleanupObserved !== true) errors.push('cleanup or import proof is incomplete');
    if (!value.resources?.leaseName || !value.resources?.namespace
      || value.resources?.serviceName !== 'http-preflight' || value.resources?.servicePort !== 80) {
      errors.push('resource identity is incomplete');
    }
    let target;
    try { target = new URL(value.target); } catch { errors.push('HTTP target is invalid'); }
    const expectedHostname = value.resources?.namespace
      ? `http-preflight.${value.resources.namespace}.svc.cluster.local`
      : null;
    if (target && (target.protocol !== 'http:' || target.hostname !== expectedHostname
      || (target.port !== '' && target.port !== '80') || target.pathname !== '/'
      || target.username || target.password || target.search || target.hash)) errors.push('HTTP target is invalid');
    if (!Number.isSafeInteger(value.httpStatus) || value.httpStatus < 200 || value.httpStatus > 299
      || value.networkRequestVerified !== true) errors.push('HTTP request proof is incomplete');
  }
  return errors;
}

export function verifyProductionReceipt(value, publicKey, options = {}) {
  const errors = validateProductionReceiptPayload(value, options);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return errors;
  const expectedAuthority = options.expectedAuthority ?? 'kubeclaw:production-operator';
  const attestation = value.attestation;
  if (attestation?.schemaVersion !== 'production-receipt-attestation.v1'
    || attestation.algorithm !== 'ed25519' || attestation.authority !== expectedAuthority
    || !DIGEST.test(attestation.publicKeyFingerprint ?? '') || typeof attestation.signature !== 'string') {
    errors.push('attestation metadata is invalid');
    return errors;
  }
  if (options.expectedPublicKeyFingerprint !== undefined
    && attestation.publicKeyFingerprint !== options.expectedPublicKeyFingerprint) {
    errors.push('receipt key fingerprint does not match the recorded trust anchor');
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
      || receipt.busterRuntimeRevision !== expectedBusterRevision
      || validateProductionReceiptPayload(receipt, { expectedRevision, expectedBusterRevision }).length > 0
      || Object.hasOwn(receipt, 'attestation')) {
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
