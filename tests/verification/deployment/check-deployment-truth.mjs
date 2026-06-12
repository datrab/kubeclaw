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
const deployScriptPath = path.join(sourceRoot, 'scripts', 'deploy.sh');
const setupScriptPath = path.join(sourceRoot, 'scripts', 'setup.sh');
const setupSecretsScriptPath = path.join(sourceRoot, 'my-values', 'setup-secrets.sh');
const busterNamespaceControllerScriptPath = path.join(sourceRoot, 'scripts', 'buster-namespace-controller.mjs');
const dockerignorePath = path.join(sourceRoot, '.dockerignore');
const gitignorePath = path.join(sourceRoot, '.gitignore');
const tailscaleValuesPath = path.join(sourceRoot, 'my-values', 'infra', 'tailscale-operator-values.yaml');
const registryLocalManifestPath = path.join(sourceRoot, 'my-values', 'infra', 'registry-local.yaml');
const litellmManifestPath = path.join(sourceRoot, 'my-values', 'infra', 'litellm-deployment.yaml');
const networkPoliciesPath = path.join(sourceRoot, 'my-values', 'infra', 'network-policies.yaml');
const busterNamespaceFencePath = path.join(sourceRoot, 'my-values', 'infra', 'buster-namespace-fence.yaml');
const imageBuildWorkflowPath = path.join(sourceRoot, '.github', 'workflows', 'build-images.yaml');
const generalDockerfilePath = path.join(sourceRoot, 'docker', 'Dockerfile.general');
const sandboxDockerfilePath = path.join(sourceRoot, 'docker', 'Dockerfile.sandbox');
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

function envValue(container, name) {
  return (container?.env || []).find((entry) => entry?.name === name)?.value;
}

