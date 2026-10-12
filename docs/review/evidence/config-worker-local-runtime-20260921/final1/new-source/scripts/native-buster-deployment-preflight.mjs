import { nativePoolPolicy } from './native-worker-node-policy.mjs';

/** Check the rendered Buster parent, immutable image and narrowly mounted host authority. */
export function nativeBusterDeploymentSelection(documents, namespace, policy) {
  const selected = documents.filter(item => item?.kind === 'Deployment'
    && item.spec?.template?.spec?.containers?.some(container => container.name === 'buster-v2-runtime'));
  if (selected.length !== 1) throw new Error('NATIVE_BUSTER_WORKLOAD_REQUIRED');
  const workload = selected[0];
  const pod = workload.spec.template;
  const container = pod.spec.containers.find(item => item.name === 'buster-v2-runtime');
  const pool = nativePoolPolicy(policy, 'buster');
  if (namespace !== policy.pools.buster.namespace || workload.spec.replicas !== 1
    || pod.metadata.annotations?.['kubeclaw.dev/native-worker-role'] !== 'buster'
    || pod.metadata.annotations?.['kubeclaw.dev/native-worker-policy'] !== pool.policyDigest) {
    throw new Error('NATIVE_BUSTER_POLICY_MISMATCH');
  }
  requireImage(container);
  const expected = [{ matchFields: [{ key: 'metadata.name', operator: 'In', values: [policy.nodeName] }] }];
  if (JSON.stringify(pod.spec.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms)
    !== JSON.stringify(expected)) throw new Error('NATIVE_BUSTER_NODE_MISMATCH');
  requireMount(pod, container, 'buster-native-pool', pool.cgroupRoot, 'Directory', false);
  requireMount(pod, container, 'buster-native-ownership', pool.ownershipRoot, 'Directory', false);
  requireMount(pod, container, 'buster-native-policy', '/etc/kubeclaw/buster-pool.json', 'File', true);
  requireMount(pod, container, 'buster-native-node', pool.nodeIdentityFile, 'File', true);
  requireMount(pod, container, 'buster-native-runtime', pool.runtimeIdentityFile, 'File', true);
  requireAuthority(container);
  return true;
}

function requireMount(pod, container, name, hostPath, type, readOnly) {
  const volume = pod.spec.volumes?.filter(item => item.name === name);
  const mount = container.volumeMounts?.filter(item => item.name === name);
  if (volume?.length !== 1 || mount?.length !== 1 || volume[0].hostPath?.path !== hostPath
    || volume[0].hostPath?.type !== type || mount[0].mountPath !== hostPath || Boolean(mount[0].readOnly) !== readOnly) {
    throw new Error('NATIVE_BUSTER_MOUNT_MISMATCH');
  }
}

function requireAuthority(container) {
  const security = container.securityContext;
  if (security?.runAsUser !== 0 || security.runAsGroup !== 0 || security.privileged !== false
    || !['KILL', 'SETUID', 'SETGID', 'CHOWN', 'SETPCAP'].every(capability => security.capabilities?.add?.includes(capability))
    || security.capabilities?.add?.some(capability => !['KILL', 'SETUID', 'SETGID', 'CHOWN', 'SETPCAP'].includes(capability))
    || JSON.stringify(security.capabilities?.drop) !== JSON.stringify(['ALL'])) throw new Error('NATIVE_BUSTER_AUTHORITY_MISMATCH');
}

function requireImage(container) {
  const digest = container.env?.find(item => item.name === 'BUSTER_ENGINE_CONTENT_DIGEST')?.value;
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? '') || digest !== container.image.split('@')[1]) {
    throw new Error('NATIVE_BUSTER_IMAGE_MISMATCH');
  }
}
