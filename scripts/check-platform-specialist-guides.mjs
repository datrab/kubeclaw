#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generatedCodeInventory } from './docs-lint-policy-reference.mjs';

const root = path.resolve(import.meta.dirname, '..');
const revision = '32b02816cc19cc8865a45b221b8b6ca28e99e8fb';

const specifications = [
  ['docs/site/reference/platform-surfaces-generated.md', 100, [
    '## Runtime Dependencies', '## Runtime Signals',
    '## Runtime Resources', '## Secret References',
    '## HTTP Endpoints', '## Outbound HTTP Connections',
    '## State And Cache Names', '## Runtime Events',
    '## Ops MCP Tools',
  ]],
  ['docs/site/extend/lint.md', 15, [
    '## Architecture', '## Pre-Check And Full', '## Add A Rule To An Existing Tool',
    '## Add A Local ESLint Rule', '## Add A Tool', '## Add A Target Or Language',
    '## Add A Policy Pack', '## Change A Baseline Or Waiver', '## Proof Ladder',
  ]],
  ['docs/site/reference/lint-policy.md', 25, [
    '## Contracts And Versions', '## Loading, Precedence, And Authority',
    '## Stage And Adapter Configuration', '## Complete Tool Inventory',
    '## Blocking ESLint Rules', '## Experimental Type-Evidence Rules',
    '## Curated Semgrep Rules', '## Kubernetes Policy Packs',
    '## Baselines, Waivers, And Debt', '## Rule Admission',
    '## Invalid Policy And Runtime Failures', '## Report Evidence',
  ]],
  ['docs/site/reference/lint-rules.md', 12, [
    '## How To Interpret A Finding', '## Blocking ESLint Rules',
    '## Experimental Type-Evidence Rules', '## Curated Semgrep Rules',
    '## Engine-Owned Finding Codes', '## Kubernetes Policy Rules',
    '## External Rule Families', '## Operational Error Codes',
    '## Verification Boundary',
  ]],
  ['docs/site/understand/forge.md', 5, [
    '## Purpose And Authority', '## Input And Dispatch Contract',
    '## Workspace And Git Flow', '## Completion, Commit Selection, And Merge',
    '## Failure And Recovery', '## Configuration And Extension',
  ]],
  ['docs/site/understand/echo.md', 5, [
    '## Purpose And Decision Boundary', '## Fixed Review Subject', '## Echo Output',
    '## Policy And Certification', '## Findings, Reports, And Repair',
    '## Failure And Recovery', '## Extension And Verification',
  ]],
  ['docs/site/understand/openclaw.md', 4, [
    '## Two Integration Surfaces', '## Shipped Host Plugins',
    '## Discovery, Installation, And Activation', '## Runtime Dispatch Target',
    '## Session Lifecycle', '## State, Ordering, Retry, And Pressure', '## Diagnosis',
  ]],
  ['docs/site/understand/codex-integration.md', 4, [
    '## What The Plugin Does', '## Installation And Activation',
    '## Deployed Ops Pod', '## Workspace And Network Boundaries',
    '## Connection Failure And Recovery',
  ]],
  ['docs/site/understand/ops-mcp.md', 4, [
    '## Purpose And Safety Boundary', '## HTTP Contract And Authentication',
    '## Tool Reference', '## Kubernetes Transport', '## Hubble Transport And Evidence Limits',
    '## Authorization And Data Exposure', '## Failure And Recovery',
  ]],
  ['docs/site/understand/archviewer.md', 5, [
    '## Purpose And Product Boundary', '## Request Path',
    '## Publication And Lifecycle', '## Failure And Recovery',
  ]],
  ['docs/site/understand/communication.md', 12, [
    '## Complete Connection Matrix', '## Endpoint Catalogue',
    '### Nova And Buster', '### Core, Plugins, And Worker Control', '### Redis',
    '### SPIFFE And mTLS', '### Git, OCI, BuildKit, And Tailscale',
    '## Global Retry Rules', '## Evidence Limits',
  ]],
  ['docs/site/understand/data-and-state.md', 15, [
    '## Complete Store Matrix', '## Nova Run State', '## Worker State',
    '## Buster State', '## PostgreSQL Owners', '### LiteLLM PostgreSQL',
    '## Redis: Durable Delivery, Not Product Authority', '## Artifact Lifecycle',
    '## Backup Groups', '## Restore Decision Rules', '## Deletion and Retention Rules',
    '## Failure and Recovery Matrix', '## Verification Map and Evidence Limits',
  ]],
  ['docs/site/understand/telemetry.md', 15, [
    '## Two Contract Families', '## Active Data Path', '## Active Event Catalog',
    '## Producer and Consumer Matrix', '## Identity and Correlation',
    '## Ordering and Deduplification', '## Redaction and Sensitive Data',
    '## Observer Delivery, Checkpoints, and Recovery', '## Sink Contracts',
    '## Retention, Capacity, and Backpressure', '## Audit Is a Projection',
    '## Failure and Recovery Matrix', '## Change Guide',
  ]],
  ['docs/site/understand/platform-and-operations.md', 20, [
    '## Required, Conditional, and Optional Systems', '## Host and K3s Boundary',
    '## DNS, Storage, and Scheduling', '## One Network Owner: Flannel or Cilium',
    '## Argo CD and Exclusive Resource Ownership', '## Rootless BuildKit',
    '## Writable Local OCI Registry', '## Docker Hub Pull-Through Mirror',
    '## Git Source and the Absent Git Mirror', '## Redis, PostgreSQL, and Tailscale',
    '## LiteLLM Model Gateway', '## Monitoring Is Optional and Non-Authoritative',
    '## Ops Pod: Tool Policy Is Not Kubernetes Authority',
    '## Dependency and Recovery Order', '## Failure and Recovery Matrix',
  ]],
  ['docs/site/understand/security-and-trust.md', 15, [
    '## Security Goals and Assumptions', '## Trust Boundary Map',
    '## One Request Passes Several Independent Checks',
    '## Identity Types Must Not Be Confused', '## SPIFFE, SPIRE, Envoy, and Worker Core',
    '## Secrets: Ownership, Resolution, and Recovery',
    '## Network Segmentation and Negative Paths',
    '## Source, Package, Image, and Artifact Integrity', '## Least Authority by Layer',
    '## Threats, Controls, and Residual Risk', '## Verification and Recovery Order',
    '## Current Limits',
  ]],
];

