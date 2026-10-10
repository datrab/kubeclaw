import assert from 'node:assert/strict';
import { apiResourceFieldBoundaries } from './docs-api-schema-authorities.mjs';
import { yamlFieldPath, yamlFieldPathTokens } from './yaml-field-path.mjs';

const canonical = (value) => yamlFieldPath(
  yamlFieldPathTokens(value.replaceAll('[<exact-key>]', '["*"]')),
  { arrayWildcard: true },
);

// This join checks completeness, not technical correctness or independent
// acceptance. Keep both the schema and the authored receiver contract intact.
// Every schema path participates, including metadata, status and unused fields.
export function apiReceiverCoverage(apiVersion, kind, receiverContracts) {
  assert(Array.isArray(receiverContracts), 'API_RECEIVER_REGISTRY_INVALID: expected an array');
  const selected = new Map();
  for (const record of receiverContracts.filter((entry) => entry.kind === kind)) {
    const fieldPath = canonical(record.fieldPath);
    assert(!selected.has(fieldPath), `API_RECEIVER_CONTRACT_DUPLICATE: ${apiVersion}/${kind} ${fieldPath}`);
    for (const name of ['purpose', 'receiver', 'operationScope', 'omitted', 'nullValue', 'emptyValue', 'invalidValue', 'changeImpact']) {
      assert(typeof record[name] === 'string' && record[name].trim(),
        `API_RECEIVER_CONTRACT_INCOMPLETE: ${apiVersion}/${kind} ${fieldPath} ${name}`);
    }
    for (const name of ['crossFieldConditions', 'cases', 'evidence', 'qualificationLimits']) {
      assert(Array.isArray(record[name]), `API_RECEIVER_CONTRACT_INCOMPLETE: ${apiVersion}/${kind} ${fieldPath} ${name}`);
    }
    assert(record.cases.length && record.evidence.length,
      `API_RECEIVER_CONTRACT_INCOMPLETE: ${apiVersion}/${kind} ${fieldPath} cases/evidence`);
    selected.set(fieldPath, record);
  }
  const boundaries = apiResourceFieldBoundaries(apiVersion, kind);
  const paths = new Set(boundaries.map((row) => row.fieldPath));
  const rows = boundaries.map((schema) => ({
    ...schema,
    receiverContract: selected.get(schema.fieldPath) ?? null,
    coverageState: selected.has(schema.fieldPath) ? 'authored-contract-present' : 'receiver-contract-missing',
  }));
  return {
    apiVersion, kind, proofClass: 'schema-and-authored-contract-join-only', rows,
    missing: rows.filter((row) => !row.receiverContract).map((row) => row.fieldPath),
    extra: [...selected.keys()].filter((fieldPath) => !paths.has(fieldPath)).sort(),
    acceptanceLimit: 'Contract presence does not prove the claims, source support, reader tasks, publication, or independent acceptance.',
  };
}

export function assertApiReceiverCoverage(coverage) {
  assert.equal(coverage.extra.length, 0,
    `API_RECEIVER_PATH_OUTSIDE_AUTHORITY: ${coverage.apiVersion}/${coverage.kind} ${coverage.extra.join(', ')}`);
  assert.equal(coverage.missing.length, 0,
    `API_RECEIVER_CONTRACT_MISSING: ${coverage.apiVersion}/${coverage.kind} ${coverage.missing.join(', ')}`);
}
