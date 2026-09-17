#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRelative = 'docs/blueprint/AP09-completeness-audit.md';
const targetRelative = 'docs/blueprint/generated/ap09-catalogue.json';
const sourcePath = path.join(root, sourceRelative);
const targetPath = path.join(root, targetRelative);
const checkMode = process.argv.includes('--check');

const expectedRanges = {
  GOV: 8, ENT: 5, ARC: 6, NVC: 18, WKC: 14, SPC: 10, PLG: 14,
  COM: 12, DAT: 9, TEL: 7, INF: 12, SEC: 7, OPR: 10, OPL: 5,
  CFG: 18, FLW: 17, DEV: 9, EXT: 9, CDV: 13, REF: 18, DEC: 2,
  STA: 2, PUB: 9, MNT: 17, QUA: 10,
};

const statusCodes = new Map([
  ['Vollständig vorhanden', 'V'],
  ['Muss erweitert/überarbeitet werden', 'E'],
  ['Fehlt komplett', 'F'],
]);

const packageDefinitions = {
  'AP09.1': {
    name: 'Truth, authority, and reader journeys',
    owner: 'documentation architecture',
    target: 'docs/site/README.md',
  },
  'AP09.2': {
    name: 'Nova Core and plugin runtime',
    owner: 'Nova and plugin-runtime maintainers',
    target: 'docs/site/understand/nova-core-and-plugin-runtime.md',
  },
  'AP09.3': {
    name: 'Worker Core and native execution',
    owner: 'Worker Core maintainers',
    target: 'docs/site/understand/worker-core.md',
  },
  'AP09.4': {
    name: 'Prism in depth',
    owner: 'Prism maintainers',
    target: 'docs/site/understand/prism.md',
  },
  'AP09.5': {
    name: 'Buster and twelve test suites',
    owner: 'Buster maintainers',
    target: 'docs/site/understand/buster.md',
  },
  'AP09.6': {
    name: 'Lint',
    owner: 'Lint maintainers',
    target: 'docs/site/extend/lint.md',
  },
  'AP09.7': {
    name: 'Platform, specialists, communication, data, and security',
    owner: 'platform maintainers',
    target: 'docs/site/understand/platform-and-operations.md',
  },
  'AP09.8': {
    name: 'Operator handbook and configuration',
    owner: 'platform operations',
    target: 'docs/site/use/README.md',
  },
  'AP09.9': {
    name: 'Pipeline and workflows',
    owner: 'Nova pipeline maintainers',
    target: 'docs/site/use/pipeline-workflows.md',
  },
  'AP09.10': {
    name: 'Developer handbook and complex plugins',
    owner: 'developer experience and component maintainers',
    target: 'docs/site/extend/developer-handbook.md',
  },
  'AP09.11': {
    name: 'Exhaustive reference and drift control',
    owner: 'documentation automation',
    target: 'docs/site/reference/README.md',
  },
  'AP09.12': {
    name: 'Publication and reader experience',
    owner: 'documentation publication',
    target: 'docs/site/README.md',
  },
  'AP09.13': {
    name: 'Integrated content acceptance',
    owner: 'independent documentation reviewers',
    target: 'docs/site/status/acceptance.md',
  },
};

const namespacePackages = {
  GOV: 'AP09.1', ENT: 'AP09.1', DEC: 'AP09.1', STA: 'AP09.1',
  ARC: 'AP09.2', NVC: 'AP09.2', PLG: 'AP09.2',
  WKC: 'AP09.3',
  SPC: 'AP09.7', COM: 'AP09.7', DAT: 'AP09.7', TEL: 'AP09.7',
  INF: 'AP09.7', SEC: 'AP09.7',
  OPR: 'AP09.8', OPL: 'AP09.8', CFG: 'AP09.8',
  FLW: 'AP09.9',
  DEV: 'AP09.10', EXT: 'AP09.10', CDV: 'AP09.10',
  REF: 'AP09.11', MNT: 'AP09.11',
  PUB: 'AP09.12', QUA: 'AP09.13',
};

const packageOverrides = {
  'SPC-001': 'AP09.5', 'SPC-008': 'AP09.5', 'CFG-006': 'AP09.5',
  'FLW-011': 'AP09.5', 'EXT-005': 'AP09.5', 'CDV-008': 'AP09.5',
  'CFG-016': 'AP09.6', 'EXT-006': 'AP09.6',
  'SPC-002': 'AP09.4', 'SPC-003': 'AP09.4', 'OPR-010': 'AP09.4',
  'CDV-009': 'AP09.4',
};

