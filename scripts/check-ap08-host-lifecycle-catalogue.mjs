#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const revision = '32b02816cc19cc8865a45b221b8b6ca28e99e8fb';

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function pinnedLinks(relative, minimum) {
  const source = read(relative);
  const links = [...source.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)#L([0-9]+)-L([0-9]+)/gu)];
  assert(links.length >= minimum, `${relative} has only ${links.length} pinned line links`);
  for (const [, linkRevision, repositoryPath, firstValue, lastValue] of links) {
    assert.equal(linkRevision, revision, `${relative} uses another revision for ${repositoryPath}`);
    const value = execFileSync('git', ['-C', root, 'show', `${revision}:${repositoryPath}`], { encoding: 'utf8' });
    const first = Number(firstValue);
    const last = Number(lastValue);
    assert(first >= 1 && last >= first && last <= value.split('\n').length,
      `${relative} has an invalid line range for ${repositoryPath}`);
  }
  return links.length;
}

const host = read('docs/site/extend/host-and-engine.md');
for (const required of [
  '## Build An OpenClaw Hook Extension',
  '## Build An OpenClaw Tool Extension',
  '## Build A Codex Plugin Or Skill',
  '## Extend Worker Core With A Specialist Engine',
  '## Follow One Real Prism Worker Attempt',
  '## Create Or Change A Runtime Role',
  '## Compatibility And Replacement',
  '**Benefit:**', '**Cost:**', '**Rejected alternative:**', '**Reconsider when:**',
]) assert(host.includes(required), `host-and-engine.md lacks ${required}`);
for (const required of [
  'Persist the idempotency key and envelope before dispatch.',
  'Propagate cancellation to all owned work.',
  'Emit progress without making it the result authority.',
  'Store the result before evidence hydration or later projection.',
  'Validate the result against the original attempt.',
]) assert(host.includes(required), `host-and-engine.md lacks Worker journey step: ${required}`);

const lifecycle = read('docs/site/extend/testing.md');
for (const required of [
  '## Use A Proof Ladder', '## Record A Reproducible Result',
  '## Test A Pipeline Stage', '## Test An Observer', '## Test A Capability Adapter',
  '## Test A Provider Or Report Adapter', '## Test An OpenClaw Or Codex Extension',
  '## Test A Worker Engine Or Runtime Role', '## Install And Activate By Surface',
  '## Update Or Replace', '## Disable Safely', '## Remove And Inspect Remaining State',
  '## Diagnose A Failure', '**Benefit:**', '**Cost:**', '**Rejected alternative:**',
  '**Reconsider when:**',
]) assert(lifecycle.includes(required), `testing.md lacks ${required}`);

