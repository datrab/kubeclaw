import fs from 'node:fs';
import { load } from 'js-yaml';
import { createHash } from 'node:crypto';

export const nativePoolRoot = '/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service';

function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('NATIVE_NODE_POLICY_LIMIT_INVALID');
}

function resources(value) {
  positive(value?.cpuMillicores); positive(value?.memoryBytes);
  if (value.memoryBytes % 4096 !== 0) throw new Error('NATIVE_NODE_MEMORY_ALIGNMENT_INVALID');
}

export function validateNativeNodePolicy(policy) {
  if (policy?.schemaVersion !== 1 || typeof policy.nodeName !== 'string'
    || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(policy.nodeName)) throw new Error('NATIVE_NODE_IDENTITY_REQUIRED');
  resources(policy.systemReserve); resources(policy.kubernetesReserve);
  positive(policy.systemReserve.tasks); positive(policy.kubernetesReserve.tasks);
  if (Object.keys(policy.pools ?? {}).sort().join(',') !== 'buster,prism') throw new Error('NATIVE_NODE_ROLE_SET_INVALID');
  for (const pool of Object.values(policy.pools)) {
    if (typeof pool.namespace !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(pool.namespace)) throw new Error('NATIVE_NODE_NAMESPACE_REQUIRED');
    resources(pool); positive(pool.tasks); positive(pool.maximumActiveScopes);
    if (pool.cpuMillicores > Number.MAX_SAFE_INTEGER / 100) throw new Error('NATIVE_NODE_CPU_RANGE_INVALID');
  }
  const result = structuredClone(policy);
  for (const key of ['cpuMillicores', 'memoryBytes', 'tasks']) {
    const total = Object.values(result.pools).reduce((sum, pool) => sum + BigInt(pool[key]), 0n)
      + BigInt(result.systemReserve[key]) + BigInt(result.kubernetesReserve[key]);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('NATIVE_NODE_TOTAL_RANGE_INVALID');
  }
  return result;
}

export function loadNativeNodePolicy(file) { return validateNativeNodePolicy(load(fs.readFileSync(file, 'utf8'))); }

export function nativePoolPolicy(policy, role) {
  const selected = validateNativeNodePolicy(policy);
  const pool = selected.pools[role];
  if (!pool) throw new Error('NATIVE_NODE_ROLE_INVALID');
  return { schemaVersion: 1, role, nodeName: selected.nodeName,
    policyDigest: createHash('sha256').update(JSON.stringify(selected)).digest('hex'),
    cgroupRoot: `${nativePoolRoot}/${role}`, ownershipRoot: `/var/lib/kubeclaw/native/${role}`,
    nodeIdentityFile: '/etc/kubeclaw/native-node-id', runtimeIdentityFile: '/etc/kubeclaw/native-runtime-identity.json',
    maximumActiveScopes: pool.maximumActiveScopes,
    limits: { memoryBytes: pool.memoryBytes, tasks: pool.tasks,
      cpuQuotaMicroseconds: pool.cpuMillicores * 100, cpuPeriodMicroseconds: 100000 } };
}

export function nativeNodeReservation(policy) {
  const selected = validateNativeNodePolicy(policy);
  const system = { ...selected.systemReserve };
  for (const pool of Object.values(selected.pools)) {
    system.cpuMillicores += pool.cpuMillicores; system.memoryBytes += pool.memoryBytes; system.tasks += pool.tasks;
  }
  return { systemReserved: { cpu: `${system.cpuMillicores}m`, memory: String(system.memoryBytes), pid: String(system.tasks) },
    kubeReserved: { cpu: `${selected.kubernetesReserve.cpuMillicores}m`, memory: String(selected.kubernetesReserve.memoryBytes), pid: String(selected.kubernetesReserve.tasks) } };
}
