#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root');
  return path.resolve(index >= 0 ? process.argv[index + 1] : process.cwd());
}

const sourceRoot = sourceRootFromArgs();
const read = (relativePath) =>
  fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
const exists = (relativePath) =>
  fs.existsSync(path.join(sourceRoot, relativePath));

const chart = read('charts/kubeclaw/templates/deployment.yaml');
const gatewayConfig = read('charts/kubeclaw/templates/configmap-gateway.yaml');
const prismWorkloads = read('charts/prism/templates/workloads.yaml');
const prismJobs = read('charts/prism/templates/jobs.yaml');
const generalDockerfile = read('docker/Dockerfile.general');
const busterGatewayDockerfile = read('docker/Dockerfile.buster-gateway');
const busterRuntimeDockerfile = read('docker/Dockerfile.buster-runtime');
const prismControlDockerfile = read('docker/Dockerfile.prism-control');
const prismStudioDockerfile = read('docker/Dockerfile.prism-studio');
const prismWorkerDockerfile = read('docker/Dockerfile.prism-worker');
const busterRuntimeEntrypoint = read('docker/buster-runtime-entrypoint.sh');
const busterWorker = read('skills/buster/plugins/buster-suite-runtime/src/worker.ts');
const values = read('charts/kubeclaw/values.yaml');
const novaValues = read('my-values/nova-values.yaml');
const busterValues = read('my-values/buster-values.yaml');
const prismAgentValues = read('my-values/prism-agent-values.yaml');
const litellmConfig = read('my-values/infra/litellm-config.yaml');
const workflow = read('.github/workflows/build-images.yaml');
const deploy = read('scripts/deploy.sh');
const dockerignore = read('.dockerignore');
const networkPolicies = read('my-values/infra/network-policies.yaml');

for (const [label, source] of [
  ['chart', chart],
  ['values', values],
  ['image workflow', workflow],
  ['deploy script', deploy],
  ['dockerignore', dockerignore],
]) {
  assert.doesNotMatch(
    source,
    /busterPipeline|buster-pipeline/i,
    `${label} must not retain the deleted v1 Buster worker`,
  );
}

assert.equal(
  exists('docker/Dockerfile.buster-pipeline'),
  false,
  'the deleted v1 Buster worker image must stay absent',
);
assert.equal(
  exists('docker/buster-pipeline-entrypoint.sh'),
  false,
  'the deleted v1 Buster worker entrypoint must stay absent',
);
assert.equal(
  exists('skills/buster/pipeline'),
  false,
  'the deleted v1 Buster runtime must stay absent',
);

for (const relativePath of [
  'docker/Dockerfile.general',
  'docker/Dockerfile.buster-gateway',
  'docker/Dockerfile.buster-runtime',
  'docker/buster-runtime-entrypoint.sh',
  'docker/Dockerfile.namespace-controller',
  'docker/Dockerfile.archviewer',
  'docker/Dockerfile.prism-control',
  'docker/Dockerfile.prism-studio',
  'docker/Dockerfile.prism-worker',
  'docker/Dockerfile.prism-ingestion',
  'skills/nova/pipeline.ts',
  'skills/nova/core/cli.ts',
  'skills/nova/core/src/index.ts',
  'skills/worker/core/src/index.ts',
  'skills/buster/engine/src/index.ts',
  'packaging/runtime/roles/nova.json',
  'packaging/runtime/roles/buster.json',
  'scripts/build-runtime-role-bundle.mjs',
]) {
  assert.equal(exists(relativePath), true, `${relativePath} must exist`);
}

for (const buildInput of [
  'tsconfig.base.json',
  'docker/Dockerfile.buster-runtime',
  'docker/buster-runtime-entrypoint.sh',
  'skills/buster/plugins/buster-suite-runtime/**',
  'skills/common/plugin-runtime/sdk/**',
]) {
  assert.match(
    dockerignore,
    new RegExp(`^!${buildInput.replaceAll('.', '\\.').replaceAll('**', '\\*\\*')}$`, 'm'),
    `${buildInput} must be present in the narrowed Docker build context`,
  );
}

for (const [label, dockerfile] of [
  ['general image', generalDockerfile],
  ['Buster gateway image', busterGatewayDockerfile],
]) {
  assert.match(
    dockerfile,
    /COPY tsconfig\.base\.json \/tmp\/tsconfig\.base\.json/,
    `${label} must copy the shared TypeScript configuration before compiling the observer`,
  );
}

for (const [label, dockerfile] of [
  ['general image', generalDockerfile],
  ['Buster gateway image', busterGatewayDockerfile],
]) {
  const baseVersion = dockerfile.match(/^ARG OPENCLAW_BASE=ghcr\.io\/openclaw\/openclaw:([^@\s]+)/mu)?.[1];
  const pluginVersion = dockerfile.match(/^ARG OPENCLAW_PLUGIN_VERSION=([^\s]+)/mu)?.[1];
  assert.ok(baseVersion, `${label} must pin an OpenClaw base version`);
  assert.equal(
    pluginVersion,
    baseVersion,
    `${label} must bake external plugins at the same version as the OpenClaw base`,
  );
  assert.match(
    dockerfile,
    /NPM_CONFIG_CACHE=\/tmp\/openclaw-plugin-npm-cache[^\n]*openclaw plugins install "npm:@openclaw\/acpx@\$\{OPENCLAW_PLUGIN_VERSION\}" --force --accept-capabilities[\s\S]*openclaw plugins install "npm:@openclaw\/discord@\$\{OPENCLAW_PLUGIN_VERSION\}" --force --accept-capabilities[\s\S]*npm pack[\s\S]*openclaw-plugin-home\/packs[\s\S]*openclaw-plugin-home\/npm-cache/,
    `${label} must package pinned plugins and their npm cache for offline runtime installation`,
  );
  assert.match(
    dockerfile,
    /ARG TARGETARCH[\s\S]*keep_codex=codex-acp-linux-x64[\s\S]*keep_claude=claude-agent-sdk-linux-x64[\s\S]*keep_esbuild=linux-x64[\s\S]*keep_codex=codex-acp-linux-arm64[\s\S]*keep_claude=claude-agent-sdk-linux-arm64[\s\S]*keep_esbuild=linux-arm64/,
    `${label} must discard ACP binaries for platforms other than the image target`,
  );
  assert.doesNotMatch(
    dockerfile,
    /cp -a \/tmp\/openclaw-plugin-home/,
    `${label} must not duplicate the multi-gigabyte plugin seed during the build`,
  );
}

