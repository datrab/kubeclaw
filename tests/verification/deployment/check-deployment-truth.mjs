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
const chartValuesPath = path.join(chartDir, 'values.yaml');
const novaValuesPath = path.join(sourceRoot, 'my-values', 'nova-values.yaml');
const busterValuesPath = path.join(sourceRoot, 'my-values', 'buster-values.yaml');
const deploymentTemplatePath = path.join(chartDir, 'templates', 'deployment.yaml');
const serviceTemplatePath = path.join(chartDir, 'templates', 'service.yaml');
const gatewayConfigTemplatePath = path.join(chartDir, 'templates', 'configmap-gateway.yaml');
const processorConfigTemplatePath = path.join(chartDir, 'templates', 'configmap-processor.yaml');
const swarmConfigTemplatePath = path.join(chartDir, 'templates', 'configmap-swarm-config.yaml');
const customSkillsConfigMapTemplatePath = path.join(chartDir, 'templates', 'configmap-skills.yaml');
const swarmConfigSourcePath = path.join(chartDir, 'files', 'config', 'swarm.config.json');
const semgrepConfigSourcePath = path.join(chartDir, 'files', 'config', '.semgrep.yml');
const yamllintConfigSourcePath = path.join(chartDir, 'files', 'config', '.yamllint.yml');
const tflintConfigSourcePath = path.join(chartDir, 'files', 'config', '.tflint.hcl');
const knipConfigSourcePath = path.join(chartDir, 'files', 'config', 'knip.json');
const jscpdConfigSourcePath = path.join(chartDir, 'files', 'config', 'jscpd.json');
const jscpdTestsConfigSourcePath = path.join(chartDir, 'files', 'config', 'jscpd-tests.json');
const lintBaselineSourcePath = path.join(chartDir, 'files', 'config', 'lint-baseline.json');
const lintPolicySourcePath = path.join(chartDir, 'files', 'config', 'lint-policy.json');
const deployScriptPath = path.join(sourceRoot, 'scripts', 'deploy.sh');
const setupScriptPath = path.join(sourceRoot, 'scripts', 'setup.sh');
const setupSecretsScriptPath = path.join(sourceRoot, 'my-values', 'setup-secrets.sh');
const busterNamespaceControllerSourcePath = path.join(sourceRoot, 'cmd', 'buster-namespace-controller', 'main.go');
const dockerignorePath = path.join(sourceRoot, '.dockerignore');
const gitignorePath = path.join(sourceRoot, '.gitignore');
const tailscaleValuesPath = path.join(sourceRoot, 'my-values', 'infra', 'tailscale-operator-values.yaml');
const registryLocalManifestPath = path.join(sourceRoot, 'my-values', 'infra', 'registry-local.yaml');
const litellmManifestPath = path.join(sourceRoot, 'my-values', 'infra', 'litellm-deployment.yaml');
const networkPoliciesPath = path.join(sourceRoot, 'my-values', 'infra', 'network-policies.yaml');
const busterNamespaceFencePath = path.join(sourceRoot, 'my-values', 'infra', 'buster-namespace-fence.yaml');
const imageBuildWorkflowPath = path.join(sourceRoot, '.github', 'workflows', 'build-images.yaml');
const docsChecksWorkflowPath = path.join(sourceRoot, '.github', 'workflows', 'docs-checks.yaml');
const packageSkillBundleScriptPath = path.join(sourceRoot, 'scripts', 'package-agent-skill-bundle.sh');
const rootPackagePath = path.join(sourceRoot, 'package.json');
const rootPackageLockPath = path.join(sourceRoot, 'package-lock.json');
const generalDockerfilePath = path.join(sourceRoot, 'docker', 'Dockerfile.general');
const generalToolsPackagePath = path.join(sourceRoot, 'docker', 'general-tools', 'package.json');
const generalToolsLockPath = path.join(sourceRoot, 'docker', 'general-tools', 'package-lock.json');
const observerPackagePath = path.join(sourceRoot, 'skills', 'common', 'plugins', 'openclaw-agent-observer', 'package.json');
const observerLockPath = path.join(sourceRoot, 'skills', 'common', 'plugins', 'openclaw-agent-observer', 'package-lock.json');
const busterGatewayDockerfilePath = path.join(sourceRoot, 'docker', 'Dockerfile.buster-gateway');
const busterPipelineDockerfilePath = path.join(sourceRoot, 'docker', 'Dockerfile.buster-pipeline');
const busterPipelineEntrypointPath = path.join(sourceRoot, 'docker', 'buster-pipeline-entrypoint.sh');
const namespaceControllerDockerfilePath = path.join(sourceRoot, 'docker', 'Dockerfile.namespace-controller');
const rbacSandboxDocsPath = path.join(sourceRoot, 'docs', 'deployment', 'rbac-and-sandbox.md');

if (!fs.existsSync(chartDir)) throw new Error(`Chart directory not found: ${chartDir}`);
if (!fs.existsSync(novaValuesPath)) throw new Error(`Values file not found: ${novaValuesPath}`);
if (!fs.existsSync(busterValuesPath)) throw new Error(`Values file not found: ${busterValuesPath}`);
if (!fs.existsSync(dockerignorePath)) throw new Error(`Docker ignore file not found: ${dockerignorePath}`);
if (!fs.existsSync(gitignorePath)) throw new Error(`Git ignore file not found: ${gitignorePath}`);
if (!fs.existsSync(rbacSandboxDocsPath)) throw new Error(`RBAC and sandbox docs not found: ${rbacSandboxDocsPath}`);

function assertIncludes(text, needle, message) {
  assert(text.includes(needle), `${message} (missing: ${needle})`);
}

