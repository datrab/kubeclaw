import { nativeNodeReservation, validateNativeNodePolicy } from './native-worker-node-policy.mjs';

const suffixes = { '': [1n, 1n], n: [1n, 1000000000n], u: [1n, 1000000n], m: [1n, 1000n],
  k: [1000n, 1n], M: [1000000n, 1n], G: [1000000000n, 1n], T: [1000000000000n, 1n],
  P: [1000000000000000n, 1n], E: [1000000000000000000n, 1n],
  Ki: [1024n, 1n], Mi: [1024n ** 2n, 1n], Gi: [1024n ** 3n, 1n], Ti: [1024n ** 4n, 1n], Pi: [1024n ** 5n, 1n], Ei: [1024n ** 6n, 1n] };

/** Exact nonnegative quantity arithmetic; reject unsupported precision rather than rounding a reservation up. */
export function nativeNodeQuantity(value, scale = 1n) {
  if (typeof value !== 'string' || value.length > 80) throw new Error('NATIVE_NODE_QUANTITY_INVALID');
  const match = /^(\d+)(?:\.(\d+))?([a-zA-Z]*)$/.exec(value);
  if (!match || !Object.hasOwn(suffixes, match[3])) throw new Error('NATIVE_NODE_QUANTITY_INVALID');
  const fraction = match[2] ?? '';
  const [numerator, denominator] = suffixes[match[3]];
  const amount = BigInt(match[1] + fraction) * numerator * scale;
  const divisor = denominator * 10n ** BigInt(fraction.length);
  if (amount % divisor !== 0n) throw new Error('NATIVE_NODE_QUANTITY_PRECISION_UNSUPPORTED');
  return amount / divisor;
}

function minimum(actual, expected, resource) {
  const scale = resource === 'cpu' ? 1000000000n : 1n;
  if (nativeNodeQuantity(actual, scale) < nativeNodeQuantity(expected, scale)) throw new Error(`NATIVE_NODE_RESERVATION_INSUFFICIENT:${resource}`);
}

function taskCapacity(reservation, kubelet, host) {
  minimum(kubelet.systemReserved?.pid, reservation.systemReserved.pid, 'pid');
  minimum(kubelet.kubeReserved?.pid, reservation.kubeReserved.pid, 'pid');
  if (kubelet.cgroupRoot && kubelet.cgroupRoot !== '/') throw new Error('NATIVE_NODE_POD_CGROUP_LAYOUT_UNSUPPORTED');
  const pidMax = nativeNodeQuantity(host.pidMax); const threadsMax = nativeNodeQuantity(host.threadsMax);
  const capacity = pidMax < threadsMax ? pidMax : threadsMax;
  const withheld = nativeNodeQuantity(reservation.systemReserved.pid) + nativeNodeQuantity(reservation.kubeReserved.pid);
  const podMaximum = nativeNodeQuantity(host.podTasksMax);
  if (capacity <= withheld || podMaximum <= 0n || podMaximum > capacity - withheld) throw new Error('NATIVE_NODE_POD_TASKS_NOT_RESERVED');
}

function hostBinding(policy, node, hostIdentity) {
  if (node?.metadata?.name !== policy.nodeName || typeof node.metadata.uid !== 'string'
    || node.status?.nodeInfo?.machineID !== hostIdentity.machineId || node.status.nodeInfo.bootID !== hostIdentity.bootId) throw new Error('NATIVE_NODE_HOST_BINDING_MISMATCH');
  if (!hostIdentity.machineId || !hostIdentity.bootId) throw new Error('NATIVE_NODE_HOST_IDENTITY_REQUIRED');
  if (!node.status.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True')) throw new Error('NATIVE_NODE_NOT_READY');
  runtimeBinding(policy, node);
}

function runtimeBinding(policy, node) {
  const runtime = policy.runtime?.containerdVersion;
  const actual = node.status.nodeInfo.containerRuntimeVersion;
  if (typeof runtime !== 'string' || typeof actual !== 'string' || !actual.startsWith('containerd://')
    || actual.slice('containerd://'.length).replace(/^v/, '') !== runtime.replace(/^v/, '')) {
    throw new Error('NATIVE_NODE_CONTAINERD_VERSION_MISMATCH');
  }
}

export function requireNativeNodeCapacity(policy, node, kubelet, hostIdentity) {
  validateNativeNodePolicy(policy);
  hostBinding(policy, node, hostIdentity);
  if (kubelet?.cgroupDriver !== 'systemd' || kubelet.cgroupsPerQOS !== true
    || !kubelet.enforceNodeAllocatable?.includes('pods')) throw new Error('NATIVE_NODE_KUBELET_ACCOUNTING_REQUIRED');
  const reservation = nativeNodeReservation(policy);
  taskCapacity(reservation, kubelet, hostIdentity);
  for (const resource of ['cpu', 'memory']) {
    minimum(kubelet.systemReserved?.[resource], reservation.systemReserved[resource], resource);
    minimum(kubelet.kubeReserved?.[resource], reservation.kubeReserved[resource], resource);
    const scale = resource === 'cpu' ? 1000000000n : 1n;
    const capacity = nativeNodeQuantity(node.status.capacity?.[resource], scale);
    const allocatable = nativeNodeQuantity(node.status.allocatable?.[resource], scale);
    const withheld = nativeNodeQuantity(reservation.systemReserved[resource], scale) + nativeNodeQuantity(reservation.kubeReserved[resource], scale);
    if (capacity <= withheld || allocatable <= 0n || allocatable > capacity - withheld) throw new Error(`NATIVE_NODE_ALLOCATABLE_NOT_RESERVED:${resource}`);
  }
  return { nodeName: node.metadata.name, nodeUid: node.metadata.uid, machineId: hostIdentity.machineId, bootId: hostIdentity.bootId,
    scope: 'current-node-cpu-memory-task-reservation-only', reservation };
}
