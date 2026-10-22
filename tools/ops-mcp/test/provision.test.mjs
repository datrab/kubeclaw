import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { provision, issueCertificate, validateProvisionConfig, createProvisionRequest } from '../src/provision.mjs';

const openssl = process.env.PATH.split(':').map(dir => join(dir, 'openssl')).find(existsSync);
const config = { namespace: 'ops', caSecret: 'service-ca', tlsSecret: 'service-tls', caConfigMap: 'service-trust', dnsNames: ['ops-mcp.ops.svc'],
  clients: [{ id: 'codex', namespace: 'ops', tokenSecret: 'codex-token' }, { id: 'nova', namespace: 'agents', tokenSecret: 'nova-token' }] };
function fixture() {
  const objects = new Map(), writes = [];
  const path = (ns, kind, name) => `/api/v1/namespaces/${ns}/${kind}/${name}`;
  for (const name of ['service-ca', 'service-tls', 'codex-token', 'nova-token']) objects.set(path('ops', 'secrets', name), { metadata: { resourceVersion: '1' }, data: {} });
  objects.set(path('agents', 'secrets', 'nova-token'), { metadata: { resourceVersion: '1' }, data: {} });
  for (const ns of ['ops', 'agents']) objects.set(path(ns, 'configmaps', 'service-trust'), { metadata: { resourceVersion: '1' }, data: {} });
  const api = async (method, key, patch) => {
    assert.ok(objects.has(key), 'provisioner must never create an undeclared object');
    if (method === 'GET') return structuredClone(objects.get(key));
    assert.equal(method, 'PATCH');
    const object = objects.get(key);
    assert.deepEqual(patch[0], { op: 'test', path: '/metadata/resourceVersion', value: object.metadata.resourceVersion });
    assert.equal(patch[1].op, 'add'); assert.equal(patch[1].path, '/data');
    object.data = patch[1].value; object.metadata.resourceVersion = String(Number(object.metadata.resourceVersion) + 1);
    writes.push(key); return structuredClone(object);
  };
  return { objects, writes, api, path };
}

test('managed provisioning retains existing credentials, copies only each client token and renews TLS without changing its CA', async () => {
  const state = fixture(); let issues = 0;
  const issuer = (conf, ca) => { issues++; return issueCertificate(conf, ca, openssl); };
  const codexKey = state.path('ops', 'secrets', 'codex-token');
  const existing = Buffer.from('retained-codex-' + 'x'.repeat(40)).toString('base64');
  state.objects.get(codexKey).data = { token: existing, unrelated: 'preserve-me' };
  await provision(config, state.api, issuer);
  assert.equal(issues, 2);
  const sourceNova = state.objects.get(state.path('ops', 'secrets', 'nova-token')).data;
  const destNova = state.objects.get(state.path('agents', 'secrets', 'nova-token')).data;
  assert.deepEqual(sourceNova, destNova); assert.notEqual(sourceNova.token, existing);
  assert.deepEqual(state.objects.get(codexKey).data, { token: existing, unrelated: 'preserve-me' });
  const caBefore = structuredClone(state.objects.get(state.path('ops', 'secrets', 'service-ca')).data);
  const trust = state.objects.get(state.path('agents', 'configmaps', 'service-trust')).data;
  assert.deepEqual(Object.keys(trust), ['ca.crt']); assert.ok(!JSON.stringify(trust).includes('PRIVATE KEY'));
  const initialWrites = state.writes.length;
  await provision(config, state.api, issuer);
  assert.equal(issues, 2); assert.equal(state.writes.length, initialWrites, 'repeated sync must be idempotent');
  // A malformed/obsolete leaf is replaced under the same retained CA. No
  // Kubernetes or authorization success is simulated by this storage fixture.
  state.objects.get(state.path('ops', 'secrets', 'service-tls')).data['tls.crt'] = Buffer.from('invalid leaf').toString('base64');
  await provision(config, state.api, issuer);
  assert.equal(issues, 3);
  assert.deepEqual(state.objects.get(state.path('ops', 'secrets', 'service-ca')).data, caBefore);
  assert.equal(state.writes.at(-1), state.path('ops', 'secrets', 'service-tls'));
});

test('conflicting client copies, credential reuse and a lost CA fail closed instead of rotating authority silently', async () => {
  const state = fixture(); const source = state.path('ops', 'secrets', 'nova-token'), dest = state.path('agents', 'secrets', 'nova-token');
  const a = Buffer.from('first-' + 'a'.repeat(40)).toString('base64'), b = Buffer.from('second-' + 'b'.repeat(40)).toString('base64');
  state.objects.get(source).data.token = a; state.objects.get(dest).data.token = b;
  await assert.rejects(provision(config, state.api), /CLIENT_TOKEN_COPIES_DIFFER/);
  state.objects.get(dest).data.token = a;
  state.objects.get(state.path('ops', 'secrets', 'codex-token')).data.token = a;
  await assert.rejects(provision(config, state.api), /CLIENT_CREDENTIALS_MUST_DIFFER/);
  state.objects.get(state.path('ops', 'secrets', 'codex-token')).data.token = b;
  state.objects.get(state.path('ops', 'secrets', 'service-tls')).data['tls.crt'] = 'existing-leaf';
  await assert.rejects(provision(config, state.api), /CA_MISSING_WITH_EXISTING_LEAF/);
  assert.throws(() => validateProvisionConfig({ ...config, caSecret: '../escape' }), /INVALID/);
  assert.throws(() => validateProvisionConfig({ ...config, clients: [config.clients[0], { ...config.clients[1], tokenSecret: 'codex-token' }] }), /INVALID/);
  const api = createProvisionRequest();
  assert.throws(() => api('DELETE', '/api/v1/namespaces/ops/secrets/codex-token'), /INVALID/);
  assert.throws(() => api('GET', '/api/v1/namespaces/ops/secrets'), /INVALID/);
});
