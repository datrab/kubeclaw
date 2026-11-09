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

test('empty case outcomes and unpinned evidence are rejected before marking contract presence', () => {
  const record = receiverContracts.find((row) => row.kind === 'NetworkPolicy');
  assert.throws(() => apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy',
    [{ ...record, cases: [{ name: 'invalid', condition: 'wrong type', sourceOutcome: '' }] }]),
  /API_RECEIVER_CASE_INCOMPLETE/);
  assert.throws(() => apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy',
    [{ ...record, evidence: [{ url: 'https://github.com/kubernetes/kubernetes/blob/master/example.go#L1-L5', claim: 'Unpinned source' }] }]),
  /API_RECEIVER_EVIDENCE_INCOMPLETE/);
});

test('product selection requires selected receivers without auditing unused alternatives', () => {
  const path = '$.spec.podSelector';
  const selection = { fieldPaths: [path] };
  const coverage = apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy', receiverContracts, selection);
  assert.deepEqual(coverage.rows.map(row => row.fieldPath), [path]);
  assertApiReceiverCoverage(coverage);
  const missing = apiReceiverCoverage('networking.k8s.io/v1', 'NetworkPolicy',
    receiverContracts.filter(record => record.fieldPath !== path), selection);
  assert.throws(() => assertApiReceiverCoverage(missing), /API_RECEIVER_CONTRACT_MISSING/);
});
