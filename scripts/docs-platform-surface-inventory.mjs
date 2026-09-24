#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  discoverGoKubernetesConnections,
  discoverGoServerRoutes,
  discoverOutboundConnections,
  discoverMethodAwareServerRoutes,
  discoverRuntimeDependencySignals,
} from './platform-surface-source-discovery.mjs';

const scriptRoot = path.resolve(import.meta.dirname, '..');
const sourceRootOverride = process.env.KUBECLAW_DOCS_SOURCE_ROOT;
const isolatedMutation = process.env.KUBECLAW_DOCS_ISOLATED_MUTATION === '1';
const root = path.resolve(sourceRootOverride ?? scriptRoot);
assert(!isolatedMutation || (sourceRootOverride && root !== scriptRoot),
  'KUBECLAW_DOCS_ISOLATED_MUTATION requires an isolated KUBECLAW_DOCS_SOURCE_ROOT');
const check = process.argv.includes('--check');
const sourceRevision = '1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de';
const busterReadyActivation = 'requires busterNamespaceBroker.controller.readiness.enabled=true; selected my-values/buster-values.yaml inherits the chart default false';
const busterProductActivation = 'requires busterNamespaceBroker.controller.readiness.enabled=true and busterNamespaceBroker.controller.productDecisions.enabled=true (BUSTER_PRODUCT_ENABLED=true); selected my-values/buster-values.yaml inherits the chart default false for both';
const jsonTarget = path.join(root, 'docs/generated/inventory/platform-surfaces.json');
const pageTarget = path.join(root, 'docs/site/reference/platform-surfaces-generated.md');
const mappingTarget = path.join(root, 'docs/config/platform-surface-map.json');
const acceptanceContractSource = 'docs/blueprint/AP09-acceptance-contract.md';
const mutationGroups = {
  dependency: ['dependencySignals', 'DOC_DRIFT_DEPENDENCY'],
  endpoint: ['endpoints', 'DOC_DRIFT_ENDPOINT'],
  outbound: ['outboundConnections', 'DOC_DRIFT_OUTBOUND'],
  event: ['events', 'DOC_DRIFT_EVENT'],
  store: ['stores', 'DOC_DRIFT_STORE'],
  secret: ['secretReferences', 'DOC_DRIFT_SECRET'],
  'runtime-service': ['resources', 'DOC_DRIFT_RUNTIME_SERVICE'],
  'ops-tool': ['opsTools', 'DOC_DRIFT_OPS_TOOL'],
};

const routeSources = [
  'skills/buster/engine/test-gates/remote-plan-http.ts',
  'skills/prism/server/agent-bridge.mjs',
  'skills/prism/server/agent-job-routes.ts',
  'skills/prism/server/control-server.ts',
  'skills/prism/server/ingestion.ts',
  'skills/prism/server/worker-lifecycle.ts',
  'skills/prism/server/worker-service.ts',
  'tools/ops-mcp/src/server.mjs',
];
const goControllerSources = walk(path.join(root, 'cmd/buster-namespace-controller')).map(relative)
  .filter((file) => file.endsWith('.go') && !file.endsWith('_test.go'));
const storeSources = [
  'skills/nova/core/effects/locks.ts',
  'skills/nova/core/execution/engine-run.ts',
  'skills/nova/core/execution/engine-runtime.ts',
  'skills/nova/core/execution/engine-snapshots.ts',
  'skills/nova/core/observability/reconciler.ts',
  'skills/nova/core/state/read-run-evidence.ts',
  'skills/nova/core/test-gates/production.ts',
  'skills/nova/core/test-gates/remote-dispatch-store.ts',
  'skills/nova/core/test-gates/remote-result-import.ts',
  'skills/common/plugin-runtime/foundation/observability/durable-records.ts',
  'skills/worker/core/worker/native-attempt-journal.ts',
  'skills/worker/core/worker/ownership-store.ts',
  'skills/buster/engine/test-gates/native-fixture-journal.ts',
  'skills/buster/engine/test-gates/production.ts',
  'skills/buster/engine/test-gates/runner.ts',
  'skills/prism/server/ingestion.ts',
  'skills/prism/server/native-worker-execution.ts',
];
const dependencyDefinitions = [
  ['kubernetes-api', 'current-profile-required', 'charts/ops-pod/templates/network.yaml', 'kube-apiserver'],
  ['cluster-dns', 'current-profile-required', 'charts/ops-pod/templates/network.yaml', 'kube-dns'],
  ['persistent-storage', 'current-profile-required', 'charts/kubeclaw/templates/pvc.yaml', 'kind: PersistentVolumeClaim'],
  ['cluster-cni', 'current-profile-required', 'charts/prism/templates/networkpolicy.yaml', 'kind: NetworkPolicy'],
  ['cilium-secured-deployment-profile', 'current-profile-required', 'my-values/infra/spire-network-policies.yaml', 'kind: CiliumNetworkPolicy'],
  ['git-origin', 'current-profile-required', 'my-values/nova-values.yaml', 'repoUrl:'],
  ['redis', 'current-profile-required', 'charts/kubeclaw/values.yaml', 'redis-master.kubeclaw.svc.cluster.local'],
  ['prism-postgresql', 'current-profile-required', 'charts/prism/values.yaml', 'postgresql:'],
  ['litellm-postgresql', 'current-profile-required', 'my-values/setup-secrets.sh', 'DATABASE_URL'],
  ['writable-oci-registry', 'configured-but-unresolved', 'my-values/infra/registry-local.yaml', 'name: registry-local'],
  ['docker-hub-pull-through-mirror', 'configured-but-unresolved', 'my-values/infra/registry-mirror.yaml', 'name: registry-mirror'],
  ['rootless-buildkit', 'current-profile-required', 'my-values/buster-values.yaml', 'CONTAINER_BUILD_BUILDKIT_HOST'],
  ['tailscale-operator', 'current-profile-required', 'gitops/platform/bootstrap/tailscale-operator.yaml', 'name: tailscale-operator'],
  ['litellm', 'current-profile-required', 'my-values/infra/litellm-deployment.yaml', 'name: litellm'],
  ['managed-openai-reasoning', 'enabled-feature-required', 'my-values/prism-agent-values.yaml', 'primary: openai/gpt-5.6-sol'],
  ['vertex-ai-embedding', 'enabled-feature-required', 'my-values/infra/litellm-config.yaml', 'model: vertex_ai/gemini-embedding-001'],
  ['discord-bot-channels', 'enabled-feature-required', 'my-values/nova-values.yaml', 'discord:'],
  ['ghcr-image-registry', 'supply-chain-required', 'my-values/nova-values.yaml', 'repository: ghcr.io/'],
  ['docker-hub-image-registry', 'supply-chain-required', 'charts/prism/values.yaml', 'image: pgvector/pgvector:'],
  ['spire-envoy-worker-trust', 'current-profile-required', 'charts/prism/values.yaml', 'spiffe:'],
  ['openclaw-gateway', 'current-profile-required', 'charts/kubeclaw/templates/deployment.yaml', '/app/openclaw.mjs'],
  ['argocd', 'optional-platform', 'gitops/platform/bootstrap/argocd.yaml', 'name: argocd'],
  ['monitoring-stack', 'optional-platform', 'gitops/platform/bootstrap/prometheus.yaml', 'project: monitoring'],
  ['ops-pod', 'optional-platform', 'gitops/platform/bootstrap/codex-ops.yaml', 'name: codex-ops'],
  ['archviewer', 'optional-platform', 'charts/kubeclaw/templates/archviewer.yaml', 'archviewer.enabled'],
  ['git-mirror', 'planned', 'docs/site/status/roadmap.md', '## Resilient Git Source Acquisition'],
  ['authenticated-https-registry', 'planned', 'docs/site/status/roadmap.md', '## Production-Grade Local OCI Registry'],
  ['automated-host-bootstrap', 'planned', 'docs/site/status/roadmap.md', '## Automated Host Bootstrap and Recovery'],
];
const externalStoreDefinitions = [
  ['helm:redis/data', 'gitops/platform/values/redis.yaml', 'persistence:'],
  ['helm:litellm-postgresql/data', 'gitops/platform/values/postgresql.yaml', 'persistence:'],
  ['helm:grafana/data', 'gitops/platform/values/prometheus.yaml', 'persistence:'],
  ['helm:prometheus/data', 'gitops/platform/values/prometheus.yaml', 'prometheusSpec:'],
  ['helm:loki/data', 'gitops/platform/values/loki.yaml', 'persistence:'],
  ['host:alloy/positions', 'gitops/platform/values/alloy.yaml', '/var/lib/kubeclaw-alloy'],
  ['openclaw/state', 'charts/kubeclaw/templates/deployment.yaml', '/home/node/.openclaw/state/openclaw.sqlite'],
  ['ephemeral:buildkit-cache', 'my-values/buster-values.yaml', 'ephemeral-storage: 8Gi'],
];
const dependencyEvidenceIdentities = new Map([
  ['redis', ['redis']],
  ['prism-postgresql', ['prism-postgresql']],
  ['litellm-postgresql', ['litellm-postgresql']],
  ['writable-oci-registry', ['registry-local']],
  ['docker-hub-pull-through-mirror', ['registry-mirror']],
  ['rootless-buildkit', ['buildkit']],
  ['tailscale-operator', ['tailscale', 'ingress-class:tailscale']],
  ['litellm', ['litellm']],
  ['managed-openai-reasoning', ['openai']],
  ['vertex-ai-embedding', ['vertex-ai']],
  ['discord-bot-channels', ['discord']],
  ['ghcr-image-registry', ['ghcr.io']],
  ['docker-hub-image-registry', ['docker.io']],
]);

