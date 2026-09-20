#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generatedCodeInventory } from './docs-lint-policy-reference.mjs';

const root = path.resolve(import.meta.dirname, '..');
const revision = '549dfe003d41fca50b85c3040029a74a817715d6';

const specifications = [
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
  assert(source.includes(`Evidence revision: \`${revision}\``),
    `${file} does not declare the inspected evidence revision`);
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
  }
}

const lintReference = fs.readFileSync(path.join(root, 'docs/site/reference/lint-policy.md'), 'utf8');
const lintRules = fs.readFileSync(path.join(root, 'docs/site/reference/lint-rules.md'), 'utf8');
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

const navigation = [
  ['docs/site/extend/README.md', 'lint.md'],
  ['docs/site/reference/README.md', 'lint-policy.md'],
  ['docs/site/reference/README.md', 'lint-policy-generated.md'],
  ['docs/site/reference/README.md', 'lint-rules.md'],
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
