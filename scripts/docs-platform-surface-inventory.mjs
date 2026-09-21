#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const sourceRevision = '32b02816cc19cc8865a45b221b8b6ca28e99e8fb';
const jsonTarget = path.join(root, 'docs/generated/inventory/platform-surfaces.json');
const pageTarget = path.join(root, 'docs/site/reference/platform-surfaces-generated.md');
const mappingTarget = path.join(root, 'docs/config/platform-surface-map.json');
const mutationGroups = {
  endpoint: ['endpoints', 'DOC_DRIFT_ENDPOINT'],
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
  ['kubernetes-api', 'pipeline-required', 'charts/ops-pod/templates/network.yaml', 'kube-apiserver'],
  ['cluster-dns', 'pipeline-required', 'charts/ops-pod/templates/network.yaml', 'kube-dns'],
  ['persistent-storage', 'pipeline-required', 'charts/kubeclaw/templates/pvc.yaml', 'kind: PersistentVolumeClaim'],
  ['cluster-cni', 'pipeline-required', 'charts/prism/templates/networkpolicy.yaml', 'kind: NetworkPolicy'],
  ['cilium-secured-deployment-profile', 'deployment-profile-required', 'my-values/infra/spire-network-policies.yaml', 'kind: CiliumNetworkPolicy'],
  ['git-origin', 'pipeline-required', 'my-values/nova-values.yaml', 'repoUrl:'],
  ['redis', 'pipeline-required', 'charts/kubeclaw/values.yaml', 'redis-master.kubeclaw.svc.cluster.local'],
  ['prism-postgresql', 'pipeline-required', 'charts/prism/values.yaml', 'postgresql:'],
  ['litellm-postgresql', 'pipeline-required', 'my-values/setup-secrets.sh', 'DATABASE_URL'],
  ['writable-oci-registry', 'pipeline-required', 'my-values/infra/registry-local.yaml', 'name: registry-local'],
  ['docker-hub-pull-through-mirror', 'pipeline-required', 'my-values/infra/registry-mirror.yaml', 'name: registry-mirror'],
  ['rootless-buildkit', 'pipeline-required', 'my-values/buster-values.yaml', 'CONTAINER_BUILD_BUILDKIT_HOST'],
  ['tailscale-operator', 'pipeline-required', 'gitops/platform/bootstrap/tailscale-operator.yaml', 'name: tailscale-operator'],
  ['litellm', 'pipeline-required', 'my-values/infra/litellm-deployment.yaml', 'name: litellm'],
  ['spire-envoy-worker-trust', 'deployment-profile-required', 'charts/prism/values.yaml', 'spiffe:'],
  ['openclaw-gateway', 'pipeline-required', 'charts/kubeclaw/templates/deployment.yaml', '/app/openclaw.mjs'],
  ['argocd', 'optional-platform', 'gitops/platform/bootstrap/argocd.yaml', 'name: argocd'],
  ['monitoring-stack', 'optional-platform', 'gitops/platform/bootstrap/prometheus.yaml', 'project: monitoring'],
  ['ops-pod', 'optional-platform', 'gitops/platform/bootstrap/codex-ops.yaml', 'name: codex-ops'],
  ['archviewer', 'optional-platform', 'charts/kubeclaw/templates/archviewer.yaml', 'archviewer.enabled'],
  ['git-mirror', 'planned', 'my-values/nova-values.yaml', 'repoUrl:'],
  ['authenticated-https-registry', 'planned', 'my-values/infra/registry-local.yaml', 'Anonymous HTTP lab registry'],
  ['automated-host-bootstrap', 'planned', 'scripts/deploy.sh', 'kubectl config current-context'],
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
  assert(index >= 0, `dependency ${value} marker is absent from ${source}`);
  return { value, classification, source, line: lineOf(maintained, index) };
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

function render(name, chart, values = [], sets = []) {
  const args = ['template', name, chart];
  for (const value of values) args.push('-f', value);
  for (const setting of sets) args.push('--set-string', setting);
  return execFileSync('helm', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function objects(source, origin) {
  return source.split(/(?=^---\s*$)/gmu).flatMap((chunk) => {
    const document = YAML.parseDocument(chunk);
    if (document.errors.length || !document.toJSON()) return [];
    const value = document.toJSON();
    const renderedSource = /^# Source: ([^\n]+)$/mu.exec(chunk)?.[1];
    const chartRoot = {
      'helm:nova': 'charts/kubeclaw', 'helm:buster': 'charts/kubeclaw',
      'helm:prism-agent': 'charts/kubeclaw', 'helm:prism': 'charts/prism',
      'helm:ops': 'charts/ops-pod',
    }[origin];
    const sourcePath = renderedSource && chartRoot
      ? `${chartRoot}/${renderedSource.slice(renderedSource.indexOf('/') + 1)}`
      : origin;
    let line;
    if (!sourcePath.startsWith('helm:') && fs.existsSync(path.join(root, sourcePath))) {
      const maintained = read(sourcePath);
      const kindIndex = maintained.search(new RegExp(`^kind:\\s*${String(value.kind).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*$`, 'mu'));
      line = kindIndex >= 0 ? lineOf(maintained, kindIndex) : 1;
    }
    return [{ value, origin, source: sourcePath, line }];
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

function renderedObjects() {
  const digestA = `sha256:${'a'.repeat(64)}`;
  const digestB = `sha256:${'b'.repeat(64)}`;
  const opsSets = [
    `codexImage=example.invalid/codex@${digestA}`,
    `mcpImage=example.invalid/mcp@${digestB}`,
    'networkPolicy.apiServerCIDRs[0]=192.0.2.1/32',
  ];
  const renders = [
    ['helm:nova', render('agent-nova', 'charts/kubeclaw', ['my-values/nova-values.yaml'])],
    ['helm:buster', render('agent-buster', 'charts/kubeclaw', ['my-values/buster-values.yaml'], [
      'runtimeInfrastructure.registry.endpoint=http://registry-local.kubeclaw.svc.cluster.local:5001',
      'runtimeInfrastructure.registry.transport=http-lab',
    ])],
    ['helm:prism-agent', render('agent-prism', 'charts/kubeclaw', ['my-values/prism-agent-values.yaml'])],
    ['helm:prism', render('prism', 'charts/prism', ['my-values/prism-values.yaml'], [
      'worker.native.namespace=kubeclaw', 'worker.native.nodeName=inventory-node',
      `worker.native.policyDigest=${'a'.repeat(64)}`,
    ])],
    ['helm:ops', render('ops', 'charts/ops-pod', [], opsSets)],
    ['helm:ops', render('ops', 'charts/ops-pod', [], [...opsSets, 'tailscale.enabled=true'])],
  ];
  const staticFiles = [
    ...walk(path.join(root, 'my-values/infra')).filter((file) => /\.ya?ml$/u.test(file)),
    ...walk(path.join(root, 'gitops/platform')).filter((file) => /\.ya?ml$/u.test(file)),
  ];
  return [
    ...renders.flatMap(([origin, source]) => objects(source, origin)),
    ...staticFiles.flatMap((file) => objects(fs.readFileSync(file, 'utf8'), relative(file))),
  ];
}

function build() {
  const rendered = renderedObjects();
  const secretLiteralSources = [
    ...walk(path.join(root, 'my-values')),
    ...walk(path.join(root, 'gitops/platform')),
    ...walk(path.join(root, 'charts')).filter((file) => /values\.ya?ml$/u.test(file)),
  ].filter((file) => /\.ya?ml$/u.test(file)).map(relative).sort();
  const discoveredRouteSources = [...new Set([
    ...routeSources,
    ...productionSourceFiles([
      'skills/nova/core', 'skills/worker/core/worker', 'skills/buster/engine/test-gates',
      'skills/prism/server', 'skills/prism/openclaw-plugin', 'tools/ops-mcp/src',
    ]),
  ])].sort();
  const stateCandidates = productionSourceFiles([
    'skills/nova/core', 'skills/worker/core/worker', 'skills/buster/engine/test-gates',
    'skills/prism/server', 'skills/common/plugin-runtime/foundation/observability',
  ]).filter((file) => /(?:writeFile|appendFile|FileJournal|FileDurable|mkdir|createWriteStream|withDurableStoreLock)/u.test(read(file)));
  const discoveredStoreSources = [...new Set([...storeSources, ...stateCandidates])].sort();
  const resources = rendered.filter(({ value }) => value.kind && value.metadata?.name).map(({ value, origin, source, line }) => ({
    kind: value.kind, namespace: value.metadata.namespace ?? 'default', name: value.metadata.name, source, line, origin,
  })).filter((item) => ['Deployment', 'StatefulSet', 'DaemonSet', 'Service', 'PersistentVolumeClaim', 'Ingress'].includes(item.kind));

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

  const routeRecords = recordsFromRegex(discoveredRouteSources,
    /(?:['"`])((?:\/healthz?|\/ready|\/bootstrap|\/mcp|\/v1\/)[^'"`\s?]*)(?:['"`])/gu);
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
  const opsSource = read('tools/ops-mcp/src/server.mjs');
  const opsTools = [...opsSource.matchAll(/server\.registerTool\(\s*['"]([^'"]+)['"]/gu)]
    .map((match) => ({ value: match[1], source: 'tools/ops-mcp/src/server.mjs', line: lineOf(opsSource, match.index) }));

  const inventory = {
    schemaVersion: 'kubeclaw-platform-surfaces.v1',
    sourceRevision,
    generatedMarker: 'Generated by scripts/docs-platform-surface-inventory.mjs. Do not edit by hand.',
    sourceScopes: { routeSources: discoveredRouteSources, storeSources: discoveredStoreSources, renderedProfiles: ['nova', 'buster', 'prism-agent', 'prism', 'ops', 'ops-tailscale'], staticRoots: ['my-values/infra', 'gitops/platform'] },
    dependencies: dependencyDefinitions.map((item) => recordFromNeedle(...item)),
    resources: distinct(resources.map((item) => ({ value: `${item.kind}/${item.namespace}/${item.name}`, source: item.source, line: item.line }))),
    secretReferences: distinct(secretReferences),
    endpoints: distinct(routeRecords),
    stores: distinct([
      ...storeRecords,
      ...resources.filter((item) => item.kind === 'PersistentVolumeClaim')
        .map((item) => ({ value: `pvc:${item.namespace}/${item.name}`, source: item.source, line: item.line })),
      ...externalStoreDefinitions.map((item) => storeFromNeedle(...item)),
    ]),
    events: distinct([...lifecycleEvents, ...domainEvents]),
    opsTools: distinct(opsTools),
  };
  const maintainedSources = new Set(Object.values(inventory)
    .flatMap((value) => Array.isArray(value) ? value : [])
    .map((item) => item?.source)
    .filter((source) => typeof source === 'string' && !source.startsWith('helm:')));
  for (const source of maintainedSources) {
    assert(fs.existsSync(path.join(root, source)), `discovered source is absent: ${source}`);
    const pinned = execFileSync('git', ['show', `${sourceRevision}:${source}`], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    assert.equal(read(source), pinned, `${source} changed after ${sourceRevision}; update and repin the platform inventory`);
  }
  return inventory;
}

function mappingFor(inventory) {
  if (!fs.existsSync(mappingTarget)) return undefined;
  const mapping = JSON.parse(fs.readFileSync(mappingTarget, 'utf8'));
  assert.equal(mapping.schemaVersion, 'kubeclaw-ap09-platform-surface-map.v1');
  for (const group of ['dependencies', 'resources', 'secretReferences', 'endpoints', 'stores', 'events', 'opsTools']) {
    const values = [...new Set(inventory[group].map((item) => item.value))].sort();
    const diagnostic = Object.values(mutationGroups).find(([mappedGroup]) => mappedGroup === group)?.[1]
      ?? 'DOC_DRIFT_PLATFORM_SURFACE';
    assert.deepEqual(mapping[group]?.identities, values,
      `${diagnostic}: ${group} documentation map is stale; map every discovered value exactly once`);
    assert.match(mapping[group]?.canonicalTarget ?? '', /^docs\/site\/(?:understand|reference)\/[a-z0-9-]+\.md#[a-z0-9-]+$/u,
      `${group} needs a canonical docs/site page and anchor`);
  }
  return mapping;
}

function mutationProbe(inventory, specification) {
  const [kind, operation] = specification.split(':');
  assert(Object.hasOwn(mutationGroups, kind), `unknown platform mutation kind: ${kind}`);
  assert(['add', 'change', 'remove'].includes(operation), `unknown platform mutation operation: ${operation}`);
  const [group, diagnostic] = mutationGroups[kind];
  const mutated = structuredClone(inventory);
  if (operation === 'add') mutated[group].push({ value: `documentation-drift-${kind}`, source: 'mutation-probe', line: 1 });
  if (operation === 'change') mutated[group][0].value = `${mutated[group][0].value}-documentation-drift`;
  if (operation === 'remove') {
    const removed = mutated[group][0].value;
    mutated[group] = mutated[group].filter((item) => item.value !== removed);
  }
  assert.throws(() => mappingFor(mutated), (error) => String(error.message).includes(diagnostic),
    `${specification} did not produce ${diagnostic}`);
  return { kind, operation, diagnostic };
}

function sourceLink(item) {
  if (!item.line || item.source.startsWith('helm:')) return `\`${item.source}${item.line ? `:${item.line}` : ''}\``;
  return `[${item.source}:${item.line}](https://github.com/datrab/kubeclaw/blob/${sourceRevision}/${item.source}#L${item.line})`;
}
function pageLink(target) {
  const [file, anchor] = target.split('#');
  const relativeTarget = path.posix.relative('docs/site/reference', file);
  return `[explanation](${relativeTarget}#${anchor})`;
}
function markdown(inventory, mapping) {
  const section = (title, key, description) => [
    `## ${title}`, '', description, '', '| Discovered identity | Source | Explanation |', '| --- | --- | --- |',
    ...inventory[key].map((item) => `| \`${item.value.replaceAll('|', '\\|')}\` | ${sourceLink(item)} | ${pageLink(mapping[key].canonicalTarget)} |`), '',
  ];
  return `${[
    '# Generated Platform Surface Inventory', '',
    'Status: generated current-source inventory',
    'Audience: platform operator, runtime maintainer, security maintainer',
    'Owner: documentation automation',
    'Generator: scripts/docs-platform-surface-inventory.mjs',
    'Evidence: scripts/docs-platform-surface-inventory.mjs; docs/config/platform-surface-map.json',
    `Evidence revision: \`${sourceRevision}\``,
    'Applies to: runtime resources, secret references, endpoints, stores, events, and Ops MCP tools', '',
    'Last verified: generated from current source on 2026-09-20', '',
    'This reference identifies source-derived platform surfaces. Each row links to the authored explanation of ownership, behavior, failure, recovery, or extension. A generated row proves that the identity exists in maintained source. It does not prove live availability.', '',
    'Dependency classes have precise meanings. `pipeline-required` is necessary for the complete shipped pipeline. `deployment-profile-required` is required by the current secured deployment profile but is not inherent to the pipeline design. `optional-platform` adds a platform capability without deciding pipeline success. `planned` has acceptance conditions but no supported runtime path.', '',
    '## Runtime Dependencies', '',
    'This table separates pipeline dependencies from deployment-profile choices, optional platform services, and planned work.', '',
    '| Dependency | Class | Source | Explanation |', '| --- | --- | --- | --- |',
    ...inventory.dependencies.map((item) => `| \`${item.value}\` | \`${item.classification}\` | ${sourceLink(item)} | ${pageLink(mapping.dependencies.canonicalTarget)} |`), '',
    ...section('Runtime Resources', 'resources', 'The generator renders the maintained Nova, Buster, Prism Agent, Prism, and Ops profiles. It also reads platform manifests.'),
    ...section('Secret References', 'secretReferences', 'A reference does not prove that the Secret exists or contains a valid key.'),
    ...section('HTTP Endpoints', 'endpoints', 'These literal routes come from the declared production HTTP servers. The communication guide explains parameterized route families.'),
    ...section('State And Cache Names', 'stores', 'These identities include persistent stores and explicitly named ephemeral caches from declared state-owning runtime sources. Kubernetes claims appear in Runtime Resources.'),
    ...section('Runtime Events', 'events', 'This list joins the closed lifecycle-event type and the shipped OpenClaw domain-event producer.'),
    ...section('Ops MCP Tools', 'opsTools', 'These names come from server registration calls.'),
    '## Maintenance Contract', '',
    'A new discovered identity makes the drift check fail until a maintainer maps it to a precise published explanation. Regeneration cannot create that explanation automatically. The maintainer must first explain ownership, protocol or data contract, security boundary, failure behavior, and recovery where those topics apply.', '',
  ].join('\n')}\n`;
}

const inventory = build();
if (process.argv.includes('--print-inventory')) {
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
  process.exit(0);
}
const probeIndex = process.argv.indexOf('--probe-mutation');
if (probeIndex >= 0) {
  const specification = process.argv[probeIndex + 1];
  assert(specification, '--probe-mutation requires <kind>:<operation>');
  process.stdout.write(`${JSON.stringify({ ok: true, ...mutationProbe(inventory, specification) })}\n`);
  process.exit(0);
}
const mapping = mappingFor(inventory);
if (!mapping) {
  fs.mkdirSync(path.dirname(jsonTarget), { recursive: true });
  fs.writeFileSync(jsonTarget, `${JSON.stringify(inventory, null, 2)}\n`);
  process.stderr.write(`Missing ${relative(mappingTarget)}. Inventory was written so that the documentation map can be created.\n`);
  process.exitCode = 2;
} else {
  const outputs = new Map([[jsonTarget, `${JSON.stringify(inventory, null, 2)}\n`], [pageTarget, markdown(inventory, mapping)]]);
  if (check) {
    for (const [target, content] of outputs) assert(fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content,
      `${relative(target)} is stale; run npm run docs:ap09:platform-inventory`);
    process.stdout.write(`${JSON.stringify({ ok: true, resources: inventory.resources.length, secrets: inventory.secretReferences.length, endpoints: inventory.endpoints.length, stores: inventory.stores.length, events: inventory.events.length, opsTools: inventory.opsTools.length })}\n`);
  } else {
    for (const [target, content] of outputs) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
    process.stdout.write(`generated ${relative(jsonTarget)} and ${relative(pageTarget)}\n`);
  }
}