function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
  });
}
function relative(target) { return path.relative(root, target).split(path.sep).join('/'); }
function productionSourceFiles(directories) {
  return directories.flatMap((directory) => walk(path.join(root, directory)))
    .map(relative)
    .filter((file) => /\.(?:ts|mjs|js)$/u.test(file)
      && !/(?:^|\/)(?:tests?|fixtures)\//u.test(file)
      && !/\.(?:test|spec)\.[^.]+$/u.test(file));
}
function shippedRuntimeEntrypoints() {
  const manifests = walk(path.join(root, 'skills')).filter((file) => /(?:^|\/)(?:plugin|openclaw\.plugin)\.json$/u.test(file));
  const sources = [];
  for (const manifest of manifests) {
    const value = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const visitModules = (item) => {
      if (Array.isArray(item)) return item.forEach(visitModules);
      if (!item || typeof item !== 'object') return;
      for (const [key, child] of Object.entries(item)) {
        if (key === 'module' && typeof child === 'string') {
          const target = path.resolve(path.dirname(manifest), child);
          assert(fs.existsSync(target), `shipped plugin entrypoint is absent: ${relative(target)}`);
          if (/\.(?:ts|mts|mjs|js)$/u.test(target)) sources.push(relative(target));
        } else visitModules(child);
      }
    };
    visitModules(value);
  }
  return [...new Set(sources)].sort();
}
function lineOf(source, index) { return source.slice(0, index).split('\n').length; }
function literalLocation(value, preferred, candidates) {
  for (const source of [...new Set([preferred, ...candidates])]) {
    if (!source || source.startsWith('helm:') || !fs.existsSync(path.join(root, source))) continue;
    const maintained = read(source);
    const index = maintained.indexOf(value);
    if (index >= 0) return { source, line: lineOf(maintained, index) };
  }
  return { source: preferred, line: undefined };
}
function recordsFromRegex(files, regex, valueAt = 1) {
  const records = [];
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(regex)) records.push({ value: match[valueAt], source: file, line: lineOf(source, match.index) });
  }
  return records;
}
function recordFromNeedle(value, classification, source, needle) {
  const maintained = read(source);
  const index = maintained.indexOf(needle);
  assert(index >= 0, `DOC_DRIFT_DEPENDENCY: dependency ${value} marker is absent from ${source}`);
  return { value, classification, source, line: lineOf(maintained, index), needle };
}
function storeFromNeedle(value, source, needle) {
  const maintained = read(source);
  const index = maintained.indexOf(needle);
  assert(index >= 0, `store ${value} marker is absent from ${source}`);
  return { value, source, line: lineOf(maintained, index) };
}
function distinct(records) {
  const byIdentity = new Map();
  for (const record of records) {
    const identity = `${record.value}\0${record.source}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, record);
  }
  return [...byIdentity.values()].sort((a, b) => a.value.localeCompare(b.value) || a.source.localeCompare(b.source));
}

function redactPublishedIdentity(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\b[0-9]{15,20}\b/gu, '<redacted-identity>')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+?\.[a-z]{2,}(?=\.(?:email|mode|provider)=|[\]\s,;"')]|$)/giu, '<redacted-email>')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/giu, '$1<redacted-credentials>@');
}

function render(name, chart, namespace, values = [], sets = []) {
  const args = ['template', name, chart, '--namespace', namespace];
  for (const value of values) args.push('-f', value);
  for (const setting of sets) args.push('--set-string', setting);
  return execFileSync('helm', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
const namespacedKinds = new Set([
  'AppProject', 'Application', 'CiliumNetworkPolicy', 'ConfigMap', 'CronJob', 'DaemonSet', 'Deployment',
  'Ingress', 'Job', 'NetworkPolicy', 'PersistentVolumeClaim', 'Pod', 'PodDisruptionBudget', 'Role', 'RoleBinding',
  'Secret', 'Service', 'ServiceAccount', 'StatefulSet',
]);
const runtimeResourceKinds = new Set([
  ...namespacedKinds,
  'CiliumClusterwideNetworkPolicy', 'ClusterRole', 'ClusterRoleBinding', 'CustomResourceDefinition',
  'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding',
]);
const clusterScopedKinds = new Set([...runtimeResourceKinds].filter((kind) => !namespacedKinds.has(kind)));

function selectedDeployNamespace() {
  const source = read('scripts/deploy.sh');
  const match = /^NAMESPACE="\$\{NAMESPACE:-([^}]+)\}"$/mu.exec(source);
  assert(match?.[1], 'scripts/deploy.sh must declare the default NAMESPACE used by static manifest authorities');
  return match[1];
}

function staticNamespaceAuthorities() {
  const namespace = selectedDeployNamespace();
  const deploySource = read('scripts/deploy.sh');
  const authorities = new Map([
    ['my-values/infra/litellm-deployment.yaml', namespace],
    ['my-values/infra/network-policies.yaml', namespace],
    ['my-values/infra/registry-local.yaml', namespace],
    ['my-values/infra/registry-mirror.yaml', namespace],
  ]);
  const evidence = [
    ['my-values/infra/litellm-deployment.yaml', 'printf \'%s\\n\' "$litellm_manifests" | kubectl apply -n "$NAMESPACE" -f -'],
    ['my-values/infra/network-policies.yaml', 'printf \'%s\\n\' "$stateful_network_policies" | kubectl apply -n "$NAMESPACE" -f -'],
    ['my-values/infra/registry-local.yaml', 'printf \'%s\\n\' "$registry_manifests" | kubectl apply -n "$NAMESPACE" -f -'],
    ['my-values/infra/registry-mirror.yaml', 'kubectl apply -n "$NAMESPACE" -f "$INFRA_DIR/registry-mirror.yaml"'],
  ];
  for (const [source, needle] of evidence) {
    assert.equal(authorities.get(source), namespace, `${source} lacks an explicit static namespace authority`);
    assert(deploySource.includes(needle), `${source} namespace authority no longer matches scripts/deploy.sh`);
  }
  return authorities;
}

function sourceSegments(source) {
  const starts = [0, ...[...source.matchAll(/^---\s*$/gmu)].map((match) => match.index)];
  return [...new Set(starts)].sort((left, right) => left - right)
    .map((start, index) => ({ start, end: starts[index + 1] ?? source.length, text: source.slice(start, starts[index + 1] ?? source.length) }));
}

function yamlObjectLocation(source, kind, name) {
  if (source.includes('{{')) return undefined;
  try {
    for (const document of YAML.parseAllDocuments(source)) {
      if (document.errors.length) continue;
      const value = document.toJSON();
      if (value?.kind !== kind || value?.metadata?.name !== name) continue;
      const nameNode = document.getIn(['metadata', 'name'], true);
      const index = nameNode?.range?.[0] ?? document.range?.[0];
      if (Number.isInteger(index)) return { line: lineOf(source, index), mode: 'yaml-object-name' };
    }
  } catch { /* Helm templates are handled below. */ }
  return undefined;
}

function templateObjectLocation(source, kind, name) {
  const escapedKind = String(kind).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const candidates = sourceSegments(source).flatMap((segment) => {
    const kindMatch = new RegExp(`^kind:\\s*${escapedKind}\\s*$`, 'mu').exec(segment.text);
    if (!kindMatch) return [];
    const inlineName = /^metadata:\s*\{\s*name:\s*(.+)\}\s*$/mu.exec(segment.text);
    const blockName = /^metadata:\s*(?:\n|\r\n)(?:^[ \t]+[^\n]*\n)*?^[ \t]+name:\s*([^\n]+)/mu.exec(segment.text);
    const match = inlineName ?? blockName;
    if (!match) return [];
    const rawName = match[1].trim();
    const referencedTemplateFragments = [...rawName.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/gu)].flatMap((reference) => {
      const declaration = new RegExp(`\\$${reference[1]}\\s*:=\\s*printf\\s+"([^"]+)"`, 'u').exec(source);
      return declaration ? declaration[1].split(/%[-+0-9.]*[a-z]/giu) : [];
    });
    const fragments = [...rawName.replaceAll(/\{\{[\s\S]*?\}\}/gu, '\0').split('\0'), ...referencedTemplateFragments]
      .map((part) => part.replaceAll(/["'`\s]/gu, '')).filter((part) => part.length >= 2);
    const score = rawName.replaceAll(/["']/gu, '') === name ? 10000
      : Math.max(0, ...fragments.filter((part) => name.startsWith(part) || name.endsWith(part) || name.includes(part))
        .map((part) => part.length));
    const valueIndex = match.index + match[0].lastIndexOf(match[1]);
    return [{ line: lineOf(source, segment.start + valueIndex), score }];
  });
  if (candidates.length === 1) return { line: candidates[0].line, mode: 'helm-object-name' };
  const ranked = candidates.filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);
  if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
    return { line: ranked[0].line, mode: 'helm-object-name' };
  }
  return undefined;
}

