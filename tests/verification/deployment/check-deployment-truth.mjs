#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'deployment/check-deployment-truth' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execFileSync } from 'child_process';
import { parseArgs, resolveRoots } from '../lib/lifecycle-audit-lib.mjs';

const args = parseArgs();
const { sourceRoot } = resolveRoots(args);

const chartDir = path.join(sourceRoot, 'charts', 'kubeclaw');
const novaValuesPath = path.join(sourceRoot, 'my-values', 'nova-values.yaml');
const busterValuesPath = path.join(sourceRoot, 'my-values', 'buster-values.yaml');
const deploymentTemplatePath = path.join(chartDir, 'templates', 'deployment.yaml');
const serviceTemplatePath = path.join(chartDir, 'templates', 'service.yaml');
const swarmConfigTemplatePath = path.join(chartDir, 'templates', 'configmap-swarm-config.yaml');
const customSkillsConfigMapTemplatePath = path.join(chartDir, 'templates', 'configmap-skills.yaml');
const swarmConfigSourcePath = path.join(chartDir, 'files', 'config', 'swarm.config.json');
const semgrepConfigSourcePath = path.join(chartDir, 'files', 'config', '.semgrep.yml');
const deployScriptPath = path.join(sourceRoot, 'scripts', 'deploy.sh');
const setupScriptPath = path.join(sourceRoot, 'scripts', 'setup.sh');
const setupSecretsScriptPath = path.join(sourceRoot, 'my-values', 'setup-secrets.sh');
const imageBuildWorkflowPath = path.join(sourceRoot, '.github', 'workflows', 'build-images.yaml');

if (!fs.existsSync(chartDir)) throw new Error(`Chart directory not found: ${chartDir}`);
if (!fs.existsSync(novaValuesPath)) throw new Error(`Values file not found: ${novaValuesPath}`);
if (!fs.existsSync(busterValuesPath)) throw new Error(`Values file not found: ${busterValuesPath}`);

function assertIncludes(text, needle, message) {
  assert(text.includes(needle), `${message} (missing: ${needle})`);
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

function normalizeLiteralPayload(text) {
  return normalizeNewlines(text).replace(/\n+$/, '\n');
}

function findRenderedDocument(manifest, { kind, name }) {
  const document = normalizeNewlines(manifest)
    .split(/^---\s*$/m)
    .find((entry) => entry.includes(`kind: ${kind}`) && entry.includes(`name: ${name}`));

  assert(document, `Rendered manifest must include ${kind} ${name}`);
  return document;
}

function extractLiteralDataBlock(document, key) {
  const lines = normalizeNewlines(document).split('\n');
  const blockHeader = `  ${key}: |`;
  const startIndex = lines.indexOf(blockHeader);

  assert(startIndex !== -1, `Rendered document must expose ${key} as a literal data block`);

  const content = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('    ')) {
      content.push(line.slice(4));
      continue;
    }
    if (/^\s*$/.test(line)) {
      content.push('');
      continue;
    }
    break;
  }

  return content.join('\n');
}

