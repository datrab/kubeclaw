import assert from 'node:assert/strict';
import test from 'node:test';
import {validateContractValue} from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import {portableDependencyKey} from '../../../skills/nova/core/effects/dependency-identity.ts';

const hash = 'a'.repeat(64);
const namespaced = length => `a.${'b'.repeat(length - 2)}`;
const legacy = (pkg = namespaced(160), registration = 'r'.repeat(96), capability = namespaced(160)) =>
  `adapter:${pkg}:${registration}:${capability}:${hash}:parent:${hash}`;
const request = key => ({schemaVersion: 'effect-request.v2', effectId: `effect:${hash}`, idempotencyKey: key,
  attempt: {runId: 'run:one', stageId: 'one', attemptId: 'attempt:one', attemptNumber: 1},
  capability: 'network.http', operation: 'request', resource: {type: 'network.url', canonicalId: 'https://localhost/a?q=1'},
  payload: {body: {ä: 1, z: 2}}, requestedAt: '2026-09-09T00:00:00Z'});
const receipt = key => ({schemaVersion: 'effect-receipt.v2', effectId: `effect:${hash}`, idempotencyKey: key,
  adapter: {pluginId: 'kubeclaw.network-http', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', contentDigest: `sha256:${hash}`, registrationId: 'http'},
  status: 'completed', result: {}, recordedAt: '2026-09-09T00:00:00Z'});

test('canonical effect keys retain opaque bounds and exactly bounded historical producer grammar', () => {
  for (const key of ['x'.repeat(192), legacy(), legacy().replace(`:parent:${hash}`, '')]) {
    validateContractValue('effectRequest', request(key)); validateContractValue('effectReceipt', receipt(key));
  }
  for (const key of ['x'.repeat(193), legacy(namespaced(161)), legacy(undefined, 'r'.repeat(97)), legacy(undefined, undefined, namespaced(161)), legacy().replace(':parent:', ':foreign:'), legacy().replace(hash, 'g'.repeat(64))]) {
    assert.throws(() => validateContractValue('effectRequest', request(key)), key);
    assert.throws(() => validateContractValue('effectReceipt', receipt(key)), key);
  }
  assert.throws(() => validateContractValue('opaqueId', legacy()));
});

test('new complete subject and owner identity has explicit version and compact bounded key', () => {
  const parent = {request: request('parent:one'), confidential: false};
  const invocation = {operation: 'request', resource: request('x').resource, payload: {body: {ä: 1, z: 2}}};
  const key = portableDependencyKey(`${namespaced(160)}:${'r'.repeat(96)}`, namespaced(160), invocation, parent, 'delivery:one');
  assert.match(key.key, /^adapter-dep:utf16-v1:[a-f0-9]{64}:[a-f0-9]{64}$/u);
  assert(key.key.length <= 192); validateContractValue('effectRequest', request(key.key));
  assert.equal(portableDependencyKey(`${namespaced(160)}:${'r'.repeat(96)}`, namespaced(160), {...invocation, payload: {body: {z: 2, ä: 1}}}, parent, 'delivery:one').key, key.key);
  assert.notEqual(portableDependencyKey(`${namespaced(160)}:${'r'.repeat(96)}`, namespaced(160), invocation, parent, 'delivery:two').key, key.key);
});

test('canonical resource owner admits real resource namespaces without relaxing other request fields', () => {
  for (const canonicalId of ['https://localhost/a?q=1', '/workspace/a', '.', 'catalog:item', 'x'.repeat(4096)]) {
    const value = request('one'); value.resource.canonicalId = canonicalId;
    validateContractValue('effectRequest', value);
    validateContractValue('resourceLock', {schemaVersion: 'resource-lock.v2', lockId: 'lock:one', resource: value.resource, ownerLeaseId: 'attempt:one', fencingToken: 1, status: 'active', acquiredAt: value.requestedAt, expiresAt: value.requestedAt});
  }
  const mutations = [v => v.effectId = 'x'.repeat(193), v => v.deliveryId = 'x'.repeat(193), v => v.resource.canonicalId = '', v => v.resource.extra = true, v => v.attempt.attemptNumber = 0, v => v.requestedAt = '2026-99-99T99:99:99Z', v => v.payload = [], v => v.extra = true];
  for (const mutate of mutations) {const value = request('one'); mutate(value); assert.throws(() => validateContractValue('effectRequest', value));}
  for (const mutate of [v => v.recordedAt = 'bad', v => v.adapter.pluginId = 'bad', v => v.status = 'unknown', v => {v.status = 'failed';}]) {
    const value = receipt('one'); mutate(value); assert.throws(() => validateContractValue('effectReceipt', value));
  }
});