const targetOverrides = {
  'SPC-008': 'docs/site/understand/buster-namespace-controller.md',
  'CFG-006': 'docs/site/reference/buster-suites.md',
  'FLW-011': 'docs/site/use/workflows/buster-suite.md',
  'EXT-005': 'docs/site/extend/buster.md',
  'CDV-008': 'docs/site/extend/platform/buster.md',
  'CFG-016': 'docs/site/reference/lint-policy.md',
  'EXT-006': 'docs/site/extend/lint.md',
  'SPC-002': 'docs/site/understand/prism.md',
  'SPC-003': 'docs/site/understand/prism-data.md',
  'OPR-010': 'docs/site/use/prism-studio.md',
  'CDV-009': 'docs/site/extend/platform/prism.md',
};

function fail(message) {
  throw new Error(`AP09 catalogue: ${message}`);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const rowPattern = /^\| ([A-Z]+-\d{3}) \| ([^|]+?) \| (Vollständig vorhanden|Muss erweitert\/\u00fcberarbeitet werden|Fehlt komplett) \| ([^\n]+?) \|$/gmu;
const requirements = [];
const seen = new Set();

for (const match of source.matchAll(rowPattern)) {
  const [id, title, status, finding] = match.slice(1);
  if (seen.has(id)) fail(`duplicate ID ${id}`);
  seen.add(id);
  const namespace = id.slice(0, 3);
  const workPackage = packageOverrides[id] ?? namespacePackages[namespace];
  const definition = packageDefinitions[workPackage];
  if (!definition) fail(`no work package for ${id}`);
  const line = source.slice(0, match.index).split('\n').length;
  requirements.push({
    id,
    namespace,
    title: title.trim(),
    baselineStatus: statusCodes.get(status),
    baselineStatusLabel: status,
    finding: finding.trim(),
    workPackage,
    owner: definition.owner,
    canonicalTarget: targetOverrides[id] ?? definition.target,
    source: `${sourceRelative}#L${line}`,
  });
}

if (requirements.length !== 261) fail(`expected 261 rows, found ${requirements.length}`);

for (const [namespace, upperBound] of Object.entries(expectedRanges)) {
  for (let number = 1; number <= upperBound; number += 1) {
    const id = `${namespace}-${String(number).padStart(3, '0')}`;
    if (!seen.has(id)) fail(`missing ID ${id}`);
  }
}

const expectedTotal = Object.values(expectedRanges).reduce((sum, count) => sum + count, 0);
if (expectedTotal !== requirements.length) {
  fail(`range definition totals ${expectedTotal}, catalogue has ${requirements.length}`);
}
const expectedOrder = Object.entries(expectedRanges).flatMap(([namespace, upperBound]) =>
  Array.from({ length: upperBound }, (_, index) =>
    `${namespace}-${String(index + 1).padStart(3, '0')}`));
const actualOrder = requirements.map(({ id }) => id);
if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
  const firstMismatch = expectedOrder.findIndex((id, index) => actualOrder[index] !== id);
  fail(`rows are not in canonical order at ${actualOrder[firstMismatch]} (expected ${expectedOrder[firstMismatch]})`);
}

const counts = { V: 0, E: 0, F: 0 };
for (const requirement of requirements) counts[requirement.baselineStatus] += 1;
if (JSON.stringify(counts) !== JSON.stringify({ V: 47, E: 144, F: 70 })) {
  fail(`expected V/E/F 47/144/70, found ${counts.V}/${counts.E}/${counts.F}`);
}

for (const requirement of requirements) {
  if (!requirement.owner.trim()) fail(`${requirement.id} has no owner`);
  if (!requirement.canonicalTarget.startsWith('docs/site/')) {
    fail(`${requirement.id} target is outside docs/site`);
  }
}

const packageCounts = Object.fromEntries(Object.keys(packageDefinitions).map((id) => [id, 0]));
for (const requirement of requirements) packageCounts[requirement.workPackage] += 1;
for (const [id, count] of Object.entries(packageCounts)) {
  if (count === 0) fail(`${id} has no assigned requirements`);
}

const output = `${JSON.stringify({
  schemaVersion: 'ap09-documentation-catalogue.v1',
  source: sourceRelative,
  total: requirements.length,
  baselineCounts: counts,
  independentGate: 'open',
  packages: Object.entries(packageDefinitions).map(([id, definition]) => ({
    id,
    ...definition,
    requirementCount: packageCounts[id],
  })),
  requirements,
}, null, 2)}\n`;

if (checkMode) {
  if (!fs.existsSync(targetPath)) fail(`${targetRelative} does not exist`);
  if (fs.readFileSync(targetPath, 'utf8') !== output) fail(`${targetRelative} is stale`);
  process.stdout.write(`AP09 catalogue passed (${requirements.length} requirements; V/E/F ${counts.V}/${counts.E}/${counts.F})\n`);
} else {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, output);
  process.stdout.write(`wrote ${targetRelative} (${requirements.length} requirements)\n`);
}
