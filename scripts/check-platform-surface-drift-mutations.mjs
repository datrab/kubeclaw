#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const inventoryScript = path.join(root, 'scripts/docs-platform-surface-inventory.mjs');
const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-platform-drift-'));
const isolatedSourceRoot = path.join(temporaryParent, 'source');
const operations = ['add', 'change', 'remove'];

const mutations = {
  dependency: {
    diagnostic: 'DOC_DRIFT_DEPENDENCY',
    source: 'my-values/buster-values.yaml',
    apply(operation, source) {
      const original = '      - name: CONTAINER_BUILD_BUILDKIT_HOST\n        value: unix:///run/user/1000/buildkit/buildkitd.sock\n';
      if (operation === 'add') return replaceOnce(source, original,
        `${original}      - name: SOURCE_MUTATION_BUILDKIT_HOST\n        value: unix:///run/user/1000/buildkit/source-mutation.sock\n`);
      if (operation === 'change') return replaceOnce(source, 'unix:///run/user/1000/buildkit/buildkitd.sock',
        'unix:///run/user/1000/buildkit/source-mutation.sock');
      return replaceOnce(source, original, '');
    },
  },
  endpoint: {
    diagnostic: 'DOC_DRIFT_ENDPOINT',
    source: 'skills/prism/server/agent-bridge.mjs',
    apply(operation, source) {
      if (operation === 'add') return replaceOnce(source,
        "if(request.url==='/health'||request.url==='/ready')",
        "if(request.url==='/health'||request.url==='/ready'||request.url==='/health-ap97-source-mutation')");
      if (operation === 'change') return replaceOnce(source,
        "request.url==='/v1/design-set'", "request.url==='/v1/design-set-ap97-source-mutation'");
      return replaceOnce(source, "request.url==='/v1/design-set'||", '');
    },
  },
  'endpoint-go-controller': {
    diagnostic: 'DOC_DRIFT_ENDPOINT',
    source: 'cmd/buster-namespace-controller/demo-readiness.go',
    apply(operation, source) {
      const original = 'if r.Method != http.MethodPost || (r.URL.Path != "/v1/demo-ready" && r.URL.Path != "/v1/demo-ready/status") {';
      if (operation === 'add') return replaceOnce(source, original,
        'if r.Method != http.MethodPost || (r.URL.Path != "/v1/demo-ready" && r.URL.Path != "/v1/demo-ready/status" && r.URL.Path != "/v1/demo-ready/source-mutation") {');
      if (operation === 'change') return replaceOnce(source, 'r.URL.Path != "/v1/demo-ready/status"',
        'r.URL.Path != "/v1/demo-ready/source-mutation-status"');
      return replaceOnce(source, ' && r.URL.Path != "/v1/demo-ready/status"', '');
    },
  },
  'endpoint-prefix': {
    diagnostic: 'DOC_DRIFT_ENDPOINT',
    source: 'skills/prism/server/studio-request.ts',
    apply(operation, source) {
      const original = "  if (url.pathname.startsWith('/v1/')) await proxy(request, response, url, options);\n";
      if (operation === 'add') return replaceOnce(source, original,
        "  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/v2-source-mutation/')) await proxy(request, response, url, options);\n");
      if (operation === 'change') return replaceOnce(source, "url.pathname.startsWith('/v1/')",
        "url.pathname.startsWith('/v9-source-mutation/')");
      return replaceOnce(source, original, '  if (false) await proxy(request, response, url, options);\n');
    },
  },
  'endpoint-static-fallback': {
    diagnostic: 'DOC_DRIFT_ENDPOINT',
    operations: ['remove'],
    source: 'skills/prism/server/studio-request.ts',
    apply(_operation, source) {
      return replaceOnce(source, '  else await staticFile(url, response, options);\n',
        '  else response.end();\n');
    },
  },
  outbound: {
    diagnostic: 'DOC_DRIFT_OUTBOUND',
    source: 'skills/prism/server/agent-job-runner.mjs',
    apply(operation, source) {
      const original = "    const {job}=await controlRequest(this.controlUrl,'/v1/agent/jobs/claim',{runnerId:this.runnerId},AbortSignal.timeout(10_000));\n";
      if (operation === 'add') return replaceOnce(source, original,
        `    await controlRequest(this.controlUrl,'/v1/source-mutation-probe',undefined,AbortSignal.timeout(10_000));\n${original}`);
      if (operation === 'change') return replaceOnce(source, "'/v1/agent/jobs/claim'", "'/v1/agent/jobs/source-mutation-claim'");
      return replaceOnce(source, original, '    const job=undefined;\n');
    },
  },
  'outbound-go-kubernetes': {
    diagnostic: 'DOC_DRIFT_OUTBOUND',
    source: 'cmd/buster-namespace-controller/demo-readiness-sources.go',
    apply(operation, source) {
      const original = 'if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespace, nil, "application/json", &current); err != nil {';
      if (operation === 'add') return replaceOnce(source, original,
        `if err := c.kube(ctx, http.MethodGet, "/api/v1/source-mutation/"+namespace, nil, "application/json", &current); err != nil { return err }\n\t${original}`);
      if (operation === 'change') return replaceOnce(source, original,
        original.replace('/api/v1/namespaces/', '/api/v1/source-mutation/namespaces/'));
      return replaceOnce(source, original, 'if false {');
    },
  },
  event: {
    diagnostic: 'DOC_DRIFT_EVENT',
    source: 'skills/common/plugin-runtime/sdk/src/generated/contracts.ts',
    apply(operation, source) {
      const original = "    | 'artifact.created'\n";
      if (operation === 'add') return replaceOnce(source, original,
        `${original}    | 'ap97.source-mutation'\n`);
      if (operation === 'change') return replaceOnce(source, original,
        "    | 'artifact.ap97-source-mutation'\n");
      return replaceOnce(source, original, '');
    },
  },
  'event-agent-observability': {
    diagnostic: 'DOC_DRIFT_EVENT',
    source: 'contracts/agent-observability/v1/src/constants.ts',
    apply(operation, source) {
      const original = "  'openclaw.session.ended',\n";
      if (operation === 'add') return replaceOnce(source, original,
        `${original}  'openclaw.source-mutation',\n`);
      if (operation === 'change') return replaceOnce(source, original,
        "  'openclaw.session.source-mutation',\n");
      return replaceOnce(source, original, '');
    },
  },
  store: {
    diagnostic: 'DOC_DRIFT_STORE',
    source: 'skills/nova/core/effects/locks.ts',
    apply(operation, source) {
      const original = "    this.#journal = new FileJournal(path.join(this.#root, 'locks.jsonl'));\n";
      if (operation === 'add') return replaceOnce(source, original,
        `${original}    void new FileJournal(path.join(this.#root, 'ap97-source-mutation.jsonl'));\n`);
      if (operation === 'change') return replaceOnce(source, 'locks.jsonl',
        'locks-ap97-source-mutation.jsonl');
      return replaceOnce(source, 'locks.jsonl', 'locks.log');
    },
  },
  'store-claim-template': {
    diagnostic: 'DOC_DRIFT_STORE',
    source: 'charts/ops-pod/templates/workload.yaml',
    apply(operation, source) {
      const original = '    {{- range $volume := list "home" "workspace" }}';
      if (operation === 'add') return replaceOnce(source, original,
        '    {{- range $volume := list "home" "workspace" "source-mutation" }}');
      if (operation === 'change') return replaceOnce(source, original,
        '    {{- range $volume := list "home" "workspace-source-mutation" }}');
      return replaceOnce(source, original, '    {{- range $volume := list "home" }}');
    },
  },
  secret: {
    diagnostic: 'DOC_DRIFT_SECRET',
    source(operation) {
      return operation === 'remove' ? 'charts/ops-pod/values.yaml' : 'my-values/nova-values.yaml';
    },
    apply(operation, source) {
      const original = '  - name: BUSTER_V2_TOKEN\n    valueFrom:\n      secretKeyRef:\n        name: openclaw-shared-secrets\n        key: busterV2Token\n';
      if (operation === 'add') return replaceOnce(source, original,
        `${original}  - name: AP97_SOURCE_MUTATION_TOKEN\n    valueFrom:\n      secretKeyRef:\n        name: ap97-source-mutation-secret\n        key: token\n`);
      if (operation === 'change') return replaceOnce(source, original,
        original.replace('name: openclaw-shared-secrets', 'name: openclaw-shared-secrets-ap97-source-mutation'));
      return replaceOnce(source, 'bearerSecret: codex-ops-bearer', 'bearerSecret: ""');
    },
  },
  'runtime-service': {
    diagnostic: 'DOC_DRIFT_RUNTIME_SERVICE',
    source: 'charts/prism/templates/services.yaml',
    apply(operation, source) {
      const service = 'apiVersion: v1\nkind: Service\nmetadata: { name: prism-studio }\nspec:\n  selector: { app: prism-studio }\n  ports: [{ port: 80, targetPort: 8080 }]\n';
      if (operation === 'add') return `${source.trimEnd()}\n---\n${service.replace('prism-studio', 'prism-source-mutation')}\n`;
      if (operation === 'change') return replaceOnce(source, service,
        service.replace('metadata: { name: prism-studio }', 'metadata: { name: prism-studio-source-mutation }'));
      return replaceOnce(source, `${service}---\n`, '');
    },
  },
  'runtime-job': {
    diagnostic: 'DOC_DRIFT_DEPENDENCY',
    operations: ['change'],
    source: 'charts/prism/templates/backup-storage-check.yaml',
    apply(_operation, source) {
      return replaceOnce(source, '  name: prism-backup-storage-check\n',
        '  name: prism-backup-storage-check-source-mutation\n');
    },
  },
  'runtime-network-policy': {
    diagnostic: 'DOC_DRIFT_RUNTIME_SERVICE',
    operations: ['change'],
    source: 'charts/prism/templates/networkpolicy.yaml',
    apply(_operation, source) {
      return replaceOnce(source, 'metadata: { name: prism-default-deny }\n',
        'metadata: { name: prism-default-deny-source-mutation }\n');
    },
  },
  'runtime-rbac': {
    diagnostic: 'DOC_DRIFT_RUNTIME_SERVICE',
    operations: ['change'],
    source: 'charts/ops-pod/templates/rbac.yaml',
    apply(_operation, source) {
      const original = 'kind: ClusterRole\nmetadata: {name: {{ .Release.Namespace }}-{{ .Release.Name }}-cluster-reader}\nrules:\n';
      return replaceOnce(source, original,
        original.replace('-cluster-reader}', '-cluster-reader-source-mutation}'));
    },
  },
  'ops-tool': {
    diagnostic: 'DOC_DRIFT_OPS_TOOL',
    source: 'tools/ops-mcp/src/server.mjs',
    apply(operation, source) {
      const call = registrationCall(source, 'get_pod');
      if (operation === 'add') return replaceOnce(source, call,
        `${call}\n\n${call.replace("'get_pod'", "'get_pod_ap97_source_mutation'")}`);
      if (operation === 'change') return replaceOnce(source, "'get_pod'", "'get_pod_ap97_source_mutation'");
      return replaceOnce(source, call, '');
    },
  },
};

