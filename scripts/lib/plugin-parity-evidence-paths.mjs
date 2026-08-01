import crypto from 'node:crypto';
import path from 'node:path';

export const MAX_PARITY_EVIDENCE_BASENAME_LENGTH = 54;

const STATUS_CODES = new Map([
  ['implementation-in-progress', 'ip'],
  ['parity-proven', 'pp'],
  ['cutover-complete', 'cc'],
]);

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function compactToken(value, maxLength) {
  const safe = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (safe || 'item').slice(0, maxLength).replace(/-+$/g, '') || 'item';
}

function statusCode(status) {
  const code = STATUS_CODES.get(status);
  if (!code) throw new Error(`unsupported parity evidence status: ${status}`);
  return code;
}

function evidenceIdentity(unitId, status, commit) {
  return `${unitId}\0${status}\0${commit}`;
}

export function parityEvidenceRecordBasename({ unitId, status, commit }) {
  const unitToken = compactToken(unitId, 20);
  const unitDigest = digest(unitId).slice(0, 6);
  return `${unitToken}.${unitDigest}.${statusCode(status)}.${commit.slice(0, 12)}.json`;
}

export function parityEvidenceOutputBasename({ unitId, status, commit, gateId }) {
  const recordKey = digest(evidenceIdentity(unitId, status, commit)).slice(0, 16);
  const gateToken = compactToken(gateId, 24);
  const gateDigest = digest(gateId).slice(0, 8);
  return `${recordKey}.${gateToken}.${gateDigest}.log`;
}

export function assertCanonicalParityEvidenceBasename(filePath, expectedBasename) {
  const actualBasename = path.basename(filePath);
  if (actualBasename !== expectedBasename) {
    throw new Error(`non-canonical parity evidence filename ${actualBasename}; expected ${expectedBasename}`);
  }
  if (actualBasename.length > MAX_PARITY_EVIDENCE_BASENAME_LENGTH) {
    throw new Error(
      `parity evidence filename exceeds ${MAX_PARITY_EVIDENCE_BASENAME_LENGTH} characters: ${actualBasename}`,
    );
  }
}