assert.match(
  chart,
  /mountPath:\s*\/home\/node\/\.openclaw/,
  'the setup container must mount plugin state at the same canonical path used by the gateway',
);
assert.match(
  chart,
  /PLUGIN_INSTALL_MODE=\{\{ \.Values\.pluginSeed\.installMode \| quote \}\}[\s\S]*kubeclaw-plugin-install-mode[\s\S]*for plugin_spec in\{\{- range \.Values\.pluginSeed\.specs \}\}[\s\S]*NPM_CONFIG_OFFLINE=true[\s\S]*openclaw plugins install "\$\{plugin_spec\}" --force --pin --accept-capabilities/,
  'the setup container must preserve official plugin provenance while installing from the offline image cache',
);
assert.match(
  values,
  /pluginSeed:[\s\S]*installMode:\s*"official-npm-v1"[\s\S]*"npm:@openclaw\/acpx@2026\.8\.2"[\s\S]*"npm:@openclaw\/discord@2026\.8\.2"/,
  'official OpenClaw plugins must be pinned to the gateway release and installed with trusted npm provenance',
);
assert.doesNotMatch(
  chart,
  /rm -rf \/config\/state|openclaw-plugin-home\/state/,
  'plugin cache refresh must preserve the persistent OpenClaw SQLite state',
);

assert.match(
  busterRuntimeDockerfile,
  /mkdir -p \/app \/home\/builder/,
  'the Buster runtime must create /app before assigning its ownership',
);
for (const [label, dockerfile] of [
  ['Buster runtime image', busterRuntimeDockerfile],
  ['Prism worker image', prismWorkerDockerfile],
]) {
  assert.match(
    dockerfile,
    /node \.?\/?(?:app\/)?node_modules\/playwright\/cli\.js install --with-deps chromium/,
    `${label} must invoke the production Playwright CLI without the pruned dev-dependency symlink`,
  );
}
assert.match(
  dockerignore,
  /^!tests\/verification\/live\/\*\*$/m,
  'Prism live verification assets must be available to the control image build',
);
assert.match(
  prismControlDockerfile,
  /COPY --from=build \/build\/tests\/verification\/live \/app\/prism\/tests\/verification\/live/,
  'the Prism control image must package its live verification assets',
);
assert.match(
  prismStudioDockerfile,
  /COPY --from=build \/build\/skills\/prism\/server\/proxy-headers\.ts \/app\/prism\/server\/proxy-headers\.ts/,
  'the Prism Studio image must package every imported server module',
);

