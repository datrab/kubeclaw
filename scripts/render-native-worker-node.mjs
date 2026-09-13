import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump } from 'js-yaml';
import { loadNativeNodePolicy, nativeNodeReservation, nativePoolPolicy, validateNativeNodePolicy } from './native-worker-node-policy.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));

export function renderNativeWorkerNode(policy) {
  const selected = validateNativeNodePolicy(policy);
  const pools = Object.fromEntries(['buster', 'prism'].map(role => [role, nativePoolPolicy(selected, role)]));
  const version = JSON.parse(fs.readFileSync(path.join(repository, 'versions.json'), 'utf8')).buildArgs.NODE_BASE;
  const nodeVersion = /^node:(\d+\.\d+\.\d+)-/.exec(version)?.[1];
  if (!nodeVersion) throw new Error('NATIVE_HOST_NODE_VERSION_NOT_SELECTED');
  const setup = { schemaVersion: 1, nodeVersion, pools: Object.fromEntries(Object.entries(pools).map(([role, pool]) => [role, pool.limits])) };
  const kubelet = { ...nativeNodeReservation(selected), cgroupDriver: 'systemd', cgroupsPerQOS: true, enforceNodeAllocatable: ['pods'] };
  return {
    'prism-native-values.yaml': dump({ worker: { native: { enabled: true, nodeName: selected.nodeName,
      namespace: selected.pools.prism.namespace, policyDigest: pools.prism.policyDigest }, replicas: 1 } }),
    'native-nri.json': `${JSON.stringify(nriPolicy(selected, pools), null, 2)}\n`,
    'containerd-nri.toml': '[plugins."io.containerd.nri.v1.nri"]\n  disable = false\n',
    'native-node-policy.json': `${JSON.stringify(setup, null, 2)}\n`,
    'buster-pool.json': `${JSON.stringify(pools.buster, null, 2)}\n`,
    'prism-pool.json': `${JSON.stringify(pools.prism, null, 2)}\n`,
    'kubelet-reservations.json': `${JSON.stringify(kubelet, null, 2)}\n`,
    'prepare-native-worker-pools.mjs': fs.readFileSync(path.join(repository, 'scripts/prepare-native-worker-pools.mjs'), 'utf8'),
    'kubeclaw-native-pools.service': unit(),
  };
}

function nriPolicy(selected, pools) {
  const containerdVersion = selected.runtime?.containerdVersion;
  if (typeof containerdVersion !== 'string' || !/^v?2\.(?:[2-9]|[1-9][0-9]+)\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(containerdVersion)) {
    throw new Error('NATIVE_NODE_SELECTED_CONTAINERD_VERSION_REQUIRED');
  }
  const roles = Object.fromEntries(['buster', 'prism'].map(role => [role, {
    namespace: selected.pools[role].namespace, container: role === 'buster' ? 'buster-v2-runtime' : 'worker',
    policyDigest: pools[role].policyDigest,
  }]));
  return { schemaVersion: 1, containerdVersion, roles };
}

function unit() {
  return `[Unit]
Description=KubeClaw native worker role pools
Before=k3s.service k3s-agent.service
After=local-fs.target

[Service]
Type=oneshot
RemainAfterExit=yes
Slice=kubeclaw.slice
Delegate=cpu memory pids
DelegateSubgroup=setup
ExecStart=/usr/bin/env node /opt/kubeclaw/native/prepare-native-worker-pools.mjs /etc/kubeclaw/native-node-policy.json
NoNewPrivileges=yes
UMask=0077
TasksMax=infinity
KillMode=control-group
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Usage: render-native-worker-node.mjs POLICY_YAML NEW_OUTPUT_DIRECTORY');
  const bundle = renderNativeWorkerNode(loadNativeNodePolicy(process.argv[2]));
  const directory = path.resolve(process.argv[3]);
  fs.mkdirSync(directory, { mode: 0o700 }); // Exclusive: never overwrite an operator's previous bundle.
  for (const [name, content] of Object.entries(bundle)) fs.writeFileSync(path.join(directory, name), content, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${directory}\n`);
}
