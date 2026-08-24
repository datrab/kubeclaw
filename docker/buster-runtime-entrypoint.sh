#!/bin/sh
set -eu

worker_token="${BUSTER_V2_TOKEN:?BUSTER_V2_TOKEN is required}"
unset BUSTER_V2_TOKEN
socket="${BUILDKIT_HOST:?BUILDKIT_HOST is required}"
address="${socket#unix://}"
state="${BUILDKIT_STATE_DIR:?BUILDKIT_STATE_DIR is required}"
otel_socket="${BUILDKIT_OTEL_SOCKET_PATH:-${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is required}/buildkit/otel-grpc.sock}"
registry="${KUBECLAW_LOCAL_REGISTRY:?KUBECLAW_LOCAL_REGISTRY is required}"
config="${HOME}/.config/buildkit/buildkitd.toml"
mkdir -p "$(dirname "$address")" "$(dirname "$otel_socket")" "$state" "$(dirname "$config")"
cat >"$config" <<EOF
[registry."${registry}"]
  http = true
  insecure = true
EOF
chown root:builder "$config"
chmod 0640 "$config"

setpriv \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  rootlesskit --net=host buildkitd \
  --config "$config" \
  --addr "$socket" \
  --otel-socket-path "$otel_socket" \
  --root "$state" \
  --oci-worker-no-process-sandbox \
  >/tmp/buildkitd.log 2>&1 &
buildkit_pid=$!
worker_pid=""
legacy_pid=""
runtime_config_root="${BUSTER_PLAN_CONFIG_ROOT:-/tmp/buster-plan-config}"
kube_service_account_root="${BUSTER_KUBERNETES_SERVICE_ACCOUNT_ROOT:-/var/run/buster-worker/kubernetes}"
plan_state_dir="${BUSTER_PLAN_STATE_DIR:-/var/lib/buster-v2/plan-jobs}"
plan_run_dir="${BUSTER_PLAN_RUN_DIR:-/tmp/buster-plan-runs}"
legacy_state_dir="${BUSTER_LEGACY_STATE_DIR:-/var/lib/buster-v2/legacy-jobs}"
legacy_run_dir="${BUSTER_LEGACY_RUN_DIR:-/tmp/buster-legacy-runs}"
cgroup_root="${BUSTER_DIRECT_COMMAND_CGROUP_ROOT:?BUSTER_DIRECT_COMMAND_CGROUP_ROOT is required}"

cleanup() {
  if [ -n "$worker_pid" ]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  if [ -n "$legacy_pid" ]; then
    kill "$legacy_pid" 2>/dev/null || true
    wait "$legacy_pid" 2>/dev/null || true
  fi
  kill "$buildkit_pid" 2>/dev/null || true
  wait "$buildkit_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
until buildctl --addr "$socket" debug workers >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    cat /tmp/buildkitd.log >&2
    exit 1
  fi
  sleep 1
done

# The deployment mounts one dedicated cgroup v2 subtree. The worker never
# receives the host cgroup root. Fail before service startup if delegation is
# incomplete, because sampled process accounting is forbidden in production.
test -d "$cgroup_root"
test -f "$cgroup_root/cgroup.controllers"
for controller in pids memory cpu; do
  grep -qw "$controller" "$cgroup_root/cgroup.controllers" \
    || { echo "required cgroup controller is unavailable: $controller" >&2; exit 1; }
done
if [ -s "$cgroup_root/cgroup.procs" ]; then
  echo "direct-command cgroup subtree contains host processes" >&2
  exit 1
fi
printf '+pids +memory +cpu' >"$cgroup_root/cgroup.subtree_control"
for controller in pids memory cpu; do
  grep -qw "$controller" "$cgroup_root/cgroup.subtree_control" \
    || { echo "required cgroup controller is not delegated: $controller" >&2; exit 1; }
done
chown builder:builder "$cgroup_root" "$cgroup_root/cgroup.procs" "$cgroup_root/cgroup.subtree_control"

# BuildKit creates the socket as the non-root builder. Apply its shared-group
# permissions as that owner; the restricted supervisor intentionally does not
# retain CAP_FOWNER.
setpriv \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  chgrp 1002 "$address"
setpriv \
  --reuid=1000 \
  --regid=1000 \
  --init-groups \
  chmod 0660 "$address"

# The supervisor retains only CHOWN/SETUID/SETGID/SETPCAP. Keep the pod fsGroup
# (1000) for projected credentials and add the socket group (1002) so its
# BuildKit readiness checks can connect after the ownership transition above.
# worker.ts clears all supplementary groups and capabilities before suite code.
: "${BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:?BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY is required}"
mkdir -p "$runtime_config_root" "$plan_state_dir" "$plan_run_dir" "$legacy_state_dir" "$legacy_run_dir"
chown -R builder:builder "$runtime_config_root" "$plan_state_dir" "$plan_run_dir" "$legacy_state_dir" "$legacy_run_dir"
test -r "$kube_service_account_root/token"
test -r "$kube_service_account_root/ca.crt"
test -r "$kube_service_account_root/namespace"
kube_namespace="$(tr -d '\r\n' < "$kube_service_account_root/namespace")"
case "$kube_namespace" in
  ''|*[!a-z0-9-]*) echo "projected Kubernetes namespace is invalid" >&2; exit 1 ;;
