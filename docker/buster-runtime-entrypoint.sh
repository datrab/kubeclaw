#!/bin/sh
set -eu

worker_token="${BUSTER_V2_TOKEN:?BUSTER_V2_TOKEN is required when SPIFFE transport is unavailable}"
trusted_peer_spiffe_id="${BUSTER_TRUSTED_PEER_SPIFFE_ID:-}"
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
runtime_config_root="${BUSTER_PLAN_CONFIG_ROOT:-/tmp/buster-plan-config}"
kube_service_account_root="${BUSTER_KUBERNETES_SERVICE_ACCOUNT_ROOT:-/var/run/buster-worker/kubernetes}"
plan_state_dir="${BUSTER_PLAN_STATE_DIR:-/var/lib/buster-v2/plan-jobs}"
plan_run_dir="${BUSTER_PLAN_RUN_DIR:-/var/lib/buster-v2/runs}"
browser_playwright_cgroup_root="${BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT:?BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT is required}"

cleanup() {
  if [ -n "$worker_pid" ]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
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

# The pod mounts one dedicated cgroup v2 subtree. The worker never receives
# the host cgroup root. Production browser execution cannot use sampled
# accounting because short-lived descendants could escape a sample.
test -d "$browser_playwright_cgroup_root"
test -f "$browser_playwright_cgroup_root/cgroup.controllers"
canonical_browser_playwright_cgroup_root="$(realpath "$browser_playwright_cgroup_root")"
expected_browser_playwright_cgroup_root="$(realpath -m /var/run/kubeclaw-browser-cgroup)"
if [ "$canonical_browser_playwright_cgroup_root" != "$expected_browser_playwright_cgroup_root" ]; then
  echo "browser Playwright cgroup root is unsafe" >&2
  exit 1
fi
for controller in pids memory cpu; do
  grep -qw "$controller" "$browser_playwright_cgroup_root/cgroup.controllers" \
    || { echo "required browser cgroup controller is unavailable: $controller" >&2; exit 1; }
done
if [ -s "$browser_playwright_cgroup_root/cgroup.procs" ]; then
  echo "browser Playwright cgroup subtree contains host processes" >&2
  exit 1
fi
printf '+pids +memory +cpu' >"$browser_playwright_cgroup_root/cgroup.subtree_control"
for controller in pids memory cpu; do
  grep -qw "$controller" "$browser_playwright_cgroup_root/cgroup.subtree_control" \
    || { echo "required browser cgroup controller is not delegated: $controller" >&2; exit 1; }
done
chown builder:builder "$browser_playwright_cgroup_root" "$browser_playwright_cgroup_root/cgroup.procs" "$browser_playwright_cgroup_root/cgroup.subtree_control"

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
mkdir -p "$runtime_config_root" "$plan_state_dir" "$plan_run_dir"
# The supervisor intentionally lacks CAP_DAC_OVERRIDE and CAP_FOWNER. Keep the
# generated-config directory owned by root until every file has been written;
# otherwise handing the directory to builder here prevents the supervisor from
# creating the kubeconfig and runtime JSON below. State and run directories are
# handed off immediately because only the workers write to them. The plan
# runtime runs as builder.
chown -R root:root "$runtime_config_root"
chmod 0750 "$runtime_config_root"
chown -R builder:builder "$plan_state_dir" "$plan_run_dir"
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
  BUSTER_ALLOWED_SOURCE_SECRETS="${BUSTER_ALLOWED_SOURCE_SECRETS:-}" \
  BUSTER_NETWORK_HTTP_EXACT_ORIGINS="${BUSTER_NETWORK_HTTP_EXACT_ORIGINS:-}" \
  BUSTER_BROWSER_AXE_EXACT_ORIGINS="${BUSTER_BROWSER_AXE_EXACT_ORIGINS:-}" \
  BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET="${BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET:-false}" \
  BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT="$browser_playwright_cgroup_root" \
  BUSTER_V2_STATE_DIR="$plan_state_dir" BUSTER_V2_RUN_DIR="$plan_run_dir" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.RUNTIME_CONFIG_ROOT;
const registry = process.env.REGISTRY_REFERENCE;
const plugins = '/app/skills/buster/plugins';
const exactHttpOrigins = (process.env.BUSTER_NETWORK_HTTP_EXACT_ORIGINS || '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const exactBrowserOrigins = (process.env.BUSTER_BROWSER_AXE_EXACT_ORIGINS || '')
  .split(',').map((value) => value.trim()).filter(Boolean);
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
  ...(process.env.BUSTER_TRUSTED_PEER_SPIFFE_ID
    ? { trustedPeerSpiffeIds: [process.env.BUSTER_TRUSTED_PEER_SPIFFE_ID] }
    : { tokenEnvironmentVariable: 'BUSTER_V2_TOKEN' }),
  sourceAttestationPublicKeyEnvironmentVariable: 'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',
  trustedSourceAuthority: process.env.BUSTER_PLAN_TRUSTED_SOURCE_AUTHORITY || 'nova:production',
  stateRoot: process.env.BUSTER_V2_STATE_DIR,
  runtimeRoot: process.env.BUSTER_V2_RUN_DIR,
  tarExecutable: '/usr/bin/tar',
  recordLimits: { maximumRecords: 10000, maximumBytes: 1073741824, maximumRecordBytes: 67108864 },
  maximumArchiveBytes: Number(process.env.BUSTER_V2_MAX_ARCHIVE_BYTES || 67108864),
  maximumActiveJobs: Number(process.env.BUSTER_V2_MAX_ACTIVE_JOBS || 2),
  maximumQueuedJobs: Number(process.env.BUSTER_V2_MAX_QUEUED_JOBS || 16),
  maximumConcurrentAttempts: Number(process.env.BUSTER_V2_MAX_CONCURRENT_ATTEMPTS || 64),
  maximumExtractedBytes: Number(process.env.BUSTER_V2_MAX_EXTRACTED_BYTES || 536870912),
  maximumResultBytes: 67108864, maximumResultStoreBytes: 1073741824,
  maximumRequestBytes: 100663296, maximumResponseBytes: 67108864,
  shutdownTimeoutMs: 15000,
  allowedCapabilities: ['command.execute', 'container.build', 'kubernetes.fixture', 'kubernetes.exposure', 'network.http', 'browser.axe', 'browser.lighthouse', 'browser.visual', 'browser.playwright', 'security.scan', 'kubernetes.runtime-security'],
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
    allowSampledProcessLimit: true,
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
    allowedRegistryPrefixes: [`${registry}/kubeclaw`],
    allowedSecretReferences: (process.env.BUSTER_ALLOWED_SOURCE_SECRETS || '').split(',').filter(Boolean),
    allowedStorageClasses: [], allowDefaultStorageClass: true,
    maximumManifestBytes: 1048576,
    maximumResources: 64, maximumPersistentVolumeClaimBytes: 10737418240,
    maximumPersistentVolumeTotalBytes: 21474836480,
    maximumRetentionSeconds: 604800, maximumExecutionMs: 900000, pollIntervalMs: 1000,
  },
  tailscaleExposure: {
    kubectlExecutable: '/usr/local/bin/kubectl', controllerNamespace: process.env.CONTROLLER_NAMESPACE,
    leaseApiGroup: process.env.BUSTER_LEASE_API_GROUP || 'kubeclaw.forgestack.ai',
    leaseApiVersion: process.env.BUSTER_LEASE_API_VERSION || 'v1alpha1', allowedNamespacePrefixes: ['test'],
    allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 900000, pollIntervalMs: 1000,
  },
  networkHttp: {
    allowedOrigins: exactHttpOrigins, allowedHostSuffixes: ['.svc.cluster.local', '.ts.net'], allowedPorts: [80, 443],
    allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
    allowedRequestHeaders: ['accept', 'authorization', 'content-type', 'x-api-key'],
    allowWebSocket: process.env.BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET === 'true',
    maximumRequestBytes: 1048576, maximumResponseBytes: 16777216, maximumExecutionMs: 120000,
  },
  browserAxe: {
    allowedOrigins: exactBrowserOrigins,
    allowedBrowsers: ['chromium', 'firefox', 'webkit'],
    maximumCombinations: 32,
    maximumConcurrency: 4,
    maximumExecutionMs: 120000,
    maximumResultBytes: 16777216,
    maximumScreenshots: 16,
    maximumScreenshotBytes: 8388608,
  },
  browserLighthouse: {
    allowedOrigins: exactBrowserOrigins,
    chromeExecutable: '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
    maximumRuns: 80,
    maximumExecutionMs: 180000,
    maximumResultBytes: 67108864,
  },
  browserVisual: {
    allowedOrigins: exactBrowserOrigins,
    allowedBrowsers: ['chromium', 'firefox', 'webkit'],
    maximumCombinations: 64,
    maximumConcurrency: 4,
    maximumExecutionMs: 120000,
    maximumResultBytes: 134217728,
    maximumScreenshotBytes: 16777216,
    maximumMasksPerCombination: 32,
  },
  browserPlaywright: {
    allowedOrigins: exactBrowserOrigins,
    allowedTargetPorts: [18080],
    playwrightExecutable: '/app/node_modules/.bin/playwright',
    sandboxExecutable: '/opt/kubeclaw-trusted/plugin-sandbox',
    runtimeNodeModules: '/app/node_modules',
    browsersPath: '/ms-playwright',
    readOnlyRoots: ['/app', '/ms-playwright', '/usr', '/lib', '/lib64', '/etc/fonts', '/etc/hosts', '/etc/nsswitch.conf', '/etc/resolv.conf', '/etc/ssl', '/proc', '/sys', '/dev'],
    maximumWorkers: 4,
    maximumExecutionMs: 900000,
    maximumOutputBytes: 16777216,
    maximumResultBytes: 67108864,
    maximumArtifactBytes: 268435456,
    maximumArtifactFiles: 256,
    maximumProcesses: 128,
    maximumMemoryBytes: 4294967296,
    maximumCpuMillis: 900000,
    terminationGraceMs: 5000,
    cgroupRoot: process.env.BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT,
    runAsUid: 1001,
    runAsGid: 1000,
  },
  securityScan: {
    trivyExecutable: '/usr/local/bin/trivy',
    allowedRegistryPrefixes: [`${registry}/kubeclaw`],
    maximumExecutionMs: 900000,
    maximumOutputBytes: 67108864,
    cacheDirectory: '/home/builder/.cache/trivy',
  },
  kubernetesRuntimeSecurity: {
    kubectlExecutable: '/usr/local/bin/kubectl',
    controllerNamespace: process.env.CONTROLLER_NAMESPACE,
    leaseApiGroup: process.env.BUSTER_LEASE_API_GROUP || 'kubeclaw.forgestack.ai',
    allowedNamespacePrefixes: ['test'],
    maximumExecutionMs: 300000,
    maximumOutputBytes: 16777216,
    pollIntervalMs: 1000,
    maximumObservationAgeMs: 10000,
  },
}, null, 2)}\n`);
NODE
chmod 0640 "$runtime_config_root/platform.json" "$runtime_config_root/runtime.json" "$kubeconfig"
chown -R builder:builder "$runtime_config_root"

if [ -n "$trusted_peer_spiffe_id" ]; then
  BUSTER_TRUSTED_PEER_SPIFFE_ID="$trusted_peer_spiffe_id" KUBECONFIG="$kubeconfig" setpriv \
    --reuid=1000 \
    --regid=1000 \
    --groups 1000,1002 \
    node /app/skills/buster/engine/remote-plan-cli.ts --config "$runtime_config_root/runtime.json" &
else
  BUSTER_V2_TOKEN="$worker_token" KUBECONFIG="$kubeconfig" setpriv \
    --reuid=1000 \
    --regid=1000 \
    --groups 1000,1002 \
    node /app/skills/buster/engine/remote-plan-cli.ts --config "$runtime_config_root/runtime.json" &
fi
worker_pid=$!

wait "$worker_pid"
