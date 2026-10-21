#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const revision = 'bcf032f241b432bf920baa9ee5f727947921447d';
const specifications = [
  {
    file: 'docs/site/extend/contracts.md',
    minimumLinks: 15,
    required: [
      '## Why KubeClaw Uses Five Contracts',
      '## Stage Contract', '## Observer Contract', '## Capability Adapter Contract',
      '## Test Provider Contract', '## Report Adapter Contract',
      '## Data And Authority Comparison', '## Compatibility Rules',
      '## Move From A Need To An Implemented Registration',
      '**Benefit:**', '**Cost:**', '**Rejected alternative:**', '**Reconsider when:**',
      'does not explain `.swarm/pipeline.json`',
    ],
  },
  {
    file: 'docs/site/extend/effectful-plugin.md',
    minimumLinks: 10,
    required: [
      '## Follow One Effectful Stage From Package To Test',
      '## Design The Effect Identity', '## Understand The Effect State Machine',
      '## Retry And Resume', '## Cancellation', '## Cleanup And Compensation',
      '**Benefit:**', '**Cost:**', '**Alternative:**', '**Reconsider when:**',
      'declares five capabilities',
      'Do not describe this as exactly-once execution.',
      'The current state-store interface does not',
    ],
  },
  {
    file: 'docs/site/extend/buster.md',
    minimumLinks: 10,
    required: [
      '## Why Buster Separates Plans, Providers, And Reports',
      '## Suite Templates', '## Implement A Test Provider',
      '### Change a suite safely', '## Build A Test Provider End To End',
      '## Define Ports And Dependencies', '## Evidence Is A Contract',
      '## Implement A Report Adapter', '19 provider contracts',
      '**Benefit:**', '**Cost:**', '**Rejected alternative:**', '**Reconsider when:**',
      '17 tests and two', '12 templates',
    ],
  },
  {
    file: 'docs/site/extend/nova.md',
    minimumLinks: 12,
    required: [
      '## Why Nova Separates Orchestration From Authority',
      '## Author A Nova Stage', '## Author Or Select A Capability Adapter',
      '### Build a Nova stage end to end', '### Build or add an adapter',
      '## Author A Nova Observer', '## Understand Nova Lint',
      '## Change Lint Policy Or Rules', '### Follow the lint change path',
      '**Benefit:**', '**Cost:**', '**Rejected alternative:**', '**Reconsider when:**',
      '21 stages and six adapters',
      'No Nova-owned package currently registers an observer.',
    ],
  },
];

for (const specification of specifications) {
  const source = fs.readFileSync(path.join(root, specification.file), 'utf8');
  assert(source.includes(`Evidence revision: \`${revision}\``), `${specification.file} lacks the assessment revision`);
  for (const required of specification.required) {
    assert(source.includes(required), `${specification.file} lacks required content: ${required}`);
  }
  const copiedProductionCode = [...source.matchAll(/^```([^\n]*)$/gmu)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((language) => language && !['bash', 'text', 'mermaid'].includes(language));
  assert.deepEqual(copiedProductionCode, [],
    `${specification.file} contains a maintained production-code block instead of a source link`);
  const links = [...source.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)#L([0-9]+)-L([0-9]+)/gu)];
  assert(links.length >= specification.minimumLinks,
    `${specification.file} has only ${links.length} pinned source links`);
  for (const match of links) {
    const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
    assert.equal(linkRevision, revision, `${specification.file} uses another revision for ${repositoryPath}`);
    const pinned = execFileSync('git', ['-C', root, 'show', `${linkRevision}:${repositoryPath}`], { encoding: 'utf8' });
    const lineCount = pinned.split('\n').length;
    const first = Number(firstValue);
    const last = Number(lastValue);
    assert(first >= 1 && last >= first && last <= lineCount,
      `${specification.file} has an invalid range for ${repositoryPath}`);
  }
}

const registrations = { novaStages: 0, novaAdapters: 0, novaObservers: 0,
  busterTests: 0, busterFixtures: 0, busterReports: 0 };
for (const owner of ['nova', 'buster']) {
  const directory = path.join(root, `skills/${owner}/plugins`);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(directory, entry.name, 'plugin.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (owner === 'nova') {
      registrations.novaStages += manifest.stages?.length ?? 0;
      registrations.novaAdapters += manifest.adapters?.length ?? 0;
      registrations.novaObservers += manifest.observers?.length ?? 0;
    } else {
      for (const provider of manifest.testProviders ?? []) {
        if (provider.kind === 'test') registrations.busterTests += 1;
        else if (provider.kind === 'fixture') registrations.busterFixtures += 1;
      }
      registrations.busterReports += manifest.reportAdapters?.length ?? 0;
    }
  }
}
assert.deepEqual(registrations, {
  novaStages: 21,
  novaAdapters: 6,
  novaObservers: 0,
  busterTests: 17,
  busterFixtures: 2,
  busterReports: 1,
});

const suiteDirectory = path.join(root, 'contracts/pipeline-test-gate/v1/suites');
const suites = fs.readdirSync(suiteDirectory).filter((name) => name.endsWith('.json'));
assert.equal(suites.length, 12, 'Buster suite-template count changed');
for (const name of suites) {
  const suite = JSON.parse(fs.readFileSync(path.join(suiteDirectory, name), 'utf8'));
  assert.equal(suite.schemaVersion, 'test-suite-template.v1', `invalid suite template: ${name}`);
  assert.equal(typeof suite.contractId, 'string', `suite lacks contract identity: ${name}`);
}

console.log(JSON.stringify({ ok: true, pages: specifications.length,
  pinnedSourceLinks: specifications.reduce((sum, specification) => {
    const source = fs.readFileSync(path.join(root, specification.file), 'utf8');
    return sum + [...source.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\//gu)].length;
  }, 0), registrations, suites: suites.length }));
