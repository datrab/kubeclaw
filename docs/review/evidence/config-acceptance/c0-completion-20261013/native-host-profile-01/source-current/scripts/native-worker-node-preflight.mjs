// Installer-Step: native.verify-capacity; category: verify. See scripts/install/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { NativeWorkerResourcePool } from '../skills/worker/core/worker/native-resource-pool.ts';
import { readNativeWorkerPoolPolicy } from '../skills/worker/core/worker/native-pool-policy.ts';
import { requireNativeWorkerRuntimeIdentity } from '../skills/worker/core/worker/native-runtime-identity.ts';
import { loadNativeNodePolicy, nativePoolPolicy, validateNativeNodePolicy } from './native-worker-node-policy.mjs';
import { requireNativeNodeCapacity } from './native-worker-node-capacity.mjs';

function kubectl(arguments_) {
  return JSON.parse(execFileSync('kubectl', arguments_, { encoding: 'utf8', timeout: 30000,
    maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
}

function hostIdentity() {
  const podRoot = '/sys/fs/cgroup/kubepods.slice';
  if (fs.statfsSync(podRoot).type !== 0x63677270) throw new Error('NATIVE_NODE_POD_CGROUP_REQUIRED');
  return { machineId: fs.readFileSync('/etc/machine-id', 'utf8').trim(),
    bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    pidMax: fs.readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim(),
    threadsMax: fs.readFileSync('/proc/sys/kernel/threads-max', 'utf8').trim(),
    podTasksMax: fs.readFileSync(`${podRoot}/pids.max`, 'utf8').trim() };
}

/** Run on the selected host. Reads actual kubelet configz, Node allocation and kernel pools. */
export function preflightNativeWorkerNode(policy) {
  policy = validateNativeNodePolicy(policy);
  const host = hostIdentity();
  const node = kubectl(['get', 'node', policy.nodeName, '-o', 'json']);
  const kubelet = kubectl(['get', '--raw', `/api/v1/nodes/${encodeURIComponent(policy.nodeName)}/proxy/configz`]).kubeletconfig;
  const result = requireNativeNodeCapacity(policy, node, kubelet, host);
  for (const role of ['buster', 'prism']) {
    const pool = nativePoolPolicy(policy, role);
    const installed = readNativeWorkerPoolPolicy(`/etc/kubeclaw/${role}-pool.json`, role);
    if (!isDeepStrictEqual(pool, installed)) throw new Error('NATIVE_NODE_INSTALLED_POLICY_MISMATCH');
    requireNativeWorkerRuntimeIdentity(pool.runtimeIdentityFile);
    new NativeWorkerResourcePool(pool.cgroupRoot, pool.limits, pool.maximumActiveScopes).verify();
  }
  const after = kubectl(['get', 'node', policy.nodeName, '-o', 'json']);
  if (after.metadata.resourceVersion !== node.metadata.resourceVersion) throw new Error('NATIVE_NODE_CHANGED_DURING_PREFLIGHT');
  const current = kubectl(['get', '--raw', `/api/v1/nodes/${encodeURIComponent(policy.nodeName)}/proxy/configz`]).kubeletconfig;
  if (!isDeepStrictEqual(current, kubelet)) throw new Error('NATIVE_NODE_KUBELET_CHANGED_DURING_PREFLIGHT');
  if (!isDeepStrictEqual(hostIdentity(), host)) throw new Error('NATIVE_NODE_HOST_CHANGED_DURING_PREFLIGHT');
  return { ...result, policyDigest: nativePoolPolicy(policy, 'buster').policyDigest, checkedAt: new Date().toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: native-worker-node-preflight.mjs POLICY_YAML');
  process.stdout.write(`${JSON.stringify(preflightNativeWorkerNode(loadNativeNodePolicy(process.argv[2])), null, 2)}\n`);
}
