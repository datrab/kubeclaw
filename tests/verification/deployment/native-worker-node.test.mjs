import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { load, dump } from 'js-yaml';
import { renderNativeWorkerNode } from '../../../scripts/render-native-worker-node.mjs';
import { validateNativeNodePolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { nativeNodeQuantity, requireNativeNodeCapacity } from '../../../scripts/native-worker-node-capacity.mjs';
import { readNativeWorkerPoolPolicy } from '../../../skills/worker/core/worker/native-pool-policy.ts';

const source = load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
const policy = { ...source, nodeName: 'native-policy-test' };

test('real generated bundle binds both role readers, selected runtime and actual systemd unit parser', () => {
  assert.throws(() => validateNativeNodePolicy(source), /NATIVE_NODE_IDENTITY_REQUIRED/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-node-bundle-'));
  try {
    const input = path.join(directory, 'policy.yaml'); const output = path.join(directory, 'bundle');
    fs.writeFileSync(input, dump(policy));
    execFileSync('bash', ['scripts/deploy.sh', 'native-node-render', output, input]);
    const generated = renderNativeWorkerNode(policy);
    assert.deepEqual(fs.readdirSync(output).sort(), Object.keys(generated).sort());
    for (const [file, content] of Object.entries(generated)) assert.equal(fs.readFileSync(path.join(output, file), 'utf8'), content);
    const prism = readNativeWorkerPoolPolicy(path.join(output, 'prism-pool.json'), 'prism');
    const buster = readNativeWorkerPoolPolicy(path.join(output, 'buster-pool.json'), 'buster');
    assert.equal(prism.limits.memoryBytes, 16 * 1024 ** 3); assert.equal(buster.limits.memoryBytes, 32 * 1024 ** 3);
    assert.equal(prism.maximumActiveScopes, 2); assert.equal(prism.policyDigest, buster.policyDigest);
    assert.notEqual(prism.cgroupRoot, buster.cgroupRoot); assert.notEqual(prism.ownershipRoot, buster.ownershipRoot);
    assert.throws(() => readNativeWorkerPoolPolicy(path.join(output, 'prism-pool.json'), 'buster'), /POOL_POLICY_INVALID/);
    const before = fs.readFileSync(path.join(output, 'prism-pool.json'));
    assert.throws(() => execFileSync(process.execPath, ['scripts/render-native-worker-node.mjs', input, output], { stdio: 'pipe' }));
    assert.deepEqual(fs.readFileSync(path.join(output, 'prism-pool.json')), before);
    execFileSync('systemd-analyze', ['verify', '--man=no', path.join(output, 'kubeclaw-native-pools.service')], { stdio: 'pipe' });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('actual policy files reject writable authority and symlinks without consuming their contents', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-pool-authority-'));
  try {
    const file = path.join(directory, 'prism.json');
    fs.writeFileSync(file, renderNativeWorkerNode(policy)['prism-pool.json'], { mode: 0o600 });
    fs.chmodSync(file, 0o666);
    assert.throws(() => readNativeWorkerPoolPolicy(file, 'prism'), /POOL_POLICY_NOT_TRUSTED/);
    fs.chmodSync(file, 0o600);
    const link = path.join(directory, 'link.json'); fs.symlinkSync(file, link);
    assert.throws(() => readNativeWorkerPoolPolicy(link, 'prism'), /ELOOP/);
    assert.ok(readNativeWorkerPoolPolicy(file, 'prism').limits.tasks > 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('capacity contract requires matching host, effective kubelet reservation and withheld allocatable capacity', () => {
  // Protocol vectors for the real checker; no Kubernetes API is replaced or claimed to have run.
  const host = { machineId: 'a'.repeat(32), bootId: 'b'.repeat(32), pidMax: '4194304', threadsMax: '4194304', podTasksMax: '4000000' };
  const node = { metadata: { name: policy.nodeName, uid: 'node-contract-vector' }, status: {
    nodeInfo: { machineID: host.machineId, bootID: host.bootId }, conditions: [{ type: 'Ready', status: 'True' }],
    capacity: { cpu: '16', memory: '64Gi' }, allocatable: { cpu: '6', memory: '10Gi' } } };
  const kubelet = JSON.parse(renderNativeWorkerNode(policy)['kubelet-reservations.json']);
  const receipt = requireNativeNodeCapacity(policy, node, kubelet, host);
  assert.equal(receipt.scope, 'current-node-cpu-memory-task-reservation-only');
  assert.equal(receipt.reservation.systemReserved.cpu, '9000m');
  for (const resource of ['cpu', 'memory']) {
    const unreserved = structuredClone(node); unreserved.status.allocatable[resource] = node.status.capacity[resource];
    assert.throws(() => requireNativeNodeCapacity(policy, unreserved, kubelet, host), /ALLOCATABLE_NOT_RESERVED/);
    const insufficient = structuredClone(kubelet); insufficient.systemReserved[resource] = '0';
    assert.throws(() => requireNativeNodeCapacity(policy, node, insufficient, host), /RESERVATION_INSUFFICIENT/);
  }
  assert.throws(() => requireNativeNodeCapacity(policy, node, kubelet, { ...host, machineId: 'other-host' }), /HOST_BINDING_MISMATCH/);
  assert.throws(() => requireNativeNodeCapacity(policy, node, { ...kubelet, enforceNodeAllocatable: [] }, host), /KUBELET_ACCOUNTING_REQUIRED/);
  const lowCapacity = structuredClone(node); lowCapacity.status.capacity.memory = '32Gi';
  assert.throws(() => requireNativeNodeCapacity(policy, lowCapacity, kubelet, host), /ALLOCATABLE_NOT_RESERVED/);
  assert.throws(() => requireNativeNodeCapacity(policy, node, kubelet, { ...host, podTasksMax: '4194304' }), /POD_TASKS_NOT_RESERVED/);
  assert.throws(() => requireNativeNodeCapacity(policy, node, kubelet, { ...host, podTasksMax: 'max' }), /QUANTITY_INVALID/);
  const missingTasks = structuredClone(kubelet); missingTasks.systemReserved.pid = '2048';
  assert.throws(() => requireNativeNodeCapacity(policy, node, missingTasks, host), /RESERVATION_INSUFFICIENT/);
});

test('quantity comparison is exact for Kubernetes CPU and memory units and rejects ambiguous precision', () => {
  assert.equal(nativeNodeQuantity('1.5Gi'), 1610612736n);
  assert.equal(nativeNodeQuantity('1500m', 1000000000n), 1500000000n);
  assert.equal(nativeNodeQuantity('500000000n', 1000000000n), 500000000n);
  assert.equal(nativeNodeQuantity('64Gi'), nativeNodeQuantity('67108864Ki'));
  assert.throws(() => nativeNodeQuantity('0.1'), /PRECISION_UNSUPPORTED/);
  for (const value of ['-1', 'NaN', 'Infinity', '1foo', '', 1024, '1e1000']) assert.throws(() => nativeNodeQuantity(value), /QUANTITY_INVALID/);
});
