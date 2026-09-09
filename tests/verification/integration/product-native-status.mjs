import assert from 'node:assert/strict';

// These are schema/admission vectors, not fabricated application or delivery receipts.
export async function runStatusMatrix({ request, record, crd }) {
  const results = [];
  const check = async (label, method, url, body, expected, options) => {
    const response = await request(method, url, body, options);
    results.push({ label, method, url, ...response }); record('native-status-matrix.json', results);
    assert.equal(response.status, expected, `${label}: ${response.body}`);
    return JSON.parse(response.body);
  };
  const namespace = 'native-status';
  await check('namespace', 'POST', '/api/v1/namespaces', { apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } }, 201);
  const base = `/apis/${crd.spec.group}/${crd.spec.versions[0].name}/namespaces/${namespace}/${crd.spec.names.plural}`;
  const created = await check('create original lease', 'POST', base, { apiVersion: `${crd.spec.group}/${crd.spec.versions[0].name}`, kind: crd.spec.names.kind, metadata: { name: 'native-product' }, spec: { namespaceName: 'test-native-product', cleanupPolicy: 'retain', ttlSeconds: 600 } }, 201);
  const uri = `${base}/${created.metadata.name}/status`;
  const digest = 'sha256:' + 'a'.repeat(64);
  const receipt = { schemaVersion: 'demo-product-decision-receipt.v1', decisionId: '00000000-0000-4000-8000-000000000001', payloadDigest: digest, action: 'accept', leaseName: created.metadata.name, leaseUID: created.metadata.uid, readyDigest: digest, generation: 1, actorId: 'human:native-schema-vector', issuer: 'native-schema-vector', appliedAt: '2026-09-09T22:00:00Z', previousExpiry: '2026-09-09T23:00:00Z', expiresAt: '2026-09-09T23:00:00Z', state: 'accepted', envelope: { schemaVersion: 'demo-product-decision-envelope.v1', payload: 'schema-admission-vector-not-a-signed-human-decision', signature: 'x'.repeat(88) } };
  const product = { leaseUID: created.metadata.uid, readyDigest: digest, decisions: [receipt] };
  const put = (object, status) => ({ ...object, status });
  const first = await check('first product status', 'PUT', uri, put(created, { demoProduct: product }), 200);
  assert.deepEqual(first.status.demoProduct, product, 'Native schema pruned producer fields');
  await check('stale resourceVersion', 'PUT', uri, put(created, first.status), 409);
  for (const [label, mutation] of [
    ['remove product', status => { delete status.demoProduct; }],
    ['remove receipt', status => { status.demoProduct.decisions = []; }],
    ['mutate receipt', status => { status.demoProduct.decisions[0].actorId = 'human:changed'; }],
    ['change subject', status => { status.demoProduct.readyDigest = 'sha256:' + 'b'.repeat(64); }],
    ['duplicate decision identity', status => { status.demoProduct.decisions.push({ ...receipt }); }],
    ['oversized envelope', status => { status.demoProduct.decisions.push({ ...receipt, decisionId: '00000000-0000-4000-8000-000000000002', envelope: { ...receipt.envelope, payload: 'x'.repeat(10925) } }); }],
  ]) {
    const status = structuredClone(first.status); mutation(status);
    await check(label, 'PUT', uri, put(first, status), 422);
    const unchanged = await check(`${label}: no mutation`, 'GET', `${base}/${created.metadata.name}`, undefined, 200);
    assert.equal(unchanged.metadata.resourceVersion, first.metadata.resourceVersion);
  }
  const appendedStatus = structuredClone(first.status);
  appendedStatus.demoProduct.decisions.push({ ...receipt, decisionId: '00000000-0000-4000-8000-000000000002' });
  const appended = await check('append new receipt', 'PUT', uri, put(first, appendedStatus), 200);
  assert.deepEqual(appended.status, appendedStatus);
  const exact = await check('exact replay', 'PUT', uri, appended, 200);
  assert.deepEqual(exact.status, appendedStatus);
  const fullStatus = structuredClone(exact.status);
  for (let i = 3; i <= 128; i++) fullStatus.demoProduct.decisions.push({ ...receipt, decisionId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` });
  const full = await check('128 receipts accepted', 'PUT', uri, put(exact, fullStatus), 200);
  assert.deepEqual(full.status, fullStatus);
  await check('128 receipts full oldSelf replay CEL evaluation', 'PUT', uri, full, 200);
  const tooMany = structuredClone(full.status);
  tooMany.demoProduct.decisions.push({ ...receipt, decisionId: '00000000-0000-4000-8000-000000000129' });
  await check('129 receipts rejected', 'PUT', uri, put(full, tooMany), 422);
  const boundedLease = await check('bounded-string lease', 'POST', base, { apiVersion: `${crd.spec.group}/${crd.spec.versions[0].name}`, kind: crd.spec.names.kind, metadata: { name: 'native-product-boundary' }, spec: { namespaceName: 'test-native-boundary', cleanupPolicy: 'retain', ttlSeconds: 600 } }, 201);
  const bounded = { ...receipt, leaseName: 'n'.repeat(1024), leaseUID: 'u'.repeat(1024), actorId: 'a'.repeat(1024), issuer: 'i'.repeat(1024), generation: 9007199254740991, envelope: { ...receipt.envelope, payload: 'x'.repeat(10924) } };
  const boundedState = { demoProduct: { leaseUID: 'u'.repeat(1024), readyDigest: digest, decisions: [bounded] } };
  const boundedPath = `${base}/${boundedLease.metadata.name}/status`;
  const boundedSaved = await check('maximum valid bounded string fields accepted', 'PUT', boundedPath, put(boundedLease, boundedState), 200);
  assert.deepEqual(boundedSaved.status, boundedState);
  await check('maximum bounded receipt exact CEL replay', 'PUT', boundedPath, boundedSaved, 200);
}