esac
kubeconfig="$runtime_config_root/kubeconfig"
cat >"$kubeconfig" <<EOF
apiVersion: v1
kind: Config
clusters:
- name: in-cluster
  cluster:
    certificate-authority: $kube_service_account_root/ca.crt
    server: https://${KUBERNETES_SERVICE_HOST:?KUBERNETES_SERVICE_HOST is required}:${KUBERNETES_SERVICE_PORT:?KUBERNETES_SERVICE_PORT is required}
users:
- name: buster
  user:
    tokenFile: $kube_service_account_root/token
contexts:
- name: buster
  context:
    cluster: in-cluster
    namespace: $kube_namespace
    user: buster
current-context: buster
EOF

RUNTIME_CONFIG_ROOT="$runtime_config_root" REGISTRY_REFERENCE="$registry" CONTROLLER_NAMESPACE="$kube_namespace" \
  DIRECT_COMMAND_CGROUP_ROOT="$cgroup_root" \
  BUSTER_V2_STATE_DIR="$plan_state_dir" BUSTER_V2_RUN_DIR="$plan_run_dir" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.RUNTIME_CONFIG_ROOT;
const registry = process.env.REGISTRY_REFERENCE;
const plugins = '/app/skills/buster/plugins';
fs.writeFileSync(path.join(root, 'platform.json'), `${JSON.stringify({
  schemaVersion: 'pipeline-platform.v2',
  installationRoots: [plugins], trustedBuiltinRoots: [plugins],
  externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
  providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {},
  storageRoot: '/tmp/buster-plan-platform', shutdownTimeoutMs: 10_000,
  orchestratorIssuerId: 'buster', administrativeDecisionIssuers: [],
}, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'runtime.json'), `${JSON.stringify({
  schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig: './platform.json',
  host: '0.0.0.0', port: Number(process.env.BUSTER_PLAN_PORT || 18891),
  tokenEnvironmentVariable: 'BUSTER_V2_TOKEN',
  sourceAttestationPublicKeyEnvironmentVariable: 'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',
  trustedSourceAuthority: process.env.BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY || 'nova:production',
  stateRoot: process.env.BUSTER_V2_STATE_DIR,
  runtimeRoot: process.env.BUSTER_V2_RUN_DIR,
  tarExecutable: '/usr/bin/tar',
  recordLimits: { maximumRecords: 10000, maximumBytes: 1073741824, maximumRecordBytes: 67108864 },
  maximumArchiveBytes: Number(process.env.BUSTER_V2_MAX_ARCHIVE_BYTES || 67108864),
  maximumExtractedBytes: Number(process.env.BUSTER_V2_MAX_EXTRACTED_BYTES || 536870912),
  maximumResultBytes: 67108864, maximumResultStoreBytes: 1073741824,
  maximumRequestBytes: 100663296, maximumResponseBytes: 67108864,
  shutdownTimeoutMs: 15000,
  tls: { keyPath: '/var/run/buster-plan-tls/tls.key', certificatePath: '/var/run/buster-plan-tls/tls.crt' },
  allowedCapabilities: ['command.execute', 'container.build', 'kubernetes.fixture', 'kubernetes.exposure', 'network.http'],
  directCommand: {
    executableCatalog: {
      node: '/usr/local/bin/node',
      npm: '/usr/local/bin/npm',
      python3: '/usr/bin/python3',
      tar: '/usr/bin/tar',
      cp: '/usr/bin/cp',
    },
    executableSearchPath: ['/usr/local/bin', '/usr/bin', '/bin'],
    runtimeReadRoots: [
      '/usr/local/bin', '/usr/local/lib/node_modules', '/usr/bin', '/bin',
      '/usr/lib', '/lib', '/lib64', '/etc/ssl', '/etc/alternatives',
    ],
    maximumOutputBytes: 16777216,
    maximumExecutionMs: 900000,
    maximumProcesses: 128,
    maximumMemoryBytes: 4294967296,
    maximumCpuMillis: 900000,
    terminationGraceMs: 2000,
    cgroupRoot: process.env.DIRECT_COMMAND_CGROUP_ROOT,
  },
  containerBuild: {
    buildctlExecutable: '/usr/local/bin/buildctl', buildkitHost: process.env.BUILDKIT_HOST,
    registryBaseUrl: `http://${registry}`, registryReference: registry,
    repositoryPrefix: 'kubeclaw/pipeline', allowedPlatforms: ['linux/amd64', 'linux/arm64'],
    allowedBuildArguments: ['NODE_ENV'], maximumLogBytes: 8388608,
    maximumExecutionMs: 900000, maximumManifestBytes: 16777216,
  },
  kubernetesFixture: {
    kubectlExecutable: '/usr/local/bin/kubectl', controllerNamespace: process.env.CONTROLLER_NAMESPACE,
    leaseApiGroup: process.env.BUSTER_LEASE_API_GROUP || 'kubeclaw.forgestack.ai',
    leaseApiVersion: process.env.BUSTER_LEASE_API_VERSION || 'v1alpha1', allowedNamespacePrefixes: ['test'],
    allowedRegistryPrefixes: [`${registry}/kubeclaw`], allowedSecretReferences: [], maximumManifestBytes: 1048576,
    maximumResources: 64, maximumRetentionSeconds: 604800, maximumExecutionMs: 900000, pollIntervalMs: 1000,
  },
  tailscaleExposure: {
    kubectlExecutable: '/usr/local/bin/kubectl', controllerNamespace: process.env.CONTROLLER_NAMESPACE,
    leaseApiGroup: process.env.BUSTER_LEASE_API_GROUP || 'kubeclaw.forgestack.ai',
    leaseApiVersion: process.env.BUSTER_LEASE_API_VERSION || 'v1alpha1', allowedNamespacePrefixes: ['test'],
    allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 900000, pollIntervalMs: 1000,
  },
  networkHttp: {
    allowedOrigins: [], allowedHostSuffixes: ['.svc.cluster.local', '.ts.net'], allowedPorts: [80, 443],
    maximumResponseBytes: 16777216, maximumExecutionMs: 120000,
  },
}, null, 2)}\n`);
NODE
chmod 0640 "$runtime_config_root/platform.json" "$runtime_config_root/runtime.json" "$kubeconfig"
chown builder:builder "$runtime_config_root/platform.json" "$runtime_config_root/runtime.json" "$kubeconfig"

BUSTER_V2_TOKEN="$worker_token" KUBECONFIG="$kubeconfig" setpriv \
  --reuid=1000 \
  --regid=1000 \
  --groups 1000,1002 \
  node /app/skills/buster/engine/remote-plan-cli.ts --config "$runtime_config_root/runtime.json" &
worker_pid=$!

printf '%s' "$worker_token" | BUSTER_V2_PORT="${BUSTER_LEGACY_PORT:-18892}" \
  BUSTER_V2_STATE_DIR="$legacy_state_dir" BUSTER_V2_RUN_DIR="$legacy_run_dir" setpriv \
  --groups 1000,1002 \
  node /app/buster-suite-runtime/src/worker.ts &
legacy_pid=$!

wait "$worker_pid"