function replaceOnce(source, needle, replacement) {
  const first = source.indexOf(needle);
  assert(first >= 0, `mutation anchor is absent: ${JSON.stringify(needle)}`);
  assert.equal(source.indexOf(needle, first + needle.length), -1,
    `mutation anchor is not unique: ${JSON.stringify(needle)}`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + needle.length)}`;
}

function registrationCall(source, toolName) {
  const nameIndex = source.indexOf(`'${toolName}'`);
  assert(nameIndex >= 0, `Ops tool mutation anchor is absent: ${toolName}`);
  const start = source.lastIndexOf('server.registerTool(', nameIndex);
  assert(start >= 0, `Ops tool registration is absent: ${toolName}`);
  let depth = 0;
  let quote;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        let end = index + 1;
        while (source[end] === ';' || source[end] === '\n') end += 1;
        return source.slice(start, end).trimEnd();
      }
    }
  }
  assert.fail(`Ops tool registration is incomplete: ${toolName}`);
}

function runInventory(sourceRoot, isolatedMutation = false, args = ['--check']) {
  return spawnSync(process.execPath, [inventoryScript, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: isolatedMutation ? {
      ...process.env,
      KUBECLAW_DOCS_SOURCE_ROOT: sourceRoot,
      KUBECLAW_DOCS_ISOLATED_MUTATION: '1',
    } : process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function workspaceFiles() {
  const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(listed.status, 0, `could not enumerate workspace files:\n${listed.stderr}`);
  return listed.stdout.split('\0').filter(Boolean).sort();
}

function copyWorkspace() {
  for (const relative of workspaceFiles()) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) continue;
    const target = path.join(isolatedSourceRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { dereference: false, preserveTimestamps: true });
  }
  const dependencies = path.join(root, 'node_modules');
  assert(fs.existsSync(dependencies), 'node_modules is required for the isolated rendering checks');
  fs.symlinkSync(dependencies, path.join(isolatedSourceRoot, 'node_modules'), 'dir');
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  fs.rmSync(temporaryParent, { recursive: true, force: true });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup();
  process.exit(128 + os.constants.signals[signal]);
});

const results = [];
const mapReviewResults = [];
try {
  const baseline = runInventory(root);
  assert.equal(baseline.status, 0,
    `platform inventory baseline failed:\n${baseline.stderr || baseline.stdout}`);
  const baselineInventory = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/generated/inventory/platform-surfaces.json'), 'utf8'));
  assert.deepEqual(
    baselineInventory.networkExposures
      .filter(({ kind }) => kind === 'Ingress')
      .map(({ namespace, name, routeKind, host, path: routePath, backendService, backendPort }) => [`${namespace}/${name}`, routeKind, host, routePath, backendService, backendPort]),
    [
      ['argocd/argocd', 'default-backend', null, null, 'argocd-server', 80],
      ['kubeclaw/agent-nova-archviewer', 'default-backend', null, null, 'agent-nova-archviewer', 3456],
      ['kubeclaw/prism-studio', 'default-backend', null, null, 'prism-studio', 80],
    ],
    'Ingress defaultBackend extraction changed or lost a published route');
  copyWorkspace();

  // An Ingress can declare rule paths and a default backend at the same time.
  // Both routes are effective and therefore both must remain in the inventory.
  const ingressFixturePath = path.join(isolatedSourceRoot, 'my-values/infra/argocd-tailscale-ingress.yaml');
  const ingressFixtureBefore = fs.readFileSync(ingressFixturePath, 'utf8');
  const ingressFixture = replaceOnce(ingressFixtureBefore, '  defaultBackend:\n', [
    '  rules:',
    '    - host: argocd.example.test',
    '      http:',
    '        paths:',
    '          - path: /api',
    '            pathType: Prefix',
    '            backend:',
    '              service:',
    '                name: argocd-api',
    '                port:',
    '                  number: 8080',
    '  defaultBackend:',
    '',
  ].join('\n'));
  fs.writeFileSync(ingressFixturePath, ingressFixture);
  const combinedIngressResult = runInventory(isolatedSourceRoot, true, ['--print-inventory']);
  assert.equal(combinedIngressResult.status, 0,
    `could not inspect the combined Ingress fixture:\n${combinedIngressResult.stderr}`);
  const combinedIngressInventory = JSON.parse(combinedIngressResult.stdout);
  assert.deepEqual(combinedIngressInventory.networkExposures
    .filter(({ kind, namespace, name }) => kind === 'Ingress' && namespace === 'argocd' && name === 'argocd')
    .map(({ routeKind, host, path: routePath, backendService, backendPort }) => [routeKind, host, routePath, backendService, backendPort]), [
    ['rule', 'argocd.example.test', '/api', 'argocd-api', 8080],
    ['default-backend', null, null, 'argocd-server', 80],
  ], 'Ingress with rules and defaultBackend did not publish both effective routes');
  fs.writeFileSync(ingressFixturePath, ingressFixtureBefore);

  const unsafeSync = runInventory(isolatedSourceRoot, true, ['--sync-map-identities']);
  assert.notEqual(unsafeSync.status, 0, 'the unsafe bulk identity synchronization option unexpectedly succeeded');
  assert.match(`${unsafeSync.stdout}\n${unsafeSync.stderr}`, /DOC_DRIFT_MAP_REVIEW/u,
    'the rejected bulk synchronization option lacks the map-review diagnostic');
  mapReviewResults.push('bulk-sync-rejected');

  for (const [kind, mutation] of Object.entries(mutations)) {
    for (const operation of mutation.operations ?? operations) {
      const relative = typeof mutation.source === 'function' ? mutation.source(operation) : mutation.source;
      const target = path.join(isolatedSourceRoot, relative);
      const before = fs.readFileSync(target, 'utf8');
      const after = mutation.apply(operation, before);
      assert.notEqual(after, before, `${kind}:${operation} did not change ${relative}`);
      fs.writeFileSync(target, after);

      const result = runInventory(isolatedSourceRoot, true);
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      const diagnostics = [...new Set(output.match(/\bDOC_DRIFT_[A-Z_]+\b/gu) ?? [])];
      assert.notEqual(result.status, 0, `${kind}:${operation} unexpectedly passed the drift check`);
      assert.deepEqual(diagnostics, [mutation.diagnostic],
        `${kind}:${operation} produced the wrong drift diagnostic:\n${output}`);
      results.push({ kind, operation, diagnostic: mutation.diagnostic, source: relative });

      fs.writeFileSync(target, before);
    }
  }

  const dependencyMutation = mutations.dependency;
  const dependencyTarget = path.join(isolatedSourceRoot, dependencyMutation.source);
  const dependencyBefore = fs.readFileSync(dependencyTarget, 'utf8');
  const mappingPath = path.join(isolatedSourceRoot, 'docs/config/platform-surface-map.json');
  const mappingBefore = fs.readFileSync(mappingPath, 'utf8');
  fs.writeFileSync(dependencyTarget, dependencyMutation.apply('add', dependencyBefore));
  const printed = runInventory(isolatedSourceRoot, true, ['--print-inventory']);
  assert.equal(printed.status, 0, `could not inspect the isolated identity addition:\n${printed.stderr}`);
  const mutatedInventory = JSON.parse(printed.stdout);
  const mapping = JSON.parse(mappingBefore);
  mapping.dependencySignals.identities = [...new Set(mutatedInventory.dependencySignals.map((item) => item.value))].sort();
  fs.writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);
  const digestBypass = runInventory(isolatedSourceRoot, true);
  assert.notEqual(digestBypass.status, 0, 'adding an identity without independent review unexpectedly passed');
  assert.match(`${digestBypass.stdout}\n${digestBypass.stderr}`, /DOC_DRIFT_MAP_REVIEW/u,
    'an identity-only map edit did not fail at the independent review digest');
  mapReviewResults.push('identity-only-edit-rejected');
  fs.writeFileSync(dependencyTarget, dependencyBefore);
  fs.writeFileSync(mappingPath, mappingBefore);
} finally {
  cleanup();
}

assert.equal(results.length,
  Object.values(mutations).reduce((total, mutation) => total + (mutation.operations ?? operations).length, 0),
  'the complete platform mutation matrix was not executed');
process.stdout.write(`${JSON.stringify({ ok: true, baseline: 'green', mutations: results.length,
  mapReview: mapReviewResults, results })}\n`);