for (const [relative, source] of [
  ['docs/site/extend/host-and-engine.md', host],
  ['docs/site/extend/testing.md', lifecycle],
]) {
  assert(source.includes(`Evidence revision: \`${revision}\``), `${relative} lacks the evidence revision`);
  const codeBlocks = [...source.matchAll(/^```([^\n]*)$/gmu)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((language) => language && !['bash', 'text', 'mermaid'].includes(language));
  assert.deepEqual(codeBlocks, [], `${relative} copies maintained production code`);
}

const guidance = JSON.parse(read('docs/blueprint/AP08-catalogue-guidance.json'));
const verification = JSON.parse(read('docs/blueprint/AP08-local-verification.json'));
const inventory = JSON.parse(read('docs/blueprint/generated/ap08-extension-inventory.json'));
const packageCount = inventory.packages.length;
assert.equal(guidance.schemaVersion, 'ap08-catalogue-guidance.v1');
assert.equal(guidance.evidenceRevision, revision);
assert(packageCount > 0, 'extension inventory must contain at least one discovered package');
assert.equal(guidance.records.length, packageCount, 'catalogue guidance must cover every discovered package');
assert.equal(new Set(guidance.records.map((item) => item.id)).size, packageCount, 'catalogue guidance contains duplicate IDs');
const verificationRecords = verification.groups.flatMap((group) =>
  group.packages.map((id) => ({ id, result: group.result, reason: group.reason })));
assert.equal(verificationRecords.length, packageCount, 'local verification must cover every discovered package');
assert.equal(new Set(verificationRecords.map((item) => item.id)).size, packageCount, 'local verification contains duplicate IDs');
assert.deepEqual(verificationRecords.map((item) => item.id).sort(), inventory.packages.map((item) => item.id).sort(),
  'local verification and extension inventory differ');
const verificationById = new Map(verificationRecords.map((item) => [item.id, item]));
assert.deepEqual(
  guidance.records.map((item) => item.id).sort(),
  inventory.packages.map((item) => item.id).sort(),
  'catalogue guidance and extension inventory differ',
);
for (const item of guidance.records) {
  for (const field of ['purpose', 'useWhen', 'avoidWhen', 'criticalLimit', 'operationNote']) {
    assert.equal(typeof item[field], 'string', `${item.id} lacks ${field}`);
    assert(item[field].length >= 24, `${item.id} has an incomplete ${field}`);
  }
}

const projectSummaryGuidance = guidance.records.find((item) => item.id === 'kubeclaw.project-summary');
const projectSummaryConfig = JSON.parse(read('skills/nova/plugins/project-summary/schemas/config.schema.json'));
const deliveryManifestEncoding = projectSummaryConfig.properties.deliveryManifestEncoding.const;
assert(
  projectSummaryGuidance.operationNote.includes(`deliveryManifestEncoding to ${deliveryManifestEncoding}`),
  'project-summary guidance must use the configuration schema value for deliveryManifestEncoding',
);
assert(
  projectSummaryGuidance.operationNote.includes('kubeclaw-json.utf16.v1 encoding marker'),
  'project-summary guidance must distinguish the artifact encoding marker from the configuration value',
);
const projectSummaryGuide = read('skills/nova/plugins/project-summary/README.md');
assert(
  projectSummaryGuide.includes(`deliveryManifestEncoding\` to \`${deliveryManifestEncoding}`),
  'project-summary package guide must use the configuration schema value',
);

const catalogueRoot = path.join(root, 'docs/site/extend/plugin-catalogue');
const packagePages = fs.readdirSync(catalogueRoot)
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .sort();
assert.equal(packagePages.length, packageCount, 'published catalogue must contain one page per discovered package');
const expectedSections = [
  '## Authored Guidance', '## When To Use It', '## When Not To Use It',
  '## Most Important Limit', '## Generated Package Facts', '## Boundaries',
  '## Registration Summary', '## Failure Behavior', '## Verification Record',
  '## Source Evidence',
];
const auditStatuses = new Map(inventory.packages.map((item) => [item.id, item.auditStatus]));
for (const name of packagePages) {
  const id = name.slice(0, -3);
  const source = fs.readFileSync(path.join(catalogueRoot, name), 'utf8');
  for (const section of expectedSections) assert(source.includes(section), `${name} lacks ${section}`);
  assert(source.includes(`Catalogue status: \`${auditStatuses.get(id)}\`.`), `${name} has a stale catalogue status`);
  assert(source.includes(`Recorded local command result on ${verification.date}: \`${verificationById.get(id).result}\`.`),
    `${name} has a stale local result`);
  const item = inventory.packages.find(entry => entry.id === id);
  const manifest = JSON.parse(read(item.manifest));
  if (item.host === 'pipeline-runtime') {
    for (const kind of ['stages', 'adapters', 'observers', 'testProviders', 'reportAdapters']) {
      for (const registration of manifest[kind] ?? []) {
        assert(source.includes(`Global registration ID: \`${id}:${registration.id}\``), `${id} lacks a global registration identity`);
        if (registration.checkpointSchema) assert(source.includes(registration.checkpointSchema), `${id} lacks its checkpoint schema`);
      }
    }
    assert(!/^Input schema: None\.|^Result schema: None\./mu.test(source), `${id} hides its shared contract`);
  }
  assert(!source.includes('Authored guidance is missing.'), `${name} lacks authored guidance`);
  assert(source.includes('/blob/' + revision + '/'), `${name} lacks revision-pinned source evidence`);
  assert(source.includes('[Install and activate](../testing.md#install-and-activate-by-surface)'), `${name} lacks the activation link`);
  assert(source.includes('[Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)'), `${name} lacks the removal link`);
  assert(source.includes('Declared manifest facts:'), `${name} lacks complete manifest facts`);
  assert(source.includes('Maintained guidance data owns'), `${name} does not state content authority`);
}
assert(fs.existsSync(path.join(catalogueRoot, 'kubeclaw-ops.md')), 'Codex package page is missing');
const prismCatalogue = fs.readFileSync(path.join(catalogueRoot, 'kubeclaw-prism.md'), 'utf8');
assert(prismCatalogue.includes('The Prism agent image copies this extension directly'),
  'Prism catalogue page does not explain direct image packaging');
assert(![...auditStatuses.values()].includes('pending'), 'catalogue contains a pending package audit');

const generatedIndex = read('docs/site/extend/plugin-catalogue/README.md');
assert(generatedIndex.includes(`The catalogue contains ${packageCount} packages.`));
assert(generatedIndex.includes('Maintainers write the practical'));

const sourceTargets = new Set();
for (const name of ['README.md', ...packagePages]) {
  const source = fs.readFileSync(path.join(catalogueRoot, name), 'utf8');
  for (const match of source.matchAll(new RegExp(`https://github\\.com/datrab/kubeclaw/blob/${revision}/([^#)]+)`, 'gu'))) {
    sourceTargets.add(match[1]);
  }
}
for (const target of sourceTargets) {
  execFileSync('git', ['-C', root, 'cat-file', '-e', `${revision}:${target}`]);
}

const hostLinks = pinnedLinks('docs/site/extend/host-and-engine.md', 25);
const lifecycleLinks = pinnedLinks('docs/site/extend/testing.md', 10);
console.log(JSON.stringify({
  ok: true,
  pages: packagePages.length + 3,
  packages: inventory.packages.length,
  authoredRecords: guidance.records.length,
  sourceTargets: sourceTargets.size,
  pinnedLineLinks: hostLinks + lifecycleLinks,
  auditStatuses: Object.fromEntries([...new Set(auditStatuses.values())]
    .map((status) => [status, [...auditStatuses.values()].filter((value) => value === status).length])),
  localResults: Object.fromEntries(verification.groups.map((group) => [group.result,
    verificationRecords.filter((item) => item.result === group.result).length])),
}));