const rendered = execFileSync('helm', ['template', 'agent-nova', chartDir, '-f', novaValuesPath], {
  cwd: sourceRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const renderedBuster = execFileSync('helm', ['template', 'agent-buster', chartDir, '-f', busterValuesPath], {
  cwd: sourceRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const kubeconformSummary = execFileSync('kubeconform', ['-strict', '-summary', '-ignore-missing-schemas'], {
  cwd: sourceRoot,
  input: rendered,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
}).trim();

const busterKubeconformSummary = execFileSync('kubeconform', ['-strict', '-summary', '-ignore-missing-schemas'], {
  cwd: sourceRoot,
  input: renderedBuster,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
}).trim();

const deploymentTemplate = fs.readFileSync(deploymentTemplatePath, 'utf8');
const serviceTemplate = fs.readFileSync(serviceTemplatePath, 'utf8');
const swarmConfigTemplate = fs.readFileSync(swarmConfigTemplatePath, 'utf8');
const customSkillsConfigMapTemplate = fs.readFileSync(customSkillsConfigMapTemplatePath, 'utf8');
const swarmConfigSource = fs.readFileSync(swarmConfigSourcePath, 'utf8');
const semgrepConfigSource = fs.readFileSync(semgrepConfigSourcePath, 'utf8');
const deployScript = fs.readFileSync(deployScriptPath, 'utf8');
const setupScript = fs.readFileSync(setupScriptPath, 'utf8');
const setupSecretsScript = fs.readFileSync(setupSecretsScriptPath, 'utf8');
const imageBuildWorkflow = fs.readFileSync(imageBuildWorkflowPath, 'utf8');
const deployScriptMode = fs.statSync(deployScriptPath).mode;
const renderedSwarmConfigMap = findRenderedDocument(rendered, {
  kind: 'ConfigMap',
  name: 'agent-nova-swarm-config',
});
const renderedSwarmConfig = extractLiteralDataBlock(renderedSwarmConfigMap, 'swarm.config.json');
const renderedSemgrepConfig = extractLiteralDataBlock(renderedSwarmConfigMap, '.semgrep.yml');

assertIncludes(rendered, 'kind: Service', 'Helm render must include a Service');
assertIncludes(rendered, 'name: agent-nova', 'Helm render must target the Nova release');
assertIncludes(rendered, 'nodePort: 30073', 'Rendered Service must preserve the Nova gateway NodePort');
assertIncludes(rendered, 'nodePort: 30456', 'Rendered Service must preserve the preview extra NodePort');
assertIncludes(rendered, 'kind: Deployment', 'Helm render must include a Deployment');
assertIncludes(rendered, 'cp -r /app/skills/. /skills-merged/', 'Rendered init container must merge packaged skills into the runtime overlay');
assertIncludes(rendered, 'cp -r /init-skills/. /skills-merged/', 'Rendered init container must overlay custom skills after packaged skills');
assertIncludes(rendered, 'customSkills may not override protected runtime skill path', 'Rendered init container must block custom skill overlays from replacing core runtime paths');
assertIncludes(rendered, 'pipeline|pipeline/*|pipeline.ts|common|common/*|nova/pipeline|nova/pipeline/*|buster/pipeline|buster/pipeline/*|redis.ts|buster-pipeline.ts|verify-task.ts', 'Rendered init container must keep the protected runtime skill denylist');
assertIncludes(rendered, 'mountPath: /app/skills', 'Rendered pod must mount the merged skills directory into /app/skills');
assertIncludes(rendered, 'value: "/home/node/.openclaw/swarm.config.json"', 'Rendered deployment must pin SWARM_CONFIG to the runtime config path');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw', 'Rendered deployment must mount the runtime config surface at /home/node/.openclaw');
assert.equal(rendered.includes('mountPath: /app/config'), false, 'Rendered deployment must not mount the stale /app/config runtime config path');
assertIncludes(rendered, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Rendered init container must copy swarm.config.json into the writable config surface');
assertIncludes(rendered, 'cp -Lf "/init-swarm-config/.semgrep.yml" "/config/.semgrep.yml"', 'Rendered init container must copy .semgrep.yml into the writable config surface');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw', 'Rendered deployment must mount the writable platform config surface at /home/node/.openclaw');
assertIncludes(renderedBuster, 'kind: Service', 'Buster Helm render must include a Service');
assertIncludes(renderedBuster, 'name: agent-buster', 'Buster Helm render must target the Buster release');
assertIncludes(renderedBuster, 'nodePort: 30074', 'Rendered Buster Service must preserve the Buster gateway NodePort');
assertIncludes(renderedBuster, 'kind: Deployment', 'Buster Helm render must include a Deployment');
assertIncludes(renderedBuster, 'image: "ghcr.io/forgestackai/kubeclaw-sandbox:latest"', 'Buster deployment must render the sandbox runtime image');
assertIncludes(renderedBuster, 'node /app/skills/buster-pipeline.ts &', 'Buster deployment must start the Buster pipeline process in the gateway container');
assertIncludes(renderedBuster, 'node /app/openclaw.mjs gateway --bind lan --port 18789 &', 'Buster deployment must start the OpenClaw gateway process alongside Buster pipeline');
assertIncludes(renderedBuster, 'shareProcessNamespace: false', 'Buster sandbox deployment must not share the pod process namespace');
assertIncludes(renderedBuster, 'privileged: true', 'Buster sandbox deployment must retain privileged Podman-in-Pod execution');
assertIncludes(renderedBuster, 'mountPath: /var/lib/containers', 'Buster sandbox deployment must mount Podman container storage');
assertIncludes(renderedBuster, 'mountPath: /sandbox', 'Buster sandbox deployment must mount the sandbox workspace');
assertIncludes(renderedBuster, 'name: agent-buster-podman-registries', 'Buster render must include Podman registry configuration');
assertIncludes(renderedBuster, 'registry-local.kubeclaw.svc.cluster.local:5001', 'Buster Podman registries must preserve registry-local for live verification images');
assertIncludes(renderedBuster, 'name: openclaw-shared-secrets, key: gatewayToken-buster', 'Buster gateway must use the Buster gateway token secret key');
assertIncludes(renderedBuster, 'name: redis-secrets', 'Buster deployment must keep Redis secret wiring');
assertIncludes(renderedBuster, 'key: redis-password', 'Buster deployment must keep Redis password secret key wiring');
assertIncludes(renderedBuster, 'name: CLAUDE_CODE_OAUTH_TOKEN', 'Buster deployment must expose the Anthropic/Claude credential env surface used by current runtime scripts');
assertIncludes(renderedBuster, 'name: ANTHROPIC_API_KEY', 'Buster deployment must expose the Anthropic API credential env surface used by current runtime scripts');
assert.equal(
  renderedBuster.includes('\n        - name: stream-processor'),
  false,
  'Buster deployment must keep the legacy stream-processor sidecar disabled while buster-pipeline.ts owns Redis tasks',
);
assertIncludes(deploymentTemplate, 'cp -r /app/skills/. /skills-merged/', 'Deployment template must retain the packaged-skill merge step');
assertIncludes(deploymentTemplate, 'cp -r /init-skills/. /skills-merged/', 'Deployment template must retain the custom-skill overlay step');
assertIncludes(deploymentTemplate, 'protected_skill_overlay() {', 'Deployment template must guard protected runtime paths before custom-skill overlay');
assertIncludes(deploymentTemplate, 'customSkills may not override protected runtime skill path', 'Deployment template must fail closed when custom skills target core runtime paths');
assertIncludes(deploymentTemplate, 'value: "/home/node/.openclaw/swarm.config.json"', 'Deployment template must pin SWARM_CONFIG to the runtime config target');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw', 'Deployment template must mount the runtime config target');
assert.equal(deploymentTemplate.includes('mountPath: /app/config'), false, 'Deployment template must not mount the stale /app/config runtime config path');
assertIncludes(deploymentTemplate, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Deployment template must copy swarm.config.json into the writable config surface');
assertIncludes(deploymentTemplate, 'cp -Lf "/init-swarm-config/.semgrep.yml" "/config/.semgrep.yml"', 'Deployment template must copy .semgrep.yml into the writable config surface');
assertIncludes(serviceTemplate, '.Values.service.extraPorts', 'Service template must continue rendering configured extra service ports');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/swarm.config.json"', 'Swarm config template must source swarm.config.json from the chart artifact by default');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/.semgrep.yml"', 'Swarm config template must source .semgrep.yml from the chart artifact by default');
assertIncludes(customSkillsConfigMapTemplate, 'Docker image at /app/skills', 'Custom skills ConfigMap comment must match the runtime skills mount path');
assertIncludes(customSkillsConfigMapTemplate, 'extension-only', 'Custom skills ConfigMap comment must define customSkills as extension-only');
assertIncludes(customSkillsConfigMapTemplate, 'cannot be used as a compatibility patch path', 'Custom skills ConfigMap comment must forbid core runtime compatibility patching');
assert.equal(customSkillsConfigMapTemplate.includes('/app/skills-kubeclaw'), false, 'Custom skills ConfigMap comment must not point at the stale skills path');
assertIncludes(imageBuildWorkflow, 'docker/Dockerfile.general', 'Image-build workflow must build the general runtime image from docker/Dockerfile.general');
assertIncludes(imageBuildWorkflow, 'docker/build-push-action@v5', 'Image-build workflow must use docker/build-push-action for the general runtime image');
assertIncludes(imageBuildWorkflow, 'image_suffix: kubeclaw-general', 'Image-build workflow must publish the kubeclaw-general image');
assert.equal((deployScriptMode & 0o111) !== 0, true, 'Deploy script must remain executable as the canonical operator deployment surface');
assertIncludes(deployScript, 'cmd_build_local_images() {', 'Deploy script must expose a canonical local image-build command for deployment verification');
assertIncludes(deployScript, 'cmd_verify_live() {', 'Deploy script must expose a canonical live deployment verification command');
assertIncludes(deployScript, 'docker build -f "$REPO_DIR/$dockerfile" -t "$push_repo:$tag" "$REPO_DIR"', 'Deploy verification must use a canonical docker build helper rooted at the repo');
assertIncludes(deployScript, 'build_local_image "general" "docker/Dockerfile.general" "$push_registry/kubeclaw-general" "$tag"', 'Deploy verification must build the general image from docker/Dockerfile.general');
assertIncludes(deployScript, 'build_local_image "sandbox" "docker/Dockerfile.sandbox" "$push_registry/kubeclaw-sandbox" "$tag"', 'Deploy verification must build the sandbox image from docker/Dockerfile.sandbox');
assertIncludes(deployScript, 'LOCAL_REGISTRY_PUSH:-127.0.0.1:30051', 'Deploy verification must pin the host-visible push path for registry-local');
assertIncludes(deployScript, 'LOCAL_REGISTRY_PULL:-registry-local.kubeclaw.svc.cluster.local:5001', 'Deploy verification must pin the cluster-visible pull path for registry-local');
assertIncludes(deployScript, 'cmd_build_local_images "$tag"', 'Live deployment verification must invoke the local image-build step before redeploying');
assertIncludes(deployScript, 'GENERAL_IMAGE_REPOSITORY="$pull_registry/kubeclaw-general"', 'Live deployment verification must redeploy Nova against the registry-local general image');
assertIncludes(deployScript, 'SANDBOX_IMAGE_REPOSITORY="$pull_registry/kubeclaw-sandbox"', 'Live deployment verification must redeploy Buster against the registry-local sandbox image');
assertIncludes(deployScript, 'DISABLE_IMAGE_PULL_SECRETS=1', 'Live deployment verification must drop GHCR pull secrets when redeploying against registry-local');
assertIncludes(deployScript, 'cmd_smoke_agent() {', 'Deploy script must expose a canonical single-agent smoke command');
assertIncludes(deployScript, 'cmd_smoke() {', 'Deploy script must expose a canonical multi-agent smoke command');
assertIncludes(deployScript, 'cmd_agents', 'Live deployment verification must redeploy the agents before smoke runs');
assertIncludes(deployScript, 'kubectl rollout status deployment/$release -n "$NAMESPACE" --timeout=180s', 'Deploy smoke must wait for deployment rollout before declaring success');
assertIncludes(deployScript, 'kubectl wait --for=condition=Ready pod -l "app.kubernetes.io/instance=$release" -n "$NAMESPACE" --timeout=180s', 'Deploy smoke must wait for a ready pod on the deployed release');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- openclaw gateway status', 'Deploy smoke must verify the in-pod OpenClaw gateway status');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -d /app/skills', 'Deploy smoke must verify packaged skills are present in the running pod');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -f /config/swarm.config.json', 'Deploy smoke must verify writable swarm config is present in the running pod');
assertIncludes(deployScript, 'remove_destructive_infra() {', 'Deploy script must keep destructive infra teardown under a shared helper');
assertIncludes(deployScript, 'run_destructive_teardown() {', 'Deploy script must centralize destructive teardown logic behind a shared helper');
assertIncludes(deployScript, 'run_destructive_teardown 0', 'Teardown must route through the shared destructive helper while preserving the namespace');
assertIncludes(deployScript, 'run_destructive_teardown 1', 'Teardown-all must route through the shared destructive helper before deleting the namespace');
assertIncludes(deployScript, 'add_helm_repo_once() {', 'Deploy script must classify Helm repo add failures instead of swallowing them');
assertIncludes(deployScript, 'wait_for_rollout_or_warn() {', 'Deploy script must classify optional rollout waits with visible warnings');
assertIncludes(deployScript, 'delete_manifested_resource_if_present() {', 'Deploy script must route manifested resource deletion through a classified helper');
assertIncludes(deployScript, 'delete_namespaced_resource_if_present() {', 'Deploy script must route optional namespaced deletion through a not-found-aware helper');
assertIncludes(deployScript, 'print_remaining_secrets() {', 'Deploy script must classify remaining-secret listing failures');
assert.equal(deployScript.includes('|| true'), false, 'Deploy script must not silently swallow failures with || true');
assert.equal(deployScript.includes('&>/dev/null'), false, 'Deploy script must not hide both stdout/stderr for control-flow checks');
assertIncludes(setupSecretsScript, 'require_command kubectl', 'setup-secrets must check required kubectl command before mutating secrets');
assertIncludes(setupSecretsScript, 'err_file="$(mktemp)"', 'setup-secrets must capture SOPS stderr without suppressing it silently');
assertIncludes(setupSecretsScript, 'Optional source secret not found', 'setup-secrets must classify missing optional source secrets');
assertIncludes(setupSecretsScript, 'skipping DATABASE_URL namespace rewrite', 'setup-secrets must classify missing litellm secret rewrite as an explicit skip');
assert.equal(setupSecretsScript.includes('&>/dev/null'), false, 'setup-secrets must not hide both stdout/stderr for control-flow checks');
assert.equal(setupSecretsScript.includes('|| true'), false, 'setup-secrets must not silently swallow failures with || true');
assertIncludes(setupScript, 'KUBECLAW_ALLOW_LEGACY_REPO_SETUP', 'legacy repo setup must require an explicit operator opt-in');
assertIncludes(setupScript, 'legacy one-time bootstrap that runs broad git add/commit/push', 'legacy repo setup must explain its broad git side effects');
assertIncludes(setupScript, 'git remote get-url origin', 'legacy repo setup must inspect origin before removing it');
assert.equal(setupScript.includes('|| true'), false, 'legacy repo setup must not silently swallow failures with || true');
assert.equal(setupScript.includes('&>/dev/null'), false, 'legacy repo setup must not hide both stdout/stderr for control-flow checks');
assert.equal(
  normalizeLiteralPayload(renderedSwarmConfig),
  normalizeLiteralPayload(swarmConfigSource),
  'Rendered swarm.config.json must exactly match the chart-provided source artifact',
);
assert.equal(
  normalizeLiteralPayload(renderedSemgrepConfig),
  normalizeLiteralPayload(semgrepConfigSource),
  'Rendered .semgrep.yml must exactly match the chart-provided source artifact',
);

const result = {
  sourceRoot,
  chartDir,
  valuesPath: novaValuesPath,
  busterValuesPath,
  checks: [
    'Helm render includes Nova Service and Deployment',
    'Rendered Service preserves gateway and preview NodePorts',
    'Helm render includes Buster Service and Deployment',
    'Rendered Buster Service preserves gateway NodePort',
    'Rendered Buster Deployment preserves sandbox image and privileged Podman-in-Pod surface',
    'Rendered Buster Deployment starts buster-pipeline.ts and OpenClaw gateway in the same container',
    'Rendered Buster Deployment keeps Redis, gateway-token, and Anthropic secret wiring',
    'Rendered Buster Podman registries preserve registry-local live-verification pull path',
    'Rendered Buster Deployment keeps the legacy stream-processor sidecar disabled',
    'Rendered Deployment preserves packaged-skills merge before custom overlay',
    'Rendered Deployment blocks customSkills from overriding core runtime paths',
    'Rendered pod mounts merged skills at /app/skills',
    'Rendered Deployment pins SWARM_CONFIG to /home/node/.openclaw/swarm.config.json',
    'Rendered init flow copies swarm.config.json and .semgrep.yml into the writable runtime config surface',
    'Rendered swarm-config ConfigMap matches the chart-provided swarm.config.json and .semgrep.yml artifacts',
    'Templates still pin SWARM_CONFIG and default swarm config artifacts in source',
    'Custom skills ConfigMap comments match the /app/skills runtime path and mark customSkills extension-only',
    'Templates still expose extra service ports and merge logic in source',
    'Build-images workflow still builds and publishes the general runtime image from docker/Dockerfile.general',
    'Deploy script remains executable as the canonical operator deployment surface',
    'Deploy script exposes a canonical local image-build command for deployment verification',
    'Deploy script exposes a canonical live deployment verification command',
    'Live deployment verification builds both runtime images and pushes them to registry-local',
    'Live deployment verification redeploys Nova and Buster against registry-local before smoke runs',
    'Deploy script exposes canonical pod-level smoke commands for the deployed agents',
    'Deploy smoke waits for rollout and pod readiness before checking the live pod surface',
    'Deploy smoke verifies in-pod gateway status, packaged skills, and writable swarm config',
    'Deploy teardown and destroy commands share one destructive implementation surface',
    'Deploy script classifies optional setup/status/teardown failures instead of using broad silent fallbacks',
    'Setup scripts classify optional failures and fence legacy broad git setup behind explicit opt-in',
    'Rendered Helm manifest passes kubeconform strict validation',
  ],
  kubeconform: {
    summary: kubeconformSummary,
    busterSummary: busterKubeconformSummary,
  },
};

quietConsole.restore();
console.log(JSON.stringify(result, null, 2));