assert.match(
  chart,
  /app-skills-package-set[\s\S]*packages\|packages\/\*[\s\S]*plugins\|plugins\/\*/,
  'the chart must accept package-set bundles and protect package roots',
);
assert.match(
  deploy,
  /nova-buildkit-preflight[\s\S]*kubectl exec[\s\S]*deployment\/agent-nova[\s\S]*nova-buildkit-production-preflight\.mts/,
  'the live BuildKit proof must execute from Nova through the v2 capability graph',
);
assert.doesNotMatch(
  deploy,
  /tests\/verification\/live\/buster-buildkit-production-smoke\.mjs/,
  'the BuildKit command must not reference the retired direct-container smoke script',
);
assert.match(
  workflow,
  /image_inputs:\s*\n\s+- '\.dockerignore'/,
  'Docker context policy changes must trigger image builds',
);
assert.match(
  workflow,
  /image_inputs:[\s\S]*- 'tsconfig\.base\.json'/,
  'shared TypeScript configuration changes must trigger image builds',
);
assert.ok(
  workflow.includes('(-[0-9]+)?$'),
  'the OpenClaw release check must accept numbered correction releases',
);
assert.doesNotMatch(chart, /execution-buildkit|execution-api-token|executionRuntime/);
assert.doesNotMatch(values, /executionRuntime|moby\/buildkit/);
assert.doesNotMatch(novaValues, /BUILDKIT_HOST|executionRuntime|moby\/buildkit/);
assert.doesNotMatch(
  novaValues,
  /https?:\/\/agent-buster(?::|\/)/,
  'Nova must derive Buster endpoints from its configured provider role',
);
assert.match(
  novaValues,
  /capabilityProviders:\s*\n\s+buster:\s*\n\s+agentRole:\s*buster\s*\n\s+capabilities:[\s\S]*runtime\.dispatch:[\s\S]*adapter:\s*openclaw[\s\S]*port:\s*18789[\s\S]*test\.suite\.execute:[\s\S]*adapter:\s*buster-suite-v2[\s\S]*port:\s*18892[\s\S]*test\.plan\.execute:[\s\S]*adapter:\s*buster-plan-v1[\s\S]*port:\s*18891/,
  'Nova must identify Buster through the provider-role contract',
);
assert.match(
  chart,
  /KUBECLAW_CAPABILITY_PROVIDERS[\s\S]*toJson \$catalog/,
  'the chart must render the neutral capability-provider catalog',
);
assert.doesNotMatch(chart, /BUSTER_V2_ENDPOINT|BUSTER_GATEWAY_ORIGIN|busterGateway/);
assert.match(
  busterRuntimeDockerfile,
  /FROM moby\/buildkit:v[\w.-]+-rootless@sha256:[a-f0-9]{64} AS buildkit/,
  'Buster must own a digest-pinned rootless BuildKit runtime',
);
assert.match(
  busterRuntimeDockerfile,
  /dist\/src\/worker\.js|buster-runtime-entrypoint/,
  'the Buster image must run the v2 suite worker',
);
assert.match(
  busterRuntimeEntrypoint,
  /--otel-socket-path\s+"\$otel_socket"/,
  'rootless BuildKit must place its OTEL trace socket in the writable runtime directory',
);
assert.match(
  gatewayConfig,
  /"kubeclaw-agent-observer"[\s\S]*"config"\s*:\s*\{[\s\S]*"enabled"[\s\S]*"maxEventBytes"[\s\S]*"maxQueuePerStream"[\s\S]*"hookTimeoutMs"/,
  'the host-native observer must receive its required runtime configuration',
);
assert.match(
  busterWorker,
  /--reuid[\s\S]*--clear-groups[\s\S]*\/usr\/bin\/unshare[\s\S]*--user[\s\S]*--map-current-user[\s\S]*--pid[\s\S]*--kill-child=SIGKILL[\s\S]*\/usr\/bin\/setpriv[\s\S]*--no-new-privs[\s\S]*--bounding-set=-all/,
  'suite jobs must switch identity before entering a killable namespace and drop all authority inside it',
);
assert.doesNotMatch(
  busterWorker,
  /--mount-proc/,
  'suite jobs must not remount the container-runtime-masked procfs from a nested user namespace',
);
assert.match(busterValues, /name:\s*buster-v2-runtime/);
const busterRuntimePortBlock = busterValues.match(
  /extraContainers:[\s\S]*?\n    ports:\s*\n(?<ports>[\s\S]*?)\n    startupProbe:/u,
)?.groups?.ports;
assert.ok(busterRuntimePortBlock, 'Buster runtime port block is missing');
const busterRuntimePortNames = [...busterRuntimePortBlock.matchAll(/^\s+- name:\s*(\S+)\s*$/gmu)]
  .map((match) => match[1]);
assert.deepEqual(busterRuntimePortNames, ['plan-runtime', 'legacy-runtime']);
for (const portName of busterRuntimePortNames) {
  assert.ok(portName.length <= 15, `Buster runtime port name exceeds Kubernetes limit: ${portName}`);
}

assert.match(
  chart,
  /name:\s*envoy-health,\s*containerPort:\s*19000[\s\S]*?readinessProbe:\s*\n\s*tcpSocket:\s*\{\s*port:\s*envoy-health\s*\}[\s\S]*?livenessProbe:\s*\n\s*tcpSocket:\s*\{\s*port:\s*envoy-health\s*\}/u,
  'agent Envoy probes must use the dedicated kubelet health listener',
);
assert.doesNotMatch(
  chart,
  /name:\s*worker-trust-proxy[\s\S]*?(?:\/bin\/bash|\/dev\/tcp\/127\.0\.0\.1\/9901)[\s\S]*?securityContext:/u,
  'agent Envoy probes must not depend on shell utilities in the proxy image',
);
assert.match(
  read('charts/kubeclaw/templates/configmap-worker-trust.yaml'),
  /name:\s*kubelet-health[\s\S]*address:\s*0\.0\.0\.0,\s*port_value:\s*19000[\s\S]*direct_response:\s*\{\s*status:\s*200\s*\}/u,
  'agent Envoy must expose a probe-only direct-response listener',
);
assert.match(
  prismWorkloads,
  /name:\s*worker-trust-proxy[\s\S]*readinessProbe:\s*\n\s*tcpSocket:\s*\{\s*port:\s*worker-trust\s*\}[\s\S]*livenessProbe:\s*\n\s*tcpSocket:\s*\{\s*port:\s*worker-trust\s*\}/u,
  'Prism Envoy probes must use the live mTLS listener without shell dependencies',
);
assert.doesNotMatch(
  prismWorkloads,
  /\/bin\/bash|\/dev\/tcp\/127\.0\.0\.1\/9901/u,
  'Prism Envoy probes must not depend on shell utilities in the proxy image',
);
assert.match(
  prismWorkloads,
  /readinessProbe:\s*\{\s*httpGet:\s*\{\s*path:\s*\{\{\s*ternary "\/health" "\/ready" \(eq \$name "worker"\)/u,
  'worker readiness must not deadlock the post-install schema migration',
);
assert.match(
  prismJobs,
  /name:\s*prism-migrate[\s\S]*"helm\.sh\/hook":\s*post-install,pre-upgrade[\s\S]*before-hook-creation,hook-succeeded/u,
  'Prism migrations must finish initial installation and run before upgraded workloads',
);
for (const [label, source] of [['artifacts', prismWorkloads], ['backups', prismJobs]]) {
  assert.match(source, /kind:\s*PersistentVolumeClaim[\s\S]*helm\.sh\/resource-policy:\s*keep/u,
    `Prism ${label} PVC must survive release recovery`);
}
assert.match(
  deploy,
  /reconcile_nova_retired_trust_mount[\s\S]*?NODE_EXTRA_CA_CERTS[\s\S]*?--type=strategic[\s\S]*?volumeMounts[\s\S]*?mountPath":"\/var\/run\/buster-plan-trust","\$patch":"delete"[\s\S]*?volumes[\s\S]*?name":"buster-plan-trust","\$patch":"delete"[\s\S]*?if \[\[ \$role == "nova" \]\]; then\s+reconcile_nova_retired_trust_mount/u,
  'Nova deploy must remove retired direct-TLS trust metadata from a drifted live Deployment',
);
assert.match(
  deploy,
  /reconcile_buster_runtime_ports[\s\S]*?go-template=[\s\S]*?runtime_index[\s\S]*?--type=json[\s\S]*?\\"op\\":\\"test[\s\S]*?buster-v2-runtime[\s\S]*?\\"op\\":\\"replace[\s\S]*?plan-runtime[\s\S]*?28891[\s\S]*?legacy-runtime[\s\S]*?28892[\s\S]*?if \[\[ \$role == "buster" \]\]; then\s+reconcile_buster_runtime_ports/u,
  'Buster deploy must replace stale runtime port metadata before Helm upgrades',
);
assert.match(
  deploy,
  /verify_buster_port_routing[\s\S]*?expected_runtime[\s\S]*?expected_proxy[\s\S]*?expected_service[\s\S]*?Buster port routing invariant failed[\s\S]*?if \[\[ \$role == "buster" \]\]; then\s+verify_buster_port_routing/u,
  'Buster deploy must verify runtime, proxy, and Service port routing after Helm upgrades',
);
assert.match(
  deploy,
  /helm_args=\([\s\S]*upgrade --install "agent-\$\{role\}"[\s\S]*--reset-values[\s\S]*--atomic --cleanup-on-fail --wait/,
  'agent upgrades must discard stale release values and roll back failed waits atomically',
);
assert.match(busterValues, /name:\s*plan-runtime[\s\S]*containerPort:\s*28891/);
assert.match(busterValues, /name:\s*legacy-runtime[\s\S]*containerPort:\s*28892/);
assert.match(
  busterValues,
  /startupDoctor:[\s\S]*nodeOptions:\s*"--max-old-space-size=3072"[\s\S]*limits:\s*\{\s*cpu:\s*"2",\s*memory:\s*4Gi\s*\}[\s\S]*initSetup:[\s\S]*requests:\s*\{\s*cpu:\s*500m,\s*memory:\s*1Gi\s*\}[\s\S]*limits:\s*\{\s*cpu:\s*"2",\s*memory:\s*8Gi\s*\}/,
  'Buster migration and plugin setup must have explicit non-trivial memory budgets',
);
assert.match(
  novaValues,
  /startupDoctor:[\s\S]*nodeOptions:\s*"--max-old-space-size=3072"[\s\S]*limits:\s*\{\s*cpu:\s*"2",\s*memory:\s*4Gi\s*\}[\s\S]*initSetup:[\s\S]*limits:\s*\{\s*cpu:\s*"2",\s*memory:\s*8Gi\s*\}/,
  'Nova migration and plugin setup must have enough memory for existing OpenClaw state',
);
assert.match(
  busterValues,
  /service:\s*\n\s+extraPorts:\s*\n\s+- name:\s*buster-plan\s*\n\s+port:\s*18891\s*\n\s+targetPort:\s*buster-plan\s*\n\s+- name:\s*buster-legacy\s*\n\s+port:\s*18892\s*\n\s+targetPort:\s*buster-legacy/,
  'the Buster Service must target the public Envoy ports, not the local suite runtime ports',
);
assert.match(novaValues, /BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY[\s\S]*pipeline-test-gate-source-attestation/);
assert.match(busterValues, /BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY[\s\S]*pipeline-test-gate-source-attestation/);
for (const values of [novaValues, busterValues, prismAgentValues]) {
  assert.match(values, /repoUrl:\s*["']git@github\.com:datrab\/kubeclaw\.git["']/,
    'production agents must clone the single authoritative datrab/kubeclaw repository');
  assert.doesNotMatch(values, /Ravencrypt|ForgeStack/,
    'production agent values must not retain a legacy repository identity');
}
assert.match(networkPolicies, /name:\s*kubeclaw-nova-buster-test-gates[\s\S]*component:\s*nova[\s\S]*component:\s*buster[\s\S]*port:\s*18891[\s\S]*port:\s*18892/);
assert.match(networkPolicies, /name:\s*kubeclaw-buster-test-gates-from-nova[\s\S]*component:\s*buster[\s\S]*component:\s*nova[\s\S]*port:\s*18891[\s\S]*port:\s*18892/);
assert.equal((busterValues.match(/scheme:\s*HTTP/gu) ?? []).length, 3,
  'all Buster plan runtime probes must use the loopback-only internal HTTP endpoint');
assert.match(busterValues, /CONTAINER_BUILD_BUILDKIT_HOST[\s\S]*buildkitd\.sock/);
assert.match(busterValues, /CONTAINER_BUILD_REGISTRY_BASE_URL[\s\S]*registry-local/);
assert.match(busterRuntimeDockerfile, /check-pipeline-container-build-production\.mts/);
assert.match(busterRuntimeDockerfile, /check-pipeline-container-build-recovery\.mts/);
for (const probe of ['startupProbe', 'readinessProbe', 'livenessProbe']) {
  assert.match(
    busterValues,
    new RegExp(`${probe}:[\\s\\S]*path:\\s*/healthz[\\s\\S]*port:\\s*28891`),
    `the Buster v2 runtime must define its own ${probe}`,
  );
}
assert.doesNotMatch(
  chart,
  /busterHeartbeat|kubeclaw-buster-heartbeat|skills\/pipeline\/platform-config/,
  'gateway probes must not retain the deleted v1 Buster heartbeat contract',
);
assert.match(
  busterValues,
  /BUSTER_PLAN_STATE_DIR[\s\S]*\/var\/lib\/buster-v2\/plan-jobs[\s\S]*BUSTER_LEGACY_STATE_DIR[\s\S]*\/var\/lib\/buster-v2\/legacy-jobs[\s\S]*name:\s*buster-v2-state[\s\S]*mountPath:\s*\/var\/lib\/buster-v2/,
  'plan and legacy state must use separate directories on the sidecar-only volume',
);
assert.match(
  busterValues,
  /name:\s*buster-v2-state[\s\S]*emptyDir:[\s\S]*sizeLimit:\s*64Mi/,
  'worker state must be bounded and absent from the shared workspace PVC',
);
assert.doesNotMatch(novaValues, /\.kubeclaw\.svc\.cluster\.local/);
assert.match(
  novaValues,
  /service:[\s\S]*name:\s*archviewer[\s\S]*port:\s*3456[\s\S]*targetPort:\s*archviewer[\s\S]*nodePort:\s*30456/,
  'Nova must expose its independent HTML architecture viewer on the established NodePort',
);
assert.match(
  novaValues,
  /extraContainers:[\s\S]*name:\s*archviewer[\s\S]*kubeclaw-archviewer:latest[\s\S]*name:\s*archviewer[\s\S]*containerPort:\s*3456[\s\S]*mountPath:\s*\/designs[\s\S]*readOnly:\s*true/,
  'Nova must retain the read-only Archviewer sidecar separately from Prism Studio',
);
assert.doesNotMatch(
  novaValues,
  /name:\s*prism-preview/,
  'the Nova architecture presentation port must not use the misleading Prism preview name',
);
assert.match(
  novaValues,
  /extraVolumes:\s*\[\][\s\S]*extraVolumeMounts:\s*\[\]/,
  'Nova must explicitly clear retired release-specific volumes and gateway mounts',
);
assert.doesNotMatch(
  novaValues,
  /buster-plan-trust|NODE_EXTRA_CA_CERTS/,
  'Nova must not retain the retired direct-TLS Buster trust volume',
);
assert.match(
  networkPolicies,
  /name:\s*kubeclaw-agents-ingress[\s\S]*port:\s*3456/,
  'the Archviewer NodePort path must retain ingress to Nova port 3456',
);
assert.match(chart, /fsGroup:\s*1000/);
assert.match(
  chart,
  /name:\s*openclaw-state-migration[\s\S]*node \/app\/openclaw\.mjs doctor --fix --non-interactive[\s\S]*mountPath:\s*\/home\/node\/\.openclaw/,
  'required OpenClaw state migrations must finish before the gateway container starts',
);
assert.match(
  chart,
  /name:\s*openclaw-state-migration[\s\S]*stdin:\s*true[\s\S]*tty:\s*true[\s\S]*doctor --fix --non-interactive/,
  'OpenClaw 2026.8.1 doctor-owned migrations require a PTY even in non-interactive init automation',
);
assert.match(
  chart,
  /Object\.hasOwn\(config\.agents, 'ownership'\)[\s\S]*delete config\.agents\.ownership[\s\S]*node \/app\/openclaw\.mjs doctor --fix --non-interactive/,
  'retired multi-agent ownership must be removed before doctor validates the single-agent config',
);
assert.match(
  deploy,
  /require_helm_release_idle\(\)[\s\S]*pending-install\|pending-upgrade\|pending-rollback[\s\S]*refusing to start a competing operation[\s\S]*deploy_agent\(\)[\s\S]*require_helm_release_idle "agent-\$\{role\}"/,
  'agent deploys must stop before mutating a release that already has a pending Helm operation',
);
assert.match(
  deploy,
  /Unknown deployment command: \$1[\s\S]*KubeClaw — Deployment CLI/,
  'unknown deployment targets must produce an explicit error instead of a full-stack heading',
);
assert.match(
  chart,
  /process\.env\.AGENT_ROLE !== 'prism'[\s\S]*delete config\.plugins\.entries\['kubeclaw-prism'\][\s\S]*node \/app\/openclaw\.mjs doctor --fix --non-interactive/,
  'non-Prism agents must remove the Prism-only plugin entry before startup doctor validation',
);
assert.match(
  chart,
  /name:\s*NODE_OPTIONS\s*\n\s*value:\s*\{\{ \.Values\.gateway\.startupDoctor\.nodeOptions \| quote \}\}/,
  'the state migration must receive its explicitly budgeted V8 heap size',
);
assert.doesNotMatch(
  gatewayConfig,
  /"ownership":\s*"explicit"/,
  'single-agent configurations must not declare multi-agent ownership',
);
assert.match(
  gatewayConfig,
  /"systemAgent":\s*\{\s*"agentId":\s*"main"/,
  'managed single-agent configurations must assign system jobs to the main agent',
);
assert.doesNotMatch(
  gatewayConfig,
  /"default":\s*true/,
  'single-agent configurations must not emit the legacy default marker',
);
assert.match(
  gatewayConfig,
  /if \.Values\.discord\.enabled[\s\S]*"bindings":\s*\[[\s\S]*"agentId":\s*"main"[\s\S]*"channel":\s*"discord"[\s\S]*"accountId":\s*"default"/,
  'Discord-enabled gateways must explicitly route the default account to main',
);
assert.match(
  gatewayConfig,
  /"allow":\s*\[[\s\S]*"discord"[\s\S]*"acpx"[\s\S]*"codex"[\s\S]*"openai"/,
  'fresh configs must allow only the installed role-appropriate OpenClaw plugins',
);
assert.match(
  gatewayConfig,
  /"defaultAgent":\s*"codex"[\s\S]*"allowedAgents":\s*\[[\s\S]*"claude"[\s\S]*"codex"[\s\S]*"kimi"[\s\S]*"gemini"[\s\S]*"pi"/,
  'ACPx must retain all approved CLI agents while Codex remains the default',
);
assert.doesNotMatch(
  gatewayConfig,
  /maxConcurrentSessions|coalesceIdleMs|maxChunkChars|ttlMinutes/,
  'fresh configs must not emit ACP tuning keys retired by OpenClaw 2026.8',
);
assert.match(
  gatewayConfig,
  /"exec":\s*\{\s*"timeoutSeconds":\s*604800,\s*"mode":\s*"full"\s*\}/,
  'fresh configs must use the canonical OpenClaw 2026.8 exec policy keys',
);
assert.match(
  gatewayConfig,
  /"modelPolicy":\s*\{\s*"allow":\s*\[\s*"openai\/gpt-5\.6-sol",\s*"openai\/gpt-5\.5"\s*\]/,
  'fresh configs must explicitly allow exactly the managed primary and fallback models',
);
assert.doesNotMatch(
  gatewayConfig,
  /"lastTouchedAt":|"timeoutSec":|"security":\s*"full"|"ask":\s*"off"|"ownerDisplay":|"eventQueue":|"retry":|"channelStaleEventThresholdMinutes":|"channelMaxRestartsPerHour":|"resetOnExit":/,
  'fresh configs must not reintroduce OpenClaw 2026.8 legacy runtime and Discord keys after doctor repair',
);
assert.doesNotMatch(
  gatewayConfig,
  /"keepLastAssistants":|"softTrimRatio":|"hardClearRatio":|"reserveTokens":|"reserveTokensFloor":|"maxHistoryShare":/,
  'fresh configs must not emit retired context-pruning and compaction tuning keys',
);
assert.match(
  gatewayConfig,
  /"memory":\s*\{\s*"search":\s*\{[\s\S]*"provider":\s*"openai-compatible"[\s\S]*"baseUrl":\s*"\{\{ \.Values\.litellm\.endpoint \}\}"[\s\S]*"id":\s*"LITELLM_API_KEY"[\s\S]*"model":\s*"gemini-embedding-001"/,
  'memory search must use the current top-level schema and the isolated LiteLLM embedding route',
);
assert.doesNotMatch(
  gatewayConfig,
  /"memorySearch":|"store":\s*\{\s*"vector"|"hybrid":/,
  'fresh configs must not emit retired memory-search paths or tuning keys',
);
assert.match(
  chart,
  /initialized\?\.memory\?\.search[\s\S]*config\.memory\.search = initialized\.memory\.search[\s\S]*delete config\.agents\.defaults\.memorySearch/,
  'persistent configs must converge from legacy agents.defaults.memorySearch to memory.search',
);
assert.doesNotMatch(
  gatewayConfig,
  /anthropic|claude-(?:sonnet|opus|haiku)/i,
  'fresh OpenClaw ConfigMaps must not contain Anthropic providers or Claude models',
);
for (const [label, source] of [
  ['chart values', values],
  ['Nova values', novaValues],
  ['Buster values', busterValues],
]) {
  assert.doesNotMatch(source, /\banthropic\b|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/i,
    `${label} must not configure or inject Anthropic credentials`);
}
assert.doesNotMatch(
  litellmConfig,
  /anthropic|claude-(?:sonnet|opus|haiku)/i,
  'LiteLLM ConfigMap source must not expose Anthropic models',
);
assert.doesNotMatch(
  litellmConfig,
  /model_name:\s*["']?(?:\*|gemini-(?:flash|pro))|model:\s*(?:vertex_ai\/)?gemini-(?:\d[^\s]*-)?(?:flash|pro)/i,
  'LiteLLM must expose only the explicit memory-search embedding route',
);
assert.match(litellmConfig, /model_name:\s*gemini-embedding-001[\s\S]*model:\s*vertex_ai\/gemini-embedding-001/,
  'LiteLLM must retain the embedding route used by OpenClaw memory search');
for (const [label, source] of [
  ['chart values', values],
  ['Nova values', novaValues],
  ['Buster values', busterValues],
  ['Prism values', prismAgentValues],
]) {
  assert.doesNotMatch(source, /gpt-5\.4|gpt-5\.5-pro|litellm\/gemini-(?:flash|pro)/i,
    `${label} must not retain retired reasoning model routes`);
}
assert.match(values, /primary:\s*"openai\/gpt-5\.6-sol"[\s\S]*fallbacks:[\s\S]*"openai\/gpt-5\.5"/,
  'chart defaults must use GPT-5.6 Sol with GPT-5.5 fallback');
assert.match(prismAgentValues, /primary:\s*openai\/gpt-5\.6-sol[\s\S]*fallbacks:\s*\[openai\/gpt-5\.5\]/,
  'Prism must use the same OpenAI model policy as every other agent');
assert.doesNotMatch(
  gatewayConfig,
  /"codex":\s*\{\}/,
  'ACP runtimes must not be registered as a second OpenClaw agent',
);
assert.doesNotMatch(
  gatewayConfig,
  /"list":\s*\[/,
  'new managed configs must not emit the retired agents.list roster',
);
assert.match(
  chart,
  /legacyEntries\.length > 0[\s\S]*canonicalEntries[\s\S]*delete config\.agents\.list[\s\S]*delete config\.agents\.ownership[\s\S]*delete managedMainEntry\.default[\s\S]*entries = managedEntries[\s\S]*defaults\.systemAgent = \{ agentId: 'main' \}[\s\S]*node \/app\/openclaw\.mjs doctor/,
  'legacy homes must converge to one unmarked main agent with explicit system ownership before doctor validation',
);
assert.match(
  chart,
  /delete managedMainEntry\.default[\s\S]*managedEntries[\s\S]*isBroadDefaultDiscordBinding[\s\S]*agentId: 'main', match: \{ channel: 'discord', accountId: 'default' \}[\s\S]*Bound discord:default to the main agent[\s\S]*doctor --fix --non-interactive/,
  'persistent homes must gain a sole unmarked agent and explicit Discord owner before doctor validation',
);
assert.match(
  chart,
  /managedPluginAllow = \['discord', 'acpx', 'codex', 'openai'\][\s\S]*config\.plugins\.allow = managedPluginAllow[\s\S]*doctor --fix --non-interactive/,
  'startup migration must enforce the managed plugin allowlist before doctor validation',
);
assert.doesNotMatch(chart, /removedAnthropic|isAnthropicModel/,
  'provider removal must not leave a one-off Anthropic migration in the deployment');
assert.match(
  chart,
  /config\.plugins\.entries = initialized\.plugins\.entries[\s\S]*config\.auth = initialized\.auth[\s\S]*config\.commands = initialized\.commands[\s\S]*config\.channels\.discord = initialized\.channels\.discord[\s\S]*delete config\.models[\s\S]*config\.acp = initialized\.acp[\s\S]*synchronized managed agent model route[\s\S]*synchronized managed agent model policy[\s\S]*config\.agents\.entries = structuredClone\(initialized\.agents\.entries\)/,
  'init setup must converge managed configuration generically instead of provider-specific cleanup',
);
assert.doesNotMatch(
  chart,
  /name:\s*(?:ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN)|\.Values\.anthropic|kubeclaw\.anthropicSecret/,
  'agent workloads must not receive Anthropic credentials',
);
assert.ok(
  chart.indexOf('name: openclaw-state-permissions') < chart.indexOf('name: openclaw-state-migration'),
  'legacy state ownership must be repaired before the non-root OpenClaw migration',
);
assert.match(
  chart,
  /if and \.Values\.gateway\.startupDoctor\.enabled \(not \.Values\.runAsRoot\)[\s\S]*name: openclaw-state-permissions[\s\S]*find \/home\/node\/\.openclaw -xdev -exec chown -h 1000:1000 \{\} \+[\s\S]*runAsNonRoot: false[\s\S]*add:[\s\S]*- CHOWN[\s\S]*- DAC_READ_SEARCH[\s\S]*name: config[\s\S]*mountPath: \/home\/node\/\.openclaw/,
  'non-root agents must repair only their persistent config ownership with bounded traversal and ownership capabilities',
);
assert.ok(
  chart.indexOf('name: openclaw-state-migration') < chart.indexOf('name: init-setup'),
  'state migration must run before init-setup invokes any OpenClaw CLI command',
);
assert.match(
  chart,
  /name: init-setup[\s\S]*if \.Values\.runAsRoot[\s\S]*runAsUser: 0[\s\S]*else[\s\S]*runAsUser: 1000[\s\S]*runAsNonRoot: true/,
  'init setup must honor the agent runtime identity instead of forcing root',
);
assert.match(
  chart,
  /name: init-setup[\s\S]*capabilities:[\s\S]*drop:[\s\S]*- ALL[\s\S]*if \.Values\.runAsRoot[\s\S]*add:[\s\S]*- CHOWN[\s\S]*- FOWNER/,
  'root-mode setup must retain only the capabilities required for its explicit ownership handoff',
);
assert.match(
  chart,
  /if \[ "\$INIT_RUN_AS_ROOT" = "true" \]; then[\s\S]*if \[ "\$\{AGENT_NAME\}" = "buster" \]; then[\s\S]*chown -R 1000:1000 \/workspace[\s\S]*chmod -R g\+rwX \/workspace[\s\S]*find \/workspace -type d -exec chmod g\+s \{\} \+/,
  'Buster setup must hand the shared workspace to UID/GID 1000 with group-write inheritance',
);
assert.equal(
  (chart.match(/chown -R (?:0:1000|1000:1000) \/workspace/gu) ?? []).length,
  1,
  'Buster workspace ownership must be reconciled once rather than traversed twice',
);
assert.match(
  chart,
  /Non-root init selected; persistent volumes already use fsGroup 1000[\s\S]*name: INIT_SSH_HOME[\s\S]*ternary "\/root\/\.ssh" "\/home\/node\/\.ssh" \.Values\.runAsRoot/,
  'non-root agents must use their writable home and avoid root-only ownership changes',
);
assert.match(
  chart,
  /\[ssh\.github\.com\]:443 ssh-ed25519[\s\S]*Host github\.com[\s\S]*HostName ssh\.github\.com[\s\S]*Port 443[\s\S]*IdentitiesOnly yes/,
  'GitHub SSH must use the HTTPS-compatible port because cluster egress blocks port 22',
);
assert.match(
  chart,
  /CURRENT_REPO_URL="\$\(git remote get-url origin\)"[\s\S]*git remote set-url origin "\$GIT_REPO_URL"[\s\S]*git remote add origin "\$GIT_REPO_URL"/,
  'persistent workspaces must reconcile origin to the configured repository',
);
assert.match(
  chart,
  /name: ssh-secret-vol[\s\S]*defaultMode: \{\{ ternary "0400" "0440" \.Values\.runAsRoot \}\}/,
  'non-root init must be able to read its fsGroup-restricted deploy key',
);
assert.match(
  chart,
  /state_db="\/home\/node\/\.openclaw\/state\/openclaw\.sqlite"[\s\S]*if \[ ! -f "\$state_db" \]; then[\s\S]*migration not required/,
  'fresh installations without an OpenClaw state database must skip migration safely',
);
assert.match(
  chart,
  /name:\s*XDG_CACHE_HOME\s*\n\s*value:\s*"\/tmp\/\.cache"/,
  'OpenClaw SQLite staging must use the writable tmp volume with a read-only root filesystem',
);
assert.equal(
  chart.match(/mountPath:\s*\/home\/node\/\.cache/g)?.length,
  3,
  'migration, setup, and gateway containers must mount a writable OpenClaw fallback cache',
);
assert.doesNotMatch(
  chart,
  /startup doctor waiting for gateway health|kubeclaw-startup-doctor\.sh/,
  'state migration must not wait for the gateway whose startup it unblocks',
);
assert.match(
  busterValues,
  /name:\s*buster-api-token[\s\S]*defaultMode:\s*288/,
  'the worker credential projection must remain group-readable only',
);
assert.match(
  busterValues,
  /name:\s*buster-v2-runtime[\s\S]*runAsUser:\s*0[\s\S]*runAsGroup:\s*0[\s\S]*runAsNonRoot:\s*false[\s\S]*add:\s*\["CHOWN",\s*"SETGID",\s*"SETPCAP",\s*"SETUID"\]/,
  'the supervisor must be able to enter the job UID and then drop the complete capability set',
);
assert.doesNotMatch(
  busterValues,
  /procMount:\s*Unmasked|SYS_ADMIN|privileged:\s*true|\/sys\/fs\/cgroup|buster-command-cgroup/,
  'the nested suite sandbox fix must not broaden the Buster pod privilege boundary',
);
assert.match(
  busterRuntimeEntrypoint,
  /allowSampledProcessLimit: true/,
  'the deployed command runner must use the unprivileged sampled process-tree fallback',
);
assert.match(
  busterRuntimeDockerfile,
  /USER\s+0:0/,
  'the runtime image must start the narrowly-capable job supervisor as root',
);
assert.match(
  busterRuntimeEntrypoint,
  /setpriv[\s\S]*--reuid=1000[\s\S]*--regid=1000[\s\S]*--init-groups[\s\S]*rootlesskit/,
  'the supervisor must launch rootless BuildKit under the non-root builder identity',
);
assert.match(
  busterRuntimeDockerfile,
  /chown root:builder \/home\/builder\/\.config \/home\/builder\/\.config\/buildkit[\s\S]*chmod 0750/,
  'the restricted supervisor must own the BuildKit configuration directory without DAC_OVERRIDE',
);
assert.match(
  busterRuntimeDockerfile,
  /BUILDKIT_HOST=unix:\/\/\/run\/user\/1000\/buildkit\/buildkitd\.sock/,
  'the Buster worker must receive the explicit rootless BuildKit endpoint required by readiness checks',
);
assert.match(
  busterRuntimeEntrypoint,
  /chown root:builder "\$config"[\s\S]*chmod 0640 "\$config"/,
  'the generated BuildKit configuration must remain writable by the supervisor and readable by the builder',
);
const configRootOwnership = busterRuntimeEntrypoint.indexOf('chown -R root:root "$runtime_config_root"');
const kubeconfigWrite = busterRuntimeEntrypoint.indexOf('cat >"$kubeconfig"');
const runtimeConfigWrite = busterRuntimeEntrypoint.indexOf("fs.writeFileSync(path.join(root, 'runtime.json')");
const configRootHandoff = busterRuntimeEntrypoint.indexOf('chown -R builder:builder "$runtime_config_root"');
assert.ok(
  configRootOwnership >= 0
    && configRootOwnership < kubeconfigWrite
    && kubeconfigWrite < runtimeConfigWrite
    && runtimeConfigWrite < configRootHandoff,
  'the capability-restricted supervisor must generate runtime configuration before handing the directory to builder',
);
assert.match(
  busterRuntimeEntrypoint,
  /setpriv[\s\S]*--reuid=1000[\s\S]*--regid=1000[\s\S]*--init-groups[\s\S]*chgrp 1002 "\$address"[\s\S]*setpriv[\s\S]*--reuid=1000[\s\S]*--regid=1000[\s\S]*--init-groups[\s\S]*chmod 0660 "\$address"/,
  'the BuildKit socket owner must grant shared runner access without requiring CAP_FOWNER',
);
assert.match(
  busterRuntimeEntrypoint,
  /chown -R builder:builder "\$plan_state_dir" "\$plan_run_dir"[\s\S]*chown -R root:builder "\$legacy_state_dir" "\$legacy_run_dir"/,
  'each Buster runtime must own the directories whose modes it initializes without CAP_FOWNER',
);
assert.match(
  busterRuntimeEntrypoint,
  /BUSTER_V2_TOKEN="\$worker_token" KUBECONFIG="\$kubeconfig" setpriv[\s\S]*--groups 1000,1002[\s\S]*remote-plan-cli\.ts[\s\S]*printf '%s' "\$worker_token" \| BUSTER_V2_PORT="\$\{BUSTER_LEGACY_PORT:-18892\}"[\s\S]*BUSTER_V2_STATE_DIR="\$legacy_state_dir"[\s\S]*setpriv[\s\S]*--groups 1000,1002[\s\S]*buster-suite-runtime\/src\/worker\.ts/,
  'the plan runtime and legacy worker must retain only their required token and BuildKit socket access',
);
assert.match(
  deploy,
  /app\.kubernetes\.io\/instance=\$\{release\},app\.kubernetes\.io\/component=\$\{role\}[\s\S]*pod="\$\(agent_pod_name "\$release"\)"[\s\S]*kubectl exec -n "\$NAMESPACE" "\$pod" -c kubeclaw/,
  'agent smoke must target the agent component pod rather than the colocated namespace controller',
);
assert.match(
  chart,
  /initializedConfigPath[\s\S]*config\.plugins\.entries = initialized\.plugins\.entries/,
  'existing persistent homes must converge to the complete chart-managed plugin configuration',
);
assert.match(
  gatewayConfig,
  /if eq \(\.Values\.agentRole \| default ""\) "buster"[\s\S]*"kubeclaw-agent-observer"[\s\S]*\{\{- end \}\}/,
  'fresh gateway configs must include the observer plugin only for Buster',
);
assert.match(
  gatewayConfig,
  /if eq \(\.Values\.agentRole \| default ""\) "prism"[\s\S]*"kubeclaw-prism"[\s\S]*\{\{- end \}\}/,
  'fresh gateway configs must include the Prism plugin only for agent-prism',
);
for (const toolProof of [
  /playwright install --with-deps chromium/,
  /k6 version/,
  /hadolint --version/,
  /kubeconform -v/,
  /kubectl version --client=true/,
  /ruff --version/,
  /mypy --version/,
  /semgrep --version/,
  /shellcheck/,
]) {
  assert.match(
    generalDockerfile,
    toolProof,
    `the authoritative Nova runtime lost deterministic suite tooling: ${toolProof}`,
  );
}
assert.doesNotMatch(
  chart,
  /skills\/(?:nova|buster|common)\/pipeline(?:\/|["'])/,
  'the chart must not materialize v1 runtime directories',
);

const helm = spawnSync(
  'helm',
  ['template', 'kubeclaw', path.join(sourceRoot, 'charts/kubeclaw')],
  { cwd: sourceRoot, encoding: 'utf8' },
);
if (helm.error?.code !== 'ENOENT') {
  assert.equal(helm.status, 0, `helm template failed:\n${helm.stderr}`);
  assert.match(helm.stdout, /kind: Deployment/, 'chart must render a Deployment');
  assert.doesNotMatch(
    helm.stdout,
    /name:\s*buster-pipeline|kubeclaw-buster-pipeline/,
    'rendered manifests must not contain the deleted worker',
  );
  assert.doesNotMatch(
    helm.stdout,
    /name:\s*execution-buildkit|name:\s*buster-v2-runtime/,
    'the generic default must not invent an execution provider',
  );

  const busterHelm = spawnSync(
    'helm',
    [
      'template',
      'agent-buster',
      path.join(sourceRoot, 'charts/kubeclaw'),
      '--namespace',
      'kubeclaw',
      '--values',
      path.join(sourceRoot, 'my-values/buster-values.yaml'),
    ],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(
    busterHelm.status,
    0,
    `Buster runtime helm template failed:\n${busterHelm.stderr}`,
  );
  assert.match(
    busterHelm.stdout,
    /name:\s*buster-v2-runtime/,
    'Buster must render its isolated v2 suite worker',
  );
  assert.match(
    busterHelm.stdout,
    /containerPort:\s*18891/,
    'Buster Envoy must expose the authenticated v2 worker port',
  );
  assert.match(busterHelm.stdout, /name:\s*worker-trust-proxy/,
    'Buster must obtain its rotating X.509-SVID through the SPIFFE CSI socket');
  assert.match(busterHelm.stdout, /csi\.spiffe\.io/);
  assert.match(busterHelm.stdout, /spire-agent\.sock/);
  assert.match(busterHelm.stdout,
    /port_value:\s*18891[\s\S]*require_client_certificate:\s*true[\s\S]*agent-nova/,
    'Buster must require Nova mTLS identity on the plan listener');
  assert.match(
    busterHelm.stdout,
    /fsGroup:\s*1000/,
    'the non-root Buster worker must receive projected credentials through fsGroup 1000',
  );
  assert.match(
    busterHelm.stdout,
    /name:\s*buster-api-token[\s\S]*defaultMode:\s*288/,
    'the rendered Buster token projection must remain mode 0440',
  );
  assert.doesNotMatch(busterHelm.stdout, /name:\s*execution-buildkit/);

  const novaHelm = spawnSync(
    'helm',
    [
      'template',
      'agent-nova',
      path.join(sourceRoot, 'charts/kubeclaw'),
      '--namespace',
      'kubeclaw',
      '--values',
      path.join(sourceRoot, 'my-values/nova-values.yaml'),
    ],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(
    novaHelm.status,
    0,
    `Nova provider-role helm template failed:\n${novaHelm.stderr}`,
  );
  assert.match(
    novaHelm.stdout,
    /name:\s*KUBECLAW_CAPABILITY_PROVIDERS[\s\S]*agent-buster:18789[\s\S]*127\.0\.0\.1:28891[\s\S]*127\.0\.0\.1:28892/,
  );
  assert.match(novaHelm.stdout,
    /port_value:\s*28891[\s\S]*agent-buster[\s\S]*port_value:\s*18891[\s\S]*agent-buster/,
    'Nova must reach Buster through its local SPIFFE mTLS proxy');
  assert.match(novaHelm.stdout,
    /port_value:\s*28080[\s\S]*agent-prism[\s\S]*port_value:\s*8080[\s\S]*agent-prism/,
    'Nova must reach the Prism OpenClaw agent through its local SPIFFE mTLS proxy');
  assert.doesNotMatch(novaHelm.stdout, /name:\s*BUSTER_V2_ENDPOINT|name:\s*BUSTER_GATEWAY_ORIGIN/);

  const numericRole = spawnSync(
    'helm',
    [
      'template',
      'numeric-provider',
      path.join(sourceRoot, 'charts/kubeclaw'),
      '--set-string', 'capabilityProviders.numeric.agentRole=1buster',
      '--set-string', 'capabilityProviders.numeric.capabilities.runtime\\.dispatch.adapter=custom-python',
      '--set-string', 'capabilityProviders.numeric.capabilities.runtime\\.dispatch.port=18789',
    ],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(numericRole.status, 0, numericRole.stderr);
  assert.match(numericRole.stdout, /http:\/\/agent-1buster:18789/);

  for (const [label, overrides, expected] of [
    [
      'invalid provider role',
      [
        '--set-string', 'capabilityProviders.buster.agentRole=INVALID_ROLE',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.adapter=openclaw',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.port=18789',
      ],
      /agentRole must be a DNS label/,
    ],
    [
      'invalid provider port',
      [
        '--set-string', 'capabilityProviders.buster.agentRole=buster',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.adapter=openclaw',
        '--set-string', 'capabilityProviders.buster.capabilities.runtime\\.dispatch.port=70000',
      ],
      /port must be between 1 and 65535/,
    ],
  ]) {
    const invalid = spawnSync(
      'helm',
      ['template', 'invalid-provider', path.join(sourceRoot, 'charts/kubeclaw'), ...overrides],
      { cwd: sourceRoot, encoding: 'utf8' },
    );
    assert.notEqual(invalid.status, 0, `${label} must fail Helm rendering`);
    assert.match(`${invalid.stdout}\n${invalid.stderr}`, expected);
  }
}

const kubeconform = spawnSync('sh', ['-c', 'command -v kubeconform'], {
  cwd: sourceRoot,
  encoding: 'utf8',
});
if (helm.status === 0 && kubeconform.status === 0) {
  const renderedPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-manifests-')),
    'rendered.yaml',
  );
  fs.writeFileSync(renderedPath, helm.stdout);
  const validation = spawnSync(
    'kubeconform',
    ['-strict', '-summary', renderedPath],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  assert.equal(
    validation.status,
    0,
    `kubeconform failed:\n${validation.stdout}\n${validation.stderr}`,
  );
}

const secretProbe = spawnSync(
  'bash',
  [
    '-c',
    `source "$SOURCE_ROOT/my-values/setup-secrets.sh"
kubectl() {
  if [[ "$*" == *"with index"* && "$*" == *"present"* ]]; then
    printf 'c2VjcmV0'
  elif [[ "$*" == *"with index"* && "$*" == *"busterV2Token"* ]]; then
    printf ''
  else
    printf '<no value>'
  fi
}
if secret_key_present test shared busterV2Token; then
  echo 'missing busterV2Token was reported present' >&2
  exit 1
fi
mapfile -t missing < <(secret_missing_keys test shared present busterV2Token)
[[ \${#missing[@]} == 1 && \${missing[0]} == busterV2Token ]]
load_secret_key test shared present decoded
[[ $decoded == secret ]]

prompt_hidden() {
  local -n output_ref="$2"
  output_ref="\${PROMPT_TEST_VALUE:-}"
}
generate_secret_value() {
  printf 'generated-worker-token'
}
generated=""
PROMPT_TEST_VALUE="" prompt_secret_or_generate "Buster v2 worker token" generated
[[ $generated == generated-worker-token ]]
provided=""
PROMPT_TEST_VALUE="operator-value" prompt_secret_required "Required value" provided
[[ $provided == operator-value ]]
patched=""
patch_secret_literal() {
  [[ $1 == test && $2 == shared && $3 == busterV2Token ]]
  patched="$4"
}
NAMESPACE=test
SECRET_NAME=shared
PROMPT_TEST_VALUE="" patch_shared_secret_interactive busterV2Token
[[ $patched == generated-worker-token ]]`,
  ],
  {
    cwd: sourceRoot,
    encoding: 'utf8',
    env: { ...process.env, SOURCE_ROOT: sourceRoot },
  },
);
assert.equal(
  secretProbe.status,
  0,
  `Secret key reconciliation probe failed:\n${secretProbe.stdout}\n${secretProbe.stderr}`,
);

console.log(
  JSON.stringify({
    ok: true,
    phase: 12,
    v2Deployment: true,
    legacyWorkerAbsent: true,
    deterministicSuiteRuntime: true,
  }),
);