function generatedObjectLocation(source, kind, name) {
  const constants = new Map([...source.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"];?$/gmu)]
    .map((match) => [match[1], match[2]]));
  const evaluate = (expression) => {
    const compact = expression?.trim() ?? 'name';
    if (constants.has(compact)) return constants.get(compact);
    if (/^['"][^'"]+['"]$/u.test(compact)) return compact.slice(1, -1);
    if (/^`[^`]+`$/u.test(compact)) return compact.slice(1, -1)
      .replaceAll(/\$\{([A-Za-z_$][\w$]*)\}/gu, (_, variable) => constants.get(variable) ?? `\${${variable}}`);
    return undefined;
  };
  for (const match of source.matchAll(/^.*kind:\s*['"]([^'"]+)['"].*metadata:\s*\{.*$/gmu)) {
    const metadata = match[0].slice(match[0].indexOf('metadata:'));
    const explicitName = /\bname\s*:\s*(`[^`]+`|'[^']+'|"[^"]+"|[A-Za-z_$][\w$]*)/u.exec(metadata)?.[1];
    const shorthandName = /(?:\{|,)\s*name\s*(?:,|\})/u.test(metadata) ? 'name' : undefined;
    if (match[1] === kind && evaluate(explicitName ?? shorthandName) === name) {
      const nameIndex = match.index + match[0].lastIndexOf('name');
      return { line: lineOf(source, nameIndex), mode: 'generated-object-name' };
    }
  }
  return undefined;
}

function resourceObjectLocation(sourcePath, kind, name) {
  if (sourcePath.startsWith('helm:') || !fs.existsSync(path.join(root, sourcePath))) return undefined;
  const maintained = read(sourcePath);
  return yamlObjectLocation(maintained, kind, name)
    ?? templateObjectLocation(maintained, kind, name)
    ?? generatedObjectLocation(maintained, kind, name);
}

function assertResourceEvidence(sourcePath, kind, name, line) {
  assert(line, `${sourcePath} ${kind}/${name} has no named-object evidence line`);
  const maintained = read(sourcePath);
  const lineStart = maintained.split('\n').slice(0, line - 1).reduce((length, value) => length + value.length + 1, 0);
  if (!maintained.includes('{{') && /\.ya?ml$/u.test(sourcePath)) {
    const document = YAML.parseAllDocuments(maintained).find((candidate) => {
      const [start = -1, end = -1] = candidate.range ?? [];
      return start <= lineStart && lineStart < end;
    });
    const value = document?.toJSON();
    assert.equal(value?.kind, kind, `${sourcePath}:${line} does not resolve to ${kind}/${name}`);
    assert.equal(value?.metadata?.name, name, `${sourcePath}:${line} does not resolve to ${kind}/${name}`);
    const nameNode = document.getIn(['metadata', 'name'], true);
    assert.equal(lineOf(maintained, nameNode?.range?.[0]), line,
      `${sourcePath}:${line} does not point at the ${kind}/${name} name field`);
    return;
  }
  const segment = sourceSegments(maintained).find(({ start, end }) => start <= lineStart && lineStart < end);
  if (/\.ya?ml$/u.test(sourcePath)) {
    assert(new RegExp(`^kind:\\s*${String(kind).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*$`, 'mu').test(segment?.text ?? ''),
      `${sourcePath}:${line} does not resolve to a ${kind} template object`);
    assert(/(?:^metadata:\s*\{\s*name:|^[ \t]+name:)/mu.test(segment?.text ?? ''),
      `${sourcePath}:${line} does not resolve to a named template object`);
  } else {
    assert(/\bname\b/u.test(maintained.split('\n')[line - 1] ?? ''),
      `${sourcePath}:${line} does not point at the ${kind}/${name} name expression`);
  }
  assert.equal(resourceObjectLocation(sourcePath, kind, name)?.line, line,
    `${sourcePath}:${line} does not resolve to the ${kind}/${name} declaration`);
}

function objects(source, origin, deploymentNamespace, renderContext = {}) {
  return source.split(/(?=^---\s*$)/gmu).flatMap((chunk) => {
    const document = YAML.parseDocument(chunk);
    if (document.errors.length || !document.toJSON()) return [];
    const value = document.toJSON();
    const declaredNamespace = value.metadata?.namespace;
    if (deploymentNamespace && namespacedKinds.has(value.kind) && value.metadata && !value.metadata.namespace) {
      value.metadata.namespace = deploymentNamespace;
    }
    const renderedSource = /^# Source: ([^\n]+)$/mu.exec(chunk)?.[1];
    const chartRoot = {
      'helm:nova': 'charts/kubeclaw', 'helm:buster': 'charts/kubeclaw',
      'helm:prism-agent': 'charts/kubeclaw', 'helm:prism': 'charts/prism',
      'helm:ops-default': 'charts/ops-pod', 'helm:ops-tailscale': 'charts/ops-pod',
    }[origin];
    const sourcePath = renderedSource && chartRoot
      ? `${chartRoot}/${renderedSource.slice(renderedSource.indexOf('/') + 1)}`
      : origin;
    const evidence = resourceObjectLocation(sourcePath, value.kind, value.metadata?.name);
    const line = evidence?.line;
    const helmHook = value.metadata?.annotations?.['helm.sh/hook'];
    return [{ value, origin, source: sourcePath, line, evidenceMode: evidence?.mode, ...renderContext,
      namespaceAuthority: declaredNamespace ? 'manifest' : deploymentNamespace ? 'deployment' : 'cluster',
      lifecycle: helmHook ? 'helm-hook' : 'managed-resource',
      ...(helmHook ? { activationCondition: helmHook } : {}),
    }];
  });
}
function visit(value, visitor, pathParts = []) {
  if (Array.isArray(value)) return value.forEach((item, index) => visit(item, visitor, [...pathParts, String(index)]));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visitor(key, child, pathParts);
    visit(child, visitor, [...pathParts, key]);
  }
}

function deployedStaticObjects(namespace) {
  const litellmSource = 'my-values/infra/litellm-deployment.yaml';
  const litellmRendered = execFileSync(process.execPath, [
    'scripts/render-litellm-deployment.mjs',
    'my-values/infra/litellm-config.yaml',
    litellmSource,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const litellm = objects(litellmRendered, litellmSource, namespace).map((item) => {
    if (!(item.value.kind === 'ConfigMap' && item.value.metadata?.name === 'litellm-config')) return item;
    const source = 'scripts/render-litellm-deployment.mjs';
    return { ...item, source, line: literalLocation("name: 'litellm-config'", source, []).line };
  });
  const recoverySource = 'scripts/render-postgresql-recovery.mjs';
  const recoveryRendered = execFileSync(process.execPath, [
    recoverySource,
    '--preflight',
    namespace,
    'my-values/infra/postgresql-recovery.yaml',
    'my-values/infra/postgresql-values.yaml',
    litellmSource,
    'postgresql',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const recovery = objects(recoveryRendered, recoverySource, namespace);
  return [...litellm, ...recovery];
}

function renderedObjects() {
  const opsApplication = YAML.parse(read('gitops/platform/bootstrap/codex-ops.yaml'));
  const opsValues = opsApplication?.spec?.source?.helm?.valuesObject;
  assert(opsValues?.codexImage && opsValues?.mcpImage && opsValues?.networkPolicy?.apiServerCIDRs?.[0],
    'the selected Ops Application must provide maintained images and an API server CIDR');
  const opsSets = [
    `codexImage=${opsValues.codexImage}`,
    `mcpImage=${opsValues.mcpImage}`,
    `networkPolicy.apiServerCIDRs[0]=${opsValues.networkPolicy.apiServerCIDRs[0]}`,
  ];
  const renders = [
    ['helm:nova', 'kubeclaw', render('agent-nova', 'charts/kubeclaw', 'kubeclaw', ['my-values/nova-values.yaml'])],
    ['helm:buster', 'kubeclaw', render('agent-buster', 'charts/kubeclaw', 'kubeclaw', ['my-values/buster-values.yaml'], [
      'runtimeInfrastructure.registry.endpoint=http://registry-local.kubeclaw.svc.cluster.local:5001',
      'runtimeInfrastructure.registry.transport=http-lab',
    ]), { fixtureOverrides: [{
      signalPrefixes: ['KUBECLAW_REGISTRY_CONFIG='],
      source: 'helm:fixture/buster-runtime-registry',
      reason: 'the inventory supplies a render-only Buster registry value because the checked-in profile leaves this optional client contract unresolved',
    }] }],
    ['helm:prism-agent', 'kubeclaw', render('agent-prism', 'charts/kubeclaw', 'kubeclaw', ['my-values/prism-agent-values.yaml'])],
    ['helm:prism', 'kubeclaw', render('prism', 'charts/prism', 'kubeclaw', ['my-values/prism-values.yaml'], [
      'worker.native.namespace=kubeclaw', 'worker.native.nodeName=inventory-node',
      `worker.native.policyDigest=${'a'.repeat(64)}`,
    ])],
    ['helm:ops-default', 'kubeclaw-ops', render('codex-ops', 'charts/ops-pod', 'kubeclaw-ops', [], opsSets), {
      activationState: 'active', activationCondition: 'the selected Ops profile uses the chart default tailscale.enabled=false',
    }],
    ['helm:ops-tailscale', 'kubeclaw-ops', render('codex-ops', 'charts/ops-pod', 'kubeclaw-ops', [], [...opsSets, 'tailscale.enabled=true']), {
      activationState: 'conditional', activationCondition: 'tailscale.enabled=true is an explicit Ops deployment opt-in; the selected default is false',
    }],
  ];
  const staticFiles = [
    ...walk(path.join(root, 'my-values/infra')).filter((file) => /\.ya?ml$/u.test(file)),
    ...walk(path.join(root, 'gitops/platform')).filter((file) => /\.ya?ml$/u.test(file)),
  ];
  const staticNamespaces = staticNamespaceAuthorities();
  return [
    ...renders.flatMap(([origin, namespace, source, context]) => objects(source, origin, namespace, context)),
    ...deployedStaticObjects(selectedDeployNamespace()),
    ...staticFiles.flatMap((file) => {
      const origin = relative(file);
      if (origin === 'my-values/infra/litellm-deployment.yaml') return [];
      return objects(fs.readFileSync(file, 'utf8'), origin, staticNamespaces.get(origin));
    }),
  ];
}

function normalizedDependencySignal(item) {
  if (item.dependencyIdentity === 'buildkit'
    && !(item.profile === 'helm:buster' && item.signal.startsWith('CONTAINER_BUILD_BUILDKIT_HOST='))) return undefined;
  if (item.dependencyIdentity !== 'postgresql') return item;
  if (item.profile === 'helm:prism') return { ...item, dependency: 'prism-postgresql', dependencyIdentity: 'prism-postgresql' };
  if (item.source === 'gitops/platform/bootstrap/postgresql.yaml') {
    return { ...item, dependency: 'litellm-postgresql', dependencyIdentity: 'litellm-postgresql' };
  }
  return undefined;
}

const renderedProfileEvidenceSources = new Map([
  ['helm:nova', ['my-values/nova-values.yaml', 'charts/kubeclaw/values.yaml']],
  ['helm:buster', ['my-values/buster-values.yaml', 'charts/kubeclaw/values.yaml']],
  ['helm:prism-agent', ['my-values/prism-agent-values.yaml', 'charts/kubeclaw/values.yaml']],
  ['helm:prism', ['my-values/prism-values.yaml', 'charts/prism/values.yaml']],
  ['helm:ops-default', ['gitops/platform/bootstrap/codex-ops.yaml', 'charts/ops-pod/values.yaml']],
  ['helm:ops-tailscale', ['gitops/platform/bootstrap/codex-ops.yaml', 'charts/ops-pod/values.yaml']],
]);

function dependencySignalLocation(item, candidates) {
  if (item.source?.startsWith('helm:fixture/')) {
    return { ...item, line: undefined, evidenceLocation: 'render-fixture' };
  }
  const equals = item.signal.indexOf('=');
  const rawValue = equals >= 0 ? item.signal.slice(equals + 1) : item.signal.replace(/^image registry for /u, '');
  const rawField = equals >= 0 ? item.signal.slice(0, equals) : item.signal;
  const field = rawField.split('.').at(-1)?.replace(/\[[0-9*]+\]$/u, '');
  const namedSignal = /^(?:volume|projected serviceAccountToken):(.+)$/u.exec(item.signal)?.[1];
  const pvcSignal = /^PersistentVolumeClaim\/(.+)$/u.exec(item.signal)?.[1];
  const exactValue = !rawValue.includes('… [') && rawValue.length >= 4
    && !/^(?:true|false|none|null|active)$/iu.test(rawValue) ? rawValue : undefined;
  const needles = [
    exactValue,
    field && /^(?:startupProbe|readinessProbe)$/u.test(field) ? `${field}:` : undefined,
    namedSignal ? `name: ${namedSignal}` : undefined,
    pvcSignal ? `name: ${pvcSignal}` : undefined,
    field && /^[A-Z][A-Z0-9_]+$/u.test(field) ? `name: ${field}` : undefined,
    field && field.length >= 4 ? field : undefined,
  ].filter(Boolean);
  const sources = [...new Set([
    item.source,
    item.origin,
    ...(renderedProfileEvidenceSources.get(item.profile) ?? []),
    ...candidates,
  ])].filter((source) => typeof source === 'string' && !source.startsWith('helm:')
    && fs.existsSync(path.join(root, source)));
  for (const needle of needles) {
    for (const source of sources) {
      const maintained = read(source);
      const index = maintained.indexOf(needle);
      if (index >= 0) return { ...item, source, line: lineOf(maintained, index),
        evidenceLocation: needle === exactValue ? 'exact-value' : 'exact-field' };
    }
  }
  return { ...item, source: item.origin?.startsWith('helm:') ? `${item.origin}:rendered-output` : item.source,
    line: undefined, evidenceLocation: 'rendered-output' };
}

function statefulSetClaimStores(rendered) {
  return rendered.flatMap(({ value, source, line }) => {
    if (value.kind !== 'StatefulSet' || !value.metadata?.name) return [];
    const namespace = value.metadata.namespace;
    assert(namespace && namespace !== 'default', `StatefulSet ${value.metadata.name} lacks its selected deployment namespace`);
    const replicas = value.spec?.replicas ?? 1;
    assert(Number.isInteger(replicas) && replicas >= 0, `StatefulSet ${namespace}/${value.metadata.name} has invalid replicas`);
    return (value.spec?.volumeClaimTemplates ?? []).flatMap((template) => {
      assert(template.metadata?.name, `StatefulSet ${namespace}/${value.metadata.name} has an unnamed volumeClaimTemplate`);
      return Array.from({ length: replicas }, (_, ordinal) => ({
        value: `pvc:${namespace}/${template.metadata.name}-${value.metadata.name}-${ordinal}`,
        source,
        line,
      }));
    });
  });
}

function networkExposuresFrom(rendered) {
  return rendered.flatMap(({ value, source, line, activationState = 'active', activationCondition }) => {
    const namespace = value.metadata?.namespace ?? 'cluster';
    if (value.kind === 'Service') {
      const ports = value.spec?.ports ?? [];
      const records = ports.length ? ports : [{}];
      return records.map((port) => ({
        value: `Service/${namespace}/${value.metadata.name}:${port.name ?? port.port ?? '<no-port>'}`,
        kind: 'Service',
        namespace,
        name: value.metadata.name,
        serviceType: value.spec?.type ?? 'ClusterIP',
        clusterIP: value.spec?.clusterIP ?? '<assigned-by-cluster>',
        portName: port.name ?? null,
        protocol: port.protocol ?? 'TCP',
        port: port.port ?? null,
        targetPort: port.targetPort ?? null,
        nodePort: port.nodePort ?? null,
        selector: value.spec?.selector ?? {},
        activationState,
        ...(activationCondition ? { activationCondition } : {}),
        source,
        line,
      }));
    }
    if (value.kind === 'Ingress') {
      const paths = (value.spec?.rules ?? []).flatMap((rule) => (rule.http?.paths ?? []).map((route) => ({ rule, route })));
      const records = [
        ...paths,
        ...(value.spec?.defaultBackend ? [{ rule: {}, route: { backend: value.spec.defaultBackend } }] : []),
      ];
      if (!records.length) records.push({ rule: {}, route: {} });
      return records.map(({ rule, route }) => ({
        value: `Ingress/${namespace}/${value.metadata.name}:${rule.host ?? '*'}${route.path ?? '/'}`,
        kind: 'Ingress',
        namespace,
        name: value.metadata.name,
        ingressClassName: value.spec?.ingressClassName ?? null,
        host: rule.host ?? '*',
        path: route.path ?? '/',
        pathType: route.pathType ?? null,
        backendService: route.backend?.service?.name ?? null,
        backendPort: route.backend?.service?.port?.name ?? route.backend?.service?.port?.number ?? null,
        tlsHosts: (value.spec?.tls ?? []).flatMap((tls) => tls.hosts ?? []),
        activationState,
        ...(activationCondition ? { activationCondition } : {}),
        source,
        line,
      }));
    }
    return [];
  });
}

function build() {
  const rendered = renderedObjects();
  const acceptanceIds = [...read(acceptanceContractSource).matchAll(/^\| (A97-[0-9]{2}) \|/gmu)].map((match) => match[1]);
  assert.deepEqual(acceptanceIds, Array.from({ length: 12 }, (_, index) => `A97-${String(index + 1).padStart(2, '0')}`),
    'the canonical AP09.7 acceptance contract must define A97-01 through A97-12 exactly once and in order');
  const shippedEntrypointSources = shippedRuntimeEntrypoints();
  const secretLiteralSources = [
    ...walk(path.join(root, 'my-values')),
    ...walk(path.join(root, 'gitops/platform')),
    ...walk(path.join(root, 'charts')).filter((file) => /values\.ya?ml$/u.test(file)),
  ].filter((file) => /\.ya?ml$/u.test(file)).map(relative).sort();
  const discoveredRouteSources = [...new Set([
    ...routeSources,
    ...shippedEntrypointSources,
    ...productionSourceFiles([
      'skills/nova/core', 'skills/worker/core/worker', 'skills/buster/engine/test-gates',
      'skills/nova/plugins', 'skills/buster/plugins', 'skills/common/plugins',
      'skills/prism/server', 'skills/prism/control', 'skills/prism/openclaw-plugin',
      'skills/common/plugins/network-http', 'tools/ops-mcp/src',
    ]),
  ])].sort();
  for (const source of shippedEntrypointSources) assert(discoveredRouteSources.includes(source),
    `shipped runtime entrypoint is outside platform discovery: ${source}`);
  const stateCandidates = productionSourceFiles([
    'skills/nova/core', 'skills/worker/core/worker', 'skills/buster/engine/test-gates',
    'skills/prism/server', 'skills/common/plugin-runtime/foundation/observability',
  ]).filter((file) => /(?:writeFile|appendFile|FileJournal|FileDurable|mkdir|createWriteStream|withDurableStoreLock)/u.test(read(file)));
  const discoveredStoreSources = [...new Set([...storeSources, ...stateCandidates])].sort();
  const resources = rendered.filter(({ value }) => runtimeResourceKinds.has(value.kind) && value.metadata?.name)
    .map(({ value, origin, source, line, namespaceAuthority, lifecycle, activationState = 'active', activationCondition }) => ({
      kind: value.kind,
      namespace: clusterScopedKinds.has(value.kind) ? 'cluster' : value.metadata.namespace,
      name: value.metadata.name,
      source,
      line,
      origin,
      namespaceAuthority,
      lifecycle,
      activationState,
      ...(activationCondition ? { activationCondition } : {}),
    }));
  for (const item of rendered.filter(({ value }) => runtimeResourceKinds.has(value.kind) && value.metadata?.name)) {
    assertResourceEvidence(item.source, item.value.kind, item.value.metadata.name, item.line);
  }
  for (const resource of resources) {
    assert(resource.namespace, `${resource.origin} ${resource.kind}/${resource.name} lacks an explicit namespace authority`);
    if (resource.namespaceAuthority !== 'manifest') {
      assert.notEqual(resource.namespace, 'default',
        `${resource.origin} ${resource.kind}/${resource.name} was falsely materialized in the default namespace`);
    }
  }
  const networkExposures = networkExposuresFrom(rendered);
  for (const resource of resources.filter((item) => item.kind === 'Service' || item.kind === 'Ingress')) {
    assert(networkExposures.some((exposure) => exposure.kind === resource.kind
      && exposure.namespace === resource.namespace && exposure.name === resource.name),
    `${resource.kind}/${resource.namespace}/${resource.name} has no endpoint exposure record`);
  }
  const expectedHelmNamespaces = new Map([
    ['helm:nova', 'kubeclaw'], ['helm:buster', 'kubeclaw'], ['helm:prism-agent', 'kubeclaw'],
    ['helm:prism', 'kubeclaw'], ['helm:ops-default', 'kubeclaw-ops'], ['helm:ops-tailscale', 'kubeclaw-ops'],
  ]);
  for (const resource of resources.filter((item) => item.origin.startsWith('helm:'))) {
    const expected = clusterScopedKinds.has(resource.kind) ? 'cluster'
      : resource.namespaceAuthority === 'deployment' ? expectedHelmNamespaces.get(resource.origin) : resource.namespace;
    assert.equal(resource.namespace, expected, `${resource.origin} ${resource.kind}/${resource.name} is not in its selected scope`);
  }
  const deployNamespace = selectedDeployNamespace();
  const expectedDeployStaticResources = [
    ['my-values/infra/litellm-deployment.yaml', 'ConfigMap', 'litellm-config'],
    ['my-values/infra/litellm-deployment.yaml', 'Deployment', 'litellm'],
    ['my-values/infra/litellm-deployment.yaml', 'Service', 'litellm'],
    ['my-values/infra/registry-local.yaml', 'PersistentVolumeClaim', 'registry-local-data'],
    ['my-values/infra/registry-local.yaml', 'ConfigMap', 'registry-local-config'],
    ['my-values/infra/registry-local.yaml', 'Deployment', 'registry-local'],
    ['my-values/infra/registry-local.yaml', 'Service', 'registry-local'],
    ['my-values/infra/registry-mirror.yaml', 'PersistentVolumeClaim', 'registry-mirror-cache'],
    ['my-values/infra/registry-mirror.yaml', 'Deployment', 'registry-mirror'],
    ['my-values/infra/registry-mirror.yaml', 'Service', 'registry-mirror'],
  ];
  for (const [origin, kind, name] of expectedDeployStaticResources) {
    assert(resources.some((resource) => resource.origin === origin && resource.kind === kind
      && resource.name === name && resource.namespace === deployNamespace),
    `${origin} ${kind}/${name} must materialize in deploy.sh NAMESPACE=${deployNamespace}`);
  }
  const expectedRecoveryResources = [
    ['ConfigMap', 'litellm-postgresql-backup-settings'],
    ['ConfigMap', 'litellm-postgresql-backup-script'],
    ['PersistentVolumeClaim', 'litellm-postgresql-backup'],
    ['CiliumNetworkPolicy', 'litellm-postgresql-backup'],
    ['CiliumNetworkPolicy', 'litellm-postgresql-backup-database'],
    ['CronJob', 'litellm-postgresql-backup'],
  ];
  for (const [kind, name] of expectedRecoveryResources) {
    assert(resources.some((resource) => resource.origin === 'scripts/render-postgresql-recovery.mjs'
      && resource.kind === kind && resource.name === name && resource.namespace === deployNamespace),
    `scripts/render-postgresql-recovery.mjs ${kind}/${name} must materialize in deploy.sh NAMESPACE=${deployNamespace}`);
  }

  const secretReferences = [];
  for (const { value, source, line } of rendered) visit(value, (key, child, parent) => {
    const add = (name, secretKey, suffix) => {
      if (typeof name !== 'string' || !name || name.includes('{{')) return;
      const location = literalLocation(name, source, secretLiteralSources);
      secretReferences.push({ value: `${name}#${secretKey || '*'}`, source: location.source, line: location.line ?? line,
        consumerPath: [...parent, suffix].join('.') });
    };
    if (key === 'secretKeyRef' && child && typeof child === 'object') add(child.name, child.key, key);
    else if (key === 'secretRef' && child && typeof child === 'object') add(child.name, '*', key);
    else if (key === 'imagePullSecrets' && Array.isArray(child)) child.forEach((item) => add(item?.name, '*', key));
    else if (['secretName', 'existingSecret', 'authSecret', 'bearerSecret', 'githubSecret'].includes(key)) add(child, '*', key);
  });

  const sourceInputs = discoveredRouteSources.map((source) => ({
    source,
    origin: source,
    text: read(source),
  }));
  const discoveredRoutes = [
    ...discoverMethodAwareServerRoutes(sourceInputs),
    ...discoverGoServerRoutes(goControllerSources.map((source) => ({ source, origin: source, text: read(source) })), {
      activationFor: ({ path: routePath }) => ({ activationState: 'conditional',
        activationCondition: routePath.startsWith('/v1/demo-product/') ? busterProductActivation : busterReadyActivation }),
    }),
  ];
  const routeRecords = discoveredRoutes.map((original) => {
    const item = original.source === 'skills/prism/server/product-decisions.ts'
      ? { ...original, activationState: 'conditional',
        activationCondition: 'control.productDecisions.enabled=true; the selected Prism profile leaves product decisions disabled' }
      : original;
    return {
    value: `${item.method} ${item.path}`,
    source: item.source,
    line: item.line,
    pathKind: item.pathKind,
    ...(item.classification ? { classification: item.classification } : {}),
    ...(item.routeRole ? { routeRole: item.routeRole } : {}),
    ...(item.excludedPaths ? { excludedPaths: item.excludedPaths } : {}),
    ...(item.excludedPrefixes ? { excludedPrefixes: item.excludedPrefixes } : {}),
    ...(item.exclusions ? { exclusions: item.exclusions } : {}),
    activationState: item.activationState,
    activationCondition: redactPublishedIdentity(item.activationCondition),
    ...(item.reason ? { reason: item.reason } : {}),
    };
  });
  const busterRouteConditions = new Map([
    ['/v1/demo-ready', busterReadyActivation],
    ['/v1/demo-ready/status', busterReadyActivation],
    ['/v1/demo-product/subjects', busterProductActivation],
    ['/v1/demo-product/decisions', busterProductActivation],
    ['/v1/demo-product/status', busterProductActivation],
  ]);
  for (const [routePath, activationCondition] of busterRouteConditions) {
    const route = routeRecords.find((item) => item.value === `POST ${routePath}`
      && item.source.startsWith('cmd/buster-namespace-controller/'));
    assert(route, `DOC_DRIFT_ENDPOINT: Buster controller route POST ${routePath} is absent from the inventory`);
    assert.equal(route.activationState, 'conditional', `DOC_DRIFT_ENDPOINT: Buster controller route POST ${routePath} is not conditional`);
    assert.equal(route.activationCondition, activationCondition,
      `DOC_DRIFT_ENDPOINT: Buster controller route POST ${routePath} has incomplete activation semantics`);
  }
  const discoveredOutbound = [
    ...discoverOutboundConnections(sourceInputs),
    ...discoverGoKubernetesConnections(goControllerSources.map((source) => ({ source, origin: source, text: read(source) })), {
      activationFor: ({ input }) => /\/demo-readiness(?:-sources|-lifecycle)?\.go$/u.test(input.source)
        ? { activationState: 'conditional', activationCondition: 'the Buster demo-readiness listener is enabled; the selected profile leaves it disabled' }
        : /\/demo-product\.go$/u.test(input.source)
          ? { activationState: 'conditional', activationCondition: 'BUSTER_PRODUCT_ENABLED=true; the selected profile leaves product decisions disabled' }
          : undefined,
    }),
  ];
  const outboundConnections = discoveredOutbound.map((original) => {
    const item = original.source === 'skills/prism/server/product-decisions.ts'
      ? { ...original, activationState: 'conditional',
        activationCondition: 'control.productDecisions.enabled=true; the selected Prism profile leaves product decisions disabled' }
      : original;
    return {
    value: `${item.method} ${item.path}`,
    caller: item.consumer,
    source: item.source,
    line: item.line,
    classification: item.classification,
    activationState: item.activationState,
    activationCondition: item.activationCondition,
    ...(item.dynamic ? { dynamic: true } : {}),
    ...(item.targetKind ? { targetKind: item.targetKind } : {}),
    ...(item.providerFamily ? { providerFamily: item.providerFamily } : {}),
    ...(item.providerClassification ? { providerClassification: item.providerClassification } : {}),
    ...(item.base ? { base: item.base } : {}),
    };
  });
  const discoveredDependencySignals = discoverRuntimeDependencySignals(rendered)
    .map(normalizedDependencySignal).filter(Boolean)
    .map((item) => dependencySignalLocation(item, secretLiteralSources));
  const litellmDatabaseSource = 'my-values/setup-secrets.sh';
  const litellmDatabaseText = read(litellmDatabaseSource);
  const litellmDatabaseIndex = litellmDatabaseText.indexOf('DATABASE_URL=$database_url');
  assert(litellmDatabaseIndex >= 0, 'LiteLLM DATABASE_URL provisioning signal is absent');
  const litellmWorkload = rendered.find((item) => item.origin === 'gitops/platform/litellm/resources.yaml'
    && item.value.kind === 'Deployment' && item.value.metadata?.name === 'litellm');
  const litellmContainer = litellmWorkload?.value.spec?.template?.spec?.containers?.find((item) => item.name === 'litellm');
  assert(litellmContainer?.envFrom?.some((item) => item.secretRef?.name === 'litellm-secrets'),
    'selected LiteLLM deployment does not import the provisioned database Secret');
  discoveredDependencySignals.push({
    consumer: `${litellmWorkload.value.kind}/${litellmWorkload.value.metadata.namespace}/${litellmWorkload.value.metadata.name}#${litellmContainer.name}`,
    dependency: 'litellm-postgresql',
    dependencyIdentity: 'litellm-postgresql',
    classification: 'secret-provisioned-endpoint',
    activationState: 'active',
    activationCondition: 'the selected LiteLLM deployment imports litellm-secrets and setup provisions DATABASE_URL',
    profile: litellmWorkload.origin,
    signal: 'litellm-secrets#DATABASE_URL',
    source: litellmDatabaseSource,
    line: lineOf(litellmDatabaseText, litellmDatabaseIndex),
    evidenceLocation: 'exact-value',
  });
  const dependencySignals = discoveredDependencySignals.map((item) => {
    const consumer = redactPublishedIdentity(item.consumer);
    const dependencyIdentity = redactPublishedIdentity(item.dependencyIdentity);
    const signal = redactPublishedIdentity(item.signal);
    return ({
    value: `${consumer} -> ${dependencyIdentity} [${signal}]`,
    consumer,
    dependencyIdentity,
    classification: item.classification,
    activationState: item.activationState,
    activationCondition: redactPublishedIdentity(item.activationCondition),
    profile: item.profile,
    signal,
    source: item.source ?? item.origin,
    line: item.line,
    evidenceLocation: item.evidenceLocation ?? 'rendered-output',
  });
  });
  assert(dependencySignals.every((item) => !/[\r\n]/u.test(item.value) && !/[\r\n]/u.test(item.signal)),
    'dependency signal identities must remain single-line Markdown table values');
  const activeDependencyIdentities = new Set(dependencySignals
    .filter((item) => item.activationState === 'active')
    .map((item) => item.dependencyIdentity));
  const dependencies = dependencyDefinitions.map((item) => {
    const record = recordFromNeedle(...item);
    const expected = dependencyEvidenceIdentities.get(record.value) ?? [];
    const matched = distinct(dependencySignals.filter((signal) => signal.activationState === 'active'
      && expected.includes(signal.dependencyIdentity)));
    if (expected.length > 0) assert(matched.length > 0,
      `DOC_DRIFT_DEPENDENCY: dependency ${record.value} has no rendered source signal (${expected.join(', ')})`);
    return { ...record, renderedSignalCount: matched.length,
      renderedProfiles: [...new Set(matched.map((signal) => signal.profile).filter(Boolean))].sort() };
  });
  for (const identity of ['redis', 'prism-postgresql', 'litellm-postgresql', 'litellm', 'openai', 'vertex-ai', 'discord',
    'buildkit', 'registry-local', 'tailscale', 'ghcr.io', 'docker.io']) {
    assert(activeDependencyIdentities.has(identity),
      `source-derived dependency inventory omits active identity ${identity}`);
  }
  assert(!activeDependencyIdentities.has('postgresql'), 'PostgreSQL dependency signals must identify Prism or LiteLLM ownership');
  const storeRecords = [
    ...recordsFromRegex(discoveredStoreSources, /['"`]([^'"`\n]*(?:\.jsonl|\.json))['"`]/gu),
    ...recordsFromRegex(discoveredStoreSources, /path\.join\([^\n]*?['"`]([^'"`]*(?:attempts|dispatch|imports|outputs|metadata|data|results|quarantine|records|blobs|blob-budget|resource-locks))['"`]/gu),
  ];
  const eventSource = read('skills/common/plugin-runtime/sdk/src/generated/contracts.ts');
  const lifecycleSection = eventSource.match(/export interface LifecycleEvent \{[\s\S]*?\n\}/u)?.[0] ?? '';
  const lifecycleStart = eventSource.indexOf(lifecycleSection);
  const lifecycleEvents = [...lifecycleSection.matchAll(/\| '([^']+)'/gu)].map((match) => ({
    value: match[1], source: 'skills/common/plugin-runtime/sdk/src/generated/contracts.ts', line: lineOf(eventSource, lifecycleStart + match.index),
  }));
  const domainSource = read('skills/common/plugins/openclaw-agent-events/src/adapter.ts');
  const hookSection = domainSource.match(/export const SUPPORTED_HOOKS = Object\.freeze\(\[([\s\S]*?)\]\);/u)?.[1] ?? '';
  const hookStart = domainSource.indexOf(hookSection);
  const domainEvents = [...hookSection.matchAll(/'([^']+)'/gu)].map((match) => ({
    value: `plugin.kubeclaw.openclaw-agent-events.${match[1].replaceAll('_', '-')}`,
    source: 'skills/common/plugins/openclaw-agent-events/src/adapter.ts',
    line: lineOf(domainSource, hookStart + match.index),
  }));
  const ingressEventSourcePath = 'contracts/agent-observability/v1/src/constants.ts';
  const ingressEventSource = read(ingressEventSourcePath);
  const ingressEventSection = ingressEventSource.match(/AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES = Object\.freeze\(\[([\s\S]*?)\]\s+as const\);/u)?.[1] ?? '';
  const ingressEventStart = ingressEventSource.indexOf(ingressEventSection);
  const ingressEvents = [...ingressEventSection.matchAll(/'([^']+)'/gu)].map((match) => ({
    value: match[1], source: ingressEventSourcePath, line: lineOf(ingressEventSource, ingressEventStart + match.index),
  }));
  assert(ingressEventSection && ingressEvents.length > 0, 'agent-observability v1 ingress event contract is undiscoverable');
  const opsSource = read('tools/ops-mcp/src/server.mjs');
  const opsTools = [...opsSource.matchAll(/server\.registerTool\(\s*['"]([^'"]+)['"]/gu)]
    .map((match) => ({ value: match[1], source: 'tools/ops-mcp/src/server.mjs', line: lineOf(opsSource, match.index) }));

  const inventory = {
    schemaVersion: 'kubeclaw-platform-surfaces.v1',
    sourceRevision,
    acceptanceContract: { source: acceptanceContractSource, acceptanceIds },
    generatedMarker: 'Generated by scripts/docs-platform-surface-inventory.mjs. Do not edit by hand.',
    sourceScopes: { shippedEntrypointSources, routeSources: discoveredRouteSources, goControllerSources, storeSources: discoveredStoreSources,
      renderedProfiles: ['helm:nova', 'helm:buster', 'helm:prism-agent', 'helm:prism', 'helm:ops-default', 'helm:ops-tailscale'],
      renderProfileStates: [
        ...['helm:nova', 'helm:buster', 'helm:prism-agent', 'helm:prism', 'helm:ops-default'].map((profile) => ({
          profile, activationState: 'active', activationCondition: 'selected maintained profile',
        })),
        { profile: 'helm:ops-tailscale', activationState: 'inactive',
          activationCondition: 'the selected Ops default is tailscale.enabled=false; deploy-ops-pod.sh opts in only when OPS_TAILSCALE_AUTHKEY_FILE is supplied' },
      ],
      staticRoots: ['my-values/infra', 'gitops/platform'] },
    dependencies,
    dependencySignals: distinct(dependencySignals),
    resources: distinct(resources.map((item) => ({
      value: `${item.kind}/${item.namespace}/${item.name}`,
      source: item.source,
      line: item.line,
      lifecycle: item.lifecycle,
      activationState: item.activationState,
      ...(item.activationCondition ? { activationCondition: item.activationCondition } : {}),
    }))),
    networkExposures: distinct(networkExposures),
    secretReferences: distinct(secretReferences),
    endpoints: distinct(routeRecords),
    outboundConnections: distinct(outboundConnections),
    stores: distinct([
      ...storeRecords,
      ...resources.filter((item) => item.kind === 'PersistentVolumeClaim')
        .map((item) => ({ value: `pvc:${item.namespace}/${item.name}`, source: item.source, line: item.line })),
      ...statefulSetClaimStores(rendered),
      ...externalStoreDefinitions.map((item) => storeFromNeedle(...item)),
    ]),
    events: distinct([...lifecycleEvents, ...domainEvents, ...ingressEvents]),
    opsTools: distinct(opsTools),
  };
  const publishedInventory = JSON.stringify(inventory);
  assert(!/\b[0-9]{15,20}\b/u.test(publishedInventory),
    'published platform inventory contains an unredacted long-form identity');
  const publishedEmail = publishedInventory.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu)?.[0];
  const publishedEmailIndex = publishedEmail ? publishedInventory.indexOf(publishedEmail) : -1;
  assert(!publishedEmail, `published platform inventory contains an unredacted email identity: ${publishedEmail ?? ''} near ${publishedInventory.slice(Math.max(0, publishedEmailIndex - 100), publishedEmailIndex + 180)}`);
  assert(!/[a-z][a-z0-9+.-]*:\/\/[^/\s"@:]+:[^/\s"@]+@/iu.test(publishedInventory),
    'published platform inventory contains a URL with embedded credentials');
  const maintainedSources = new Set(Object.values(inventory)
    .flatMap((value) => Array.isArray(value) ? value : [])
    .map((item) => item?.source)
    .filter((source) => typeof source === 'string' && !source.startsWith('helm:')));
  for (const source of maintainedSources) {
    assert(fs.existsSync(path.join(root, source)), `discovered source is absent: ${source}`);
    if (!isolatedMutation && !source.startsWith('docs/site/')) {
      const pinned = execFileSync('git', ['show', `${sourceRevision}:${source}`], {
        cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      });
      assert.equal(read(source), pinned, `${source} changed after ${sourceRevision}; update and repin the platform inventory`);
    }
  }
  return inventory;
}

