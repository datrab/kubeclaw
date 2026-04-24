#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execFileSync } from 'child_process';
import { parseArgs, resolveRoots } from '../lib/lifecycle-audit-lib.mjs';

const args = parseArgs();
const { sourceRoot } = resolveRoots(args);

const chartDir = path.join(sourceRoot, 'charts', 'kubeclaw');
const valuesPath = path.join(sourceRoot, 'my-values', 'nova-values.yaml');
const deploymentTemplatePath = path.join(chartDir, 'templates', 'deployment.yaml');
const serviceTemplatePath = path.join(chartDir, 'templates', 'service.yaml');
const swarmConfigTemplatePath = path.join(chartDir, 'templates', 'configmap-swarm-config.yaml');
const swarmConfigSourcePath = path.join(chartDir, 'files', 'config', 'swarm.config.json');
const semgrepConfigSourcePath = path.join(chartDir, 'files', 'config', '.semgrep.yml');
const deployScriptPath = path.join(sourceRoot, 'scripts', 'deploy.sh');
const imageBuildWorkflowPath = path.join(sourceRoot, '.github', 'workflows', 'build-images.yaml');

if (!fs.existsSync(chartDir)) throw new Error(`Chart directory not found: ${chartDir}`);
if (!fs.existsSync(valuesPath)) throw new Error(`Values file not found: ${valuesPath}`);

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

const rendered = execFileSync('helm', ['template', 'agent-nova', chartDir, '-f', valuesPath], {
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

const deploymentTemplate = fs.readFileSync(deploymentTemplatePath, 'utf8');
const serviceTemplate = fs.readFileSync(serviceTemplatePath, 'utf8');
const swarmConfigTemplate = fs.readFileSync(swarmConfigTemplatePath, 'utf8');
const swarmConfigSource = fs.readFileSync(swarmConfigSourcePath, 'utf8');
const semgrepConfigSource = fs.readFileSync(semgrepConfigSourcePath, 'utf8');
const deployScript = fs.readFileSync(deployScriptPath, 'utf8');
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
assertIncludes(rendered, 'mountPath: /app/skills', 'Rendered pod must mount the merged skills directory into /app/skills');
assertIncludes(rendered, 'value: "/home/node/.openclaw/swarm.config.json"', 'Rendered deployment must pin SWARM_CONFIG to the writable runtime config path');
assertIncludes(rendered, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Rendered init container must copy swarm.config.json into the writable config surface');
assertIncludes(rendered, 'cp -Lf "/init-swarm-config/.semgrep.yml" "/config/.semgrep.yml"', 'Rendered init container must copy .semgrep.yml into the writable config surface');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw', 'Rendered deployment must mount the writable platform config surface at /home/node/.openclaw');
assertIncludes(deploymentTemplate, 'cp -r /app/skills/. /skills-merged/', 'Deployment template must retain the packaged-skill merge step');
assertIncludes(deploymentTemplate, 'cp -r /init-skills/. /skills-merged/', 'Deployment template must retain the custom-skill overlay step');
assertIncludes(deploymentTemplate, 'value: "/home/node/.openclaw/swarm.config.json"', 'Deployment template must pin SWARM_CONFIG to the writable runtime target');
assertIncludes(deploymentTemplate, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Deployment template must copy swarm.config.json into the writable config surface');
assertIncludes(deploymentTemplate, 'cp -Lf "/init-swarm-config/.semgrep.yml" "/config/.semgrep.yml"', 'Deployment template must copy .semgrep.yml into the writable config surface');
assertIncludes(serviceTemplate, '.Values.service.extraPorts', 'Service template must continue rendering configured extra service ports');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/swarm.config.json"', 'Swarm config template must source swarm.config.json from the chart artifact by default');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/.semgrep.yml"', 'Swarm config template must source .semgrep.yml from the chart artifact by default');
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
  valuesPath,
  checks: [
    'Helm render includes Nova Service and Deployment',
    'Rendered Service preserves gateway and preview NodePorts',
    'Rendered Deployment preserves packaged-skills merge before custom overlay',
    'Rendered pod mounts merged skills at /app/skills',
    'Rendered Deployment pins SWARM_CONFIG to /home/node/.openclaw/swarm.config.json',
    'Rendered init flow copies swarm.config.json and .semgrep.yml into the writable runtime config surface',
    'Rendered swarm-config ConfigMap matches the chart-provided swarm.config.json and .semgrep.yml artifacts',
    'Templates still pin SWARM_CONFIG and default swarm config artifacts in source',
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
    'Rendered Helm manifest passes kubeconform strict validation',
  ],
  kubeconform: {
    summary: kubeconformSummary,
  },
};

console.log(JSON.stringify(result, null, 2));
