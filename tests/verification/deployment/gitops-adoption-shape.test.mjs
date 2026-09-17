import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareAdoptionShape } from '../../../scripts/gitops-adoption-shape.mjs';

test('probe adoption removes a legacy handler while preserving the selected check', () => {
  const probe = { exec: { command: ['check'] }, periodSeconds: 5 };
  const docs = [{ kind: 'Deployment', spec: { template: { spec: { containers: [{ name: 'proxy', readinessProbe: probe }] } } } }];
  prepareAdoptionShape(docs);
  const merged = { tcpSocket: { port: 1234 }, ...probe };
  assert.deepEqual(merged.exec, { command: ['check'] });
  assert.equal(merged.tcpSocket, null);
  assert.equal(merged.httpGet, null);
  assert.equal(merged.grpc, null);
  assert.equal(merged.periodSeconds, 5);
  assert.deepEqual(prepareAdoptionShape(structuredClone(docs)), docs);
  probe.httpGet = { path: '/' };
  assert.throws(() => prepareAdoptionShape(docs), /PROBE_HANDLER_INVALID/);
});

test('stateful adoption preserves storage template and protects workload/claims', () => {
  const spec = { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '100Gi' } } };
  const doc = { kind: 'StatefulSet', metadata: { name: 'prism-postgresql' }, spec: {
    volumeClaimTemplates: [{ metadata: { name: 'data', annotations: { 'argocd.argoproj.io/sync-options': 'Prune=false,Delete=false' } }, spec }],
  } };
  prepareAdoptionShape([doc]);
  assert.deepEqual(doc.spec.volumeClaimTemplates, [{ metadata: { name: 'data' }, spec }]);
  assert.deepEqual(doc.spec.persistentVolumeClaimRetentionPolicy, { whenDeleted: 'Retain', whenScaled: 'Retain' });
  assert.equal(doc.metadata.annotations['argocd.argoproj.io/sync-options'], 'Prune=false,Delete=false');
});
