import assert from 'node:assert/strict';
import test from 'node:test';
import { apiReceiverCoverage, assertApiReceiverCoverage } from '../docs-api-receiver-coverage.mjs';
import { receiverContracts } from '../docs-kubernetes-network-receiver-contracts.mjs';

test('complete spec contracts do not conceal absent metadata contracts', () => {
  const coverage = apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy', receiverContracts);
  assert(coverage.missing.includes('$.metadata'));
  assert(!coverage.missing.some((path) => path.startsWith('$.spec')));
  assert.throws(() => assertApiReceiverCoverage(coverage), /API_RECEIVER_CONTRACT_MISSING/);
  const label = coverage.rows.find((row) => row.fieldPath === '$.spec.podSelector.matchLabels["*"]');
  assert.equal(label.receiverContract.fieldPath, '$.spec.podSelector.matchLabels[<exact-key>]');
  assert.equal(coverage.proofClass, 'schema-and-authored-contract-join-only');
});

test('a removed unselected alternative remains a named coverage failure', () => {
  const omitted = '$.spec.rules[].http.paths[].backend.resource.apiGroup';
  const coverage = apiReceiverCoverage('networking.k8s.io/v1', 'Ingress',
    receiverContracts.filter((record) => record.fieldPath !== omitted));
  assert(coverage.missing.includes(omitted));
  assert.equal(coverage.rows.find((row) => row.fieldPath === omitted).receiverContract, null);
});

test('duplicate contracts and undocumented paths cannot hide by overwrite or exclusion', () => {
  const record = receiverContracts.find((row) => row.kind === 'NetworkPolicy');
  assert.throws(() => apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy',
    [...receiverContracts, record]), /API_RECEIVER_CONTRACT_DUPLICATE/);
  const coverage = apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy',
    [...receiverContracts, { ...record, fieldPath: '$.spec.undocumentedField' }]);
  assert.deepEqual(coverage.extra, ['$.spec.undocumentedField']);
  assert.throws(() => assertApiReceiverCoverage(coverage), /API_RECEIVER_PATH_OUTSIDE_AUTHORITY/);
});