function mappingFor(inventory) {
  if (!fs.existsSync(mappingTarget)) return undefined;
  const mapping = JSON.parse(fs.readFileSync(mappingTarget, 'utf8'));
  assert.equal(mapping.schemaVersion, 'kubeclaw-ap09-platform-surface-map.v1');
  for (const group of ['dependencies', 'dependencySignals', 'resources', 'secretReferences', 'endpoints', 'outboundConnections', 'stores', 'events', 'opsTools']) {
    const values = [...new Set(inventory[group].map((item) => item.value))].sort();
    const diagnostic = Object.values(mutationGroups).find(([mappedGroup]) => mappedGroup === group)?.[1]
      ?? 'DOC_DRIFT_PLATFORM_SURFACE';
    assert.deepEqual(mapping[group]?.identities, values,
      `${diagnostic}: ${group} documentation map is stale; map every discovered value exactly once`);
    assert.deepEqual(Object.keys(mapping[group]?.identityTargets ?? {}).sort(), values,
      `DOC_DRIFT_MAP_REVIEW: ${group} needs one explicit explanation target for every discovered identity`);
    assert.match(mapping[group]?.canonicalTarget ?? '', /^docs\/site\/(?:understand|reference)\/[a-z0-9-]+\.md#[a-z0-9-]+$/u,
      `${group} needs a canonical docs/site page and anchor`);
    assertExplanationTarget(mapping[group].canonicalTarget, group);
    for (const identity of values) {
      const target = mapping[group].identityTargets[identity];
      assert.match(target, /^docs\/site\/(?:understand|reference)\/[a-z0-9-]+\.md#[a-z0-9-]+$/u,
        `DOC_DRIFT_MAP_REVIEW: ${group} identity lacks a precise explanation target: ${identity}`);
      assertExplanationTarget(target, `${group} identity ${identity}`);
    }
    assert.equal(mapping[group]?.reviewedIdentitiesSha256, mappingReviewDigest(group, mapping[group]),
      `DOC_DRIFT_MAP_REVIEW: ${group} identities or explanation target changed without an independent map review`);
  }
  return mapping;
}