function normalizedNonemptyLines(text) {
  return normalizeNewlines(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function assertLine(text, needle, message) {
  const lines = normalizedNonemptyLines(text);
  assert(lines.includes(needle), `${message} (missing line: ${needle})`);
}

function assertOrdered(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  assert(firstIndex >= 0, `${message} (missing first marker: ${first})`);
  assert(secondIndex >= 0, `${message} (missing second marker: ${second})`);
  assert(firstIndex < secondIndex, `${message} (markers are out of order)`);
}

function assertMatchCountAtLeast(text, needle, expectedCount, message) {
  const count = text.split(needle).length - 1;
  assert(
    count >= expectedCount,
    `${message} (expected at least ${expectedCount} occurrences of ${needle}, got ${count})`,
  );
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

function normalizeLiteralPayload(text) {
  return normalizeNewlines(text).replace(/\n+$/, '\n');
}

function parseYamlDocuments(text, label = 'YAML') {
  const parser = [
    'import json',
    'import sys',
    'import yaml',
    'docs = [doc for doc in yaml.safe_load_all(sys.stdin.read()) if doc is not None]',
    'print(json.dumps(docs))',
  ].join('\n');
  try {
    return JSON.parse(execFileSync('python', ['-c', parser], {
      cwd: sourceRoot,
      input: text,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
  } catch (error) {
    throw new Error(`${label} must parse as structured YAML: ${error.message}`);
  }
}

function parseYamlFile(filePath) {
  return parseYamlDocuments(fs.readFileSync(filePath, 'utf8'), filePath);
}

function objectName(object) {
  return object?.metadata?.name || '';
}

function objectsByKind(objects, kind) {
  return objects.filter((object) => object?.kind === kind);
}

function findObject(objects, kind, name) {
  const object = objects.find((entry) => entry?.kind === kind && objectName(entry) === name);
  assert(object, `Structured manifest must include ${kind}/${name}`);
  return object;
}

function serviceType(service) {
  return service?.spec?.type || 'ClusterIP';
}

function serviceNodePorts(service) {
  return (service?.spec?.ports || [])
    .map((port) => port?.nodePort)
    .filter((port) => port !== undefined && port !== null);
}

function containerByName(deployment, containerName) {
  const containers = deployment?.spec?.template?.spec?.containers || [];
  const container = containers.find((entry) => entry?.name === containerName);
  assert(container, `${deployment?.kind || 'Deployment'}/${objectName(deployment)} must include container ${containerName}`);
  return container;
}

function resourceQuantity(container, type, resourceName) {
  return container?.resources?.[type]?.[resourceName];
}

function containerMountPaths(container) {
  return (container?.volumeMounts || []).map((mount) => mount?.mountPath).filter(Boolean);
}

function containerMount(container, mountPath) {
  return (container?.volumeMounts || []).find((mount) => mount?.mountPath === mountPath);
}

function envValue(container, name) {
  return (container?.env || []).find((entry) => entry?.name === name)?.value;
}

function preStopCommand(container) {
  return (container?.lifecycle?.preStop?.exec?.command || []).join('\n');
}

function postStartCommand(container) {
  return (container?.lifecycle?.postStart?.exec?.command || []).join('\n');
}

function volumeByName(deployment, volumeName) {
  const volumes = deployment?.spec?.template?.spec?.volumes || [];
  const volume = volumes.find((entry) => entry?.name === volumeName);
  assert(volume, `${deployment?.kind || 'Deployment'}/${objectName(deployment)} must include volume ${volumeName}`);
  return volume;
}

function assertServiceExposure(service, expected) {
  assert.equal(serviceType(service), expected.type, `${expected.name} Service type must be ${expected.type}`);
  assert.deepEqual(serviceNodePorts(service).sort(), [...(expected.nodePorts || [])].sort(), `${expected.name} Service NodePorts must match expected exposure`);
}

function assertNoUnexpectedNodePorts(objects, allowed) {
  const allowedKeys = new Set(allowed.map((entry) => `${entry.name}:${entry.nodePort}`));
  for (const service of objectsByKind(objects, 'Service')) {
    for (const nodePort of serviceNodePorts(service)) {
      assert(
        allowedKeys.has(`${objectName(service)}:${nodePort}`),
        `Unexpected NodePort ${nodePort} on Service/${objectName(service)}`,
      );
    }
  }
}

function networkPolicyByName(name) {
  return findObject(networkPolicyObjects, 'NetworkPolicy', name);
}

function assertNetworkPolicy(name, predicate, message) {
  const policy = networkPolicyByName(name);
  assert(predicate(policy), message);
  return policy;
}

function policyPorts(policy, direction) {
  return (policy?.spec?.[direction] || [])
    .flatMap((rule) => rule?.ports || [])
    .map((port) => port?.port)
    .filter((port) => port !== undefined && port !== null);
}

function policyHasPodSelector(policy, labels) {
  const matchLabels = policy?.spec?.podSelector?.matchLabels || {};
  return Object.entries(labels).every(([key, value]) => matchLabels[key] === value);
}

function policyHasPeerPodSelector(policy, direction, labels) {
  return (policy?.spec?.[direction] || []).some((rule) => {
    const peers = direction === 'ingress' ? rule?.from || [] : rule?.to || [];
    return peers.some((peer) => {
      const matchLabels = peer?.podSelector?.matchLabels || {};
      return Object.entries(labels).every(([key, value]) => matchLabels[key] === value);
    });
  });
}

function rulesGrantResource(rules, resource) {
  return (rules || []).some((rule) => (rule?.resources || []).includes(resource));
}

function rulesGrantResourceVerbs(rules, resource, verbs) {
  return (rules || []).some((rule) => {
    const resources = rule?.resources || [];
    const ruleVerbs = rule?.verbs || [];
    return resources.includes(resource) && verbs.every((verb) => ruleVerbs.includes(verb));
  });
}

function dockerRunInstructions(text) {
  const instructionStart = /^\s*(?:FROM|ARG|ENV|USER|WORKDIR|COPY|ADD|LABEL|EXPOSE|ENTRYPOINT|CMD|SHELL|STOPSIGNAL|HEALTHCHECK|VOLUME|ONBUILD)\b/;
  const instructions = [];
  let current = null;

  for (const line of normalizeNewlines(text).split('\n')) {
    if (/^\s*RUN\b/.test(line)) {
      if (current) instructions.push(current);
      current = line;
      continue;
    }
    if (instructionStart.test(line)) {
      if (current) instructions.push(current);
      current = null;
      continue;
    }
    if (current) current = `${current}\n${line}`;
  }

  if (current) instructions.push(current);
  return instructions;
}

function assertDockerInstallCommandsFailClosed(text, label) {
  for (const instruction of dockerRunInstructions(text)) {
    if (!/\b(?:apt-get|npm|npx|pip|agent-browser)\b[\s\S]*\binstall\b/.test(instruction)) continue;
    assert.equal(instruction.includes('|| true'), false, `${label} install command must not silently continue with || true`);
    assert.equal(instruction.includes('2>/dev/null'), false, `${label} install command must not suppress install stderr`);
  }
}

function findRenderedDocument(manifest, { kind, name }) {
  const document = normalizeNewlines(manifest)
    .split(/^---\s*$/m)
    .find((entry) => entry.includes(`kind: ${kind}`) && entry.includes(`name: ${name}`));

  assert(document, `Rendered manifest must include ${kind} ${name}`);
  return document;
}

function findRenderedNamedDocument(manifest, { kind, name }) {
  const document = normalizeNewlines(manifest)
    .split(/^---\s*$/m)
    .find((entry) => {
      const lines = entry.split('\n');
      const kindIndex = lines.findIndex((line) => line === `kind: ${kind}`);
      const metadataIndex = lines.findIndex((line) => line === 'metadata:');
      if (kindIndex === -1 || metadataIndex === -1) return false;
      return lines.slice(metadataIndex + 1).some((line) => line === `  name: ${name}`);
    });

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

const renderedBusterGatewayUrlOverride = execFileSync('helm', [
  'template',
  'agent-buster',
  chartDir,
  '-f',
  busterValuesPath,
  '--set-string',
  'gateway.url=http://agent-buster.kubeclaw.svc.cluster.local:18789',
], {
  cwd: sourceRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const renderedBusterBrokerDisabled = execFileSync('helm', [
  'template',
  'agent-buster',
  chartDir,
  '--set-string',
  'agentRole=buster',
  '--set',
  'serviceAccount.create=true',
  '--set',
  'serviceAccount.automount=true',
  '--set',
  'busterNamespaceBroker.enabled=false',
], {
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

const networkPolicyKubeconformSummary = execFileSync('kubeconform', [
  '-strict',
  '-summary',
  '-ignore-missing-schemas',
  networkPoliciesPath,
], {
  cwd: sourceRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

const localInfraKubeconformSummary = execFileSync('kubeconform', [
  '-strict',
  '-summary',
  '-ignore-missing-schemas',
  busterNamespaceFencePath,
  litellmManifestPath,
  registryLocalManifestPath,
  path.join(sourceRoot, 'my-values', 'infra', 'registry-mirror.yaml'),
  networkPoliciesPath,
], {
  cwd: sourceRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

const deploymentTemplate = fs.readFileSync(deploymentTemplatePath, 'utf8');
const serviceTemplate = fs.readFileSync(serviceTemplatePath, 'utf8');
const gatewayConfigTemplate = fs.readFileSync(gatewayConfigTemplatePath, 'utf8');
const chartValues = fs.readFileSync(chartValuesPath, 'utf8');
const novaValues = fs.readFileSync(novaValuesPath, 'utf8');
const busterValues = fs.readFileSync(busterValuesPath, 'utf8');
const swarmConfigTemplate = fs.readFileSync(swarmConfigTemplatePath, 'utf8');
const customSkillsConfigMapTemplate = fs.readFileSync(customSkillsConfigMapTemplatePath, 'utf8');
const swarmConfigSource = fs.readFileSync(swarmConfigSourcePath, 'utf8');
const semgrepConfigSource = fs.readFileSync(semgrepConfigSourcePath, 'utf8');
const yamllintConfigSource = fs.readFileSync(yamllintConfigSourcePath, 'utf8');
const tflintConfigSource = fs.readFileSync(tflintConfigSourcePath, 'utf8');
const knipConfigSource = fs.readFileSync(knipConfigSourcePath, 'utf8');
const jscpdConfigSource = fs.readFileSync(jscpdConfigSourcePath, 'utf8');
const jscpdTestsConfigSource = fs.readFileSync(jscpdTestsConfigSourcePath, 'utf8');
const lintBaselineSource = fs.readFileSync(lintBaselineSourcePath, 'utf8');
const lintPolicySource = fs.readFileSync(lintPolicySourcePath, 'utf8');
const deployScript = fs.readFileSync(deployScriptPath, 'utf8');
const setupScript = fs.readFileSync(setupScriptPath, 'utf8');
const setupSecretsScript = fs.readFileSync(setupSecretsScriptPath, 'utf8');
const busterNamespaceControllerSource = fs.readFileSync(busterNamespaceControllerSourcePath, 'utf8');
const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
const gitignore = fs.readFileSync(gitignorePath, 'utf8');
const tailscaleValues = fs.readFileSync(tailscaleValuesPath, 'utf8');
const registryLocalManifest = fs.readFileSync(registryLocalManifestPath, 'utf8');
const litellmManifest = fs.readFileSync(litellmManifestPath, 'utf8');
const networkPolicies = fs.readFileSync(networkPoliciesPath, 'utf8');
const imageBuildWorkflow = fs.readFileSync(imageBuildWorkflowPath, 'utf8');
const docsChecksWorkflow = fs.readFileSync(docsChecksWorkflowPath, 'utf8');
const packageSkillBundleScript = fs.readFileSync(packageSkillBundleScriptPath, 'utf8');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
const rootPackageLock = JSON.parse(fs.readFileSync(rootPackageLockPath, 'utf8'));
const generalDockerfile = fs.readFileSync(generalDockerfilePath, 'utf8');
const generalToolsPackage = JSON.parse(fs.readFileSync(generalToolsPackagePath, 'utf8'));
const generalToolsLock = JSON.parse(fs.readFileSync(generalToolsLockPath, 'utf8'));
const observerPackage = JSON.parse(fs.readFileSync(observerPackagePath, 'utf8'));
const observerLock = JSON.parse(fs.readFileSync(observerLockPath, 'utf8'));
const busterGatewayDockerfile = fs.readFileSync(busterGatewayDockerfilePath, 'utf8');
const busterPipelineDockerfile = fs.readFileSync(busterPipelineDockerfilePath, 'utf8');
const busterPipelineEntrypoint = fs.readFileSync(busterPipelineEntrypointPath, 'utf8');
const busterGatewayRuntimeStage = busterGatewayDockerfile.split(/^FROM /m).at(-1);
const busterGatewayRuntimeCommands = busterGatewayRuntimeStage
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');
const generalOpenClawBase = generalDockerfile.match(/^ARG OPENCLAW_BASE=(.+)$/m)?.[1];
const busterOpenClawBase = busterGatewayDockerfile.match(/^ARG OPENCLAW_BASE=(.+)$/m)?.[1];
const generalAptInstall = generalDockerfile.match(/apt-get install -y --no-install-recommends([\s\S]*?)&& rm -rf \/var\/lib\/apt\/lists\//)?.[1] ?? '';
const busterGatewayAptInstall = busterGatewayRuntimeStage.match(/apt-get install -y --no-install-recommends([\s\S]*?)&& rm -rf \/var\/lib\/apt\/lists\//)?.[1] ?? '';
const busterPipelineAptInstall = busterPipelineDockerfile.match(/apt-get install -y --no-install-recommends([\s\S]*?)&& rm -rf \/var\/lib\/apt\/lists\//)?.[1] ?? '';
const namespaceControllerDockerfile = fs.readFileSync(namespaceControllerDockerfilePath, 'utf8');
const rbacSandboxDocs = fs.readFileSync(rbacSandboxDocsPath, 'utf8');
const deployScriptMode = fs.statSync(deployScriptPath).mode;
const renderedSwarmConfigMap = findRenderedDocument(rendered, {
  kind: 'ConfigMap',
  name: 'agent-nova-swarm-config',
});
const renderedSwarmConfig = extractLiteralDataBlock(renderedSwarmConfigMap, 'swarm.config.json');
const renderedSwarmConfigJson = JSON.parse(renderedSwarmConfig);
const renderedSemgrepConfig = extractLiteralDataBlock(renderedSwarmConfigMap, '.semgrep.yml');
const renderedYamllintConfig = extractLiteralDataBlock(renderedSwarmConfigMap, '.yamllint.yml');
const renderedTflintConfig = extractLiteralDataBlock(renderedSwarmConfigMap, '.tflint.hcl');
const renderedKnipConfig = extractLiteralDataBlock(renderedSwarmConfigMap, 'knip.json');
const renderedJscpdConfig = extractLiteralDataBlock(renderedSwarmConfigMap, 'jscpd.json');
const renderedJscpdTestsConfig = extractLiteralDataBlock(renderedSwarmConfigMap, 'jscpd-tests.json');
const renderedLintBaseline = extractLiteralDataBlock(renderedSwarmConfigMap, 'lint-baseline.json');
const renderedLintPolicy = extractLiteralDataBlock(renderedSwarmConfigMap, 'lint-policy.json');
const renderedBusterGatewayConfigMap = findRenderedDocument(renderedBuster, {
  kind: 'ConfigMap',
  name: 'agent-buster-config',
});
const renderedBusterGatewayConfig = JSON.parse(extractLiteralDataBlock(renderedBusterGatewayConfigMap, 'openclaw.json'));
const renderedBusterDeployment = findRenderedNamedDocument(renderedBuster, {
  kind: 'Deployment',
  name: 'agent-buster',
});
const renderedObjects = parseYamlDocuments(rendered, 'rendered Nova manifest');
const renderedBusterObjects = parseYamlDocuments(renderedBuster, 'rendered Buster manifest');
const renderedBusterBrokerDisabledObjects = parseYamlDocuments(
  renderedBusterBrokerDisabled,
  'rendered broker-disabled Buster manifest',
);
const networkPolicyObjects = parseYamlFile(networkPoliciesPath);
const busterNamespaceFenceObjects = parseYamlFile(busterNamespaceFencePath);
const localInfraObjects = [
  ...parseYamlFile(litellmManifestPath),
  ...parseYamlFile(registryLocalManifestPath),
  ...parseYamlFile(path.join(sourceRoot, 'my-values', 'infra', 'registry-mirror.yaml')),
];
const allRenderedServiceObjects = [
  ...objectsByKind(renderedObjects, 'Service'),
  ...objectsByKind(renderedBusterObjects, 'Service'),
  ...objectsByKind(localInfraObjects, 'Service'),
];
const novaServiceObject = findObject(renderedObjects, 'Service', 'agent-nova');
const novaPreviewServiceObject = findObject(renderedObjects, 'Service', 'agent-nova-prism-preview');
const busterServiceObject = findObject(renderedBusterObjects, 'Service', 'agent-buster');
const litellmServiceObject = findObject(localInfraObjects, 'Service', 'litellm');
const registryLocalServiceObject = findObject(localInfraObjects, 'Service', 'registry-local');
const registryMirrorServiceObject = findObject(localInfraObjects, 'Service', 'registry-mirror');
const busterDeploymentObject = findObject(renderedBusterObjects, 'Deployment', 'agent-buster');
const busterNamespaceControllerDeploymentObject = findObject(renderedBusterObjects, 'Deployment', 'agent-buster-namespace-controller');
const novaDeploymentObject = findObject(renderedObjects, 'Deployment', 'agent-nova');
const novaGatewayContainerObject = containerByName(novaDeploymentObject, 'kubeclaw');
const novaInitSetupContainerObject = (novaDeploymentObject.spec?.template?.spec?.initContainers || [])
  .find((entry) => entry?.name === 'init-setup');
const busterGatewayContainerObject = containerByName(busterDeploymentObject, 'kubeclaw');
const busterPipelineContainerObject = containerByName(busterDeploymentObject, 'buster-pipeline');
const busterNamespaceControllerContainerObject = containerByName(busterNamespaceControllerDeploymentObject, 'controller');
const busterNamespaceControllerPrefixEnvObject = (busterNamespaceControllerContainerObject.env || [])
  .find((entry) => entry?.name === 'BUSTER_ALLOWED_NAMESPACE_PREFIXES');
const busterNamespaceControllerAdditionalRunnerEnvObject = (busterNamespaceControllerContainerObject.env || [])
  .find((entry) => entry?.name === 'BUSTER_ADDITIONAL_RUNNER_SERVICE_ACCOUNTS');
const novaLeaseClientRoleObject = findObject(renderedObjects, 'Role', 'agent-nova-namespace-lease-client');
const novaLeaseClientRoleBindingObject = findObject(renderedObjects, 'RoleBinding', 'agent-nova-namespace-lease-client');
const novaVerificationReadClusterRoleObject = findObject(renderedObjects, 'ClusterRole', 'agent-nova-verification-read');
const novaVerificationReadClusterRoleBindingObject = findObject(renderedObjects, 'ClusterRoleBinding', 'agent-nova-verification-read');
const busterLeaseClientRoleObject = findObject(renderedBusterObjects, 'Role', 'agent-buster-namespace-lease-client');
const busterLeaseCrdObject = findObject(renderedBusterObjects, 'CustomResourceDefinition', `busternamespaceleases.kubeclaw.forgestack.ai`);
const busterLeaseStatusProperties = busterLeaseCrdObject?.spec?.versions?.[0]?.schema?.openAPIV3Schema?.properties?.status?.properties || {};
const busterLeaseSpecProperties = busterLeaseCrdObject?.spec?.versions?.[0]?.schema?.openAPIV3Schema?.properties?.spec?.properties || {};
const busterNamespaceFencePolicyObject = findObject(busterNamespaceFenceObjects, 'ValidatingAdmissionPolicy', 'buster-namespace-fence');
const busterNamespaceFenceMatchExpression = (busterNamespaceFencePolicyObject.spec?.matchConditions || [])
  .map((condition) => condition?.expression || '')
  .join('\n');
const busterNamespaceFenceValidationExpression = (busterNamespaceFencePolicyObject.spec?.validations || [])
  .map((validation) => validation?.expression || '')
  .join('\n');

assertServiceExposure(novaServiceObject, { name: 'agent-nova', type: 'ClusterIP' });
assertServiceExposure(busterServiceObject, { name: 'agent-buster', type: 'ClusterIP' });
assertServiceExposure(registryLocalServiceObject, { name: 'registry-local', type: 'ClusterIP' });
assertServiceExposure(registryMirrorServiceObject, { name: 'registry-mirror', type: 'ClusterIP' });
assertServiceExposure(novaPreviewServiceObject, { name: 'agent-nova-prism-preview', type: 'NodePort', nodePorts: [30456] });
assertServiceExposure(litellmServiceObject, { name: 'litellm', type: 'NodePort', nodePorts: [30050] });
assertNoUnexpectedNodePorts(allRenderedServiceObjects, [
  { name: 'agent-nova-prism-preview', nodePort: 30456 },
  { name: 'litellm', nodePort: 30050 },
]);

assert.equal(
  renderedBusterObjects.some((object) => object?.kind === 'ClusterRole' && objectName(object) === 'agent-buster-k8s-tester'),
  false,
  'Structured Buster render must not include the legacy broad k8s tester ClusterRole',
);
assert.equal(
  renderedBusterBrokerDisabledObjects.some(
    (object) => object?.kind === 'ClusterRole' && objectName(object) === 'agent-buster-k8s-tester',
  ),
  false,
  'Broker-disabled Buster render must not fall back to the legacy broad k8s tester ClusterRole',
);
assert.equal(
  renderedBusterObjects.some((object) => rulesGrantResource(object?.rules, 'pods/exec')),
  false,
  'Structured Buster render must not grant pods/exec to the agent runtime',
);
assert.equal(
  renderedObjects.some((object) => object?.kind === 'CustomResourceDefinition' && objectName(object) === 'busternamespaceleases.kubeclaw.forgestack.ai'),
  false,
  'Structured Nova render must not own the BusterNamespaceLease CRD',
);
assert.equal(
  renderedObjects.some((object) => object?.kind === 'Deployment' && objectName(object) === 'agent-nova-namespace-controller'),
  false,
  'Structured Nova render must not run the Buster namespace controller',
);
assert.equal(
  renderedObjects.some((object) => object?.kind === 'ClusterRole' && objectName(object) === 'agent-nova-k8s-tester'),
  false,
  'Structured Nova render must not include a broad k8s tester ClusterRole',
);
assert.equal(
  renderedObjects.some((object) => rulesGrantResource(object?.rules, 'namespaces')),
  false,
  'Structured Nova render must not grant direct namespace control',
);
assert.equal(
  renderedObjects.some((object) => rulesGrantResource(object?.rules, 'pods/exec')),
  false,
  'Structured Nova render must not grant pods/exec',
);
assert.equal(
  rulesGrantResource(novaLeaseClientRoleObject.rules, 'busternamespaceleases'),
  true,
  'Structured Nova lease-client Role must grant BusterNamespaceLease access',
);
assert.equal(
  rulesGrantResource(novaLeaseClientRoleObject.rules, 'busternamespaceleases/status'),
  true,
  'Structured Nova lease-client Role must grant read-only BusterNamespaceLease status access',
);
assert.equal(
  rulesGrantResourceVerbs(novaLeaseClientRoleObject.rules, 'deployments', ['get', 'list', 'watch']),
  true,
  'Structured Nova lease-client Role must grant read-only Deployment visibility for broker preflight',
);
assert.equal(
  rulesGrantResourceVerbs(novaLeaseClientRoleObject.rules, 'services', ['get', 'list']),
  true,
  'Structured Nova lease-client Role must grant read-only Service visibility for broker preflight',
);
assert.equal(
  novaLeaseClientRoleBindingObject.subjects?.[0]?.name,
  'agent-nova',
  'Structured Nova lease-client RoleBinding must bind only the Nova ServiceAccount',
);
assert.equal(
  rulesGrantResourceVerbs(novaVerificationReadClusterRoleObject.rules, 'pods', ['get', 'list', 'watch']),
  true,
  'Structured Nova verification read ClusterRole must grant read-only pod visibility for Tailscale operator preflight',
);
assert.equal(
  rulesGrantResourceVerbs(novaVerificationReadClusterRoleObject.rules, 'secrets', ['get']),
  true,
  'Structured Nova verification read ClusterRole must grant named Tailscale OAuth Secret visibility',
);
assert.deepEqual(
  novaVerificationReadClusterRoleObject.rules
    .find((rule) => (rule?.resources || []).includes('secrets'))
    ?.resourceNames,
  ['operator-oauth'],
  'Structured Nova verification read ClusterRole must limit Secret visibility to operator-oauth',
);
assert.equal(
  rulesGrantResourceVerbs(novaVerificationReadClusterRoleObject.rules, 'ingressclasses', ['get']),
  true,
  'Structured Nova verification read ClusterRole must grant read-only Tailscale IngressClass visibility',
);
assert.equal(
  novaVerificationReadClusterRoleBindingObject.subjects?.[0]?.name,
  'agent-nova',
  'Structured Nova verification read ClusterRoleBinding must bind only the Nova ServiceAccount',
);
assert.equal(
  rulesGrantResource(busterLeaseClientRoleObject.rules, 'busternamespaceleases'),
  true,
  'Structured Buster lease-client Role must grant BusterNamespaceLease access',
);
assert.equal(
  Object.hasOwn(busterLeaseStatusProperties, 'credentials'),
  false,
  'BusterNamespaceLease status schema must not expose plaintext credentials',
);
assert.equal(
  busterLeaseStatusProperties.credentialsAvailable?.type,
  'boolean',
  'BusterNamespaceLease status schema must expose only non-secret credential availability',
);
assert.equal(
  busterLeaseSpecProperties.namespaceName?.pattern,
  '^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$',
  'BusterNamespaceLease namespaceName must allow human request names that the controller normalizes',
);
assert.deepEqual(
  busterLeaseSpecProperties.namespacePrefix?.enum,
  ['test'],
  'BusterNamespaceLease namespacePrefix must only allow test namespaces',
);
assert.equal(
  busterNamespaceControllerPrefixEnvObject?.value,
  'test',
  'Buster namespace controller must receive only the test namespace prefix',
);
assert.equal(
  busterNamespaceControllerAdditionalRunnerEnvObject?.value,
  'kubeclaw/agent-nova',
  'Buster namespace controller must bind Nova as an additional runner only inside broker-created test namespaces',
);
assert.equal(
  String(busterNamespaceControllerPrefixEnvObject?.value || '').includes('buster'),
  false,
  'Buster namespace controller must not allow legacy buster namespace prefixes',
);
assert.equal(
  busterNamespaceControllerContainerObject.image,
  'ghcr.io/datrab/kubeclaw-namespace-controller:latest',
  'Buster namespace controller must render the dedicated namespace controller image from Buster values',
);
assert.deepEqual(
  busterNamespaceControllerDeploymentObject.spec?.template?.spec?.imagePullSecrets,
  [{ name: 'ghcr-secret' }],
  'Buster namespace controller must inherit imagePullSecrets for private GHCR pulls',
);
assertIncludes(
  busterNamespaceControllerSource,
  'func (c *controller) normalizeLeaseNamespaceName(requestedName string) string',
  'Buster namespace controller must normalize requested lease namespace names',
);
assertIncludes(
  busterNamespaceControllerSource,
  'if prefix == "test"',
  'Buster namespace controller must default unprefixed lease namespace requests to test-*',
);
assertIncludes(
  busterNamespaceControllerSource,
  '63 - len(prefix) - 1',
  'Buster namespace controller must keep normalized namespaces within the DNS label length limit',
);
assertIncludes(
  busterNamespaceControllerSource,
  'BUSTER_ADDITIONAL_RUNNER_SERVICE_ACCOUNTS',
  'Buster namespace controller must read additional runner ServiceAccounts from explicit broker config',
);
assertIncludes(
  busterNamespaceControllerSource,
  'func (c *controller) parseServiceAccountRefs(value string)',
  'Buster namespace controller must validate additional runner ServiceAccount references',
);
assertIncludes(
  busterNamespaceControllerSource,
  'for _, account := range c.additionalRunnerAccounts',
  'Buster namespace controller must bind additional runner ServiceAccounts in broker-created namespaces',
);
assertIncludes(
  busterNamespaceControllerSource,
  '"resources": []string{"pods/portforward"}',
  'Buster namespace controller must grant port-forward only inside broker-created namespaces',
);
assert.equal(
  rulesGrantResource(busterLeaseClientRoleObject.rules, 'namespaces'),
  false,
  'Structured Buster lease-client Role must not grant direct namespace control',
);
assertIncludes(
  busterNamespaceFenceMatchExpression,
  'system:serviceaccount:kubeclaw:agent-buster-namespace-controller',
  'Buster namespace fence must cover the namespace-controller ServiceAccount',
);
assertIncludes(
  busterNamespaceFenceValidationExpression,
  'request.userInfo.username !=',
  'Buster namespace fence must deny direct namespace lifecycle calls by agent-buster',
);
assertIncludes(
  busterNamespaceFenceValidationExpression,
  'system:serviceaccount:kubeclaw:agent-buster',
  'Buster namespace fence must explicitly identify direct Buster namespace calls',
);
assertIncludes(
  busterNamespaceFenceValidationExpression,
  'object.metadata.name.startsWith("test-")',
  'Buster namespace fence must allow only test-* namespace creates',
);
assert.equal(
  busterNamespaceFenceValidationExpression.includes('object.metadata.name.startsWith("buster-")'),
  false,
  'Buster namespace fence must not allow buster-* namespace creates',
);
assertIncludes(
  busterNamespaceFenceValidationExpression,
  '"kubeclaw/managed-by" in object.metadata.labels',
  'Buster namespace fence must require managed labels on namespace create',
);
assertIncludes(
  busterNamespaceFenceValidationExpression,
  '"kubeclaw/managed-by" in oldObject.metadata.labels',
  'Buster namespace fence must require managed labels on namespace delete',
);
assertIncludes(
  busterNamespaceFenceValidationExpression,
  'oldObject.metadata.name.startsWith("test-")',
  'Buster namespace fence must check oldObject test-* name on namespace delete',
);
assert.equal(
  busterNamespaceFenceValidationExpression.includes('oldObject.metadata.name.startsWith("buster-")'),
  false,
  'Buster namespace fence must not allow buster-* namespace deletes',
);

assert.deepEqual(
  containerMountPaths(busterGatewayContainerObject).filter((mountPath) => ['/var/lib/containers', '/sandbox'].includes(mountPath)).sort(),
  [],
  'Structured Buster gateway container must not mount build or workload runtime storage',
);
assert.deepEqual(
  containerMountPaths(novaGatewayContainerObject).filter((mountPath) => ['/var/lib/containers', '/sandbox'].includes(mountPath)).sort(),
  [],
  'Structured Nova gateway container must not mount container runtime storage',
);
assert.deepEqual(
  containerMountPaths(busterPipelineContainerObject).filter((mountPath) => ['/var/lib/containers', '/sandbox'].includes(mountPath)).sort(),
  [],
  'Structured Buster pipeline container must not mount privileged container runtime storage',
);
assert.equal(
  busterDeploymentObject.spec?.template?.spec?.automountServiceAccountToken,
  false,
  'Structured Buster pod must disable implicit service-account token mounts',
);
assert.equal(
  containerMountPaths(busterGatewayContainerObject).includes('/var/run/secrets/kubernetes.io/serviceaccount'),
  false,
  'Structured Buster gateway must not receive Kubernetes API credentials',
);
assert.equal(
  containerMountPaths(busterPipelineContainerObject).includes('/var/run/secrets/kubernetes.io/serviceaccount'),
  true,
  'Structured Buster pipeline must receive the explicit projected Kubernetes API credential',
);
assert.equal(
  Array.isArray(volumeByName(busterDeploymentObject, 'buster-api-token')?.projected?.sources),
  true,
  'Structured Buster pipeline credential must be a projected service-account volume',
);
assert.equal(novaDeploymentObject.spec?.template?.spec?.terminationGracePeriodSeconds >= 120, true, 'Structured Nova deployment must define a real shutdown grace budget');
assert.equal(busterDeploymentObject.spec?.template?.spec?.terminationGracePeriodSeconds >= 120, true, 'Structured Buster deployment must define a real shutdown grace budget');
for (const [label, container] of [
  ['Nova gateway', novaGatewayContainerObject],
  ['Buster gateway', busterGatewayContainerObject],
  ['Buster pipeline', busterPipelineContainerObject],
]) {
  assert.equal(envValue(container, 'KUBECLAW_DRAIN_FILE'), '/tmp/kubeclaw-draining', `${label} must expose the readiness drain marker path`);
  assert.equal(envValue(container, 'KUBECLAW_PRESTOP_DRAIN_SECONDS'), '5', `${label} must expose the preStop drain handoff budget`);
  assertIncludes(preStopCommand(container), 'date -Iseconds > "$DRAIN_FILE"', `${label} preStop hook must mark the container draining before SIGTERM`);
  assertIncludes(preStopCommand(container), 'sleep "${KUBECLAW_PRESTOP_DRAIN_SECONDS:-5}"', `${label} preStop hook must give readiness a short handoff window`);
}
assert.equal(resourceQuantity(busterGatewayContainerObject, 'limits', 'ephemeral-storage'), '50Gi', 'Structured Buster gateway ephemeral-storage limit must be 50Gi');
assert.equal(resourceQuantity(busterPipelineContainerObject, 'limits', 'ephemeral-storage'), '60Gi', 'Structured Buster pipeline ephemeral-storage limit must be 60Gi');
assert.equal(volumeByName(busterDeploymentObject, 'buildkit-state')?.emptyDir?.sizeLimit, '50Gi', 'Structured Buster rootless BuildKit state must be bounded at 50Gi');
assert.equal(containerMountPaths(busterPipelineContainerObject).includes('/run/user/1000'), true, 'Structured Buster pipeline must expose its rootless BuildKit socket across the worker mount namespace');
assert.equal(envValue(busterPipelineContainerObject, 'XDG_RUNTIME_DIR'), '/run/user/1000', 'Structured Buster pipeline must keep all rootless BuildKit runtime sockets in its writable runtime mount');
assert.equal(containerMountPaths(busterPipelineContainerObject).includes('/home/node/.openclaw'), false, 'Structured Buster pipeline must not traverse the gateway-owned OpenClaw home');
assert.equal(containerMountPaths(busterPipelineContainerObject).includes('/workspace'), true, 'Structured Buster pipeline must mount the shared checkout at its own runtime root');
assert.equal(envValue(busterPipelineContainerObject, 'REPO_ROOT'), '/workspace/git-repo', 'Structured Buster pipeline must resolve the checkout from its isolated workspace mount');
assert.equal(envValue(busterPipelineContainerObject, 'SWARM_CONFIG'), '/home/builder/.openclaw/swarm.config.json', 'Structured Buster pipeline must consume runtime config from its builder-owned home');
assert.equal(containerMountPaths(busterPipelineContainerObject).includes('/home/node/.openclaw-persisted'), false, 'Structured Buster pipeline must not mount the gateway persisted-config alias');
assert.equal(envValue(busterPipelineContainerObject, 'KUBECLAW_HEALTH_STARTUP_STATUS_PATH'), '/home/builder/.openclaw/logs/startup-verification.json', 'Structured Buster pipeline must write startup health evidence in its builder-owned home');
assert.equal(novaDeploymentObject.spec?.template?.spec?.shareProcessNamespace, true, 'Structured Nova deployment should share process namespace for lifecycle coordination');
assert.equal(busterDeploymentObject.spec?.template?.spec?.shareProcessNamespace, false, 'Structured Buster deployment must not expose gateway processes to the pipeline sidecar');
assert.equal(novaGatewayContainerObject.securityContext?.privileged, false, 'Structured Nova gateway must remain non-privileged');
assert.equal(novaGatewayContainerObject.securityContext?.readOnlyRootFilesystem, true, 'Structured Nova gateway must keep its image filesystem read-only');
assert.equal(novaInitSetupContainerObject?.securityContext?.readOnlyRootFilesystem, true, 'Structured Nova init must keep its image filesystem read-only');
assert.equal((novaGatewayContainerObject.volumeMounts || []).some((mount) => mount?.name === 'tmp' && mount?.mountPath === '/tmp'), true, 'Structured Nova gateway must isolate writable temporary files on emptyDir');
assert.equal((novaInitSetupContainerObject?.volumeMounts || []).some((mount) => mount?.name === 'tmp' && mount?.mountPath === '/tmp'), true, 'Structured Nova init must isolate writable temporary files on emptyDir');
assert.equal(busterGatewayContainerObject.securityContext?.privileged, false, 'Structured Buster gateway must remain non-privileged');
assert.equal(busterPipelineContainerObject.securityContext?.privileged, false, 'Structured Buster pipeline must remain non-privileged');
assert.equal(busterPipelineContainerObject.securityContext?.allowPrivilegeEscalation, true, 'Structured Buster pipeline must permit RootlessKit UID/GID mapping helpers');
assert.equal(busterPipelineContainerObject.securityContext?.appArmorProfile?.type, 'Unconfined', 'Structured Buster pipeline must use the BuildKit-required unconfined AppArmor posture');
assert.equal(busterPipelineContainerObject.securityContext?.seccompProfile?.type, 'Unconfined', 'Structured Buster pipeline must use the BuildKit-required unconfined seccomp posture');
assert.deepEqual(busterPipelineContainerObject.securityContext?.capabilities?.drop, ['ALL'], 'Structured Buster pipeline must drop the runtime default capability set');
assert.deepEqual(busterPipelineContainerObject.securityContext?.capabilities?.add, ['SETUID', 'SETGID'], 'Structured Buster pipeline must retain only UID/GID mapping capabilities');
assert.equal(busterDeploymentObject.spec?.template?.spec?.securityContext?.fsGroup, 1000, 'Structured Buster pod must expose the shared workspace group to both containers');
assert.equal(busterDeploymentObject.spec?.template?.spec?.securityContext?.fsGroupChangePolicy, 'OnRootMismatch', 'Structured Buster pod must normalize retained PVC group ownership without rewriting it every start');
assert.equal(busterGatewayContainerObject.livenessProbe?.periodSeconds >= 10, true, 'Buster gateway liveness period must tolerate build pressure');
assert.equal(busterGatewayContainerObject.livenessProbe?.timeoutSeconds >= 5, true, 'Buster gateway liveness timeout must tolerate build pressure');
assert.equal(busterGatewayContainerObject.livenessProbe?.failureThreshold >= 6, true, 'Buster gateway liveness failure threshold must avoid transient restart loops');
assert.equal(envValue(novaGatewayContainerObject, 'NODE_PATH'), '/opt/kubeclaw-tools/node_modules:/usr/local/lib/node_modules:/app/node_modules', 'Nova gateway must resolve general-image locked JavaScript tools and OpenClaw globals');
assert.equal(envValue(busterGatewayContainerObject, 'NODE_PATH'), '/opt/kubeclaw-tools/node_modules:/usr/local/lib/node_modules:/app/node_modules', 'Buster gateway must resolve shared chart health dependencies across gateway image variants');
assert.equal(envValue(busterPipelineContainerObject, 'BUSTER_PLATFORM_CAPABILITIES'), 'rootless_buildkit', 'Buster pipeline must expose rootless BuildKit capability');
assert.equal(envValue(busterPipelineContainerObject, 'NODE_PATH'), '/app/node_modules', 'Buster pipeline must resolve mounted ESM skills against image-local dependencies');
assert.equal(busterPipelineContainerObject.livenessProbe?.periodSeconds >= 10, true, 'Buster pipeline liveness period must tolerate build pressure');
assert.equal(busterPipelineContainerObject.livenessProbe?.timeoutSeconds >= 5, true, 'Buster pipeline liveness timeout must tolerate build pressure');
assert.equal(busterPipelineContainerObject.livenessProbe?.failureThreshold >= 6, true, 'Buster pipeline liveness failure threshold must avoid transient restart loops');

assert.equal(networkPolicyObjects.length, 13, 'Structured NetworkPolicy baseline must contain exactly 13 policies');
assertNetworkPolicy(
  'kubeclaw-default-deny',
  (policy) => Object.keys(policy?.spec?.podSelector || {}).length === 0
    && policy?.spec?.policyTypes?.includes('Ingress')
    && policy?.spec?.policyTypes?.includes('Egress'),
  'Structured NetworkPolicy baseline must include namespace default-deny ingress and egress',
);
assertNetworkPolicy(
  'kubeclaw-agents-egress',
  (policy) => policyHasPodSelector(policy, { 'app.kubernetes.io/name': 'kubeclaw' })
    && [22, 80, 443, 6379, 6333, 6334, 4000, 5000, 5001, 18789, 18790].every((port) => policyPorts(policy, 'egress').includes(port)),
  'Structured NetworkPolicy baseline must preserve agent service, Git, web, registry, and agent-to-agent egress',
);
assertNetworkPolicy(
  'kubeclaw-redis-ingress',
  (policy) => policyHasPodSelector(policy, { 'app.kubernetes.io/instance': 'redis', 'app.kubernetes.io/name': 'redis' })
    && policyHasPeerPodSelector(policy, 'ingress', { 'app.kubernetes.io/name': 'kubeclaw' })
    && policyHasPeerPodSelector(policy, 'ingress', { 'app.kubernetes.io/name': 'clawdeck' })
    && policyPorts(policy, 'ingress').includes(6379),
  'Structured NetworkPolicy baseline must restrict Redis ingress on 6379 to approved clients',
);
assertNetworkPolicy(
  'kubeclaw-clawdeck-redis-egress',
  (policy) => policyHasPodSelector(policy, { 'app.kubernetes.io/name': 'clawdeck' })
    && policyHasPeerPodSelector(policy, 'egress', { 'app.kubernetes.io/instance': 'redis', 'app.kubernetes.io/name': 'redis' })
    && policyPorts(policy, 'egress').includes(6379),
  'Structured NetworkPolicy baseline must allow Clawdeck Redis egress only to Redis on 6379',
);
assertNetworkPolicy(
  'kubeclaw-litellm-egress',
  (policy) => policyHasPodSelector(policy, { app: 'litellm' })
    && [80, 443, 5432].every((port) => policyPorts(policy, 'egress').includes(port)),
  'Structured NetworkPolicy baseline must preserve LiteLLM provider and PostgreSQL egress',
);
assertNetworkPolicy(
  'kubeclaw-registry-mirror-egress',
  (policy) => policyHasPodSelector(policy, { app: 'registry-mirror' })
    && [80, 443].every((port) => policyPorts(policy, 'egress').includes(port)),
  'Structured NetworkPolicy baseline must preserve registry-mirror upstream egress',
);
assertIncludes(localInfraKubeconformSummary, 'Invalid: 0', 'Local infra manifest kubeconform summary must report no invalid resources');
assertIncludes(localInfraKubeconformSummary, 'Errors: 0', 'Local infra manifest kubeconform summary must report no schema errors');

assertIncludes(rendered, 'kind: Service', 'Helm render must include a Service');
assertIncludes(rendered, 'name: agent-nova', 'Helm render must target the Nova release');
assertIncludes(rendered, 'type: ClusterIP', 'Rendered Nova gateway Service must be cluster-internal by default');
assert.equal(rendered.includes('nodePort: 30073'), false, 'Rendered Nova gateway must not expose a NodePort');
assertIncludes(rendered, 'name: agent-nova-prism-preview', 'Rendered Nova preview must use a dedicated preview Service');
assertIncludes(rendered, 'nodePort: 30456', 'Rendered Nova preview must preserve the temporary Prism preview NodePort');
assertIncludes(rendered, 'kind: Deployment', 'Helm render must include a Deployment');
assertIncludes(rendered, 'cp -r /app/skills/. /skills-merged/', 'Rendered init container must prepare the durable empty image skills baseline before the code bundle overlay');
assertIncludes(rendered, 'codeBundle.enabled=true but CODE_BUNDLE_ARCHIVE_URL is empty', 'Rendered init container must fail closed when code bundles are enabled without a resolved archive URL');
assertIncludes(rendered, 'bundle manifest accepted', 'Rendered init container must validate and log accepted code bundle manifests');
assertIncludes(rendered, 'value: "/runtime-config/code-bundle-manifest.json"', 'Rendered deployment must expose the code bundle manifest path to runtime containers');
assertIncludes(rendered, 'cp -r /init-skills/. /skills-merged/', 'Rendered init container must overlay custom skills after code bundle skills');
assertIncludes(rendered, 'customSkills may not override protected runtime skill path', 'Rendered init container must block custom skill overlays from replacing core runtime paths');
assertIncludes(rendered, 'pipeline|pipeline/*|pipeline.ts|common|common/*|nova/pipeline|nova/pipeline/*|buster/pipeline|buster/pipeline/*|redis.ts|buster-pipeline.ts|verify-task.ts', 'Rendered init container must keep the protected runtime skill denylist');
assertIncludes(rendered, 'mountPath: /app/skills', 'Rendered pod must mount the merged skills directory into /app/skills');
assertIncludes(rendered, 'value: "/home/node/.openclaw/swarm.config.json"', 'Rendered deployment must pin SWARM_CONFIG to the runtime config path');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw', 'Rendered deployment must mount the runtime config surface at /home/node/.openclaw');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw-persisted', 'Rendered deployment must keep the retained config PVC available as persistent source config');
assertIncludes(rendered, 'mountPath: /runtime-config', 'Rendered init container must mount the runtime config emptyDir');
assert.equal(rendered.includes('mountPath: /home/node/.openclaw/openclaw.json'), false, 'Rendered deployment must not overlay openclaw.json over the writable persistent home');
assert.equal(rendered.includes('subPath: openclaw.json'), false, 'Rendered deployment must not mount openclaw.json through subPath');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw/swarm.config.json', 'Rendered deployment must overlay runtime swarm.config.json onto the normal config path');
assertIncludes(rendered, 'subPath: swarm.config.json', 'Rendered deployment must mount only the runtime swarm.config.json file over the persistent source');
assertIncludes(rendered, 'emptyDir: {}', 'Rendered deployment must include emptyDir-backed runtime config storage');
assert.equal(rendered.includes('mountPath: /app/config'), false, 'Rendered deployment must not mount the stale /app/config runtime config path');
assert.equal(rendered.includes('sed -i "s|__LITELLM_API_KEY__|'), false, 'Rendered init container must not substitute secrets into the retained config PVC with sed');
assert.equal(rendered.includes('sed -i "s|__DISCORD_TOKEN__|'), false, 'Rendered init container must not substitute Discord tokens into the retained config PVC with sed');
assertIncludes(rendered, 'openclaw.json source refreshed managed SecretRefs and safe migrations', 'Rendered init container must refresh managed SecretRefs without stomping mutable runtime settings');
assertIncludes(rendered, '.kubeclaw-plugin-cache-version', 'Rendered init container must compare a baked plugin-cache version stamp');
assertIncludes(rendered, 'OpenClaw external plugin cache already current; skipping reseed', 'Rendered init container must skip plugin cache reseeding when the baked cache is unchanged');
assertIncludes(rendered, 'Merged OpenClaw plugin entries from image cache into persistent config', 'Rendered init container must merge baked plugin entries into persistent openclaw.json during reseed');
assertIncludes(rendered, 'Seeded OpenClaw external plugins from image cache', 'Rendered init container must still seed configured external plugins when the baked cache changes');
assertIncludes(rendered, 'ensure_official_plugin acpx @openclaw/acpx', 'Rendered init container must self-heal missing ACPX installs before gateway startup');
assertIncludes(rendered, 'ensure_official_plugin discord @openclaw/discord', 'Rendered init container must self-heal missing Discord installs before gateway startup');
assertIncludes(rendered, 'openclaw plugins install "$package_name"', 'Rendered init container must use the official plugin installer for missing required plugins');
assertIncludes(rendered, 'swarm.config.json rendered into runtime config', 'Rendered init container must render webhook-expanded swarm.config.json only into runtime config');
assertIncludes(rendered, 'swarm.config.json written from chart source', 'Rendered init container must overwrite persisted swarm.config.json from chart source');
assertIncludes(rendered, 'delete config.discord_webhook_url', 'Rendered init container must remove webhook secrets from persistent swarm.config.json');
assertIncludes(rendered, 'swarm.config.json source normalized without runtime webhook secrets', 'Rendered init container must normalize persisted swarm.config.json source');
assertIncludes(rendered, 'kubeclaw-health.mjs', 'Rendered init container must generate the reusable agent health script');
assertIncludes(rendered, 'kubeclaw-startup-doctor.sh', 'Rendered init container must generate the startup doctor helper');
assertIncludes(rendered, 'startup doctor waiting for gateway health', 'Rendered startup doctor must wait for the gateway before running');
assertIncludes(rendered, 'HOME="/home/node"', 'Rendered startup doctor must run directly against the persistent OpenClaw home');
assertIncludes(rendered, 'doctor --fix --non-interactive', 'Rendered startup doctor must run OpenClaw doctor with fixes enabled');
assert.equal(rendered.includes('synced repaired openclaw.json back to persistent and runtime config'), false, 'Rendered startup doctor must not sync a staged config copy back into place');
assertIncludes(rendered, '/home/node/.openclaw/logs/startup-doctor.log', 'Rendered startup doctor must write a persistent diagnostic log');
assertIncludes(rendered, 'function checkDrainState()', 'Rendered health script must include drain-aware readiness');
assertIncludes(rendered, 'function checkStartupVerificationStatus()', 'Rendered health script must expose persisted startup verification status checks');
assertIncludes(rendered, 'function checkCodeBundle()', 'Rendered health script must validate the selected code bundle when enabled');
assertIncludes(rendered, "await check('code bundle', checkCodeBundle)", 'Rendered readiness must validate bundle manifest state before accepting the pod');
assertIncludes(rendered, "await check('drain state', checkDrainState)", 'Rendered readiness must fail when the container is draining');
assertIncludes(rendered, "await check('startup verification status', checkStartupVerificationStatus)", 'Rendered readiness must require a successful startup verification marker');
assertIncludes(rendered, '/home/node/.openclaw/logs/startup-verification.json', 'Rendered health env must expose the persistent startup verification status path');
assertIncludes(rendered, '/home/node/.openclaw/logs/startup-verification.jsonl', 'Rendered health env must expose the persistent startup verification event log path');
assertIncludes(rendered, 'mode === \'startup-status\'', 'Rendered health script must support explicit startup status inspection for smoke checks');
assertIncludes(rendered, "redis.xadd(stream, 'MAXLEN'", 'Rendered health script must write a Redis stream smoke entry');
assertIncludes(rendered, 'registry-local.kubeclaw.svc.cluster.local:5001', 'Rendered health env must include registry-local reachability checks');
assertIncludes(rendered, 'registry-mirror.kubeclaw.svc.cluster.local:5000', 'Rendered health env must include registry-mirror reachability checks');
assertIncludes(rendered, 'name: KUBECLAW_LOCAL_REGISTRY', 'Rendered agent env must expose the writable local registry as deployment infrastructure');
assertIncludes(rendered, 'value: "registry-local.kubeclaw.svc.cluster.local:5001"', 'Rendered local registry env must use the deployment-owned registry endpoint');
assert.equal(deploymentTemplate.includes('runtimeInfrastructure.localRegistry | default'), false, 'Deployment template must not duplicate local registry defaults after values.yaml owns the deployment authority');
assertIncludes(rendered, 'KUBECLAW_HEALTH_CHECK_LITELLM', 'Rendered health env must expose optional LiteLLM readiness checks');
assertIncludes(rendered, 'KUBECLAW_HEALTH_CHECK_QDRANT', 'Rendered health env must expose optional Qdrant readiness checks');
assertIncludes(rendered, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Rendered init container must keep swarm.config.json source on the retained config PVC');
assertIncludes(rendered, 'cp -Lf /config/.semgrep.yml /runtime-config/.semgrep.yml', 'Rendered init container must copy .semgrep.yml into runtime config');
assertIncludes(renderedBuster, 'kind: Service', 'Buster Helm render must include a Service');
assertIncludes(renderedBuster, 'name: agent-buster', 'Buster Helm render must target the Buster release');
assertIncludes(renderedBuster, 'type: ClusterIP', 'Rendered Buster gateway Service must be cluster-internal by default');
assert.equal(renderedBuster.includes('nodePort: 30074'), false, 'Rendered Buster gateway must not expose a NodePort');
assertIncludes(renderedBuster, 'kind: Deployment', 'Buster Helm render must include a Deployment');
assertIncludes(renderedBuster, 'image: "ghcr.io/datrab/kubeclaw-buster-gateway:latest"', 'Buster gateway must render its dedicated minimal OpenClaw image');
assertIncludes(renderedBuster, 'image: "ghcr.io/datrab/kubeclaw-buster-pipeline:latest"', 'Buster worker must render its dedicated pipeline image');
assertIncludes(renderedBuster, 'name: kubeclaw', 'Buster deployment must render the OpenClaw gateway container');
assertIncludes(renderedBuster, 'name: buster-pipeline', 'Buster deployment must render the Buster pipeline worker container separately');
assertIncludes(renderedBuster, 'value: "gateway"', 'Buster gateway container must expose its health role explicitly');
assertIncludes(renderedBuster, 'value: "buster-pipeline"', 'Buster pipeline container must expose its health role explicitly');
assertIncludes(renderedBuster, 'name: KUBECLAW_CODE_BUNDLE_ENABLED', 'Buster deployment must expose code bundle state to both runtime containers');
assertIncludes(renderedBuster, '- /app/openclaw.mjs', 'Buster gateway container must start OpenClaw gateway directly');
assertIncludes(busterPipelineDockerfile, 'buster-pipeline-entrypoint', 'Buster pipeline image must use its dedicated worker entrypoint');
assertIncludes(busterPipelineDockerfile, 'npm install --prefix /app', 'Buster pipeline image must install Node dependencies where mounted ESM skills can resolve them');
assertIncludes(busterPipelineDockerfile, 'setcap cap_setuid=ep /usr/bin/newuidmap', 'Buster pipeline image must grant newuidmap its exact Debian file capability');
assertIncludes(busterPipelineDockerfile, 'setcap cap_setgid=ep /usr/bin/newgidmap', 'Buster pipeline image must grant newgidmap its exact Debian file capability');
assertIncludes(busterPipelineDockerfile, "getcap /usr/bin/newuidmap | grep -Fx '/usr/bin/newuidmap cap_setuid=ep'", 'Buster pipeline image build must verify the newuidmap capability');
assertIncludes(busterPipelineDockerfile, "getcap /usr/bin/newgidmap | grep -Fx '/usr/bin/newgidmap cap_setgid=ep'", 'Buster pipeline image build must verify the newgidmap capability');
assertIncludes(busterPipelineEntrypoint, 'kernel.apparmor_restrict_unprivileged_userns=1', 'Buster pipeline entrypoint must diagnose the Ubuntu rootless-user-namespace host policy explicitly');
assertIncludes(busterPipelineEntrypoint, '--net=host', 'Buster rootless worker must reuse the pod network namespace so it can reach colocated gateway services without a TUN device');
assert.equal(busterPipelineEntrypoint.includes('slirp4netns'), false, 'Buster rootless worker must not create a nested TAP network inside Kubernetes');
assert.equal(busterPipelineDockerfile.includes('slirp4netns'), false, 'Buster pipeline image must not retain the obsolete nested-network dependency');
assertIncludes(busterPipelineEntrypoint, '--otel-socket-path "$otel_socket"', 'Buster pipeline must place BuildKit\'s OTEL trace socket in its writable rootless runtime directory');
assertIncludes(deploymentTemplate, 'chown -R 0:1000 /workspace', 'Deployment init must assign the shared workspace group canonically');
assertIncludes(deploymentTemplate, 'chmod -R g+rwX /workspace', 'Deployment init must preserve shared workspace access across gateway and pipeline UIDs');
assertIncludes(deploymentTemplate, 'find /workspace -type d -exec chmod g+s {} +', 'Deployment init must keep inherited workspace group ownership on new directories');
assertIncludes(postStartCommand(novaGatewayContainerObject), '/runtime-config/kubeclaw-startup-doctor.sh', 'Nova gateway postStart must run the startup doctor helper');
assertIncludes(postStartCommand(busterGatewayContainerObject), '/runtime-config/kubeclaw-startup-doctor.sh', 'Buster gateway postStart must run the startup doctor helper');
assert.equal(postStartCommand(busterPipelineContainerObject), '', 'Buster pipeline worker must not run OpenClaw doctor');
assert.equal(renderedBuster.includes('wait -n'), false, 'Buster deployment must not couple gateway and worker through shell wait supervision');
assert.equal(renderedBuster.includes('BUSTER_PIPELINE_PID'), false, 'Buster deployment must remove the old shell-supervised worker PID path');
assertIncludes(renderedBuster, 'name: OPENCLAW_GATEWAY_URL', 'Buster deployment must expose the colocated gateway URL to the Buster startup process');
assertIncludes(renderedBuster, 'value: "http://127.0.0.1:18789"', 'Buster deployment must point Buster startup checks at the colocated gateway port');
assertIncludes(renderedBuster, 'name: REPO_ROOT', 'Buster deployment must pass the mounted checkout path to runtime processes');
assert.equal(envValue(busterGatewayContainerObject, 'REPO_ROOT'), '/home/node/.openclaw/workspace/git-repo', 'Buster gateway must keep OpenClaw workspace authority at its canonical path');
assert.equal(envValue(busterPipelineContainerObject, 'REPO_ROOT'), '/workspace/git-repo', 'Buster pipeline must use its isolated workspace path');
assertIncludes(renderedBuster, 'mountPath: /home/node/.openclaw/workspace', 'Buster gateway must mount the OpenClaw workspace at its canonical path');
assertIncludes(renderedBuster, 'mountPath: /workspace', 'Buster pipeline must mount the same PVC outside the gateway-owned OpenClaw home');
assert.equal(renderedBuster.includes('mountPath: /home/node/.openclaw/openclaw.json'), false, 'Buster containers must keep openclaw.json as the writable persistent file');
assert.equal(envValue(busterGatewayContainerObject, 'SWARM_CONFIG'), '/home/node/.openclaw/swarm.config.json', 'Buster gateway must consume runtime config at the OpenClaw-owned path');
assert.equal(envValue(busterPipelineContainerObject, 'SWARM_CONFIG'), '/home/builder/.openclaw/swarm.config.json', 'Buster pipeline must consume the same runtime config at its builder-owned path');
assertIncludes(renderedBuster, 'mountPath: /app/skills', 'Buster containers must share the merged skills runtime');
assertIncludes(renderedBuster, "await import('/app/skills/pipeline/platform-config.ts')", 'Buster readiness must expand compact swarm config before reading runtime policy');
assertIncludes(renderedBuster, 'config.buster.runtime.heartbeat_path is required', 'Buster readiness must use swarm.config.json as heartbeat path authority');
assert.equal(renderedBuster.includes('BUSTER_HEARTBEAT_PATH'), false, 'Buster deployment must not keep heartbeat path env fallback after swarm config owns it');
assert.equal(renderedBuster.includes('BUSTER_HEARTBEAT_INTERVAL_MS'), false, 'Buster deployment must not keep obsolete heartbeat interval env fallback');
assertIncludes(renderedBuster, 'KUBECLAW_HEALTH_CHECK_BUSTER_HEARTBEAT', 'Buster deployment must enable Buster heartbeat readiness checks');
assertIncludes(renderedBusterGatewayUrlOverride, 'value: "http://agent-buster.kubeclaw.svc.cluster.local:18789"', 'Buster deployment must honor gateway.url when explicitly configured');
assertIncludes(renderedBuster, 'shareProcessNamespace: false', 'Buster pipeline must reach gateway tools over pod networking without cross-container process visibility');
assert.equal(renderedBusterDeployment.includes('privileged: true'), false, 'Buster deployment must contain no privileged container');
assert.equal(renderedBusterDeployment.includes('mountPath: /var/lib/containers'), false, 'Buster deployment must contain no container-runtime storage mount');
assertIncludes(renderedBusterDeployment, 'ghcr.io/datrab/kubeclaw-buster-pipeline:latest', 'Buster pipeline must use its dedicated image');
assertIncludes(renderedBusterDeployment, 'mountPath: /home/builder/.local/share/buildkit', 'Buster pipeline must mount bounded rootless BuildKit state');
assertIncludes(renderedBusterDeployment, 'sizeLimit: 50Gi', 'Buster pipeline must receive bounded BuildKit storage sized for production image builds');
assert.equal(busterPipelineContainerObject.resources?.requests?.cpu, '2', 'Buster pipeline must reserve two CPUs for image builds');
assert.equal(busterPipelineContainerObject.resources?.requests?.memory, '8Gi', 'Buster pipeline must reserve eight GiB for image builds');
assert.equal(busterPipelineContainerObject.resources?.limits?.cpu, '8', 'Buster pipeline must permit bounded build parallelism');
assert.equal(busterPipelineContainerObject.resources?.limits?.memory, '24Gi', 'Buster pipeline must have a bounded production build memory ceiling');
assert.equal(busterPipelineContainerObject.resources?.limits?.['ephemeral-storage'], '60Gi', 'Buster pipeline must bound total ephemeral build storage');
assertIncludes(renderedBusterDeployment, 'BUILDKIT_HOST', 'Buster pipeline must expose the local BuildKit socket authority');
assertIncludes(renderedBusterDeployment, 'buildctl --addr "$BUILDKIT_HOST" debug workers', 'Buster pipeline probes must verify the BuildKit worker');
assertIncludes(renderedBuster, 'name: KUBECLAW_LOCAL_REGISTRY', 'Buster runtime must receive local registry coordinates through deployment env');
assertIncludes(registryLocalManifest, 'type: ClusterIP', 'registry-local must stay cluster-internal by default');
assert.equal(registryLocalManifest.includes('nodePort: 30051'), false, 'registry-local must not expose its writable registry through NodePort');
assertIncludes(litellmManifest, 'nodePort: 30050', 'LiteLLM must preserve its temporary operator NodePort');
assertMatchCountAtLeast(networkPolicies, 'kind: NetworkPolicy', 13, 'Network policy manifest must define the full namespace policy baseline');
assertIncludes(networkPolicies, 'name: kubeclaw-default-deny', 'Network policies must include namespace default-deny ingress and egress');
assertIncludes(networkPolicies, 'name: kubeclaw-allow-dns-egress', 'Network policies must keep DNS egress available');
assertIncludes(networkPolicies, 'name: kubeclaw-agents-egress', 'Network policies must keep agent web/Git/service egress available');
assertIncludes(networkPolicies, 'name: kubeclaw-litellm-egress', 'Network policies must keep LiteLLM provider and PostgreSQL egress available');
assertIncludes(networkPolicies, 'name: kubeclaw-registry-mirror-egress', 'Network policies must keep registry-mirror upstream egress available');
assertIncludes(networkPolicies, 'name: kubeclaw-redis-ingress', 'Network policies must restrict Redis ingress to expected clients');
assertIncludes(networkPolicies, 'name: kubeclaw-clawdeck-redis-egress', 'Network policies must allow Clawdeck Redis egress explicitly');
assertIncludes(networkPolicies, 'name: kubeclaw-postgresql-ingress', 'Network policies must restrict PostgreSQL ingress to LiteLLM');
assertIncludes(networkPolicies, 'name: kubeclaw-qdrant-ingress', 'Network policies must restrict Qdrant ingress to agents');
assertIncludes(networkPolicies, 'name: kubeclaw-registry-local-ingress', 'Network policies must keep registry-local cluster-internal');
assertIncludes(networkPolicies, 'port: 22', 'Agent egress must preserve Git SSH access');
assertIncludes(networkPolicies, 'port: 18789', 'Agent egress must preserve OpenClaw gateway access to Buster');
assertIncludes(networkPolicies, 'port: 18790', 'Agent egress must preserve OpenClaw bridge access to Buster');
assertIncludes(networkPolicies, 'port: 443', 'Agent, LiteLLM, and registry-mirror egress must preserve HTTPS access');
assertIncludes(renderedBuster, 'name: openclaw-shared-secrets, key: gatewayToken-buster', 'Buster gateway must use the Buster gateway token secret key');
assertIncludes(renderedBuster, 'name: redis-secrets', 'Buster deployment must keep Redis secret wiring');
assertIncludes(renderedBuster, 'key: redis-password', 'Buster deployment must keep Redis password secret key wiring');
assertIncludes(renderedBuster, 'name: CLAUDE_CODE_OAUTH_TOKEN', 'Buster deployment must expose the Anthropic/Claude credential env surface used by current runtime scripts');
assertIncludes(renderedBuster, 'name: ANTHROPIC_API_KEY', 'Buster deployment must expose the Anthropic API credential env surface used by current runtime scripts');
assertIncludes(renderedBuster, 'kind: CustomResourceDefinition', 'Buster broker render must include the BusterNamespaceLease CRD');
assertIncludes(renderedBuster, 'kind: BusterNamespaceLease', 'Buster broker CRD must define BusterNamespaceLease');
assertIncludes(renderedBuster, 'name: agent-buster-namespace-controller', 'Buster broker render must include the namespace controller');
assertIncludes(renderedBuster, 'previewUrl:', 'Buster broker CRD must expose final-preview URL status');
assertIncludes(renderedBuster, 'exposure:', 'Buster broker CRD must expose declarative preview exposure spec');
assertIncludes(renderedBuster, 'ingresses', 'Buster namespace controller RBAC must support Tailscale final-preview ingress creation');
assertIncludes(renderedBuster, 'busternamespaceleases', 'Buster broker RBAC must grant lease access instead of direct namespace control');
assertIncludes(renderedBuster, 'name: agent-buster-namespace-lease-client', 'Buster ServiceAccount must only receive lease-client RBAC in broker mode');
assert.equal(
  renderedBuster.includes('name: agent-buster-k8s-tester'),
  false,
  'Buster broker mode must not render the legacy broad k8s tester ClusterRole',
);
assert.equal(
  renderedBuster.includes('pods/exec'),
  false,
  'Buster broker mode must not grant pods/exec to the agent runtime',
);
assertIncludes(
  rbacSandboxDocs,
  'Broker Mode Buster Agent RBAC',
  'RBAC docs must describe broker-mode Buster agent RBAC separately',
);
assertIncludes(
  rbacSandboxDocs,
  'the chart renders `ServiceAccount/agent-buster` with a namespace-local lease-client Role',
  'RBAC docs must describe the production Buster agent as lease-client only in broker mode',
);
assertIncludes(
  rbacSandboxDocs,
  'Review this controller as the higher-authority Kubernetes component in broker-mode deployments',
  'RBAC docs must distinguish namespace-controller authority from Buster agent authority',
);
assertIncludes(
  rbacSandboxDocs,
  'Broker Required For Kubernetes Suites',
  'RBAC docs must require broker mode for Kubernetes suites',
);
assertIncludes(
  rbacSandboxDocs,
  'the chart does not render Kubernetes tester RBAC',
  'RBAC docs must document that broker-disabled Buster gets no broad Kubernetes tester RBAC',
);
assert.equal(
  rbacSandboxDocs.includes('legacy fallback ClusterRole'),
  false,
  'RBAC docs must not document the removed broad tester fallback',
);
assert.equal(
  rbacSandboxDocs.includes('production Buster renders `ClusterRole/agent-buster-k8s-tester`'),
  false,
  'RBAC docs must not claim production broker-mode Buster renders the legacy broad tester ClusterRole',
);
assert.equal(
  rbacSandboxDocs.includes('production Buster renders a broad `pods/exec`'),
  false,
  'RBAC docs must not claim production broker-mode Buster renders broad pods/exec RBAC',
);
assert.equal(
  JSON.stringify(renderedBusterGatewayConfig.plugins?.load || {}).includes('/app/openclaw-plugins/kubeclaw-agent-observer'),
  false,
  'Rendered Buster gateway config must not preserve the obsolete observer plugin load path',
);
assert.equal(
  JSON.stringify(renderedBusterGatewayConfig).includes('openai-codex'),
  false,
  'Rendered Buster gateway config must use canonical OpenAI refs instead of legacy openai-codex refs',
);
assert.deepEqual(
  renderedBusterGatewayConfig.agents?.defaults?.models?.['openai/gpt-5.5']?.agentRuntime,
  { id: 'codex' },
  'Rendered Buster gateway config must keep Codex auth routing on canonical GPT 5.5 model refs',
);
assert.equal(
  renderedBusterGatewayConfig.agents?.defaults?.model?.primary,
  'openai/gpt-5.5',
  'Rendered Buster gateway config must default to GPT 5.5',
);
assert.equal(
  renderedBusterGatewayConfig.agents?.defaults?.thinkingDefault,
  'off',
  'Rendered Buster gateway config must default reasoning/thinking off',
);
assert.deepEqual(
  renderedBusterGatewayConfig.plugins?.entries?.['kubeclaw-agent-observer']?.hooks,
  { allowConversationAccess: true },
  'Rendered Buster gateway config must grant observer hook conversation access',
);
assert.equal(
  renderedBusterGatewayConfig.plugins?.entries?.['kubeclaw-agent-observer']?.enabled,
  true,
  'Rendered Buster gateway config must keep the gateway-owned observer plugin permanently enabled',
);
assert.equal(
  renderedSwarmConfigJson?.profile,
  'standard',
  'Rendered swarm.config.json must use the standard profile as the strict runtime baseline',
);
assert.deepEqual(
  renderedSwarmConfigJson?.features,
  { observability: true, buster: true, discord_alerts: true },
  'Rendered compact swarm.config.json must enable the standard feature set',
);
assert.deepEqual(
  renderedSwarmConfigJson?.tuning,
  {
    safety_margins: 'high',
    retention: 'high',
    alerts: 'rich',
    logs: 'verbose',
    checks: 'strict',
    determinism: 'strict',
  },
  'Rendered compact swarm.config.json must request the strict standard tuning set',
);
assert.deepEqual(
  renderedBusterGatewayConfig.models?.providers?.litellm?.apiKey,
  { source: 'env', provider: 'default', id: 'LITELLM_API_KEY' },
  'Rendered Buster gateway config must use a SecretRef for the LiteLLM API key',
);
assert.deepEqual(
  renderedBusterGatewayConfig.agents?.defaults?.memorySearch?.remote?.apiKey,
  { source: 'env', provider: 'default', id: 'LITELLM_API_KEY' },
  'Rendered Buster gateway config must use a SecretRef for memory search API key',
);
assert.deepEqual(
  renderedBusterGatewayConfig.channels?.discord?.token,
  { source: 'env', provider: 'default', id: 'DISCORD_TOKEN' },
  'Rendered Buster gateway config must use a SecretRef for the Discord token',
);
assert.deepEqual(
  renderedBusterGatewayConfig.commands?.ownerAllowFrom,
  ['discord:849379821536804864'],
  'Rendered Buster gateway config must configure the OpenClaw command owner',
);
assert.equal(
  renderedBusterGatewayConfig.plugins?.entries?.litellm?.enabled,
  true,
  'Rendered Buster gateway config must explicitly enable the LiteLLM plugin',
);
assertIncludes(renderedBuster, 'removed obsolete kubeclaw-agent-observer plugin load path', 'Rendered init container must migrate existing PVC openclaw.json away from the obsolete observer plugin path');
assert.equal(
  renderedBuster.includes('\n        - name: stream-processor'),
  false,
  'Buster deployment must not render the legacy stream-processor sidecar',
);
assert.equal(
  renderedBuster.includes('agent-buster-processor'),
  false,
  'Buster render must not include the removed processor ConfigMap or volume reference',
);
assert.equal(
  deploymentTemplate.includes('.Values.processor'),
  false,
  'Deployment template must not retain the removed processor values gate',
);
assert.equal(
  fs.existsSync(processorConfigTemplatePath),
  false,
  'Chart must not retain the removed processor ConfigMap template',
);
assert.equal(
  [chartValues, novaValues, busterValues].some((source) => source.includes('processor:') || source.includes('processor.enabled')),
  false,
  'Chart and production values must not retain processor configuration',
);
assertIncludes(chartValues, 'codeBundle:', 'Chart defaults must define the code bundle surface');
assertIncludes(chartValues, 'archiveUrl: ""', 'Chart defaults must keep code bundle archive URL explicit');
assertIncludes(novaValues, 'codeBundle:', 'Nova production values must expose the code bundle surface');
assertIncludes(busterValues, 'codeBundle:', 'Buster production values must expose the code bundle surface');
assertIncludes(deploymentTemplate, 'cp -r /app/skills/. /skills-merged/', 'Deployment template must retain the durable empty image skills baseline step');
assertIncludes(deploymentTemplate, 'Code bundles own the final /app/skills runtime tree.', 'Deployment template must document that fast-changing skills come from code bundles');
assertIncludes(deploymentTemplate, 'rm -f /runtime-config/code-bundle-manifest.json', 'Deployment template must clear stale bundle manifest state on each init');
assertIncludes(deploymentTemplate, 'CODE_BUNDLE_ARCHIVE_URL', 'Deployment template must expose a resolved bundle archive URL to init');
assertIncludes(deploymentTemplate, 'CODE_BUNDLE_AUTH_TOKEN', 'Deployment template must support authenticated bundle downloads');
assertIncludes(deploymentTemplate, 'Readable.fromWeb(response.body)', 'Deployment template bundle downloader must stream archives instead of buffering them in memory');
assertIncludes(deploymentTemplate, "bundle must contain a top-level skills/ directory", 'Deployment template must require the bundle skills payload explicitly');
assertIncludes(deploymentTemplate, 'bundle manifest accepted', 'Deployment template must log accepted bundle metadata');
assertIncludes(deploymentTemplate, 'cp -r /init-skills/. /skills-merged/', 'Deployment template must retain the custom-skill overlay step');
assertIncludes(deploymentTemplate, 'protected_skill_overlay() {', 'Deployment template must guard protected runtime paths before custom-skill overlay');
assertIncludes(deploymentTemplate, 'customSkills may not override protected runtime skill path', 'Deployment template must fail closed when custom skills target core runtime paths');
assertIncludes(deploymentTemplate, 'value: "/home/node/.openclaw/swarm.config.json"', 'Deployment template must pin SWARM_CONFIG to the runtime config target');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw', 'Deployment template must mount the runtime config target');
assertIncludes(deploymentTemplate, 'startupProbe:', 'Deployment template must use a startupProbe for slow first boot');
assertIncludes(deploymentTemplate, 'readinessProbe:', 'Deployment template must use a readinessProbe for dependency-aware readiness');
assertIncludes(deploymentTemplate, 'livenessProbe:', 'Deployment template must use a conservative livenessProbe');
assertIncludes(deploymentTemplate, '- /runtime-config/kubeclaw-health.mjs', 'Deployment template probes must execute the generated health script');
assertIncludes(deploymentTemplate, 'terminationGracePeriodSeconds: {{ .Values.shutdown.terminationGracePeriodSeconds | default 180 }}', 'Deployment template must render a configurable shutdown grace budget');
assertIncludes(deploymentTemplate, 'function checkDrainState()', 'Deployment template health script must include drain-aware readiness');
assertIncludes(deploymentTemplate, 'function checkStartupVerificationStatus()', 'Deployment template health script must include persisted startup verification checks');
assertIncludes(deploymentTemplate, 'function checkCodeBundle()', 'Deployment template health script must include bundle validation');
assertIncludes(deploymentTemplate, "if (mode !== 'readiness') return;", 'Deployment template drain checks must affect readiness only');
assertIncludes(deploymentTemplate, "await check('code bundle', checkCodeBundle)", 'Deployment template readiness must validate bundle state before succeeding');
assertIncludes(deploymentTemplate, "await check('drain state', checkDrainState)", 'Deployment template readiness checks must fail while the container is draining');
assertIncludes(deploymentTemplate, "await check('startup verification status', checkStartupVerificationStatus)", 'Deployment template readiness must require the persisted startup verification marker');
assertIncludes(deploymentTemplate, 'date -Iseconds > "$DRAIN_FILE"', 'Deployment template preStop hook must create the drain marker');
assertIncludes(deploymentTemplate, 'sleep "${KUBECLAW_PRESTOP_DRAIN_SECONDS:-5}"', 'Deployment template preStop hook must give readiness a short drain handoff');
assert.equal(deploymentTemplate.includes('tcpSocket:'), false, 'Deployment template must not use TCP-only probes');
assert.equal(deploymentTemplate.includes("if (containerRole === 'buster-pipeline')"), false, 'Deployment liveness must not restart Buster pipeline solely on heartbeat age');
assertIncludes(deploymentTemplate, "containerRole !== 'buster-pipeline'", 'Deployment liveness must keep Buster pipeline liveness local-only');
assert.equal(deploymentTemplate.includes('git pull origin main || echo'), false, 'Deployment init must not swallow git pull failures');
assertIncludes(deploymentTemplate, 'git clone "$GIT_REPO_URL" "$REPO_DIR"', 'Deployment init must fail closed on first clone failure');
assertIncludes(deploymentTemplate, 'git config --global --add safe.directory "$REPO_DIR"', 'Deployment init must trust the exact persisted checkout after its UID ownership handoff');
assertOrdered(deploymentTemplate, 'git config --global --add safe.directory "$REPO_DIR"', 'git diff --quiet && git diff --cached --quiet', 'Deployment init must trust the persisted checkout before inspecting it');
assertIncludes(deploymentTemplate, 'git diff --quiet && git diff --cached --quiet', 'Deployment init must preserve existing workspace local edits');
assertIncludes(deploymentTemplate, 'git fetch origin main', 'Deployment init must fetch before non-destructive workspace sync');
assertIncludes(deploymentTemplate, 'git merge --ff-only origin/main', 'Deployment init must only fast-forward clean existing workspaces');
assertIncludes(deploymentTemplate, 'Repository diverged from origin/main. Skipping pull to preserve local state.', 'Deployment init must preserve diverged existing workspaces');
assert.equal(deploymentTemplate.includes('Repository diverged from origin/main; refusing unsafe init merge.'), false, 'Deployment init must not fail on diverged existing workspaces');
assertIncludes(deploymentTemplate, 'Git fetch failed; keeping existing workspace checkout.', 'Deployment init must make stale existing workspace startup explicit');
assertIncludes(deploymentTemplate, "redis.xadd(stream, 'MAXLEN'", 'Deployment template health script must write a Redis stream smoke entry');
assertIncludes(deploymentTemplate, 'checkRegistries', 'Deployment template health script must check configured registries');
assertIncludes(deploymentTemplate, 'checkLiteLLM', 'Deployment template health script must check LiteLLM when enabled');
assertIncludes(deploymentTemplate, 'checkQdrant', 'Deployment template health script must check Qdrant when enabled');
assertIncludes(deploymentTemplate, 'checkBusterHeartbeat', 'Deployment template health script must check Buster heartbeat when enabled');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw-persisted', 'Deployment template must expose the retained config PVC separately from runtime config');
assertIncludes(deploymentTemplate, 'mountPath: /runtime-config', 'Deployment template must mount runtime config into the init container');
assert.equal(deploymentTemplate.includes('mountPath: /home/node/.openclaw/openclaw.json'), false, 'Deployment template must not overlay openclaw.json onto the writable persistent home');
assert.equal(deploymentTemplate.includes('subPath: openclaw.json'), false, 'Deployment template must not mount openclaw.json through subPath');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw/swarm.config.json', 'Deployment template must overlay runtime swarm.config.json onto the normal config path');
assertIncludes(deploymentTemplate, 'subPath: swarm.config.json', 'Deployment template must mount only the runtime swarm.config.json file over the persistent source');
assertIncludes(deploymentTemplate, 'openclaw.json source refreshed managed SecretRefs and safe migrations', 'Deployment template must refresh managed SecretRefs without stomping mutable runtime settings');
assertIncludes(deploymentTemplate, '.kubeclaw-plugin-cache-version', 'Deployment template must compare a baked plugin-cache version stamp');
assertIncludes(deploymentTemplate, 'OpenClaw external plugin cache already current; skipping reseed', 'Deployment template must skip plugin cache reseeding when the baked cache is unchanged');
assertIncludes(deploymentTemplate, 'Merged OpenClaw plugin entries from image cache into persistent config', 'Deployment template must merge baked plugin entries into persistent openclaw.json during reseed');
assertIncludes(deploymentTemplate, 'Seeded OpenClaw external plugins from image cache', 'Deployment template must still seed configured external plugins from the baked image cache when needed');
assertIncludes(deploymentTemplate, 'ensure_official_plugin acpx @openclaw/acpx', 'Deployment template must self-heal missing ACPX installs before gateway startup');
assertIncludes(deploymentTemplate, 'ensure_official_plugin discord @openclaw/discord', 'Deployment template must self-heal missing Discord installs before gateway startup');
assertIncludes(deploymentTemplate, 'openclaw plugins registry --refresh', 'Deployment template must refresh the persisted plugin registry from the baked cache before gateway startup');
assertIncludes(deploymentTemplate, 'Refreshed persisted OpenClaw plugin registry before startup', 'Deployment template must log successful pre-start plugin registry refresh');
assertIncludes(deploymentTemplate, 'HOME="/home/node"', 'Deployment template startup doctor must run directly against the persistent OpenClaw home');
assert.equal(deploymentTemplate.includes('synced repaired openclaw.json back to persistent and runtime config'), false, 'Deployment template startup doctor must not sync a staged config copy back after doctor succeeds');
assertIncludes(deploymentTemplate, 'swarm.config.json rendered into runtime config', 'Deployment template must render swarm.config.json into emptyDir-backed runtime config');
assertIncludes(deploymentTemplate, 'swarm.config.json written from chart source', 'Deployment template must overwrite persisted swarm.config.json from chart source');
assertIncludes(deploymentTemplate, 'delete config.discord_webhook_url', 'Deployment template must remove webhook secrets from persistent swarm.config.json source');
assertIncludes(deploymentTemplate, 'swarm.config.json source normalized without runtime webhook secrets', 'Deployment template must normalize persisted swarm.config.json source');
assert.equal(deploymentTemplate.includes('sed -i "s|__LITELLM_API_KEY__|'), false, 'Deployment template must not substitute LiteLLM secrets into the retained config PVC');
assert.equal(deploymentTemplate.includes('sed -i "s|__DISCORD_TOKEN__|'), false, 'Deployment template must not substitute Discord secrets into the retained config PVC');
assert.equal(deploymentTemplate.includes('mountPath: /app/config'), false, 'Deployment template must not mount the stale /app/config runtime config path');
assertIncludes(deploymentTemplate, 'removed obsolete kubeclaw-agent-observer plugin load path', 'Deployment template must include the persistent openclaw.json observer plugin path migration');
assert.equal(gatewayConfigTemplate.includes('/app/openclaw-plugins/kubeclaw-agent-observer'), false, 'Gateway config template must not seed the obsolete observer plugin load path');
assertIncludes(deploymentTemplate, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Deployment template must copy chart swarm.config.json into the retained source config surface every init');
assertIncludes(deploymentTemplate, 'cp -Lf /config/.semgrep.yml /runtime-config/.semgrep.yml', 'Deployment template must copy .semgrep.yml into the runtime config surface');
assertIncludes(deploymentTemplate, 'cp -Lf /config/lint-policy.json /runtime-config/lint-policy.json', 'Deployment template must copy the canonical lint policy into the runtime config surface');
assertIncludes(deploymentTemplate, 'cp -Lf /config/.yamllint.yml /runtime-config/.yamllint.yml', 'Deployment template must copy the canonical Yamllint config into the runtime config surface');
assertIncludes(deploymentTemplate, 'cp -Lf /config/.tflint.hcl /runtime-config/.tflint.hcl', 'Deployment template must copy the canonical TFLint config into the runtime config surface');
assertIncludes(deploymentTemplate, 'for lint_config in knip.json jscpd.json jscpd-tests.json lint-baseline.json', 'Deployment template must copy canonical architecture, duplication, and baseline configs');
assertIncludes(deploymentTemplate, 'ln -sfnT /opt/kubeclaw-tools/node_modules /runtime-config/node_modules', 'Runtime ESLint config must replace stale paths and resolve its pinned parser from the general toolchain');
assertIncludes(deploymentTemplate, 'ln -sfnT /opt/kubeclaw-tools/node_modules /config/node_modules', 'Authoritative persistent ESLint config must replace stale paths and resolve its pinned parser from the general toolchain');
assertIncludes(deploymentTemplate, 'rm -rf /config/node_modules', 'Owned persistent ESLint module path must remove a stale real directory before linking the pinned toolchain');
assertIncludes(deploymentTemplate, 'rm -rf /runtime-config/node_modules', 'Owned runtime ESLint module path must remove stale state before linking the pinned toolchain');
assertIncludes(serviceTemplate, '.Values.service.extraPorts', 'Service template must continue rendering configured extra service ports');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/swarm.config.json"', 'Swarm config template must source swarm.config.json from the chart artifact by default');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/.semgrep.yml"', 'Swarm config template must source .semgrep.yml from the chart artifact by default');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/.yamllint.yml"', 'Swarm config template must source .yamllint.yml from the chart artifact');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/.tflint.hcl"', 'Swarm config template must source .tflint.hcl from the chart artifact');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/knip.json"', 'Swarm config template must source knip.json from the chart artifact');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/jscpd.json"', 'Swarm config template must source jscpd.json from the chart artifact');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/jscpd-tests.json"', 'Swarm config template must source jscpd-tests.json from the chart artifact');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/lint-baseline.json"', 'Swarm config template must source the lint baseline from the chart artifact');
assertIncludes(swarmConfigTemplate, '.Files.Get "files/config/lint-policy.json"', 'Swarm config template must source the canonical lint policy from the chart artifact');
assertIncludes(customSkillsConfigMapTemplate, 'code bundles to /app/skills', 'Custom skills ConfigMap comment must match the code-bundle runtime skills mount path');
assertIncludes(customSkillsConfigMapTemplate, 'extension-only', 'Custom skills ConfigMap comment must define customSkills as extension-only');
assertIncludes(customSkillsConfigMapTemplate, 'cannot be used as a compatibility patch path', 'Custom skills ConfigMap comment must forbid core runtime compatibility patching');
assert.equal(customSkillsConfigMapTemplate.includes('/app/skills-kubeclaw'), false, 'Custom skills ConfigMap comment must not point at the stale skills path');
assertIncludes(imageBuildWorkflow, 'docker/Dockerfile.general', 'Image-build workflow must build the general runtime image from docker/Dockerfile.general');
assertIncludes(imageBuildWorkflow, 'docker/Dockerfile.buster-gateway', 'Image-build workflow must build the dedicated Buster gateway image');
assertIncludes(imageBuildWorkflow, 'actions/checkout@v6', 'Image-build workflow must use the Node-24-compatible checkout action');
assertIncludes(imageBuildWorkflow, 'docker/setup-buildx-action@v4', 'Image-build workflow must use the Node-24-compatible Buildx setup action');
assertIncludes(imageBuildWorkflow, 'docker/login-action@v4', 'Image-build workflow must use the Node-24-compatible registry login action');
assertIncludes(imageBuildWorkflow, 'docker/metadata-action@v6', 'Image-build workflow must use the Node-24-compatible metadata action');
assertIncludes(imageBuildWorkflow, 'docker/build-push-action@v7', 'Image-build workflow must use the Node-24-compatible Docker build action');
assertIncludes(imageBuildWorkflow, 'cache-from: type=gha,scope=${{ matrix.name }}', 'Image-build workflow must isolate reusable cache by image');
assertIncludes(imageBuildWorkflow, 'cache-to: type=gha,scope=${{ matrix.name }},mode=min,ignore-error=true', 'Image cache export must remain a scoped best-effort optimization');
assertIncludes(imageBuildWorkflow, 'image_suffix: kubeclaw-general', 'Image-build workflow must publish the kubeclaw-general image');
assertIncludes(imageBuildWorkflow, 'image_suffix: kubeclaw-buster-gateway', 'Image-build workflow must publish the dedicated Buster gateway image');
assertIncludes(imageBuildWorkflow, 'docker/Dockerfile.namespace-controller', 'Image-build workflow must build the namespace controller image from docker/Dockerfile.namespace-controller');
assertIncludes(imageBuildWorkflow, 'image_suffix: kubeclaw-namespace-controller', 'Image-build workflow must publish the kubeclaw-namespace-controller image');
assertIncludes(imageBuildWorkflow, 'dorny/paths-filter@v3', 'Build workflow must detect image-affecting changes without suppressing bundle publication on unrelated pushes');
assertIncludes(imageBuildWorkflow, 'skills/common/plugins/openclaw-agent-observer/**', 'Build workflow change detection must include the baked observer plugin source');
assert.equal(imageBuildWorkflow.includes("- 'skills/**'"), false, 'Image-build workflow must not rebuild runtime images for skill-only changes');
assert.equal(imageBuildWorkflow.includes("- 'scripts/package-agent-skill-bundle.sh'"), false, 'Image-build workflow must not rebuild runtime images for bundle packager-only changes');
assertIncludes(imageBuildWorkflow, 'Package & Publish Skill Bundles', 'Build workflow must include the durable skill-bundle publication job');
assertIncludes(imageBuildWorkflow, './scripts/package-agent-skill-bundle.sh nova', 'Build workflow must package the Nova /app/skills bundle');
assertIncludes(imageBuildWorkflow, './scripts/package-agent-skill-bundle.sh buster', 'Build workflow must package the Buster /app/skills bundle');
assertIncludes(imageBuildWorkflow, 'gh release upload "$BUNDLE_RELEASE_TAG"', 'Build workflow must publish bundle assets to a GitHub release');
assertIncludes(imageBuildWorkflow, 'agent-code-bundles', 'Build workflow must use the stable bundle release tag');
assertIncludes(docsChecksWorkflow, 'cache: npm', 'Docs workflow must cache the committed root npm dependency graph');
assertIncludes(docsChecksWorkflow, 'npm ci --ignore-scripts', 'Docs workflow must install the committed root dependency graph before running repository scripts');
assert.deepEqual(rootPackageLock.packages?.['']?.devDependencies, rootPackage.devDependencies, 'Root npm lock must match the repository development dependencies');
assert.equal(rootPackage.devDependencies?.typescript, '5.9.3', 'Repository analysis scripts must use the canonical pinned TypeScript compiler API');
assertIncludes(packageSkillBundleScript, 'cp -R "${role_source}/." "$skills_root/"', 'Bundle packaging script must copy the role-specific skills surface first');
assertIncludes(packageSkillBundleScript, 'cp -R "${common_source}/." "$skills_root/"', 'Bundle packaging script must overlay skills/common onto the role-specific bundle surface');
assertIncludes(packageSkillBundleScript, 'cp -R "${agent_observability_contract_source}/." "${skills_root}/pipeline/agent-observability/src/"', 'Bundle packaging must materialize the canonical agent-observability contract');
assertIncludes(packageSkillBundleScript, 'cp -R "${telemetry_contract_source}/." "${skills_root}/pipeline/contracts/telemetry/v1/"', 'Bundle packaging must materialize the canonical telemetry contract');
assertIncludes(packageSkillBundleScript, '"runtimeSurface": "/app/skills"', 'Bundle packaging manifest must declare the /app/skills runtime surface');
assertIncludes(packageSkillBundleScript, '"bundleKind": "app-skills-overlay"', 'Bundle packaging manifest must describe the overlay-style bundle contract');
assertDockerInstallCommandsFailClosed(generalDockerfile, 'General Dockerfile');
assertDockerInstallCommandsFailClosed(busterGatewayDockerfile, 'Buster gateway Dockerfile');
assertDockerInstallCommandsFailClosed(busterPipelineDockerfile, 'Buster pipeline Dockerfile');
const observerPluginCopy = 'COPY skills/common/plugins/openclaw-agent-observer/';
assert.equal(generalDockerfile.replaceAll(observerPluginCopy, '').includes('COPY skills/'), false, 'General runtime image must not bake fast-changing agent skills');
assert.equal(busterGatewayDockerfile.replaceAll(observerPluginCopy, '').includes('COPY skills/'), false, 'Buster gateway image must not bake fast-changing agent skills');
assert.equal(busterPipelineDockerfile.includes('COPY skills/'), false, 'Buster pipeline image must not bake fast-changing agent skills');
assertIncludes(generalDockerfile, 'ARG KUBECTL_VERSION=', 'General Dockerfile must pin kubectl for live Kubernetes verification');
assertIncludes(generalDockerfile, 'ARG HELM_VERSION=', 'General Dockerfile must pin Helm for reproducible image builds');
assertIncludes(generalDockerfile, 'npm install -g --no-audit --no-fund ioredis@5.11.1', 'General gateway runtime must include the Redis health-check dependency on the global Node path');
assert.equal(generalDockerfile.includes('ARG KUBECTL_VERSION=1.35.'), true, 'General kubectl must stay within one minor of the production Kubernetes 1.34 API');
assert.equal(busterPipelineDockerfile.includes('ARG KUBECTL_VERSION=1.35.'), true, 'Buster kubectl must stay within one minor of the production Kubernetes 1.34 API');
assertIncludes(generalDockerfile, 'ARG OPENCLAW_BASE=ghcr.io/openclaw/openclaw:', 'General Dockerfile must pin the OpenClaw base version');
assertIncludes(generalDockerfile, '@sha256:', 'General Dockerfile must pin the OpenClaw base digest');
assert.equal(generalOpenClawBase, busterOpenClawBase, 'OpenClaw-derived runtime images must share one version-and-digest-pinned base');
assertIncludes(generalDockerfile, 'ARG DEBIAN_SNAPSHOT=', 'General Dockerfile must pin the Debian package snapshot');
assertIncludes(busterGatewayDockerfile, 'ARG DEBIAN_SNAPSHOT=', 'Buster gateway Dockerfile must pin the Debian package snapshot');
assertIncludes(busterPipelineDockerfile, 'ARG DEBIAN_SNAPSHOT=', 'Buster pipeline Dockerfile must pin the Debian package snapshot');
for (const [label, dockerfile] of [
  ['General', generalDockerfile],
  ['Buster gateway', busterGatewayDockerfile],
  ['Buster pipeline', busterPipelineDockerfile],
]) {
  assertOrdered(
    dockerfile,
    'test -s /etc/ssl/certs/ca-certificates.crt',
    'URIs: https://snapshot.debian.org/archive/debian/',
    `${label} must establish a CA trust bundle before contacting the HTTPS Debian snapshot`,
  );
  assertIncludes(dockerfile, 'Acquire::Retries=5', `${label} snapshot refresh must retry transient archive fetch failures`);
  assertIncludes(dockerfile, 'APT::Update::Error-Mode=any', `${label} snapshot refresh must reject partial package indexes`);
  assertIncludes(dockerfile, 'apt-cache show "${package}"', `${label} image build must verify every required apt package before installation`);
}
assertOrdered(
  busterPipelineDockerfile,
  'COPY --from=buildkit /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt',
  'test -s /etc/ssl/certs/ca-certificates.crt',
  'Buster pipeline must bootstrap CA trust from the already-required BuildKit image before validating it',
);
assert.equal(/\$\{[A-Z0-9_]+_VERSION\}/.test(busterGatewayAptInstall), false, 'Buster gateway apt packages must use the snapshot as their single version authority');
assert.equal(/\$\{[A-Z0-9_]+_VERSION\}/.test(busterPipelineAptInstall), false, 'Buster pipeline apt packages must use the snapshot as their single version authority');
assertIncludes(generalDockerfile, 'COPY docker/general-tools/package.json docker/general-tools/package-lock.json', 'General Dockerfile must install JavaScript tools from the committed lockfile');
assert.deepEqual(generalToolsLock.packages?.['']?.dependencies, generalToolsPackage.dependencies, 'General JavaScript tool lock must match its direct dependency manifest');
for (const [dependency, version] of Object.entries(generalToolsPackage.dependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `General JavaScript tool ${dependency} must use an exact semantic version`);
}
assert.deepEqual(observerLock.packages?.['']?.devDependencies, observerPackage.devDependencies, 'Observer build-tool lock must match its direct development dependencies');
assert.equal(observerPackage.devDependencies?.typescript, '5.9.3', 'Observer TypeScript compiler must use the canonical pinned version');
assert.match(observerPackage.devDependencies?.['@types/node'] || '', /^24\.\d+\.\d+$/, 'Observer Node types must match the Node 24 gateway runtime');
assertIncludes(generalDockerfile, 'https://get.helm.sh/${helm_archive}.sha256sum', 'General Dockerfile must checksum the pinned official Helm archive');
assert.equal(generalDockerfile.includes('get-helm-3'), false, 'General Dockerfile must not depend on the mutable Helm convenience installer');
assertIncludes(generalDockerfile, 'https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/${arch}/kubectl', 'General Dockerfile must install architecture-aware kubectl from the pinned Kubernetes release');
assertIncludes(generalDockerfile, 'kubectl.sha256', 'General Dockerfile must verify the kubectl release checksum');
assertIncludes(generalDockerfile, 'install -m 0755 "$tmp/$kubectl_file" /usr/local/bin/kubectl', 'General Dockerfile must install verified kubectl in PATH');
assertIncludes(busterPipelineDockerfile, 'ARG KUBECTL_SHA256_AMD64=', 'Buster pipeline must pin the amd64 kubectl checksum');
assertIncludes(busterPipelineDockerfile, 'ARG KUBECTL_SHA256_ARM64=', 'Buster pipeline must pin the arm64 kubectl checksum');
assertIncludes(busterPipelineDockerfile, '--retry 5 --retry-all-errors', 'Buster pipeline must retry transient kubectl download failures');
assertIncludes(busterPipelineDockerfile, 'sha256sum -c -', 'Buster pipeline must verify kubectl before installation');
assert.equal(/\bchromium\b/.test(generalAptInstall), false, 'General Dockerfile must not duplicate Playwright Chromium with the Debian browser package');
assertIncludes(busterGatewayDockerfile, 'ARG OPENCLAW_BASE=ghcr.io/openclaw/openclaw:', 'Buster gateway must share the pinned OpenClaw base version');
assertIncludes(imageBuildWorkflow, 'Verify the pinned base is current', 'Image workflow must compare the pinned OpenClaw digest with the current release');
assertIncludes(imageBuildWorkflow, 'https://api.github.com/repos/openclaw/openclaw/releases/latest', 'Image workflow must derive release authority from the latest stable GitHub release');
assertIncludes(imageBuildWorkflow, 'latest_ref="ghcr.io/openclaw/openclaw:${latest_version}"', 'Image workflow must inspect the immutable stable release tag instead of mutable GHCR latest');
assertIncludes(imageBuildWorkflow, 'for attempt in 1 2 3', 'Image workflow must bound retries for transient registry inspection failures');
assert.equal(imageBuildWorkflow.includes('ghcr.io/openclaw/openclaw:latest'), false, 'Image workflow must not treat mutable GHCR latest as release authority');
assert.equal(imageBuildWorkflow.includes('/tmp/last-base-digest.txt'), false, 'Image workflow must not pretend ephemeral runner state persists between schedules');
assertIncludes(busterPipelineDockerfile, 'FROM moby/buildkit:rootless AS buildkit', 'Buster pipeline image must source rootless BuildKit');
assertIncludes(busterPipelineDockerfile, 'USER 1000:1000', 'Buster pipeline image must run as a non-root user');
assertIncludes(generalDockerfile, 'openclaw plugins install "@openclaw/acpx@${OPENCLAW_PLUGIN_VERSION}"', 'General Dockerfile must bake the pinned official ACPX plugin into the gateway image cache');
assertIncludes(generalDockerfile, 'openclaw plugins install "@openclaw/discord@${OPENCLAW_PLUGIN_VERSION}"', 'General Dockerfile must bake the pinned official Discord plugin into the gateway image cache');
assertIncludes(busterGatewayDockerfile, 'openclaw plugins install "@openclaw/acpx@${OPENCLAW_PLUGIN_VERSION}"', 'Buster gateway must bake the pinned official ACPX plugin into its gateway cache');
assertIncludes(busterGatewayDockerfile, 'openclaw plugins install "@openclaw/discord@${OPENCLAW_PLUGIN_VERSION}"', 'Buster gateway must bake the pinned official Discord plugin into its gateway cache');
assertIncludes(busterGatewayDockerfile, '/app/dist/extensions/kubeclaw-agent-observer', 'Buster gateway must package the observer plugin into the OpenClaw extension tree');
assertIncludes(busterGatewayRuntimeStage, 'npm install -g ioredis', 'Buster gateway runtime must include the observer Redis transport dependency');
for (const forbiddenRuntimeTool of ['eslint', 'playwright', 'lighthouse', 'semgrep', 'hadolint', 'kubeconform', 'kubectl', 'buildkit', 'k6']) {
  assert.equal(
    busterGatewayRuntimeCommands.toLowerCase().includes(forbiddenRuntimeTool),
    false,
    `Buster gateway runtime must not contain pipeline-owned tool ${forbiddenRuntimeTool}`,
  );
}
assert.equal(busterPipelineDockerfile.includes('openclaw plugins install'), false, 'Buster pipeline image must not carry gateway plugin/runtime weight');
assertIncludes(imageBuildWorkflow, "cmd/buster-namespace-controller/**", 'Image-build workflow must rebuild the namespace controller image when Go controller source changes');
assertIncludes(namespaceControllerDockerfile, 'FROM golang:1.22-bookworm AS build', 'Namespace controller Dockerfile must compile the Go controller in a dedicated build stage');
assertIncludes(namespaceControllerDockerfile, 'go build -trimpath -ldflags="-s -w"', 'Namespace controller Dockerfile must build a stripped Go binary');
assertIncludes(namespaceControllerDockerfile, 'FROM gcr.io/distroless/static-debian12:nonroot', 'Namespace controller Dockerfile must use a minimal non-root runtime image');
assertIncludes(namespaceControllerDockerfile, 'COPY --from=build /out/buster-namespace-controller /app/buster-namespace-controller', 'Namespace controller Dockerfile must package the compiled controller binary');
assertIncludes(namespaceControllerDockerfile, 'USER nonroot:nonroot', 'Namespace controller Dockerfile must run as a non-root user');
assertIncludes(namespaceControllerDockerfile, 'ENTRYPOINT ["/app/buster-namespace-controller"]', 'Namespace controller Dockerfile must use the compiled controller binary as entrypoint');
assert.equal(
  namespaceControllerDockerfile.includes('ghcr.io/openclaw/openclaw'),
  false,
  'Namespace controller Dockerfile must not inherit the OpenClaw runtime image',
);
assertIncludes(busterPipelineDockerfile, 'npm install --prefix /app', 'Buster pipeline Dockerfile must install deterministic suite tools into the ESM-resolvable application tree');
assertLine(dockerignore, '**', 'Docker build context must default-deny repository files');
assertLine(dockerignore, '!docker/Dockerfile.namespace-controller', 'Docker build context must include the namespace controller Dockerfile');
assertLine(dockerignore, '!docker/Dockerfile.buster-gateway', 'Docker build context must include the Buster gateway Dockerfile');
assertLine(dockerignore, '!docker/Dockerfile.buster-pipeline', 'Docker build context must include the Buster pipeline Dockerfile');
assertLine(dockerignore, '!docker/buster-pipeline-entrypoint.sh', 'Docker build context must include the Buster pipeline entrypoint');
assertLine(dockerignore, '!go.mod', 'Docker build context must include the Go module file');
assertLine(dockerignore, '!cmd/buster-namespace-controller/**', 'Docker build context must include the Go namespace controller source');
assert.equal(dockerignore.split('\n').includes('!skills/'), false, 'Docker build context must not include all agent skills; code bundles own /app/skills');
assert.equal(dockerignore.split('\n').includes('!skills/**'), false, 'Docker build context must not include all agent skills recursively; code bundles own /app/skills');
assertLine(dockerignore, '!skills/common/plugins/openclaw-agent-observer/**', 'Docker build context must include observer plugin source');
assert.equal(dockerignore.includes('!scripts/buster-namespace-controller.mjs'), false, 'Docker build context must not include the removed JS namespace controller');
assertLine(dockerignore, 'my-values/', 'Docker build context must exclude deployment values');
assertLine(dockerignore, '.swarm/', 'Docker build context must exclude local swarm logs and state');
assertLine(dockerignore, 'worktrees/', 'Docker build context must exclude local worktrees');
assertLine(dockerignore, '**/node_modules/', 'Docker build context must exclude local dependencies');
assertLine(dockerignore, 'skills/common/plugins/openclaw-agent-observer/dist/', 'Docker build context must exclude generated observer plugin output');
assertLine(dockerignore, '**/*.key', 'Docker build context must exclude key-shaped files');
assertLine(dockerignore, '**/*.pem', 'Docker build context must exclude PEM-shaped files');
assertLine(dockerignore, '.env', 'Docker build context must exclude root env files');
assertLine(dockerignore, '.env.*', 'Docker build context must exclude root env variants');
assertLine(gitignore, 'my-values/.workspace-namespace', 'Git ignore must keep only local workspace namespace state under my-values');
assert.equal(
  normalizedNonemptyLines(gitignore).includes('my-values/'),
  false,
  'Git ignore must not hide the currently tracked my-values deployment surface',
);
assert.equal((deployScriptMode & 0o111) !== 0, true, 'Deploy script must remain executable as the canonical operator deployment surface');
assertIncludes(deployScript, 'deploy_tailscale_operator() {', 'Deploy script must expose a canonical Tailscale operator deployment command');
assertIncludes(deployScript, 'cmd_secrets() {', 'Deploy script must expose a canonical guided secret setup command');
assertIncludes(deployScript, 'cmd_buildkit_preflight() {', 'Deploy script must expose an explicit rootless BuildKit node capability probe');
assertIncludes(deployScript, 'pipeline_preflight_pull_secret="$(yaml_get_first_named_list_item "$values_file" imagePullSecrets)"', 'Buster image preflight must derive registry pull authority from the canonical values file');
assertIncludes(deployScript, 'cmd_buildkit_preflight "$pipeline_preflight_image" "$pipeline_preflight_pull_secret"', 'Buster image deployment must preflight the exact worker image before rollout');
assertIncludes(deployScript, 'cmd_buster_buildkit_smoke() {', 'Deploy script must expose the live Buster build, push, deploy, and cleanup smoke');
assertIncludes(deployScript, 'tests/verification/live/buster-buildkit-production-smoke.mjs', 'Live Buster smoke must use the canonical production BuildKit test');
assertIncludes(deployScript, 'cmd_buster_infra_smoke() {', 'Deploy script must expose the full deployed-Buster infrastructure smoke');
assertIncludes(deployScript, 'tests/verification/live/buster-infra-production-smoke.mjs', 'Full Buster infrastructure smoke must publish through the canonical live test');
assertIncludes(deployScript, 'local probe_image="${1:-$BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE}"', 'Standalone BuildKit preflight must retain the configurable official rootless image default');
assertIncludes(deployScript, 'image: "${probe_image}"', 'BuildKit preflight must run the selected host or Buster pipeline image');
assertIncludes(deployScript, 'command:\n        - rootlesskit', 'BuildKit preflight must bypass application entrypoints and launch RootlessKit directly');
assertIncludes(deployScript, 'args:\n        - --net=host\n        - buildkitd', 'BuildKit preflight must use the same pod-network mode as the production Buster worker');
assertIncludes(deployScript, 'imagePullPolicy: Always', 'BuildKit preflight must inspect the current mutable worker tag rather than a stale node image');
assertIncludes(deployScript, 'name: XDG_RUNTIME_DIR\n          value: /run/user/1000', 'BuildKit preflight must place its rootless runtime in the writable runtime mount');
assertIncludes(deployScript, 'local otel_socket="/run/user/1000/buildkit/otel-grpc.sock"', 'BuildKit preflight must place its OTEL trace socket in the writable runtime mount');
assertIncludes(deployScript, '- --otel-socket-path\n        - ${otel_socket}', 'BuildKit preflight must override BuildKit\'s root-owned OTEL socket default');
assertIncludes(deployScript, 'privileged: false', 'BuildKit preflight must prove the builder works without privileged mode');
assertIncludes(deployScript, 'runAsNonRoot: true', 'BuildKit preflight must run the builder as a non-root user');
assertIncludes(deployScript, 'automountServiceAccountToken: false', 'BuildKit preflight must not expose Kubernetes API credentials to the builder');
assertIncludes(deployScript, 'buildctl --addr "$socket" debug workers', 'BuildKit preflight must verify a real BuildKit worker instead of checking sysctls only');
assertIncludes(deployScript, 'cleanup_buildkit_preflight_pod "$probe_name"', 'BuildKit preflight must clean up its temporary pod');
assert.equal(deployScript.includes('sysctl -w'), false, 'Deploy script must not mutate node sysctls for rootless BuildKit');
assertIncludes(deployScript, 'prompt_workspace_namespace_if_needed() {', 'Deploy script must prompt for a workspace namespace when no namespace is configured');
assertIncludes(deployScript, 'How would you like to name the workspace namespace?', 'Deploy script must present operator-facing workspace namespace wording');
assertIncludes(deployScript, 'KUBECLAW_WORKSPACE_NAMESPACE_FILE', 'Deploy script must remember the selected workspace namespace for later setup runs');
assertIncludes(deployScript, 'prompt_default="$workspace"', 'Deploy script must offer the remembered workspace namespace as the interactive prompt default');
assertIncludes(deployScript, 'workspace="${workspace:-$prompt_default}"', 'Deploy script must accept the remembered/default namespace when the operator presses Enter');
assertIncludes(deployScript, 'KUBECLAW_DEPLOY_LITELLM', 'Deploy script must expose optional component deployment switches');
assertIncludes(deployScript, 'KUBECLAW_DEPLOY_POSTGRESQL', 'Deploy script must allow PostgreSQL to be disabled as optional infrastructure');
assertIncludes(deployScript, 'KUBECLAW_DEPLOY_QDRANT', 'Deploy script must allow Qdrant to be disabled as optional infrastructure');
assertIncludes(deployScript, 'Skipping LiteLLM by KUBECLAW_DEPLOY_LITELLM', 'Deploy script must skip disabled components instead of deploying them unconditionally');
assertIncludes(deployScript, 'header "Infrastructure: Redis"', 'Deploy script must keep Redis on the required infrastructure path');
assert.equal(deployScript.includes('KUBECLAW_DEPLOY_REDIS'), false, 'Deploy script must not expose Redis as optional infrastructure');
assert.equal(deployScript.includes('KUBECLAW_DEPLOY_REGISTRIES'), false, 'Deploy script must not expose registry infrastructure as optional');
assert.equal(deployScript.includes('KUBECLAW_DEPLOY_BUSTER_FENCE'), false, 'Deploy script must not expose the Buster namespace fence as optional');
assert.equal(deployScript.includes('KUBECLAW_DEPLOY_AGENTS'), false, 'Deploy script must not expose agent deployment as optional');
assertIncludes(deployScript, 'ALLOW_PARTIAL_INFRA="${ALLOW_PARTIAL_INFRA:-false}"', 'Deploy script must fail closed on infra rollout failures by default');
assertIncludes(deployScript, 'wait_for_rollout_required() {', 'Deploy script must use an explicit required rollout wait helper');
assertIncludes(deployScript, 'if component_enabled "$ALLOW_PARTIAL_INFRA"; then', 'Deploy script must gate partial infra continuation behind ALLOW_PARTIAL_INFRA');
assertIncludes(deployScript, 'Set ALLOW_PARTIAL_INFRA=1 only for explicit troubleshooting.', 'Deploy script must explain the partial-infra break-glass path');
assertIncludes(deployScript, 'run_secret_setup_if_enabled', 'Deploy setup/all must route through the guided secret setup helper when enabled');
assertIncludes(deployScript, 'KUBECLAW_RUN_SECRET_SETUP', 'Deploy script must allow operators and CI to control automatic secret setup');
assertIncludes(deployScript, 'secrets)', 'Deploy script must route the secrets command through cmd_secrets');
assertIncludes(deployScript, 'TAILSCALE_HELM_REPO="${TAILSCALE_HELM_REPO:-https://pkgs.tailscale.com/helmcharts}"', 'Deploy script must use the stable Tailscale Helm chart repository by default');
assertIncludes(deployScript, 'TAILSCALE_OAUTH_SECRET_NAME="${TAILSCALE_OAUTH_SECRET_NAME:-operator-oauth}"', 'Deploy script must use the chart-default Tailscale OAuth secret name');
assertIncludes(deployScript, 'TAILSCALE_VALUES_FILE="${TAILSCALE_VALUES_FILE:-$INFRA_DIR/tailscale-operator-values.yaml}"', 'Deploy script must install Tailscale with the repository-local values file');
assertIncludes(deployScript, 'ensure_tailscale_oauth_secret() {', 'Deploy script must check or bootstrap the Tailscale OAuth Secret before install');
assertIncludes(deployScript, 'kubectl get secret "$TAILSCALE_OAUTH_SECRET_NAME" -n "$TAILSCALE_OPERATOR_NAMESPACE"', 'Deploy script must prefer an existing Kubernetes Secret for Tailscale OAuth');
assertIncludes(deployScript, '--values "$TAILSCALE_VALUES_FILE"', 'Deploy script must install Tailscale with values file settings instead of direct secret values');
assertIncludes(deployScript, 'helm upgrade --install "$TAILSCALE_OPERATOR_RELEASE" tailscale/tailscale-operator', 'Deploy script must install the Tailscale Kubernetes Operator through Helm');
assertIncludes(deployScript, 'kubectl get ingressclass tailscale', 'Deploy script must verify the Tailscale IngressClass after operator installation');
assertIncludes(deployScript, '-l "app.kubernetes.io/instance=$TAILSCALE_OPERATOR_RELEASE"', 'Deploy script must wait for the Tailscale operator pod to become Ready');
assertIncludes(deployScript, 'Tailscale operator install requires Secret/${TAILSCALE_OAUTH_SECRET_NAME}', 'Explicit Tailscale install must fail closed without OAuth Secret');
assertIncludes(deployScript, 'deploy_tailscale_operator', 'Infra deployment must route through the Tailscale operator helper');
assertIncludes(deployScript, 'kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/network-policies.yaml"', 'Infra deployment must apply the namespace NetworkPolicy baseline');
assertIncludes(deployScript, 'kubectl delete -n "$NAMESPACE" -f "$INFRA_DIR/network-policies.yaml" --ignore-not-found', 'Infra teardown must remove the namespace NetworkPolicy baseline');
assertIncludes(deployScript, 'wait_for_rollout_required "LiteLLM" deployment/litellm -n "$NAMESPACE" --timeout=120s', 'Infra deployment must fail hard when enabled LiteLLM is not ready');
assertIncludes(deployScript, 'wait_for_rollout_required "Registry Mirror" deployment/registry-mirror -n "$NAMESPACE" --timeout=120s', 'Infra deployment must fail hard when registry-mirror is not ready');
assertIncludes(deployScript, 'wait_for_rollout_required "Registry Local" deployment/registry-local -n "$NAMESPACE" --timeout=60s', 'Infra deployment must fail hard when registry-local is not ready');
assert.equal(deployScript.includes('--set-string oauth.clientId'), false, 'Deploy script must not pass Tailscale OAuth client ID through Helm values');
assert.equal(deployScript.includes('--set-string oauth.clientSecret'), false, 'Deploy script must not pass Tailscale OAuth client secret through Helm values');
assertIncludes(tailscaleValues, 'clientId: ""', 'Tailscale values must leave OAuth client ID unset so the chart uses Secret/operator-oauth');
assertIncludes(tailscaleValues, 'clientSecret: ""', 'Tailscale values must leave OAuth client secret unset so the chart uses Secret/operator-oauth');
assertIncludes(tailscaleValues, 'name: tailscale', 'Tailscale values must keep the ingress class name aligned with final-preview ingresses');
assertIncludes(tailscaleValues, 'tag:k8s-operator', 'Tailscale values must include the operator tag expected by tailnet policy');
assertIncludes(tailscaleValues, 'defaultTags: tag:k8s', 'Tailscale values must tag final-preview proxies with the proxy tag');
assertIncludes(deployScript, 'append_code_bundle_override_file() {', 'Deploy script must define a canonical code bundle override helper');
assertIncludes(deployScript, 'codeBundle:', 'Deploy script must be able to render code bundle Helm overrides');
assertIncludes(deployScript, 'archiveUrl: "$archive_url"', 'Deploy script code bundle overrides must target a resolved archive URL');
assertIncludes(deployScript, 'expectedCommit: "$expected_commit"', 'Deploy script code bundle overrides must pin the expected commit');
assertIncludes(deployScript, 'bundle_env_for_role() {', 'Deploy script must resolve per-agent code bundle env surfaces');
assertIncludes(deployScript, 'resolve_deploy_targets() {', 'Deploy script must define a shared target resolver for image and code deploys');
assertIncludes(deployScript, 'cmd_agent() {', 'Deploy script must expose a dedicated single-agent deploy surface');
assertIncludes(deployScript, 'cmd_image() {', 'Deploy script must expose a dedicated image deploy surface');
assertIncludes(deployScript, 'cmd_code() {', 'Deploy script must expose a dedicated code deploy surface');
assertIncludes(deployScript, '--with-code', 'Deploy script must support an explicit combined agent deploy flag');
assertIncludes(deployScript, 'cmd_smoke_agent "$role"', 'Combined agent deploys must smoke-check the target before and after code rollout');
assertIncludes(deployScript, 'derive_github_repository_from_image_repository() {', 'Deploy script must derive the bundle GitHub repository from deployed image ownership when available');
assertIncludes(deployScript, 'ghcr\\.io/([^/]+)/kubeclaw', 'Deploy script must map kubeclaw GHCR image ownership back to the GitHub bundle repository');
assertIncludes(deployScript, 'derive_github_repository() {', 'Deploy script must derive the GitHub repository for bundle release URLs when possible');
assertIncludes(deployScript, 'repo="${repo#ssh://git@github.com/}"', 'Deploy script must support ssh:// GitHub remotes when deriving bundle release URLs');
assertIncludes(deployScript, '([^/@]+@)?github\\.com/', 'Deploy script must support authenticated HTTPS GitHub remotes when deriving bundle release URLs');
assertIncludes(deployScript, 'default_bundle_archive_url() {', 'Deploy script must define the canonical GitHub release asset URL shape for bundles');
assertIncludes(deployScript, 'default_bundle_expected_commit() {', 'Deploy script must define a helper for default code-bundle commit resolution');
assertIncludes(deployScript, 'git -C "$REPO_DIR" ls-remote --exit-code origin "$ref"', 'Deploy script must resolve omitted code bundle commits from the latest remote ref');
assertIncludes(deployScript, 'Resolved ${role} code bundle commit from ${CODE_BUNDLE_DEFAULT_REF}', 'Deploy script must report which default ref supplied the code bundle commit');
assertIncludes(deployScript, 'CODE_BUNDLE_RELEASE_TAG="${CODE_BUNDLE_RELEASE_TAG:-agent-code-bundles}"', 'Deploy script must expose the stable default bundle release tag');
assertIncludes(deployScript, 'CODE_BUNDLE_DEFAULT_REF="${CODE_BUNDLE_DEFAULT_REF:-refs/heads/main}"', 'Deploy script must default omitted code deploy commits to the latest remote main ref');
assertIncludes(deployScript, 'verify_bundle_archive_url() {', 'Deploy script must preflight bundle archive availability before rolling a code deploy');
assertIncludes(deployScript, 'method="GET"', 'Deploy script bundle preflight must fall back to a real GET when HEAD is not accepted');
assertIncludes(deployScript, 'CODE_BUNDLE_PREFLIGHT_SKIP', 'Deploy script must expose a controlled bundle preflight escape hatch');
assertIncludes(deployScript, 'CODE_BUNDLE_GITHUB_REPOSITORY', 'Deploy script must advertise the GitHub repository override for derived bundle URLs');
assertIncludes(deployScript, 'NOVA_CODE_BUNDLE_ARCHIVE_URL', 'Deploy script must advertise the Nova code bundle deploy input');
assertIncludes(deployScript, 'BUSTER_CODE_BUNDLE_ARCHIVE_URL', 'Deploy script must advertise the Buster code bundle deploy input');
assertIncludes(deployScript, 'releases/download/${CODE_BUNDLE_RELEASE_TAG}/${role}-${expected_commit}.tgz', 'Deploy script must derive predictable GitHub release bundle URLs from role and commit');
assertIncludes(deployScript, 'code deploy requires $(tr', 'Deploy script must still fail closed when neither an explicit commit nor a default ref can be resolved');
assertIncludes(deployScript, 'controller_image_repo="${BUSTER_CONTROLLER_IMAGE_REPOSITORY:-${NAMESPACE_CONTROLLER_IMAGE_REPOSITORY:-}}"', 'Buster deploy overrides must keep the namespace controller on the dedicated controller image repository');
assertIncludes(deployScript, 'controller_image_tag="${BUSTER_CONTROLLER_IMAGE_TAG:-${NAMESPACE_CONTROLLER_IMAGE_TAG:-}}"', 'Buster deploy overrides must keep the namespace controller on the dedicated controller image tag');
assertIncludes(deployScript, 'image_repo="${BUSTER_GATEWAY_IMAGE_REPOSITORY:-}"', 'Buster deploy overrides must expose the dedicated gateway image repository');
assertIncludes(deployScript, 'image_tag="${BUSTER_GATEWAY_IMAGE_TAG:-}"', 'Buster deploy overrides must expose the dedicated gateway image tag');
assertIncludes(deployScript, 'pipeline_image_repo="${BUSTER_PIPELINE_IMAGE_REPOSITORY:-}"', 'Buster deploy overrides must expose the dedicated pipeline image repository');
assertIncludes(deployScript, 'pipeline_image_tag="${BUSTER_PIPELINE_IMAGE_TAG:-}"', 'Buster deploy overrides must expose the dedicated pipeline image tag');
assert.equal(deployScript.includes('SANDBOX_IMAGE_REPOSITORY'), false, 'Buster deploy must not retain the retired sandbox image repository path');
assert.equal(deployScript.includes('SANDBOX_IMAGE_TAG'), false, 'Buster deploy must not retain the retired sandbox image tag path');
assertIncludes(deployScript, '--set probes.dependencies.litellm.enabled=false', 'Agent deployment must disable LiteLLM readiness checks when LiteLLM infrastructure is intentionally disabled');
assertIncludes(deployScript, '--set probes.dependencies.qdrant.enabled=false', 'Agent deployment must disable Qdrant readiness checks when Qdrant infrastructure is intentionally disabled');
assertIncludes(deployScript, 'AGENT_HELM_TIMEOUT="${AGENT_HELM_TIMEOUT:-45m}"', 'Deploy script must expose a longer default Helm timeout for slow agent upgrades');
assertIncludes(deployScript, 'AGENT_ROLLOUT_TIMEOUT="${AGENT_ROLLOUT_TIMEOUT:-45m}"', 'Deploy script must expose a longer default rollout timeout for slow agent readiness');
assertIncludes(deployScript, '--wait --timeout "$AGENT_HELM_TIMEOUT"', 'Agent deployment must route Helm wait time through the configurable agent timeout');
assertIncludes(deployScript, 'wait_for_agent_rollout() {', 'Agent deployment must define a shared rollout wait helper');
assertIncludes(deployScript, 'wait_for_agent_rollout "agent-${role}"', 'Code deploy must wait for the Helm-triggered rollout to become ready');
assertIncludes(deployScript, 'kubectl rollout restart deployment -n "$NAMESPACE" -l "app.kubernetes.io/instance=agent-${role}"', 'Mutable image deploys must restart every deployment owned by the selected release');
assertIncludes(deployScript, 'kubectl rollout status deployment/agent-buster-namespace-controller', 'Buster image deploys must wait for the refreshed namespace controller');
assertIncludes(deployScript, 'cmd_smoke_agent() {', 'Deploy script must expose a canonical single-agent smoke command');
assertIncludes(deployScript, 'cmd_smoke() {', 'Deploy script must expose a canonical multi-agent smoke command');
assertIncludes(deployScript, 'image [target]', 'Deploy script usage must advertise the image deploy mode');
assertIncludes(deployScript, 'code [target]', 'Deploy script usage must advertise the code deploy mode');
assertIncludes(deployScript, 'Code-bundle deploy for all agents by default, or one target (nova|buster)', 'Deploy script usage must make all-agents the default code deploy mode');
assert.equal(deployScript.includes('build-local-images)'), false, 'Deploy script must remove the old local image-build command surface');
assert.equal(deployScript.includes('verify-live)'), false, 'Deploy script must remove the old live local-image verification command surface');
assertIncludes(deployScript, 'kubectl rollout status deployment/$release -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"', 'Deploy smoke must wait for deployment rollout before declaring success');
assertIncludes(deployScript, 'kubectl wait --for=condition=Ready pod -l "app.kubernetes.io/instance=$release" -n "$NAMESPACE" --timeout="$AGENT_ROLLOUT_TIMEOUT"', 'Deploy smoke must wait for a ready pod on the deployed release');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- openclaw gateway status', 'Deploy smoke must verify the in-pod OpenClaw gateway status');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- node /runtime-config/kubeclaw-health.mjs startup-status', 'Deploy smoke must assert the persisted startup verification marker');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- node /runtime-config/kubeclaw-health.mjs readiness', 'Deploy smoke must re-run cheap readiness checks inside the pod');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -d /app/skills', 'Deploy smoke must verify the runtime skills mount is present in the running pod');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -f /home/node/.openclaw/swarm.config.json', 'Deploy smoke must verify runtime swarm config is present in the running pod');
assertIncludes(deployScript, 'remove_destructive_infra() {', 'Deploy script must keep destructive infra teardown under a shared helper');
assertIncludes(deployScript, 'run_destructive_teardown() {', 'Deploy script must centralize destructive teardown logic behind a shared helper');
assertIncludes(deployScript, 'run_destructive_teardown 0', 'Teardown must route through the shared destructive helper while preserving the namespace');
assertIncludes(deployScript, 'run_destructive_teardown 1', 'Teardown-all must route through the shared destructive helper before deleting the namespace');
assertIncludes(deployScript, 'add_helm_repo_once() {', 'Deploy script must classify Helm repo add failures instead of swallowing them');
assertIncludes(deployScript, 'delete_manifested_resource_if_present() {', 'Deploy script must route manifested resource deletion through a classified helper');
assertIncludes(deployScript, 'delete_namespaced_resource_if_present() {', 'Deploy script must route optional namespaced deletion through a not-found-aware helper');
assertIncludes(deployScript, 'print_remaining_secrets() {', 'Deploy script must classify remaining-secret listing failures');
assert.equal(deployScript.includes('|| true'), false, 'Deploy script must not silently swallow failures with || true');
assert.equal(deployScript.includes('&>/dev/null'), false, 'Deploy script must not hide both stdout/stderr for control-flow checks');
assertIncludes(setupSecretsScript, 'require_command kubectl', 'setup-secrets must check required kubectl command before mutating secrets');
assertIncludes(setupSecretsScript, 'err_file="$(mktemp)"', 'setup-secrets must capture SOPS stderr without suppressing it silently');
assertIncludes(setupSecretsScript, 'Optional source secret not found', 'setup-secrets must classify missing optional source secrets');
assertIncludes(setupSecretsScript, 'KUBECLAW_SECRET_SETUP_MODE', 'setup-secrets must expose an explicit interactive/noninteractive mode');
assertIncludes(setupSecretsScript, 'KUBECLAW_SECRETS_OVERWRITE', 'setup-secrets must avoid overwriting existing Secrets unless requested');
assertIncludes(setupSecretsScript, 'KUBECLAW_DEPLOY_LITELLM', 'setup-secrets must expose optional component-aware secret prompting');
assertIncludes(setupSecretsScript, 'KUBECLAW_DEPLOY_POSTGRESQL', 'setup-secrets must allow PostgreSQL secrets to be skipped only when PostgreSQL is disabled');
assertIncludes(setupSecretsScript, 'Skipping optional LiteLLM/Google secrets by KUBECLAW_DEPLOY_LITELLM', 'setup-secrets must skip LiteLLM-related prompts when LiteLLM is disabled');
assertIncludes(setupSecretsScript, 'Skipping optional postgresql-secrets by KUBECLAW_DEPLOY_POSTGRESQL', 'setup-secrets must skip PostgreSQL prompts when PostgreSQL is disabled');
assertIncludes(setupSecretsScript, 'setup_redis_secret', 'setup-secrets must keep Redis on the required secret path');
assertIncludes(setupSecretsScript, 'setup_ghcr_secret', 'setup-secrets must keep GHCR pull credentials on the required secret path');
assertIncludes(setupSecretsScript, 'setup_git_deploy_key git-deploy-key-nova Nova', 'setup-secrets must keep the Nova Git deploy key on the required secret path');
assert.equal(setupSecretsScript.includes('KUBECLAW_DEPLOY_REDIS'), false, 'setup-secrets must not expose Redis secrets as optional');
assert.equal(setupSecretsScript.includes('KUBECLAW_DEPLOY_REGISTRIES'), false, 'setup-secrets must not expose GHCR secrets as optional');
assert.equal(setupSecretsScript.includes('KUBECLAW_DEPLOY_AGENTS'), false, 'setup-secrets must not expose agent secrets as optional');
assertIncludes(setupSecretsScript, 'prompt_secret_required() {', 'setup-secrets must prompt for external secret values that cannot be generated');
assertIncludes(setupSecretsScript, 'prompt_secret_or_generate() {', 'setup-secrets must generate internal secret values when the operator leaves a prompt blank');
assertIncludes(setupSecretsScript, 'prompt_file_or_paste() {', 'setup-secrets must support pasted multiline file-backed Secrets');
assertIncludes(setupSecretsScript, 'secret_missing_keys() {', 'setup-secrets must detect missing keys inside existing Secrets');
assertIncludes(setupSecretsScript, 'patch_secret_literal() {', 'setup-secrets must patch missing literal keys into existing Secrets');
assertIncludes(setupSecretsScript, 'patch_secret_file() {', 'setup-secrets must patch missing file-backed keys into existing Secrets');
assertIncludes(setupSecretsScript, 'setup_shared_secret', 'setup-secrets must manage openclaw-shared-secrets');
assertIncludes(setupSecretsScript, 'setup_redis_secret', 'setup-secrets must manage redis-secrets');
assertIncludes(setupSecretsScript, 'setup_postgresql_secret', 'setup-secrets must manage postgresql-secrets');
assertIncludes(setupSecretsScript, 'setup_litellm_secret', 'setup-secrets must manage litellm-secrets');
assertIncludes(setupSecretsScript, 'setup_google_sa_key', 'setup-secrets must manage google-sa-key');
assertIncludes(setupSecretsScript, 'setup_ghcr_secret', 'setup-secrets must manage ghcr-secret');
assertIncludes(setupSecretsScript, 'setup_git_deploy_key git-deploy-key-buster Buster', 'setup-secrets must manage the Buster Git deploy key');
assertIncludes(setupSecretsScript, 'SHARED_LITELLM_API_KEY', 'setup-secrets must reuse the shared LiteLLM key for LiteLLM infrastructure');
assertIncludes(setupSecretsScript, 'POSTGRES_LITELLM_PASSWORD', 'setup-secrets must reuse the PostgreSQL litellm password for LiteLLM DATABASE_URL');
assertIncludes(setupSecretsScript, 'TAILSCALE_OAUTH_SECRET_NAME="${TAILSCALE_OAUTH_SECRET_NAME:-operator-oauth}"', 'setup-secrets must know the chart-default Tailscale OAuth Secret name');
assertIncludes(setupSecretsScript, '--from-literal=client_id="$client_id"', 'setup-secrets must create Tailscale OAuth Secret key client_id from bootstrap env when provided');
assertIncludes(setupSecretsScript, '--from-literal=client_secret="$client_secret"', 'setup-secrets must create Tailscale OAuth Secret key client_secret from bootstrap env when provided');
assertIncludes(setupSecretsScript, 'Copied: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}', 'setup-secrets must support copying a preexisting Tailscale OAuth Secret into the operator namespace');
assertIncludes(setupSecretsScript, 'skipping DATABASE_URL namespace rewrite', 'setup-secrets must classify missing litellm secret rewrite as an explicit skip');
assert.equal(setupSecretsScript.includes('&>/dev/null'), false, 'setup-secrets must not hide both stdout/stderr for control-flow checks');
assert.equal(setupSecretsScript.includes('|| true'), false, 'setup-secrets must not silently swallow failures with || true');
assertIncludes(setupScript, 'KUBECLAW_ALLOW_LEGACY_REPO_SETUP', 'legacy repo setup must require an explicit operator opt-in');
assertIncludes(setupScript, 'legacy one-time bootstrap that runs broad git add/commit/push', 'legacy repo setup must explain its broad git side effects');
assertIncludes(setupScript, '.dockerignore excludes my-values/ from runtime image build contexts', 'legacy repo setup must enforce Docker-only deployment value exclusion');
assertIncludes(setupScript, 'my-values/ is currently tracked as the audited deployment surface', 'legacy repo setup must document the current tracked deployment values policy');
assertIncludes(setupScript, 'Deploy values:', 'legacy repo setup must report my-values as deploy values instead of private ignored data');
assertIncludes(setupScript, 'git remote get-url origin', 'legacy repo setup must inspect origin before removing it');
assert.equal(setupScript.includes('echo "my-values/" >> .gitignore'), false, 'legacy repo setup must not force my-values into .gitignore');
assert.equal(setupScript.includes('my-values/ correctly excluded from git'), false, 'legacy repo setup must not claim my-values is excluded from git');
assert.equal(setupScript.includes('your personal configs stay private'), false, 'legacy repo setup must not describe tracked deployment values as private configs');
assert.equal(setupScript.includes('my-values/ is staged!'), false, 'legacy repo setup must allow tracked deployment values to be staged');
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
assert.equal(
  normalizeLiteralPayload(renderedYamllintConfig),
  normalizeLiteralPayload(yamllintConfigSource),
  'Rendered .yamllint.yml must exactly match the chart-provided source artifact',
);
assert.equal(
  normalizeLiteralPayload(renderedTflintConfig),
  normalizeLiteralPayload(tflintConfigSource),
  'Rendered .tflint.hcl must exactly match the chart-provided source artifact',
);
assert.equal(normalizeLiteralPayload(renderedKnipConfig), normalizeLiteralPayload(knipConfigSource), 'Rendered knip.json must exactly match the chart source');
assert.equal(normalizeLiteralPayload(renderedJscpdConfig), normalizeLiteralPayload(jscpdConfigSource), 'Rendered jscpd.json must exactly match the chart source');
assert.equal(normalizeLiteralPayload(renderedJscpdTestsConfig), normalizeLiteralPayload(jscpdTestsConfigSource), 'Rendered jscpd-tests.json must exactly match the chart source');
assert.equal(normalizeLiteralPayload(renderedLintBaseline), normalizeLiteralPayload(lintBaselineSource), 'Rendered lint-baseline.json must exactly match the chart source');
assert.equal(
  normalizeLiteralPayload(renderedLintPolicy),
  normalizeLiteralPayload(lintPolicySource),
  'Rendered lint-policy.json must exactly match the chart-provided source artifact',
);

const result = {
  sourceRoot,
  chartDir,
  valuesPath: novaValuesPath,
  busterValuesPath,
  checks: [
    'Helm render includes Nova Service and Deployment',
    'Structured manifest checks enforce expected Service exposure and reject unexpected NodePorts',
    'Rendered Nova Service keeps the gateway internal while exposing only Prism preview through NodePort',
    'Helm render includes Buster Service and Deployment',
    'Rendered Buster Service keeps the gateway internal',
    'Rendered Buster Deployment uses a dedicated rootless BuildKit image',
    'Rendered Buster Deployment bounds BuildKit state and container ephemeral storage',
    'Rendered Buster Deployment uses conservative liveness budgets for gateway and pipeline containers',
    'Structured Buster checks enforce lease-only agent RBAC and bounded BuildKit resources',
    'Rendered Buster Deployment separates buster-pipeline.ts from the OpenClaw gateway container',
    'Rendered Buster containers share workspace storage and merged skills through isolated runtime paths',
    'Rendered Buster gateway and pipeline containers remain non-privileged with separated runtime authority',
    'Rendered Buster Deployment exposes the colocated OpenClaw gateway URL to Buster startup',
    'Rendered Buster Deployment honors the explicit gateway.url override',
    'Rendered Buster Deployment keeps Redis, gateway-token, and Anthropic secret wiring',
    'Rendered Buster broker includes BusterNamespaceLease, namespace controller, and lease-client RBAC',
    'Rendered BusterNamespaceLease status schema omits plaintext credentials and keeps credential availability only',
    'Buster namespace controller normalizes human lease namespace requests into test-* namespaces',
    'Buster namespace controller grants pod port-forward only inside leased namespaces',
    'Buster namespace fence denies direct Buster namespace lifecycle and constrains the controller to managed test namespaces',
    'Rendered Buster broker mode omits the legacy broad k8s tester ClusterRole and pods/exec grant',
    'Broker-disabled Buster render does not fall back to legacy broad Kubernetes tester RBAC',
    'RBAC docs distinguish broker-mode lease-client Buster authority from namespace-controller authority',
    'Rendered Buster rootless BuildKit preserves registry-local build/push authority',
    'registry-local stays ClusterIP while LiteLLM preserves its temporary NodePort',
    'NetworkPolicies define default-deny ingress and egress with explicit service allowances',
    'Structured NetworkPolicy checks verify expected selectors and ports',
    'Local infra manifests pass kubeconform where Kubernetes schemas are available',
    'Rendered Buster Deployment removes the legacy stream-processor sidecar',
    'Chart and production values remove processor configuration',
    'Rendered Deployment preserves code-bundle skill merge before custom overlay',
    'Rendered Deployment blocks customSkills from overriding core runtime paths',
    'Rendered pod mounts merged skills at /app/skills',
    'Rendered Deployment pins SWARM_CONFIG to /home/node/.openclaw/swarm.config.json',
    'Rendered init flow keeps OpenClaw config SecretRef-backed, writable, and doctor-compatible',
    'Rendered probes use dependency-aware health checks instead of TCP-only port checks',
    'Rendered agent Deployments define shutdown grace, preStop drain markers, and drain-aware readiness',
    'Rendered swarm-config ConfigMap matches all chart-provided lint policy, baseline, and native configuration artifacts',
    'Templates still pin SWARM_CONFIG and default swarm config artifacts in source',
    'Custom skills ConfigMap comments match the /app/skills runtime path and mark customSkills extension-only',
    'Templates still expose extra service ports and merge logic in source',
    'Build-images workflow still builds and publishes the runtime and namespace controller images',
    'Runtime Dockerfiles fail closed on tool installation failures',
    'Docker build context excludes deployment values, local state, dependencies, logs, and secret-shaped files',
    'Git ignore keeps my-values tracked while excluding only local workspace namespace state',
    'Deploy script remains executable as the canonical operator deployment surface',
    'Deploy script prompts for and remembers a workspace namespace',
    'Deploy script exposes component switches only for optional infrastructure',
    'Deploy script exposes guided secret setup for required Kubernetes Secrets',
    'Deploy script exposes canonical Tailscale operator installation for final-preview ingress',
    'Tailscale operator deployment uses Kubernetes Secret/operator-oauth, repository-local values, and pod readiness',
    'Infra rollout failures fail closed unless ALLOW_PARTIAL_INFRA is explicit',
    'Deploy script exposes a non-privileged rootless BuildKit node capability preflight',
    'Rootless BuildKit preflight verifies a real worker without Kubernetes API credentials or node mutation',
    'Deploy script exposes canonical pod-level smoke commands for the deployed agents',
    'Deploy smoke waits for rollout and pod readiness before checking the live pod surface',
    'Deploy smoke verifies in-pod gateway status, runtime skills mount, and runtime swarm config',
    'Deploy teardown and destroy commands share one destructive implementation surface',
    'Deploy script classifies optional setup/status/teardown failures instead of using broad silent fallbacks',
    'Setup scripts classify optional failures, fence legacy broad git setup behind explicit opt-in, and document tracked deploy values',
    'Rendered Helm manifest passes kubeconform strict validation',
  ],
  kubeconform: {
    summary: kubeconformSummary,
    busterSummary: busterKubeconformSummary,
    networkPolicySummary: networkPolicyKubeconformSummary,
    localInfraSummary: localInfraKubeconformSummary,
  },
};

quietConsole.restore();
console.log(JSON.stringify(result, null, 2));
