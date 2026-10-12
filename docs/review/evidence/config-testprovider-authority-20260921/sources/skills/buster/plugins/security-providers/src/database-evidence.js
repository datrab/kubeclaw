import { object } from './common.js';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
/** Missing snapshot evidence cannot be interpreted as a clean advisory scan. */
export function databaseEvidence(response) {
  const evidence = object(response.databaseEvidence, 'SECURITY_DATABASE_EVIDENCE_REQUIRED');
  const evaluated = Date.parse(evidence.evaluatedAt);
  if (typeof evidence.evaluatedAt !== 'string' || evidence.schemaVersion !== 'trivy-database-evidence.v1' || !Number.isFinite(evaluated) || evaluated > Date.now()
    || !Array.isArray(evidence.databases) || evidence.databases.length !== 2) throw new Error('SECURITY_DATABASE_EVIDENCE_INVALID');
  const kinds = new Set();
  for (const raw of evidence.databases) {
    const item = object(raw, 'SECURITY_DATABASE_EVIDENCE_INVALID');
    const version = item.kind === 'vulnerability' ? 2 : item.kind === 'java' ? 1 : undefined;
    if (version === undefined || kinds.has(item.kind) || item.schemaVersion !== version) throw new Error('SECURITY_DATABASE_EVIDENCE_INVALID');
    checkAge(item, evaluated);
    checkContent(item);
    kinds.add(item.kind);
  }
  return evidence;
}


function checkAge(item, evaluated) {
  const updated = Date.parse(item.updatedAt), next = Date.parse(item.nextUpdate);
  if (typeof item.updatedAt !== 'string' || typeof item.nextUpdate !== 'string'
    || !Number.isFinite(updated) || updated <= 0 || !Number.isFinite(next) || next <= updated || updated > evaluated
    || !Number.isSafeInteger(item.maximumAgeMs) || item.maximumAgeMs < 1 || item.maximumAgeMs > 30 * 86400000
    || item.sourceAgeMs !== evaluated - updated || Date.now() - updated > item.maximumAgeMs) {
    throw new Error('SECURITY_DATABASE_EVIDENCE_INVALID');
  }
}
function checkContent(item) {
  if (!Number.isSafeInteger(item.databaseBytes) || item.databaseBytes < 1 || item.databaseBytes > 32 * 1024 ** 3
    || !DIGEST.test(item.databaseDigest) || !DIGEST.test(item.metadataDigest)) throw new Error('SECURITY_DATABASE_EVIDENCE_INVALID');
}