function preStopCommand(container) {
  return (container?.lifecycle?.preStop?.exec?.command || []).join('\n');
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
const deployScript = fs.readFileSync(deployScriptPath, 'utf8');
const setupScript = fs.readFileSync(setupScriptPath, 'utf8');
const setupSecretsScript = fs.readFileSync(setupSecretsScriptPath, 'utf8');
const busterNamespaceControllerScript = fs.readFileSync(busterNamespaceControllerScriptPath, 'utf8');
const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
const gitignore = fs.readFileSync(gitignorePath, 'utf8');
const tailscaleValues = fs.readFileSync(tailscaleValuesPath, 'utf8');
const registryLocalManifest = fs.readFileSync(registryLocalManifestPath, 'utf8');
const litellmManifest = fs.readFileSync(litellmManifestPath, 'utf8');
const networkPolicies = fs.readFileSync(networkPoliciesPath, 'utf8');
const imageBuildWorkflow = fs.readFileSync(imageBuildWorkflowPath, 'utf8');
const generalDockerfile = fs.readFileSync(generalDockerfilePath, 'utf8');
const sandboxDockerfile = fs.readFileSync(sandboxDockerfilePath, 'utf8');
const namespaceControllerDockerfile = fs.readFileSync(namespaceControllerDockerfilePath, 'utf8');
const rbacSandboxDocs = fs.readFileSync(rbacSandboxDocsPath, 'utf8');
const deployScriptMode = fs.statSync(deployScriptPath).mode;
const renderedSwarmConfigMap = findRenderedDocument(rendered, {
  kind: 'ConfigMap',
  name: 'agent-nova-swarm-config',
});
const renderedSwarmConfig = extractLiteralDataBlock(renderedSwarmConfigMap, 'swarm.config.json');
const renderedSemgrepConfig = extractLiteralDataBlock(renderedSwarmConfigMap, '.semgrep.yml');
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
const busterGatewayContainerObject = containerByName(busterDeploymentObject, 'kubeclaw');
const busterPipelineContainerObject = containerByName(busterDeploymentObject, 'buster-pipeline');
const busterNamespaceControllerContainerObject = containerByName(busterNamespaceControllerDeploymentObject, 'controller');
const busterNamespaceControllerPrefixEnvObject = (busterNamespaceControllerContainerObject.env || [])
  .find((entry) => entry?.name === 'BUSTER_ALLOWED_NAMESPACE_PREFIXES');
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
  renderedBusterObjects.some((object) => rulesGrantResource(object?.rules, 'pods/exec')),
  false,
  'Structured Buster render must not grant pods/exec to the agent runtime',
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
  busterNamespaceControllerScript,
  'function normalizeLeaseNamespaceName(requestedName)',
  'Buster namespace controller must normalize requested lease namespace names',
);
assertIncludes(
  busterNamespaceControllerScript,
  "if (allowedPrefixes.has('test')) return 'test';",
  'Buster namespace controller must default unprefixed lease namespace requests to test-*',
);
assertIncludes(
  busterNamespaceControllerScript,
  '63 - prefix.length - 1',
  'Buster namespace controller must keep normalized namespaces within the DNS label length limit',
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
  ['/sandbox', '/var/lib/containers'],
  'Structured Buster gateway container must mount bounded sandbox storage',
);
assert.deepEqual(
  containerMountPaths(busterPipelineContainerObject).filter((mountPath) => ['/var/lib/containers', '/sandbox'].includes(mountPath)).sort(),
  ['/sandbox', '/var/lib/containers'],
  'Structured Buster pipeline container must mount bounded sandbox storage',
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
assert.equal(resourceQuantity(busterPipelineContainerObject, 'limits', 'ephemeral-storage'), '50Gi', 'Structured Buster pipeline ephemeral-storage limit must be 50Gi');
assert.equal(volumeByName(busterDeploymentObject, 'podman-storage')?.emptyDir?.sizeLimit, '50Gi', 'Structured Buster Podman emptyDir storage must be capped at 50Gi');
assert.equal(busterGatewayContainerObject.livenessProbe?.periodSeconds >= 10, true, 'Buster gateway liveness period must tolerate sandbox pressure');
assert.equal(busterGatewayContainerObject.livenessProbe?.timeoutSeconds >= 5, true, 'Buster gateway liveness timeout must tolerate sandbox pressure');
assert.equal(busterGatewayContainerObject.livenessProbe?.failureThreshold >= 6, true, 'Buster gateway liveness failure threshold must avoid transient restart loops');
assert.equal(busterPipelineContainerObject.livenessProbe?.periodSeconds >= 10, true, 'Buster pipeline liveness period must tolerate sandbox pressure');
assert.equal(busterPipelineContainerObject.livenessProbe?.timeoutSeconds >= 5, true, 'Buster pipeline liveness timeout must tolerate sandbox pressure');
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
    && [22, 80, 443, 6379, 6333, 6334, 4000, 5000, 5001].every((port) => policyPorts(policy, 'egress').includes(port)),
  'Structured NetworkPolicy baseline must preserve agent service, Git, web, and registry egress',
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
assertIncludes(rendered, 'cp -r /app/skills/. /skills-merged/', 'Rendered init container must merge packaged skills into the runtime overlay');
assertIncludes(rendered, 'cp -r /init-skills/. /skills-merged/', 'Rendered init container must overlay custom skills after packaged skills');
assertIncludes(rendered, 'customSkills may not override protected runtime skill path', 'Rendered init container must block custom skill overlays from replacing core runtime paths');
assertIncludes(rendered, 'pipeline|pipeline/*|pipeline.ts|common|common/*|nova/pipeline|nova/pipeline/*|buster/pipeline|buster/pipeline/*|redis.ts|buster-pipeline.ts|verify-task.ts', 'Rendered init container must keep the protected runtime skill denylist');
assertIncludes(rendered, 'mountPath: /app/skills', 'Rendered pod must mount the merged skills directory into /app/skills');
assertIncludes(rendered, 'value: "/home/node/.openclaw/swarm.config.json"', 'Rendered deployment must pin SWARM_CONFIG to the runtime config path');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw', 'Rendered deployment must mount the runtime config surface at /home/node/.openclaw');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw-persisted', 'Rendered deployment must keep the retained config PVC available as persistent source config');
assertIncludes(rendered, 'mountPath: /runtime-config', 'Rendered init container must mount the runtime config emptyDir');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw/openclaw.json', 'Rendered deployment must overlay runtime openclaw.json onto the normal config path');
assertIncludes(rendered, 'subPath: openclaw.json', 'Rendered deployment must mount only the runtime openclaw.json file over the persistent source');
assertIncludes(rendered, 'mountPath: /home/node/.openclaw/swarm.config.json', 'Rendered deployment must overlay runtime swarm.config.json onto the normal config path');
assertIncludes(rendered, 'subPath: swarm.config.json', 'Rendered deployment must mount only the runtime swarm.config.json file over the persistent source');
assertIncludes(rendered, 'emptyDir: {}', 'Rendered deployment must include emptyDir-backed runtime config storage');
assert.equal(rendered.includes('mountPath: /app/config'), false, 'Rendered deployment must not mount the stale /app/config runtime config path');
assert.equal(rendered.includes('sed -i "s|__LITELLM_API_KEY__|'), false, 'Rendered init container must not substitute secrets into the retained config PVC with sed');
assert.equal(rendered.includes('sed -i "s|__DISCORD_TOKEN__|'), false, 'Rendered init container must not substitute Discord tokens into the retained config PVC with sed');
assertIncludes(rendered, 'openclaw.json source normalized without literal runtime secrets', 'Rendered init container must normalize persistent openclaw.json as secret-free source config');
assertIncludes(rendered, 'openclaw.json rendered into runtime config', 'Rendered init container must render secret-expanded openclaw.json only into runtime config');
assertIncludes(rendered, 'swarm.config.json rendered into runtime config', 'Rendered init container must render webhook-expanded swarm.config.json only into runtime config');
assertIncludes(rendered, 'removed discord_webhook_url from persistent swarm.config.json source', 'Rendered init container must remove webhook secrets from persistent swarm.config.json');
assertIncludes(rendered, 'kubeclaw-health.mjs', 'Rendered init container must generate the reusable agent health script');
assertIncludes(rendered, 'function checkDrainState()', 'Rendered health script must include drain-aware readiness');
assertIncludes(rendered, "await check('drain state', checkDrainState)", 'Rendered readiness must fail when the container is draining');
assertIncludes(rendered, "redis.xadd(stream, 'MAXLEN'", 'Rendered health script must write a Redis stream smoke entry');
assertIncludes(rendered, 'registry-local.kubeclaw.svc.cluster.local:5001', 'Rendered health env must include registry-local reachability checks');
assertIncludes(rendered, 'registry-mirror.kubeclaw.svc.cluster.local:5000', 'Rendered health env must include registry-mirror reachability checks');
assertIncludes(rendered, 'KUBECLAW_HEALTH_CHECK_LITELLM', 'Rendered health env must expose optional LiteLLM readiness checks');
assertIncludes(rendered, 'KUBECLAW_HEALTH_CHECK_QDRANT', 'Rendered health env must expose optional Qdrant readiness checks');
assertIncludes(rendered, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Rendered init container must keep swarm.config.json source on the retained config PVC');
assertIncludes(rendered, 'cp -Lf /config/.semgrep.yml /runtime-config/.semgrep.yml', 'Rendered init container must copy .semgrep.yml into runtime config');
assertIncludes(renderedBuster, 'kind: Service', 'Buster Helm render must include a Service');
assertIncludes(renderedBuster, 'name: agent-buster', 'Buster Helm render must target the Buster release');
assertIncludes(renderedBuster, 'type: ClusterIP', 'Rendered Buster gateway Service must be cluster-internal by default');
assert.equal(renderedBuster.includes('nodePort: 30074'), false, 'Rendered Buster gateway must not expose a NodePort');
assertIncludes(renderedBuster, 'kind: Deployment', 'Buster Helm render must include a Deployment');
assertIncludes(renderedBuster, 'image: "ghcr.io/datrab/kubeclaw-sandbox:latest"', 'Buster deployment must render the sandbox runtime image');
assertIncludes(renderedBuster, 'name: kubeclaw', 'Buster deployment must render the OpenClaw gateway container');
assertIncludes(renderedBuster, 'name: buster-pipeline', 'Buster deployment must render the Buster pipeline worker container separately');
assertIncludes(renderedBuster, 'value: "gateway"', 'Buster gateway container must expose its health role explicitly');
assertIncludes(renderedBuster, 'value: "buster-pipeline"', 'Buster pipeline container must expose its health role explicitly');
assertIncludes(renderedBuster, '- /app/openclaw.mjs', 'Buster gateway container must start OpenClaw gateway directly');
assertIncludes(renderedBuster, '- /app/skills/buster-pipeline.ts', 'Buster pipeline container must start the Buster worker directly');
assert.equal(renderedBuster.includes('wait -n'), false, 'Buster deployment must not couple gateway and worker through shell wait supervision');
assert.equal(renderedBuster.includes('BUSTER_PIPELINE_PID'), false, 'Buster deployment must remove the old shell-supervised worker PID path');
assertIncludes(renderedBuster, 'name: OPENCLAW_GATEWAY_URL', 'Buster deployment must expose the colocated gateway URL to the Buster startup process');
assertIncludes(renderedBuster, 'value: "http://127.0.0.1:18789"', 'Buster deployment must point Buster startup checks at the colocated gateway port');
assertIncludes(renderedBuster, 'name: REPO_ROOT', 'Buster deployment must pass the mounted checkout path to runtime processes');
assertIncludes(renderedBuster, 'value: "/home/node/.openclaw/workspace/git-repo"', 'Buster deployment must point REPO_ROOT at the workspace-mounted Git checkout');
assertIncludes(renderedBuster, 'mountPath: /home/node/.openclaw/workspace', 'Buster containers must share the OpenClaw workspace runtime mount');
assertIncludes(renderedBuster, 'mountPath: /home/node/.openclaw/openclaw.json', 'Buster containers must share the rendered OpenClaw runtime config');
assertIncludes(renderedBuster, 'mountPath: /home/node/.openclaw/swarm.config.json', 'Buster containers must share the rendered swarm runtime config');
assertIncludes(renderedBuster, 'mountPath: /app/skills', 'Buster containers must share the merged skills runtime');
assertIncludes(renderedBuster, 'config.buster.runtime.heartbeat_path is required', 'Buster readiness must use swarm.config.json as heartbeat path authority');
assert.equal(renderedBuster.includes('BUSTER_HEARTBEAT_PATH'), false, 'Buster deployment must not keep heartbeat path env fallback after swarm config owns it');
assert.equal(renderedBuster.includes('BUSTER_HEARTBEAT_INTERVAL_MS'), false, 'Buster deployment must not keep obsolete heartbeat interval env fallback');
assertIncludes(renderedBuster, 'KUBECLAW_HEALTH_CHECK_BUSTER_HEARTBEAT', 'Buster deployment must enable Buster heartbeat readiness checks');
assertIncludes(renderedBusterGatewayUrlOverride, 'value: "http://agent-buster.kubeclaw.svc.cluster.local:18789"', 'Buster deployment must honor gateway.url when explicitly configured');
assertIncludes(renderedBuster, 'shareProcessNamespace: false', 'Buster sandbox deployment must not share the pod process namespace');
assertIncludes(renderedBuster, 'privileged: true', 'Buster sandbox deployment must retain privileged Podman-in-Pod execution');
assertIncludes(renderedBuster, 'mountPath: /var/lib/containers', 'Buster sandbox deployment must mount Podman container storage');
assertIncludes(renderedBuster, 'mountPath: /sandbox', 'Buster sandbox deployment must mount the sandbox workspace');
assertIncludes(renderedBuster, 'ephemeral-storage: 50Gi', 'Buster sandbox containers must bound ephemeral storage at 50Gi');
assertIncludes(renderedBuster, 'sizeLimit: 50Gi', 'Buster Podman emptyDir storage must be capped at 50Gi');
assertMatchCountAtLeast(renderedBusterDeployment, 'privileged: true', 2, 'Buster gateway and pipeline containers must both retain sandbox execution privileges');
assertMatchCountAtLeast(renderedBusterDeployment, 'mountPath: /var/lib/containers', 2, 'Buster gateway and pipeline containers must both mount Podman container storage');
assertMatchCountAtLeast(renderedBusterDeployment, 'mountPath: /sandbox', 2, 'Buster gateway and pipeline containers must both mount the sandbox workspace');
assertIncludes(renderedBuster, 'name: agent-buster-podman-registries', 'Buster render must include Podman registry configuration');
assertIncludes(renderedBuster, 'registry-local.kubeclaw.svc.cluster.local:5001', 'Buster Podman registries must preserve registry-local for live verification images');
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
  'Legacy Non-Broker Fallback',
  'RBAC docs must keep broad tester RBAC scoped to the legacy non-broker fallback',
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
assertIncludes(deploymentTemplate, 'cp -r /app/skills/. /skills-merged/', 'Deployment template must retain the packaged-skill merge step');
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
assertIncludes(deploymentTemplate, "if (mode !== 'readiness') return;", 'Deployment template drain checks must affect readiness only');
assertIncludes(deploymentTemplate, "await check('drain state', checkDrainState)", 'Deployment template readiness checks must fail while the container is draining');
assertIncludes(deploymentTemplate, 'date -Iseconds > "$DRAIN_FILE"', 'Deployment template preStop hook must create the drain marker');
assertIncludes(deploymentTemplate, 'sleep "${KUBECLAW_PRESTOP_DRAIN_SECONDS:-5}"', 'Deployment template preStop hook must give readiness a short drain handoff');
assert.equal(deploymentTemplate.includes('tcpSocket:'), false, 'Deployment template must not use TCP-only probes');
assert.equal(deploymentTemplate.includes("if (containerRole === 'buster-pipeline')"), false, 'Deployment liveness must not restart Buster pipeline solely on heartbeat age');
assertIncludes(deploymentTemplate, "containerRole !== 'buster-pipeline'", 'Deployment liveness must keep Buster pipeline liveness local-only');
assert.equal(deploymentTemplate.includes('git pull origin main || echo'), false, 'Deployment init must not swallow git pull failures');
assertIncludes(deploymentTemplate, 'git clone "$GIT_REPO_URL" "$REPO_DIR"', 'Deployment init must fail closed on first clone failure');
assertIncludes(deploymentTemplate, 'git diff --quiet && git diff --cached --quiet', 'Deployment init must preserve existing workspace local edits');
assertIncludes(deploymentTemplate, 'git fetch origin main', 'Deployment init must fetch before non-destructive workspace sync');
assertIncludes(deploymentTemplate, 'git merge --ff-only origin/main', 'Deployment init must only fast-forward clean existing workspaces');
assertIncludes(deploymentTemplate, 'Repository diverged from origin/main; refusing unsafe init merge.', 'Deployment init must fail on diverged existing workspaces');
assertIncludes(deploymentTemplate, 'Git fetch failed; keeping existing workspace checkout.', 'Deployment init must make stale existing workspace startup explicit');
assertIncludes(deploymentTemplate, "redis.xadd(stream, 'MAXLEN'", 'Deployment template health script must write a Redis stream smoke entry');
assertIncludes(deploymentTemplate, 'checkRegistries', 'Deployment template health script must check configured registries');
assertIncludes(deploymentTemplate, 'checkLiteLLM', 'Deployment template health script must check LiteLLM when enabled');
assertIncludes(deploymentTemplate, 'checkQdrant', 'Deployment template health script must check Qdrant when enabled');
assertIncludes(deploymentTemplate, 'checkBusterHeartbeat', 'Deployment template health script must check Buster heartbeat when enabled');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw-persisted', 'Deployment template must expose the retained config PVC separately from runtime config');
assertIncludes(deploymentTemplate, 'mountPath: /runtime-config', 'Deployment template must mount runtime config into the init container');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw/openclaw.json', 'Deployment template must overlay runtime openclaw.json onto the normal config path');
assertIncludes(deploymentTemplate, 'subPath: openclaw.json', 'Deployment template must mount only the runtime openclaw.json file over the persistent source');
assertIncludes(deploymentTemplate, 'mountPath: /home/node/.openclaw/swarm.config.json', 'Deployment template must overlay runtime swarm.config.json onto the normal config path');
assertIncludes(deploymentTemplate, 'subPath: swarm.config.json', 'Deployment template must mount only the runtime swarm.config.json file over the persistent source');
assertIncludes(deploymentTemplate, 'openclaw.json source normalized without literal runtime secrets', 'Deployment template must normalize persistent openclaw.json as secret-free source config');
assertIncludes(deploymentTemplate, 'openclaw.json rendered into runtime config', 'Deployment template must render openclaw.json into emptyDir-backed runtime config');
assertIncludes(deploymentTemplate, 'swarm.config.json rendered into runtime config', 'Deployment template must render swarm.config.json into emptyDir-backed runtime config');
assertIncludes(deploymentTemplate, 'removed discord_webhook_url from persistent swarm.config.json source', 'Deployment template must remove webhook secrets from persistent swarm.config.json source');
assert.equal(deploymentTemplate.includes('sed -i "s|__LITELLM_API_KEY__|'), false, 'Deployment template must not substitute LiteLLM secrets into the retained config PVC');
assert.equal(deploymentTemplate.includes('sed -i "s|__DISCORD_TOKEN__|'), false, 'Deployment template must not substitute Discord secrets into the retained config PVC');
assert.equal(deploymentTemplate.includes('mountPath: /app/config'), false, 'Deployment template must not mount the stale /app/config runtime config path');
assertIncludes(deploymentTemplate, 'removed obsolete kubeclaw-agent-observer plugin load path', 'Deployment template must include the persistent openclaw.json observer plugin path migration');
assert.equal(gatewayConfigTemplate.includes('/app/openclaw-plugins/kubeclaw-agent-observer'), false, 'Gateway config template must not seed the obsolete observer plugin load path');
assertIncludes(deploymentTemplate, 'cp -Lf "/init-swarm-config/swarm.config.json" "/config/swarm.config.json"', 'Deployment template must copy swarm.config.json into the retained source config surface');
assertIncludes(deploymentTemplate, 'cp -Lf /config/.semgrep.yml /runtime-config/.semgrep.yml', 'Deployment template must copy .semgrep.yml into the runtime config surface');
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
assertIncludes(imageBuildWorkflow, 'docker/Dockerfile.namespace-controller', 'Image-build workflow must build the namespace controller image from docker/Dockerfile.namespace-controller');
assertIncludes(imageBuildWorkflow, 'image_suffix: kubeclaw-namespace-controller', 'Image-build workflow must publish the kubeclaw-namespace-controller image');
assertDockerInstallCommandsFailClosed(generalDockerfile, 'General Dockerfile');
assertDockerInstallCommandsFailClosed(sandboxDockerfile, 'Sandbox Dockerfile');
assertIncludes(namespaceControllerDockerfile, 'FROM node:22-bookworm-slim', 'Namespace controller Dockerfile must use a lightweight Node image');
assertIncludes(namespaceControllerDockerfile, 'COPY scripts/buster-namespace-controller.mjs /app/scripts/buster-namespace-controller.mjs', 'Namespace controller Dockerfile must package the namespace controller entrypoint');
assertIncludes(namespaceControllerDockerfile, 'USER node', 'Namespace controller Dockerfile must run as the non-root node user');
assert.equal(
  namespaceControllerDockerfile.includes('ghcr.io/openclaw/openclaw'),
  false,
  'Namespace controller Dockerfile must not inherit the OpenClaw runtime image',
);
assertIncludes(sandboxDockerfile, 'RUN npm install -g lighthouse serve playwright', 'Sandbox Dockerfile must fail closed when browser test tool installation fails');
assertIncludes(sandboxDockerfile, '&& agent-browser install --with-deps', 'Sandbox Dockerfile must fail closed when agent-browser dependency installation fails');
assertLine(dockerignore, '**', 'Docker build context must default-deny repository files');
assertLine(dockerignore, '!docker/Dockerfile.namespace-controller', 'Docker build context must include the namespace controller Dockerfile');
assertLine(dockerignore, '!skills/**', 'Docker build context must include runtime skills');
assertLine(dockerignore, '!plugins/openclaw-agent-observer/**', 'Docker build context must include observer plugin source');
assertLine(dockerignore, '!scripts/buster-namespace-controller.mjs', 'Docker build context must include the namespace controller entrypoint');
assertLine(dockerignore, 'my-values/', 'Docker build context must exclude deployment values');
assertLine(dockerignore, '.swarm/', 'Docker build context must exclude local swarm logs and state');
assertLine(dockerignore, 'worktrees/', 'Docker build context must exclude local worktrees');
assertLine(dockerignore, '**/node_modules/', 'Docker build context must exclude local dependencies');
assertLine(dockerignore, 'plugins/openclaw-agent-observer/dist/', 'Docker build context must exclude generated observer plugin output');
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
assertIncludes(deployScript, 'cmd_build_local_images() {', 'Deploy script must expose a canonical local image-build command for deployment verification');
assertIncludes(deployScript, 'cmd_verify_live() {', 'Deploy script must expose a canonical live deployment verification command');
assertIncludes(deployScript, 'deploy_tailscale_operator() {', 'Deploy script must expose a canonical Tailscale operator deployment command');
assertIncludes(deployScript, 'cmd_secrets() {', 'Deploy script must expose a canonical guided secret setup command');
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
assertIncludes(deployScript, 'docker build -f "$REPO_DIR/$dockerfile" -t "$push_repo:$tag" "$REPO_DIR"', 'Deploy verification must use a canonical docker build helper rooted at the repo');
assertIncludes(deployScript, 'build_local_image "general" "docker/Dockerfile.general" "$push_registry/kubeclaw-general" "$tag"', 'Deploy verification must build the general image from docker/Dockerfile.general');
assertIncludes(deployScript, 'build_local_image "sandbox" "docker/Dockerfile.sandbox" "$push_registry/kubeclaw-sandbox" "$tag"', 'Deploy verification must build the sandbox image from docker/Dockerfile.sandbox');
assertIncludes(deployScript, 'build_local_image "namespace-controller" "docker/Dockerfile.namespace-controller" "$push_registry/kubeclaw-namespace-controller" "$tag"', 'Deploy verification must build the namespace controller image from docker/Dockerfile.namespace-controller');
assertIncludes(deployScript, 'LOCAL_REGISTRY_PUSH is required because registry-local is ClusterIP by default.', 'Deploy verification must not assume a registry-local NodePort push path');
assertIncludes(deployScript, 'LOCAL_REGISTRY_PULL is required because registry-local is ClusterIP by default.', 'Live verification must require an explicit cluster pull path');
assertIncludes(deployScript, 'verify_cluster_image_pull() {', 'Live deployment verification must define a cluster image-pull preflight');
assertIncludes(deployScript, 'kubectl run "$pod"', 'Live deployment verification must use a temporary pod to prove cluster image pulls');
assertIncludes(deployScript, '--image-pull-policy=Always', 'Live deployment verification image-pull preflight must force a fresh pull');
assertIncludes(deployScript, 'kubectl wait --for=condition=Ready "pod/$pod"', 'Live deployment verification must wait for the image-pull preflight pod to become Ready');
assertIncludes(deployScript, 'kubectl describe pod "$pod"', 'Live deployment verification must describe the failed preflight pod');
assertIncludes(deployScript, 'local general_image="$pull_registry/kubeclaw-general:$tag"', 'Live deployment verification must resolve the exact general image ref before redeploying agents');
assertIncludes(deployScript, 'local sandbox_image="$pull_registry/kubeclaw-sandbox:$tag"', 'Live deployment verification must resolve the exact sandbox image ref before redeploying agents');
assertIncludes(deployScript, 'local namespace_controller_image="$pull_registry/kubeclaw-namespace-controller:$tag"', 'Live deployment verification must resolve the exact namespace controller image ref before redeploying agents');
assertIncludes(deployScript, 'verify_cluster_image_pull "$general_image"', 'Live deployment verification must preflight the deployed general image pull path before redeploying agents');
assertIncludes(deployScript, 'verify_cluster_image_pull "$sandbox_image"', 'Live deployment verification must preflight the deployed sandbox image pull path before redeploying agents');
assertIncludes(deployScript, 'verify_cluster_image_pull "$namespace_controller_image"', 'Live deployment verification must preflight the namespace controller image pull path before redeploying agents');
assertIncludes(deployScript, 'cmd_build_local_images "$tag"', 'Live deployment verification must invoke the local image-build step before redeploying');
assertIncludes(deployScript, 'GENERAL_IMAGE_REPOSITORY="$pull_registry/kubeclaw-general"', 'Live deployment verification must redeploy Nova against the registry-local general image');
assertIncludes(deployScript, 'SANDBOX_IMAGE_REPOSITORY="$pull_registry/kubeclaw-sandbox"', 'Live deployment verification must redeploy Buster against the registry-local sandbox image');
assertIncludes(deployScript, 'NAMESPACE_CONTROLLER_IMAGE_REPOSITORY="$pull_registry/kubeclaw-namespace-controller"', 'Live deployment verification must redeploy the namespace controller against the registry-local controller image');
assertIncludes(deployScript, 'controller_image_repo="${BUSTER_CONTROLLER_IMAGE_REPOSITORY:-${NAMESPACE_CONTROLLER_IMAGE_REPOSITORY:-}}"', 'Buster deploy overrides must keep the namespace controller on the dedicated controller image repository');
assertIncludes(deployScript, 'controller_image_tag="${BUSTER_CONTROLLER_IMAGE_TAG:-${NAMESPACE_CONTROLLER_IMAGE_TAG:-}}"', 'Buster deploy overrides must keep the namespace controller on the dedicated controller image tag');
assertIncludes(deployScript, '--set probes.dependencies.litellm.enabled=false', 'Agent deployment must disable LiteLLM readiness checks when LiteLLM infrastructure is intentionally disabled');
assertIncludes(deployScript, '--set probes.dependencies.qdrant.enabled=false', 'Agent deployment must disable Qdrant readiness checks when Qdrant infrastructure is intentionally disabled');
assertIncludes(deployScript, 'DISABLE_IMAGE_PULL_SECRETS=1', 'Live deployment verification must drop GHCR pull secrets when redeploying against registry-local');
assertIncludes(deployScript, 'cmd_smoke_agent() {', 'Deploy script must expose a canonical single-agent smoke command');
assertIncludes(deployScript, 'cmd_smoke() {', 'Deploy script must expose a canonical multi-agent smoke command');
assertIncludes(deployScript, 'cmd_agents', 'Live deployment verification must redeploy the agents before smoke runs');
assertIncludes(deployScript, 'kubectl rollout status deployment/$release -n "$NAMESPACE" --timeout=180s', 'Deploy smoke must wait for deployment rollout before declaring success');
assertIncludes(deployScript, 'kubectl wait --for=condition=Ready pod -l "app.kubernetes.io/instance=$release" -n "$NAMESPACE" --timeout=180s', 'Deploy smoke must wait for a ready pod on the deployed release');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- openclaw gateway status', 'Deploy smoke must verify the in-pod OpenClaw gateway status');
assertIncludes(deployScript, 'kubectl exec -n "$NAMESPACE" deployment/$release -c kubeclaw -- test -d /app/skills', 'Deploy smoke must verify packaged skills are present in the running pod');
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
    'Rendered Buster Deployment preserves sandbox image and privileged Podman-in-Pod surface',
    'Rendered Buster Deployment bounds Podman emptyDir and container ephemeral storage',
    'Rendered Buster Deployment uses conservative liveness budgets for gateway and pipeline containers',
    'Structured Buster checks enforce lease-only agent RBAC and bounded sandbox resources',
    'Rendered Buster Deployment separates buster-pipeline.ts from the OpenClaw gateway container',
    'Rendered Buster containers share OpenClaw runtime config, workspace, and merged skills',
    'Rendered Buster gateway and pipeline containers both retain sandbox execution privileges and mounts',
    'Rendered Buster Deployment exposes the colocated OpenClaw gateway URL to Buster startup',
    'Rendered Buster Deployment honors the explicit gateway.url override',
    'Rendered Buster Deployment keeps Redis, gateway-token, and Anthropic secret wiring',
    'Rendered Buster broker includes BusterNamespaceLease, namespace controller, and lease-client RBAC',
    'Rendered BusterNamespaceLease status schema omits plaintext credentials and keeps credential availability only',
    'Buster namespace controller normalizes human lease namespace requests into test-* namespaces',
    'Buster namespace fence denies direct Buster namespace lifecycle and constrains the controller to managed test namespaces',
    'Rendered Buster broker mode omits the legacy broad k8s tester ClusterRole and pods/exec grant',
    'RBAC docs distinguish broker-mode lease-client Buster authority from namespace-controller and legacy fallback authority',
    'Rendered Buster Podman registries preserve registry-local live-verification pull path',
    'registry-local stays ClusterIP while LiteLLM preserves its temporary NodePort',
    'NetworkPolicies define default-deny ingress and egress with explicit service allowances',
    'Structured NetworkPolicy checks verify expected selectors and ports',
    'Local infra manifests pass kubeconform where Kubernetes schemas are available',
    'Rendered Buster Deployment removes the legacy stream-processor sidecar',
    'Chart and production values remove processor configuration',
    'Rendered Deployment preserves packaged-skills merge before custom overlay',
    'Rendered Deployment blocks customSkills from overriding core runtime paths',
    'Rendered pod mounts merged skills at /app/skills',
    'Rendered Deployment pins SWARM_CONFIG to /home/node/.openclaw/swarm.config.json',
    'Rendered init flow keeps persistent config secret-free and renders secrets only into runtime config',
    'Rendered probes use dependency-aware health checks instead of TCP-only port checks',
    'Rendered agent Deployments define shutdown grace, preStop drain markers, and drain-aware readiness',
    'Rendered swarm-config ConfigMap matches the chart-provided swarm.config.json and .semgrep.yml artifacts',
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
    'Deploy script exposes a canonical local image-build command for deployment verification',
    'Deploy script exposes a canonical live deployment verification command',
    'Live deployment verification builds runtime and namespace controller images and pushes them to registry-local',
    'Live deployment verification preflights every deployed runtime image pull path',
    'Live deployment verification redeploys Nova and Buster against registry-local before smoke runs',
    'Deploy script exposes canonical pod-level smoke commands for the deployed agents',
    'Deploy smoke waits for rollout and pod readiness before checking the live pod surface',
    'Deploy smoke verifies in-pod gateway status, packaged skills, and runtime swarm config',
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
