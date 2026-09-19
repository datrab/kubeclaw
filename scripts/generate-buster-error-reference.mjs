#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'docs/site/reference/buster-error-codes.md');
const revision = '3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f';
const architecture = path.join(root, 'docs/architecture');

const groups = new Map();

function addGroup(id, title, prefixes, files, additional = []) {
  const current = groups.get(id) ?? { id, title, prefixes: [], files: [], additional: [] };
  current.prefixes.push(...prefixes);
  current.files.push(...files);
  current.additional.push(...additional);
  groups.set(id, current);
}

for (const name of fs.readdirSync(architecture).filter((item) => item.endsWith('-documentation-manifest.json'))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(architecture, name), 'utf8'));
  const id = manifest.suite;
  addGroup(id, id, manifest.errorPrefixes ?? [], manifest.sourceFilesWithErrors ?? [], manifest.additionalErrors ?? []);
}

addGroup('unit', 'unit command and JUnit report', ['DIRECT_COMMAND_', 'JUNIT_'], [
  'skills/buster/plugins/direct-command/src/provider.js',
  'skills/buster/plugins/junit-report-adapter/src/adapter.js',
]);
addGroup('coverage', 'coverage budget', ['COVERAGE_'], [
  'skills/buster/plugins/coverage-budget/src/provider.js',
]);
addGroup('demo-auth', 'authenticated demo smoke test', ['DEMO_AUTH_'], [
  'skills/buster/plugins/demo-auth-smoke/src/protocol.js',
  'skills/buster/plugins/demo-auth-smoke/src/provider.js',
]);

const guidance = {
  unit: ['Command, report, or JUnit normalization failed.', 'Check the executable catalogue, paths, process result, and JUnit bytes.'],
  coverage: ['LCOV input or the declared budget is invalid.', 'Check input identity, LCOV syntax, size limits, and the minimum percentage.'],
  build: ['Build input, BuildKit, registry, or image proof failed.', 'Check safe paths, native readiness, push policy, and manifest digest equality.'],
  k8s: ['The deployment fixture or namespace lease failed.', 'Check typed inputs, lease status, broker policy, readiness, and cleanup.'],
  health: ['The bounded HTTP request could not produce trusted facts.', 'Check target selection, origin policy, timeout, response size, and assertions.'],
  'tailscale-preview': ['Exposure ownership, readiness, or release failed.', 'Check lease generation, ingress ownership, DNS, handoff, and cleanup.'],
  api: ['API flow or OpenAPI execution failed.', 'Check the project document, selected operation, variables, origin policy, and cleanup.'],
  a11y: ['Axe configuration, browser authority, or result validation failed.', 'Check target, profiles, routes, acceptance expiry, and browser readiness.'],
  perf: ['Lighthouse setup, browser execution, or report admission failed.', 'Check settings, profile, budget, Chrome readiness, timeout, and report bytes.'],
  'visual-reg': ['Baseline, browser identity, image comparison, or evidence failed.', 'Check target selection, baseline digest, browser version, masks, and PNG limits.'],
  e2e: ['Playwright setup, process execution, report, or attachment failed.', 'Check project paths, browser sandbox, test selection, JSON report, and limits.'],
  security: ['A security policy, scanner, database, input, or cluster read failed.', 'Check strict policy, acceptance expiry, scanner readiness, and immutable inputs.'],
  bundle: ['Artifact measurement, archive inspection, or budget evaluation failed.', 'Check input digest, archive safety, matching rules, baseline, and limits.'],
  'demo-auth': ['The authenticated preview flow could not prove its contract.', 'Check all typed inputs, credential provenance, paths, cookie scope, and assertions.'],
};

function codesFor(group) {
  const source = [...new Set(group.files)].map((file) => {
    const absolute = path.join(root, file);
    assert(fs.existsSync(absolute), `Buster error source is missing: ${file}`);
    return fs.readFileSync(absolute, 'utf8');
  }).join('\n');
  const discovered = source.match(/[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}/gu) ?? [];
  return [...new Set([
    ...discovered.filter((code) => group.prefixes.some((prefix) => code.startsWith(prefix))),
    ...group.additional,
  ])].sort();
}

const ordered = ['unit', 'coverage', 'build', 'k8s', 'health', 'tailscale-preview', 'api', 'a11y',
  'perf', 'visual-reg', 'e2e', 'security', 'bundle', 'demo-auth'];
const titles = {
  unit: 'Unit Command And JUnit Report', coverage: 'Coverage Budget', build: 'Container Build',
  k8s: 'Kubernetes Fixture', health: 'HTTP', 'tailscale-preview': 'Tailscale Exposure',
  api: 'API', a11y: 'Accessibility', perf: 'Lighthouse Performance', visual: 'Visual',
  'visual-reg': 'Visual', e2e: 'End-To-End', security: 'Security', bundle: 'Size Budget',
  'demo-auth': 'Authenticated Demo Smoke Test',
};

const lines = [
  '# Buster Error Code Reference',
  '',
  'Status: generated from implemented provider and capability sources',
  'Audience: pipeline author, operator, test maintainer',
  'Owner: buster',
  'Evidence: scripts/generate-buster-error-reference.mjs; skills/buster/plugins',
  `Evidence revision: \`${revision}\``,
  'Applies to: exact errors emitted by shipped Buster suite providers',
  'Last verified: generated source inventory on 2026-09-19',
  '',
  '## How To Use This Reference',
  '',
  'Find the complete code before you retry. A code identifies the boundary that',
  'could not produce trusted facts. It does not by itself make a retry safe.',
  'Use the attempt state and the provider retry contract with the code.',
  '',
  'A failed assertion is not an execution error. It produces a normal provider',
  'result with findings. The codes below describe invalid input, unavailable',
  'authority, interrupted execution, invalid output, or failed evidence checks.',
  '',
  'The generator keeps this list equal to the source inventory. A source change',
  'fails the documentation check until this page is regenerated and reviewed.',
  '',
];

for (const id of ordered) {
  const group = groups.get(id);
  assert(group, `Buster error group is missing: ${id}`);
  const codes = codesFor(group);
  assert(codes.length > 0, `Buster error group has no codes: ${id}`);
  const [meaning, action] = guidance[id];
  lines.push(`## ${titles[id]}`, '',
    `**Meaning:** ${meaning}`, '', `**Safe action:** ${action}`, '',
    `**Exact codes (${codes.length}):**`, '', ...codes.map((code) => `- \`${code}\``), '',
    '**Source evidence:**', '');
  for (const file of [...new Set(group.files)].sort()) {
    lines.push(`- [${file}](https://github.com/datrab/kubeclaw/blob/${revision}/${file})`);
  }
  lines.push('');
}

lines.push('## Errors Outside A Provider', '',
  'Plan resolution, remote admission, Worker Core, evidence import, and namespace',
  'reconciliation have separate authorities. Use the family table in the',
  '[suite reference](buster-suites.md#error-codes-and-safe-actions), then continue',
  'with the linked subsystem guide. Do not translate an integrity or admission',
  'error into a failed test assertion.', '');

const output = `${lines.join('\n')}\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)}`);
} else {
  assert(fs.existsSync(target), 'generated Buster error reference is missing');
  assert.equal(fs.readFileSync(target, 'utf8'), output,
    'generated Buster error reference is stale; run node scripts/generate-buster-error-reference.mjs --write');
  console.log(`Buster error reference verified: ${ordered.length} groups`);
}
