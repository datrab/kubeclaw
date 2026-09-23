#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const specifications = [
  {
    file: 'docs/site/understand/prism.md', minimumLinks: 11,
    required: [
      '## The Product Boundary', '## One Request Through the System',
      '## Authority Map', '## The Durable Spine', '## Five Engine Operations',
      '## Retrieval, Rights, and Preference Evidence',
      '## Failure Is Part of the Design', '## Configuration and Environment Proof',
      '**Decision:**', '**Reason:**', '**Rejected alternative:**', '**Cost:**',
    ],
  },
  {
    file: 'docs/site/understand/prism-runtime.md', minimumLinks: 49,
    required: [
      '## Runtime Map', '## 1. Control: The Durable Authority',
      '## 2. API Surface and Request Flows', '## 3. The Main Design Journey',
      '## 4. Native Worker and Engine Execution',
      '## 5. Durable Restart and Recovery',
      '## 6. Studio: User Entry and Same-Origin Proxy',
      '## 7. Ingestion: Untrusted Content Boundary', '## 8. Pipeline Adapter',
      '## 9. Deployment Topology', '## 10. Implemented Boundaries and Open Limits',
      '## 11. Failure Codes That Matter During Recovery', '## 12. Extension Rules',
      'Agent Bridge', 'Control', 'Studio', 'Worker Core', 'Tailscale', 'SPIFFE',
    ],
  },
  {
    file: 'docs/site/understand/prism-data.md', minimumLinks: 86,
    required: [
      '## The Data Map', '## Projects and Design Requests',
      '## Design Rounds and Directions', '## Design Documents',
      '## Operations and Revisions', '## Direction Decisions and Preference Evidence',
      '## Evaluation, Approval, and Publication', '## Renderer and Assets',
      '## Content-Addressed Artifact Storage', '## Corpus Ingestion',
      '## Retrieval, Embeddings, Ranking, and Access Boundaries',
      '## PostgreSQL Ownership and Migrations', '### Complete migration reference',
      '## Transactions, Locks, and Compare-and-Swap',
      '## Backup, Verification, Restore Proof, and Retention',
      '## Failure and Recovery Matrix', 'pgvector', 'rights',
    ],
  },
  {
    file: 'docs/site/use/prism-studio.md', minimumLinks: 53,
    required: [
      '## Configuration Sources and Precedence', '### Main Helm values',
      '### Runtime settings and defaults', '### Deploy-command settings',
      '### Prism agent values', '### Nova Prism-stage configuration', '### Secrets',
      '## Deploy Prism', '## The Complete Studio Journey',
      '### Step 1: Let Nova create the governed project',
      '### Step 11: Resume Nova with the approved identities',
      '## What Is in the Baseline Bundle', '## Safe Recovery Procedures',
      '## Diagnosis Map', '## Backup, Restore, and Removal',
      '## Local Development and Verification',
      '## Implemented, Environment-Dependent, and Not an Operator Surface',
    ],
  },
  {
    file: 'docs/site/extend/platform/prism.md', minimumLinks: 29,
    required: [
      '## Start With the Smallest Owner', '## Change a Public Contract',
      '## Add or Change a Document Operation',
      '## Add a Node Type or Renderer Feature', '## Change a Design Provider',
      '## Change Retrieval or Ingestion', '## Change Evaluation or Preferences',
      '## Change Control or an HTTP Route', '## Change Worker Execution',
      '## Change Studio', '## Change Storage or Add a Migration',
      '## Change Publication or Pipeline Handoff', '## Verification Matrix',
      '## Review Checklist',
    ],
  },
];