let sourceLinkCount = 0;
const checkedSources = new Set();
for (const [file, minimumLinks, markers] of specifications) {
  const absolute = path.join(root, file);
  assert(fs.existsSync(absolute), `${file} is missing`);
  const source = fs.readFileSync(absolute, 'utf8');
  if (!file.endsWith('platform-surfaces-generated.md')) {
    assert(source.includes(`Evidence revision: \`${revision}\``),
      `${file} does not declare the inspected evidence revision`);
  }
  for (const marker of markers) assert(source.includes(marker), `${file} lacks ${marker}`);

  if (file.startsWith('docs/site/understand/')) {
    const languages = [...source.matchAll(/^```([^\n]*)$/gmu)]
      .map(match => match[1].trim().toLowerCase()).filter(Boolean);
    assert(languages.every(language => language === 'mermaid'),
      `${file} copies maintained source instead of linking to it`);
  }

  const links = [...source.matchAll(
    /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)(?:#L([0-9]+)(?:-L([0-9]+))?)?/gu,
  )];
  assert(links.length >= minimumLinks,
    `${file} has ${links.length} pinned source links; expected at least ${minimumLinks}`);
  sourceLinkCount += links.length;

  for (const match of links) {
    const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
    assert.equal(linkRevision, revision, `${file} uses another revision for ${repositoryPath}`);
    const pinned = execFileSync('git', ['-C', root, 'show', `${revision}:${repositoryPath}`],
      { encoding: 'utf8' });
    if (!checkedSources.has(repositoryPath)) {
      const currentPath = path.join(root, repositoryPath);
      assert(fs.existsSync(currentPath), `linked source is absent: ${repositoryPath}`);
      assert.equal(fs.readFileSync(currentPath, 'utf8'), pinned,
        `${repositoryPath} changed after ${revision}; inspect and repin AP09.6/9.7`);
      checkedSources.add(repositoryPath);
    }
    if (!firstValue) continue;
    const first = Number(firstValue);
    const last = Number(lastValue ?? firstValue);
    const lineCount = pinned.split('\n').length;
    assert(first >= 1 && last >= first && last <= lineCount,
      `${file} has an invalid line range for ${repositoryPath}`);
    if (file.startsWith('docs/site/understand/') || file.endsWith('platform-surfaces-generated.md')) {
      assert(last - first <= 60, `${file} has an evidence range wider than 60 lines for ${repositoryPath}`);
    }
  }

  if (file.startsWith('docs/site/understand/') || file.endsWith('platform-surfaces-generated.md')) {
    assert(links.every((match) => match[3]), `${file} has a source link without an explicit line range`);
  }
}

const lintReference = fs.readFileSync(path.join(root, 'docs/site/reference/lint-policy.md'), 'utf8');
const lintRules = fs.readFileSync(path.join(root, 'docs/site/reference/lint-rules.md'), 'utf8');
const lintExtension = fs.readFileSync(path.join(root, 'docs/site/extend/lint.md'), 'utf8');
const lintPackage = JSON.parse(fs.readFileSync(path.join(root, 'skills/nova/plugins/lint/package.json'), 'utf8'));
assert.equal(typeof lintPackage.scripts?.['test:focused'], 'string', 'lint package lacks the fail-fast focused suite');
assert.equal(typeof lintPackage.scripts?.['test:live'], 'string', 'lint package lacks the separate live suite');
for (const required of [
  'npm run test:focused --prefix skills/nova/plugins/lint',
  'npm run test:live --prefix skills/nova/plugins/lint',
  'npm run lint:report --',
  '--helm-chart charts/kubeclaw',
  '"hostileCases":8',
  'LINT_POLICY_ADAPTER_MISSING',
  'LINT_POLICY_TOOL_MISSING',
]) assert(lintExtension.includes(required), `lint extension guide omits maintained proof: ${required}`);
for (const requiredFile of [
  'scripts/run-lint-report.mjs',
  'skills/nova/plugins/lint/tests/registry-lifecycle.test.mjs',
  'skills/nova/plugins/lint/tests/report-contract.test.mjs',
]) assert(fs.existsSync(path.join(root, requiredFile)), `lint extension proof is absent: ${requiredFile}`);
const lintPolicy = JSON.parse(fs.readFileSync(
  path.join(root, 'charts/kubeclaw/files/config/lint-policy.json'), 'utf8'));
assert.equal(lintPolicy.tools.length, 31,
  'lint tool count changed; update the complete tool reference');
for (const tool of lintPolicy.tools) {
  assert(lintReference.includes(`\`${tool.id}\``),
    `lint policy reference omits shipped tool ${tool.id}`);
}
execFileSync(process.execPath, [path.join(root, 'scripts/docs-lint-policy-reference.mjs'), '--check'],
  { encoding: 'utf8' });
const lintGeneratedReference = fs.readFileSync(
  path.join(root, 'docs/site/reference/lint-policy-generated.md'), 'utf8');

const eslintConfigs = await Promise.all([
  'eslint.config.mjs', 'eslint-type-evidence-config.mjs',
  'eslint-type-evidence-tests-config.mjs', 'eslint-type-evidence-generated-config.mjs',
].map((file) => import(path.join(root, 'charts/kubeclaw/files/config', file))));
const configuredEslintRules = new Set(eslintConfigs.flatMap(({ default: groups }) =>
  groups.flatMap((group) => Object.keys(group.rules ?? {}))));
for (const rule of configuredEslintRules) {
  assert(lintRules.includes(`\`${rule}\``), `lint rule reference omits ESLint rule ${rule}`);
}

const semgrepSource = fs.readFileSync(path.join(root, 'charts/kubeclaw/files/config/.semgrep.yml'), 'utf8');
const semgrepIds = [...semgrepSource.matchAll(/^\s*- id:\s*([^\s]+)$/gmu)].map((match) => match[1]);
assert.equal(semgrepIds.length, 25, 'Semgrep rule count changed; update the lint rule reference');
for (const rule of semgrepIds) {
  assert(lintRules.includes(`\`${rule}\``), `lint rule reference omits Semgrep rule ${rule}`);
}

const fixedCodes = new Set(generatedCodeInventory());
const criticalFixedCodes = [
  'go-vet', 'kubeconform', 'kubernetes-schema', 'eslint', 'mypy', 'semgrep',
  'staticcheck', 'tflint', 'trivy-kubernetes', 'trivy-terraform',
  'LINT_POLICY_PATH_INVALID', 'LINT_POLICY_PATH_DENIED',
];
for (const code of criticalFixedCodes) {
  assert(fixedCodes.has(code), `shared fixed-code inventory omits critical code ${code}`);
}
for (const code of fixedCodes) {
  const documentedUpstreamFallback = code === 'semgrep'
    && lintRules.includes('## Curated Semgrep Rules');
  assert(documentedUpstreamFallback || lintRules.includes(`\`${code}\``),
    `lint rule reference omits fixed code ${code}`);
  assert(lintGeneratedReference.includes(`\`${code}\``),
    `generated lint policy reference omits fixed code ${code}`);
}
const documentedFixedCodeCount = Number(
  /\| Engine-owned fixed codes \| (\d+) \|/u.exec(lintGeneratedReference)?.[1]);
assert.equal(documentedFixedCodeCount, fixedCodes.size,
  'generated lint policy reference contains a stale fixed-code count or omissions');
const configDirectory = path.dirname(path.join(root, 'charts/kubeclaw/files/config/lint-policy.json'));
for (const reference of lintPolicy.kubernetes_policy_packs) {
  const policyPack = JSON.parse(fs.readFileSync(path.resolve(configDirectory, reference.path), 'utf8'));
  for (const rule of policyPack.rules) {
    assert(lintGeneratedReference.includes(`\`${rule.id}\``),
      `lint policy reference omits Kubernetes rule ${rule.id}`);
    assert(lintGeneratedReference.includes(`\`${rule.type}\``),
      `lint policy reference omits Kubernetes rule type ${rule.type}`);
  }
}

const opsGuide = fs.readFileSync(path.join(root, 'docs/site/understand/ops-mcp.md'), 'utf8');
const opsServer = fs.readFileSync(path.join(root, 'tools/ops-mcp/src/server.mjs'), 'utf8');
const opsTools = [...opsServer.matchAll(/server\.registerTool\(\s*['"]([^'"]+)['"]/gu)]
  .map(match => match[1]);
assert(opsTools.length > 0, 'Ops MCP tool discovery returned no tools');
for (const tool of opsTools) {
  assert(opsGuide.includes(`\`${tool}\``), `Ops MCP guide omits tool ${tool}`);
}
for (const required of [
  'There is no page, duration, item-count, or encoded-output ceiling',
  'total pages, total duration, and encoded result bytes are not',
  'effective credential boundary',
  '`pods/exec` `create`',
]) assert(opsGuide.includes(required), `Ops MCP guide omits required limit or authority text: ${required}`);

const surfaceMap = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/config/platform-surface-map.json'), 'utf8'));
const dataGuide = fs.readFileSync(path.join(root, 'docs/site/understand/data-and-state.md'), 'utf8');
const mappedAliases = new Set();
for (const identity of surfaceMap.stores.identities) {
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const matches = [...dataGuide.matchAll(new RegExp(
    '^\\| `' + escaped + '` \\| (?:Persistent authority|Ephemeral state|Cache|Inactive/library-only) \\| `(S[0-9]{2})` \\|', 'gmu'))];
  assert.equal(matches.length, 1,
    `data guide must classify discovered store ${identity} exactly once`);
  mappedAliases.add(matches[0][1]);
}
for (const alias of mappedAliases) {
  assert.match(dataGuide, new RegExp(
    '^\\| `' + alias + '` (?:Persistent authority|Ephemeral state|Cache|Inactive/library-only|Persistent authority or cache as mapped) \\|[^\\n]+\\|[^\\n]+\\|[^\\n]+\\|[^\\n]+\\|[^\\n]+\\|$', 'mu'),
  `${alias} lacks a complete authority, consistency, retention, recovery, and loss contract`);
}

const telemetryGuide = fs.readFileSync(path.join(root, 'docs/site/understand/telemetry.md'), 'utf8');
for (const required of [
  '## OpenClaw agent-observability v1 path',
  'pipeline:agent-observability:payload:v1',
  'pipeline:agent-observability:control:v1',
  'pipeline:agent-observability:deadletter:v1',
  'no `XREAD`, consumer group, acknowledgement, checkpoint, or',
  'does not apply semantic or field-name redaction',
]) assert(telemetryGuide.includes(required),
  `telemetry guide omits active OpenClaw observer fact: ${required}`);

const busterWorkflowGuide = fs.readFileSync(
  path.join(root, 'docs/site/use/workflows/buster-suite.md'), 'utf8');
for (const required of [
  'operator-supplied `nova-project.v2` descriptor',
  'conceptual\n[20-step showcase trace]',
  'project.architecture?.review !== undefined',
  "one executable ${packageId} node is required",
  'plan?.coverage?.policy?.baseRevision !== process.env.RELEASE_COMMIT',
  'effects.get(nodeId) !== \'passed\'',
  'This is the cleanup meaning supported by the decision',
]) assert(busterWorkflowGuide.includes(required),
  `Buster workflow omits maintained acceptance boundary: ${required}`);
assert(!busterWorkflowGuide.includes('uses an operator-reviewed explicit pipeline graph'),
  'Buster workflow still depends on an unmaintained explicit pipeline graph');

const dependencyFailureGuide = fs.readFileSync(path.join(root, 'docs/site/use/diagnose.md'), 'utf8');
for (const required of [
  'EXEC-FAIL-REGISTRY-ENDPOINT',
  "trap 'restore_redis' EXIT",
  "trap 'restore_prism_postgresql' EXIT",
  "trap 'restore_litellm_postgresql' EXIT",
  "trap 'restore_registry_selector' EXIT",
  "trap 'restore_tailscale_oauth' EXIT",
  "trap 'restore_litellm_policy' EXIT",
  'tailscale-authority-fingerprints.json',
  'tailscale-new-lease.json',
  'tailscale-fault-cleanup.json',
  'preconditions: { uid, resourceVersion }',
  'same-name lease replacement exists; refusing to delete it',
  'same-name namespace replacement exists; refusing to delete it',
  'leaseAbsent: true',
  'namespaceAbsent: true',
  'operator logs lack an explicit OAuth rejection',
  'redis-stream-after.json',
  'redis-nova-audit-after.json',
  'kubectl create -f - <<EOF',
  'litellm-readiness-during-fault-before.json',
  'litellm-pods-during-fault-after.json',
  'observation: "bounded-upstream-failure"',
  'test "$litellm_fault_status" -eq 0',
]) assert(dependencyFailureGuide.includes(required),
  `dependency failure guide omits rollback or identity proof: ${required}`);
assert(!dependencyFailureGuide.includes('EXEC-FAIL-REGISTRY-BUILDKIT'),
  'dependency failure guide retains the misleading registry rejection identity');

const referenceTrace = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/site/use/workflows/examples/request-trace-success.json'), 'utf8'));
assert.equal(referenceTrace.status, 'conceptual-reference-only-not-live-proof');
assert.match(referenceTrace.scopeBoundary, /No maintained harness currently binds/u);
assert.equal(referenceTrace.steps.length, 20);
for (const step of referenceTrace.steps) {
  assert.equal(step.evidenceStatus, 'reference-only; no live evidence is attached',
    `reference trace step ${step.order} lacks its evidence boundary`);
}
const roadmap = fs.readFileSync(path.join(root, 'docs/site/status/roadmap.md'), 'utf8');
assert(roadmap.includes('## Joined Showcase Acceptance Harness'),
  'roadmap omits the joined showcase harness limit');
execFileSync(process.execPath, [path.join(root, 'scripts/docs-platform-surface-inventory.mjs'), '--check'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
execFileSync(process.execPath, [path.join(root, 'scripts/platform-surface-source-discovery.mjs'), '--self-test'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
execFileSync(process.execPath, [path.join(root, 'scripts/check-platform-surface-drift-mutations.mjs')],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
execFileSync(process.execPath, [path.join(root, 'scripts/check-cni-portability.mjs')],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const navigation = [
  ['docs/site/extend/README.md', 'lint.md'],
  ['docs/site/reference/README.md', 'lint-policy.md'],
  ['docs/site/reference/README.md', 'lint-policy-generated.md'],
  ['docs/site/reference/README.md', 'lint-rules.md'],
  ['docs/site/reference/README.md', 'platform-surfaces-generated.md'],
  ['docs/site/understand/README.md', 'forge.md'],
  ['docs/site/understand/README.md', 'echo.md'],
  ['docs/site/understand/README.md', 'openclaw.md'],
  ['docs/site/understand/README.md', 'codex-integration.md'],
  ['docs/site/understand/README.md', 'ops-mcp.md'],
  ['docs/site/understand/README.md', 'archviewer.md'],
  ['docs/site/understand/README.md', 'communication.md'],
  ['docs/site/understand/README.md', 'data-and-state.md'],
  ['docs/site/understand/README.md', 'telemetry.md'],
  ['docs/site/understand/README.md', 'platform-and-operations.md'],
  ['docs/site/understand/README.md', 'security-and-trust.md'],
];
for (const [file, target] of navigation) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(source.includes(`](${target})`), `${file} does not link to ${target}`);
}

process.stdout.write(`AP09.6/9.7 guides passed (${specifications.length} pages, ${sourceLinkCount} pinned source links, ${checkedSources.size} source files, ${opsTools.length} Ops tools)\n`);