function headingAnchor(heading) {
  return heading.toLowerCase().replaceAll(/[`*_~]/gu, '').replaceAll(/[^a-z0-9\s-]/gu, '')
    .trim().replaceAll(/\s+/gu, '-');
}

const explanationAnchorCache = new Map();
function assertExplanationTarget(target, group) {
  const [file, anchor] = target.split('#');
  assert(fs.existsSync(path.join(root, file)), `DOC_DRIFT_MAP_REVIEW: ${group} explanation page is absent: ${file}`);
  const anchors = explanationAnchorCache.get(file)
    ?? [...read(file).matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) => headingAnchor(match[1]));
  explanationAnchorCache.set(file, anchors);
  assert(anchors.includes(anchor), `DOC_DRIFT_MAP_REVIEW: ${group} explanation anchor is absent: ${target}`);
}

function mappingReviewDigest(group, entry) {
  const reviewed = JSON.stringify({ group, canonicalTarget: entry.canonicalTarget,
    identities: [...new Set(entry.identities ?? [])].sort(),
    identityTargets: Object.fromEntries(Object.entries(entry.identityTargets ?? {}).sort(([left], [right]) => left.localeCompare(right))) });
  return createHash('sha256').update(reviewed).digest('hex');
}

function sourceLink(item) {
  if (!item.line || item.source.startsWith('helm:')) return `\`${item.source}${item.line ? `:${item.line}` : ''}\``;
  if (item.source.startsWith('docs/site/')) {
    const relativeTarget = path.posix.relative('docs/site/reference', item.source);
    const anchor = item.needle?.replace(/^#+\s*/u, '').toLowerCase()
      .replace(/[^a-z0-9\s-]/gu, '').trim().replace(/\s+/gu, '-');
    return `[${item.source}](${relativeTarget}${anchor ? `#${anchor}` : ''})`;
  }
  return `[${item.source}:${item.line}](https://github.com/datrab/kubeclaw/blob/${sourceRevision}/${item.source}#L${item.line}-L${item.line})`;
}
function pageLink(target) {
  const [file, anchor] = target.split('#');
  const relativeTarget = path.posix.relative('docs/site/reference', file);
  return `[explanation](${relativeTarget}#${anchor})`;
}
function assertDependencySignalTable(page, inventory) {
  const detail = page.split('### Detailed signals\n')[1]?.split('\n## Render Profile Selection')[0];
  assert(detail, 'generated dependency-signal detail section is absent');
  const nonempty = detail.split('\n').filter((line) => line.trim());
  assert.equal(nonempty.length, inventory.dependencySignals.length + 2,
    'generated dependency-signal table has a broken multiline row');
  assert(nonempty.every((line) => line.startsWith('|') && line.endsWith('|')),
    'generated dependency-signal table contains content outside a table row');
}
function assertReaderPage(page) {
  for (const forbidden of ['## Maintenance Contract', 'Generator:', 'Evidence revision:', 'newly discovered identity',
    'drift check', 'documentation map', 'reviewed digest', 'bulk sync', 'publication process']) {
    assert(!page.toLowerCase().includes(forbidden.toLowerCase()),
      `reader-facing platform inventory contains internal process text: ${forbidden}`);
  }
  assert(page.includes('## Runtime Signals\n\nAn `active` signal belongs to a selected profile.'),
    'reader-facing platform inventory must explain activation states');
}
function markdown(inventory, mapping) {
  const signalProfiles = new Map();
  for (const item of inventory.dependencySignals) {
    const profile = item.profile ?? 'unscoped';
    const counts = signalProfiles.get(profile) ?? { total: 0, active: 0, conditional: 0, inactive: 0, fixture: 0 };
    counts.total += 1;
    if (item.activationState === 'active') counts.active += 1;
    if (item.activationState === 'conditional') counts.conditional += 1;
    if (item.activationState === 'inactive') counts.inactive += 1;
    if (item.activationState === 'fixture-only') counts.fixture += 1;
    signalProfiles.set(profile, counts);
  }
  const section = (title, key, description) => [
    `## ${title}`, '', description, '', '| Identity | Source | Explanation |', '| --- | --- | --- |',
    ...inventory[key].map((item) => `| \`${item.value.replaceAll('|', '\\|')}\` | ${sourceLink(item)} | ${pageLink(mapping[key].identityTargets[item.value])} |`), '',
  ];
  const activationSection = (title, key, description) => [
    `## ${title}`, '', description, '',
    '| Identity | State | Activation condition | Source | Explanation |',
    '| --- | --- | --- | --- | --- |',
    ...inventory[key].map((item) => `| \`${item.value.replaceAll('|', '\\|')}\` | \`${item.activationState}\` | ${item.activationCondition.replaceAll('|', '\\|')} | ${sourceLink(item)} | ${pageLink(mapping[key].identityTargets[item.value])} |`), '',
  ];
  const resourceSection = [
    '## Runtime Resources', '',
    'Cluster-scoped objects use `cluster`. Helm lifecycle Jobs are active only during the named hook phase. An inactive or conditional profile does not describe a currently selected resource.', '',
    '| Identity | Lifecycle | State | Activation condition | Source | Explanation |',
    '| --- | --- | --- | --- | --- | --- |',
    ...inventory.resources.map((item) => `| \`${item.value.replaceAll('|', '\\|')}\` | \`${item.lifecycle}\` | \`${item.activationState}\` | ${item.activationCondition ?? 'selected manifest or profile renders this resource'} | ${sourceLink(item)} | ${pageLink(mapping.resources.identityTargets[item.value])} |`), '',
  ];
  return `${[
    '# Platform Surface Inventory', '',
    'Status: current',
    'Audience: platform operator, runtime maintainer, security maintainer',
    'Owner: platform maintainers',
    'Evidence: docs/generated/inventory/platform-surfaces.json; docs/config/platform-surface-map.json',
    `Source revision: \`${inventory.sourceRevision}\``,
    'Applies to: dependencies, runtime resources, secret references, server endpoints, outbound connections, stores, events, and Ops MCP tools', '',
    'Last verified: 2026-09-21', '',
    'This reference lists platform surfaces and their activation state. A source link identifies the maintained declaration; it does not prove live availability.', '',
    'Dependency classes have precise meanings. `current-profile-required` is required by the checked-in complete profile. `enabled-feature-required` is required only while that enabled feature is used. `operation-conditional` is required by the named operation. `supply-chain-required` supplies selected runtime images. `configured-but-unresolved` has a concrete service or readiness signal but lacks one complete selected client contract. `optional-platform` adds a platform capability without deciding pipeline success. `planned` has acceptance conditions but no supported runtime path.', '',
    '## Runtime Dependencies', '',
    'This table separates pipeline dependencies from deployment-profile choices, optional platform services, and planned work.', '',
    '| Dependency | Class | Rendered signals | Source | Explanation |', '| --- | --- | --- | --- | --- |',
    ...inventory.dependencies.map((item) => `| \`${item.value}\` | \`${item.classification}\` | ${item.renderedSignalCount}${item.renderedProfiles.length ? ` in \`${item.renderedProfiles.join(', ')}\`` : ''} | ${sourceLink(item)} | ${pageLink(mapping.dependencies.identityTargets[item.value])} |`), '',
    '## Runtime Signals', '',
    'An `active` signal belongs to a selected profile. A `conditional` signal requires its stated option or operation. An `inactive` signal belongs to an unselected profile, and `fixture-only` identifies non-runtime render scaffolding. A signal does not by itself prove a successful live connection.', '',
    '### Signal index', '',
    '| Profile | Total | Active | Conditional | Inactive | Render fixture |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...[...signalProfiles.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([profile, counts]) => `| \`${profile}\` | ${counts.total} | ${counts.active} | ${counts.conditional} | ${counts.inactive} | ${counts.fixture} |`), '',
    '### Detailed signals', '',
    '| Consumer and dependency | Profile | Signal class | State | Source | Explanation |',
    '| --- | --- | --- | --- | --- | --- |',
    ...inventory.dependencySignals.map((item) => `| \`${item.value.replaceAll('|', '\\|')}\` | \`${item.profile ?? 'unscoped'}\` | \`${item.classification}\` | \`${item.activationState}\` | ${sourceLink(item)} (\`${item.evidenceLocation}\`) | ${pageLink(mapping.dependencySignals.identityTargets[item.value])} |`), '',
    '## Render Profile Selection', '',
    'Profile state distinguishes maintained selected renders from opt-in comparison renders. An inactive comparison render contributes only conditional resources and signals.', '',
    '| Profile | Selected state | Activation condition |', '| --- | --- | --- |',
    ...inventory.sourceScopes.renderProfileStates.map((item) => `| \`${item.profile}\` | \`${item.activationState}\` | ${item.activationCondition} |`), '',
    ...resourceSection,
    ...section('Secret References', 'secretReferences', 'A reference does not prove that the Secret exists or contains a valid key.'),
    ...activationSection('HTTP Endpoints', 'endpoints', '`active` routes are admitted by the selected runtime. `conditional` routes also require the stated listener or feature switch. `ANY` means the handler does not restrict the method at this routing boundary.'),
    ...activationSection('Outbound HTTP Connections', 'outboundConnections', '`active` calls can be made by the selected runtime. `conditional` calls also require the stated feature or operation.'),
    ...section('State And Cache Names', 'stores', 'These identities include persistent stores and explicitly named ephemeral caches from declared state-owning runtime sources. Kubernetes claims appear in Runtime Resources.'),
    ...section('Runtime Events', 'events', 'This list joins the closed lifecycle-event type, the shipped Nova OpenClaw domain-event adapter, and the active Buster agent-observability ingress contract.'),
    ...section('Ops MCP Tools', 'opsTools', 'These tool names are available when the Ops service is active.'),
  ].join('\n')}\n`;
}

const inventory = build();
if (process.argv.includes('--print-inventory')) {
  await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`,
    (error) => error ? reject(error) : resolve()));
  process.exit(0);
}
if (process.argv.includes('--sync-map-identities')) {
  assert.fail('DOC_DRIFT_MAP_REVIEW: --sync-map-identities is disabled; review each new identity, its authored explanation anchor, and the reviewed digest explicitly');
}
const mapping = mappingFor(inventory);
if (!mapping) {
  fs.mkdirSync(path.dirname(jsonTarget), { recursive: true });
  fs.writeFileSync(jsonTarget, `${JSON.stringify(inventory, null, 2)}\n`);
  process.stderr.write(`Missing ${relative(mappingTarget)}. Inventory was written so that the documentation map can be created.\n`);
  process.exitCode = 2;
} else {
  const page = markdown(inventory, mapping);
  assertDependencySignalTable(page, inventory);
  assertReaderPage(page);
  const outputs = new Map([[jsonTarget, `${JSON.stringify(inventory, null, 2)}\n`], [pageTarget, page]]);
  if (check) {
    for (const [target, content] of outputs) assert(fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content,
      `${relative(target)} is stale; run npm run docs:ap09:platform-inventory`);
    process.stdout.write(`${JSON.stringify({ ok: true, dependencySignals: inventory.dependencySignals.length, resources: inventory.resources.length, secrets: inventory.secretReferences.length, endpoints: inventory.endpoints.length, outboundConnections: inventory.outboundConnections.length, stores: inventory.stores.length, events: inventory.events.length, opsTools: inventory.opsTools.length })}\n`);
  } else {
    for (const [target, content] of outputs) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
    process.stdout.write(`generated ${relative(jsonTarget)} and ${relative(pageTarget)}\n`);
  }
}