let sourceLinks = 0;
const checkedSources = new Set();
for (const specification of specifications) {
  const filePath = path.join(root, specification.file);
  const source = fs.readFileSync(filePath, 'utf8');
  const revisionMatch = source.match(/^Evidence revision: `([0-9a-f]{40})`$/mu);
  assert(revisionMatch, `${specification.file} lacks one explicit inspected evidence revision`);
  const revision = revisionMatch[1];
  for (const marker of specification.required) {
    assert(source.includes(marker), `${specification.file} lacks required content: ${marker}`);
  }

  if (specification.file.startsWith('docs/site/understand/')) {
    const blockLanguages = [...source.matchAll(/^```([^\n]*)$/gmu)]
      .map((match) => match[1].trim().toLowerCase()).filter(Boolean);
    assert(blockLanguages.every((language) => language === 'mermaid'),
      `${specification.file} copies maintained code instead of linking to source`);
  }

  const links = [...source.matchAll(
    /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)]+)(?:#L([0-9]+)(?:-L([0-9]+))?)?/gu,
  )];
  assert(links.length >= specification.minimumLinks,
    `${specification.file} has only ${links.length} pinned source links`);
  sourceLinks += links.length;

  for (const match of links) {
    const [, linkRevision, repositoryPath, firstValue, lastValue] = match;
    assert.equal(linkRevision, revision,
      `${specification.file} uses another revision for ${repositoryPath}`);
    const pinned = execFileSync('git', ['-C', root, 'show', `${revision}:${repositoryPath}`],
      { encoding: 'utf8' });
    if (!checkedSources.has(repositoryPath)) {
      const currentPath = path.join(root, repositoryPath);
      assert(fs.existsSync(currentPath), `linked source is absent: ${repositoryPath}`);
      assert.notEqual(repositoryPath, 'package.json',
        `${specification.file} must not use mutable documentation command registration as pinned Prism evidence`);
      assert.equal(fs.readFileSync(currentPath, 'utf8'), pinned,
        `${repositoryPath} changed after ${revision}; inspect and repin the Prism guides`);
      checkedSources.add(repositoryPath);
    }
    if (!firstValue) continue;
    const lineCount = pinned.split('\n').length;
    const first = Number(firstValue);
    const last = Number(lastValue ?? firstValue);
    assert(first >= 1 && last >= first && last <= lineCount,
      `${specification.file} has an invalid line range for ${repositoryPath}`);
  }
}

const operator = fs.readFileSync(path.join(root, 'docs/site/use/prism-studio.md'), 'utf8');
const runtimeConfigFiles = [
  'skills/prism/config/database-bootstrap.ts', 'skills/prism/config/native-worker.ts',
  'skills/prism/server/studio-config.ts', 'skills/prism/server/agent-bridge.mjs',
  'skills/prism/server/control-config.ts', 'skills/prism/server/worker-config.ts',
  'skills/prism/server/ingestion.ts', 'skills/prism/server/migrate.ts',
  'skills/prism/openclaw-plugin/index.mjs', 'skills/prism/control/product-decisions.ts',
];
const configSource = runtimeConfigFiles
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const directSettings = [...configSource.matchAll(
  /(?:process\.env\.|environment\.)([A-Z][A-Z0-9_]+)/gu,
)].map((match) => match[1]);
const helperSettings = [...configSource.matchAll(
  /(?:required|read|root)\([^\n)]*?['"]([A-Z][A-Z0-9_]+)['"]/gu,
)].map((match) => match[1]);
const settings = [...new Set([...directSettings, ...helperSettings])].sort();
for (const setting of settings) {
  assert(operator.includes(`\`${setting}\``),
    `Prism operator guide does not name runtime setting ${setting}`);
}

function leafPaths(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      leafPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}
const shippedValues = parseYaml(fs.readFileSync(path.join(root, 'charts/prism/values.yaml'), 'utf8'));
const helmFields = leafPaths(shippedValues);
assert.equal(helmFields.length, 97,
  'shipped Prism Helm field count changed; update the complete operator field map');
for (const field of helmFields) {
  assert(operator.includes(`\`${field}\``),
    `Prism operator guide does not name shipped Helm field ${field}`);
}

const deploySource = fs.readFileSync(path.join(root, 'scripts/deploy.sh'), 'utf8');
const deploySettings = [...new Set([...deploySource.matchAll(/\b(PRISM_[A-Z0-9_]+)\b/gu)]
  .map((match) => match[1]))].sort();
assert.equal(deploySettings.length, 31,
  'Prism deploy setting count changed; update the operator deployment table');
for (const setting of deploySettings) {
  assert(operator.includes(`\`${setting}\``),
    `Prism operator guide does not classify deploy identifier ${setting}`);
}

const dataGuide = fs.readFileSync(path.join(root, 'docs/site/understand/prism-data.md'), 'utf8');
const migrationDirectory = path.join(root, 'skills/prism/storage/migrations');
const migrations = fs.readdirSync(migrationDirectory)
  .filter((name) => /^\d{3}_.+\.sql$/u.test(name)).sort();
assert.equal(migrations.length, 17, 'Prism migration count changed; update the data guide');
for (const migration of migrations) {
  assert(dataGuide.includes(`\`${migration}\``),
    `Prism data guide does not name migration ${migration}`);
}

const allGuides = specifications
  .map(({ file }) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
for (const operation of ['generate', 'render', 'evaluate', 'ingest', 'publish']) {
  assert(allGuides.includes(`\`${operation}\``),
    `Prism guide set does not name engine operation ${operation}`);
}

const navigation = [
  ['docs/site/README.md', 'understand/prism.md'],
  ['docs/site/understand/README.md', 'prism.md'],
  ['docs/site/use/README.md', 'prism-studio.md'],
  ['docs/site/extend/README.md', 'platform/prism.md'],
];
for (const [file, target] of navigation) {
  assert(fs.readFileSync(path.join(root, file), 'utf8').includes(`](${target}`),
    `${file} does not link to ${target}`);
}

const surfaces = fs.readFileSync(path.join(root, 'docs/site/product-surfaces.md'), 'utf8');
for (const id of ['SUR-SPC-03', 'SUR-DAT-04', 'SUR-DEP-06']) {
  const row = surfaces.split('\n').find((line) => line.startsWith(`| ${id} |`));
  assert(row?.endsWith('| Detailed |'), `${id} does not declare detailed coverage`);
}

const requirementMarkers = {
  'SPC-002': ['docs/site/understand/prism.md', '## The Product Boundary'],
  'SPC-003': ['docs/site/understand/prism-data.md', '## Projects and Design Requests'],
  'OPR-010': ['docs/site/use/prism-studio.md', '## The Complete Studio Journey'],
  'CDV-009': ['docs/site/extend/platform/prism.md', '## Start With the Smallest Owner'],
};
for (const [id, [file, marker]] of Object.entries(requirementMarkers)) {
  assert(fs.readFileSync(path.join(root, file), 'utf8').includes(marker),
    `${id} lost its maintained marker in ${file}`);
}

console.log(`Prism guides verified: ${specifications.length} pages, ${sourceLinks} pinned links, ${checkedSources.size} source files, ${settings.length} runtime settings, ${helmFields.length} shipped Helm fields, ${deploySettings.length} deploy identifiers, ${migrations.length} migrations, ${Object.keys(requirementMarkers).length} requirements.`);
