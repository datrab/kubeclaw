import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { load } from 'js-yaml';
import { loadNativeNodePolicy, nativeNodeReservation, nativePoolPolicy, validateNativeNodePolicy } from '../../../scripts/native-worker-node-policy.mjs';
import { renderNativeWorkerNode } from '../../../scripts/render-native-worker-node.mjs';
import { requireNativeNodeCapacity } from '../../../scripts/native-worker-node-capacity.mjs';

const selected = loadNativeNodePolicy('my-values/infra/native-worker-pools-ax41.yaml');
const { cpuReservation: _cpu, ...dedicated } = selected;

test('AX41 explicitly selects 11 allocatable CPUs while keeping memory and PID reservations', () => {
  const reservation = nativeNodeReservation(selected), before = nativeNodeReservation(dedicated);
  assert.equal(reservation.systemReserved.cpu, '500m');
  assert.equal(reservation.kubeReserved.cpu, '500m');
  assert.equal(before.systemReserved.cpu, '4500m');
  assert.equal(before.kubeReserved.cpu, '500m');
  for (const category of ['systemReserved', 'kubeReserved']) {
    for (const resource of ['memory', 'pid']) assert.equal(reservation[category][resource], before[category][resource]);
  }
  assert.equal(BigInt(reservation.systemReserved.memory) + BigInt(reservation.kubeReserved.memory), 29527900160n);
});

test('CPU scheduler overcommit leaves installed worker policies, NRI identity and cgroup setup unchanged', () => {
  for (const role of ['buster', 'prism']) assert.deepEqual(nativePoolPolicy(selected, role), nativePoolPolicy(dedicated, role));
  const before = renderNativeWorkerNode(dedicated), after = renderNativeWorkerNode(selected);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const file of Object.keys(after)) {
    if (file === 'kubelet-reservations.json') assert.notEqual(after[file], before[file]);
    else assert.equal(after[file], before[file], file);
  }
});

test('dedicated accounting remains the default and malformed overcommit declarations fail closed', () => {
  const defaults = load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8'));
  defaults.nodeName = 'node';
  const reservation = nativeNodeReservation(defaults);
  assert.equal(reservation.systemReserved.cpu, '9000m');
  assert.equal(reservation.kubeReserved.cpu, '1000m');
  for (const cpuReservation of [null, true, {}, { mode: 'dedicated', systemMillicores: 500, kubernetesMillicores: 500 },
    { ...selected.cpuReservation, systemMillicores: 0 }, { ...selected.cpuReservation, systemMillicores: -1 },
    { ...selected.cpuReservation, kubernetesMillicores: '500' }, { ...selected.cpuReservation, extra: 1 },
    { ...selected.cpuReservation, systemMillicores: Number.MAX_SAFE_INTEGER },
    { ...selected.cpuReservation, kubernetesMillicores: 0.5 }]) {
    assert.throws(() => validateNativeNodePolicy({ ...dedicated, cpuReservation }), /NATIVE_NODE_/);
  }
});

test('preflight accepts 11 only with explicit overcommit and continues to enforce daemon, memory and PID reserves', () => {
  const host = { machineId: 'a'.repeat(32), bootId: 'b'.repeat(32), pidMax: '4194304', threadsMax: '4194304', podTasksMax: '4000000' };
  const node = { metadata: { name: selected.nodeName, uid: 'node' }, status: {
    nodeInfo: { machineID: host.machineId, bootID: host.bootId, containerRuntimeVersion: 'containerd://' + selected.runtime.containerdVersion },
    conditions: [{ type: 'Ready', status: 'True' }], capacity: { cpu: '12', memory: '64Gi' }, allocatable: { cpu: '11', memory: '36Gi' },
  } };
  const kubelet = JSON.parse(renderNativeWorkerNode(selected)['kubelet-reservations.json']);
  assert.equal(requireNativeNodeCapacity(selected, node, kubelet, host).cpuReservationMode, 'overcommit');
  const old = JSON.parse(renderNativeWorkerNode(dedicated)['kubelet-reservations.json']);
  assert.throws(() => requireNativeNodeCapacity(dedicated, node, old, host), /ALLOCATABLE_NOT_RESERVED:cpu/);
  const noDaemonReserve = structuredClone(kubelet); noDaemonReserve.systemReserved.cpu = '0';
  assert.throws(() => requireNativeNodeCapacity(selected, node, noDaemonReserve, host), /RESERVATION_INSUFFICIENT:cpu/);
  const tooMuchCPU = structuredClone(node); tooMuchCPU.status.allocatable.cpu = '12';
  assert.throws(() => requireNativeNodeCapacity(selected, tooMuchCPU, kubelet, host), /ALLOCATABLE_NOT_RESERVED:cpu/);
  const tooMuchRAM = structuredClone(node); tooMuchRAM.status.allocatable.memory = '64Gi';
  assert.throws(() => requireNativeNodeCapacity(selected, tooMuchRAM, kubelet, host), /ALLOCATABLE_NOT_RESERVED:memory/);
  const noMemoryReserve = structuredClone(kubelet); noMemoryReserve.systemReserved.memory = '0';
  assert.throws(() => requireNativeNodeCapacity(selected, node, noMemoryReserve, host), /RESERVATION_INSUFFICIENT:memory/);
  const noPIDReserve = structuredClone(kubelet); noPIDReserve.systemReserved.pid = '0';
  assert.throws(() => requireNativeNodeCapacity(selected, node, noPIDReserve, host), /RESERVATION_INSUFFICIENT:pid/);
});
