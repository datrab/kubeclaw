#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRelative = 'docs/blueprint/AP09-completeness-audit.md';
const targetRelative = 'docs/blueprint/generated/ap09-catalogue.json';
const planRelative = 'docs/blueprint/AP09-execution-plan.md';
const sourcePath = path.join(root, sourceRelative);
const targetPath = path.join(root, targetRelative);
const planPath = path.join(root, planRelative);
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
    target: 'docs/README.md',
  },
  'AP09.2': {
    name: 'Nova Core and plugin runtime',
    owner: 'Nova and plugin-runtime maintainers',
    target: 'docs/understand/nova-core.md',
  },
  'AP09.3': {
    name: 'Worker Core and native execution',
    owner: 'Worker Core maintainers',
    target: 'docs/understand/worker-core.md',
  },
  'AP09.4': {
    name: 'Prism in depth',
    owner: 'Prism maintainers',
    target: 'docs/understand/prism.md',
  },
  'AP09.5': {
    name: 'Buster and twelve test suites',
    owner: 'Buster maintainers',
    target: 'docs/understand/buster.md',
  },
  'AP09.6': {
    name: 'Lint',
    owner: 'Lint maintainers',
    target: 'docs/extend/lint.md',
  },
  'AP09.7': {
    name: 'Platform, specialists, communication, data, and security',
    owner: 'platform maintainers',
    target: 'docs/understand/platform-and-operations.md',
  },
  'AP09.8': {
    name: 'Operator handbook and configuration',
    owner: 'platform operations',
    target: 'docs/use/README.md',
  },
  'AP09.9': {
    name: 'Pipeline and workflows',
    owner: 'Nova pipeline maintainers',
    target: 'docs/use/pipeline-workflows.md',
  },
  'AP09.10': {
    name: 'Developer handbook and complex plugins',
    owner: 'developer experience and component maintainers',
    target: 'docs/extend/developer-handbook.md',
  },
  'AP09.11': {
    name: 'Exhaustive reference and drift control',
    owner: 'documentation automation',
    target: 'docs/reference/README.md',
  },
  'AP09.12': {
    name: 'Publication and reader experience',
    owner: 'documentation publication',
    target: 'docs/README.md',
  },
  'AP09.13': {
    name: 'Integrated content acceptance',
    owner: 'independent documentation reviewers',
    target: 'docs/status/acceptance.md',
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

const namespaceDefinitions = {
  GOV: { owner: 'documentation architecture', target: 'docs/README.md' },
  ENT: { owner: 'product documentation', target: 'docs/understand/README.md' },
  ARC: { owner: 'architecture maintainers', target: 'docs/understand/components-and-authority.md' },
  NVC: { owner: 'Nova maintainers', target: 'docs/understand/nova-core.md' },
  WKC: { owner: 'Worker Core maintainers', target: 'docs/understand/worker-core.md' },
  SPC: { owner: 'component maintainers', target: 'docs/understand/specialists.md' },
  PLG: { owner: 'plugin-runtime maintainers', target: 'docs/understand/plugin-runtime.md' },
  COM: { owner: 'runtime and platform maintainers', target: 'docs/understand/communication.md' },
  DAT: { owner: 'state-owning component maintainers', target: 'docs/understand/data-and-state.md' },
  TEL: { owner: 'observability maintainers', target: 'docs/understand/telemetry.md' },
  INF: { owner: 'platform maintainers', target: 'docs/understand/platform-and-operations.md' },
  SEC: { owner: 'security maintainers', target: 'docs/understand/security-and-trust.md' },
  OPR: { owner: 'platform operations', target: 'docs/use/README.md' },
  OPL: { owner: 'plugin and platform operations', target: 'docs/use/plugins.md' },
  CFG: { owner: 'configuration owners', target: 'docs/reference/configuration.md' },
  FLW: { owner: 'product integration maintainers', target: 'docs/use/workflows/README.md' },
  DEV: { owner: 'developer experience maintainers', target: 'docs/extend/developer-handbook.md' },
  EXT: { owner: 'plugin-runtime maintainers', target: 'docs/extend/README.md' },
  CDV: { owner: 'component maintainers', target: 'docs/extend/platform/README.md' },
  REF: { owner: 'documentation automation', target: 'docs/reference/README.md' },
  DEC: { owner: 'architecture maintainers', target: 'docs/decisions/README.md' },
  STA: { owner: 'release and documentation maintainers', target: 'docs/status/current.md' },
  PUB: { owner: 'documentation publication', target: 'docs/reference/documentation-site.md' },
  MNT: { owner: 'documentation automation', target: 'docs/extend/documentation-maintenance.md' },
  QUA: { owner: 'independent documentation reviewers', target: 'docs/status/acceptance.md' },
};

const packageOverrides = {
  'GOV-005': 'AP09.11', 'GOV-007': 'AP09.12', 'ENT-005': 'AP09.9',
  'SPC-001': 'AP09.5', 'SPC-008': 'AP09.5', 'CFG-006': 'AP09.5',
  'FLW-011': 'AP09.5', 'EXT-005': 'AP09.5', 'CDV-008': 'AP09.5',
  'CFG-016': 'AP09.6', 'EXT-006': 'AP09.6',
  'SPC-002': 'AP09.4', 'SPC-003': 'AP09.4', 'OPR-010': 'AP09.4',
  'CDV-009': 'AP09.4',
};

const ownerOverrides = {
  'SPC-001': 'Buster maintainers', 'SPC-008': 'Buster maintainers',
  'CFG-006': 'Buster maintainers', 'FLW-011': 'Buster maintainers',
  'EXT-005': 'Buster maintainers', 'CDV-008': 'Buster maintainers',
  'CFG-016': 'Lint maintainers', 'EXT-006': 'Nova and Lint maintainers',
  'SPC-002': 'Prism maintainers', 'SPC-003': 'Prism maintainers',
  'OPR-010': 'Prism maintainers', 'CDV-009': 'Prism maintainers',
  'SPC-004': 'Forge maintainers', 'SPC-005': 'Echo maintainers',
  'SPC-006': 'OpenClaw integration maintainers',
  'SPC-007': 'Codex integration maintainers', 'SPC-009': 'Ops MCP maintainers',
  'SPC-010': 'Archviewer maintainers',
};

const targetOverrides = {
  'GOV-002': 'docs/product-surfaces.md',
  'GOV-003': 'docs/reference/documentation-governance.md',
  'GOV-005': 'docs/reference/documentation-governance.md',
  'GOV-006': 'docs/reference/documentation-governance.md',
  'GOV-007': 'docs/reference/documentation-governance.md',
  'NVC-001': 'docs/understand/components-and-authority.md',
  'WKC-001': 'docs/understand/components-and-authority.md',
  'PLG-001': 'docs/extend/contracts.md',
  'PLG-004': 'docs/extend/contracts.md',
  'PLG-012': 'docs/extend/testing.md',
  'PLG-014': 'docs/extend/README.md',
  'TEL-005': 'docs/extend/contracts.md',
  'TEL-006': 'docs/understand/deployment-and-trust.md',
  'SPC-001': 'docs/understand/buster.md',
  'SPC-002': 'docs/understand/prism.md',
  'SPC-003': 'docs/understand/prism-data.md',
  'SPC-004': 'docs/understand/forge.md',
  'SPC-005': 'docs/understand/echo.md',
  'SPC-006': 'docs/understand/openclaw.md',
  'SPC-007': 'docs/understand/codex-integration.md',
  'SPC-008': 'docs/understand/buster-namespace-controller.md',
  'SPC-009': 'docs/understand/ops-mcp.md',
  'SPC-010': 'docs/understand/archviewer.md',
  'OPR-003': 'docs/use/install.md',
  'OPR-004': 'docs/use/operate.md',
  'OPR-005': 'docs/use/operate.md',
  'OPR-006': 'docs/use/diagnose.md',
  'OPR-007': 'docs/use/recovery.md',
  'OPR-008': 'docs/use/maintenance.md',
  'OPR-009': 'docs/use/capacity.md',
  'OPR-010': 'docs/use/prism-studio.md',
  'CFG-001': 'docs/reference/README.md',
  'CFG-002': 'docs/reference/pipeline-platform.md',
  'CFG-003': 'docs/reference/nova-project.md',
  'CFG-004': 'docs/reference/pipeline-definition.md',
  'CFG-005': 'docs/reference/pipeline-json.md',
  'CFG-006': 'docs/reference/buster-suites.md',
  'CFG-007': 'docs/reference/plugin-configuration.md',
  'CFG-008': 'docs/reference/worker-profiles-and-roles.md',
  'CFG-009': 'docs/reference/helm-values.md',
  'CFG-010': 'docs/reference/host-and-prism-configuration.md',
  'CFG-011': 'docs/reference/environment-variables.md',
  'CFG-012': 'docs/reference/endpoints.md',
  'CFG-013': 'docs/reference/configuration-precedence.md',
  'CFG-014': 'docs/reference/configuration-change-impact.md',
  'CFG-015': 'docs/reference/configuration-errors.md',
  'FLW-011': 'docs/use/workflows/buster-suite.md',
  'EXT-005': 'docs/extend/buster.md',
  'CDV-008': 'docs/extend/platform/buster.md',
  'CFG-016': 'docs/reference/lint-policy.md',
  'CFG-017': 'docs/reference/project-pipeline-publication.md',
  'CFG-018': 'docs/reference/configuration-compatibility.md',
  'EXT-006': 'docs/extend/nova.md',
  'MNT-002': 'docs/extend/plugin-catalogue/README.md',
  'MNT-007': 'docs/extend/plugin-catalogue/README.md',
  'MNT-012': 'docs/extend/plugin-catalogue/README.md',
  'MNT-013': 'docs/reference/verification-commands.md',
  'MNT-016': 'docs/extend/plugin-catalogue/README.md',
  'CDV-009': 'docs/extend/platform/prism.md',
  'REF-002': 'docs/reference/cli.md',
  'REF-003': 'docs/reference/configuration.md',
  'REF-004': 'docs/reference/schemas.md',
  'REF-005': 'docs/reference/errors.md',
  'REF-006': 'docs/reference/events.md',
  'REF-007': 'docs/reference/capabilities.md',
  'REF-008': 'docs/extend/plugin-catalogue/README.md',
  'REF-009': 'docs/reference/roles-and-package-ownership.md',
  'REF-010': 'docs/reference/contracts.md',
  'REF-011': 'docs/reference/endpoints.md',
  'REF-012': 'docs/reference/secrets.md',
  'REF-013': 'docs/reference/helm-values.md',
  'REF-014': 'docs/reference/stores-and-retention.md',
  'REF-015': 'docs/reference/images-and-digests.md',
  'REF-016': 'docs/reference/verification-commands.md',
  'REF-017': 'docs/reference/glossary.md',
  'REF-018': 'docs/reference/sdk.md',
};

function fail(message) {
  throw new Error(`AP09 catalogue: ${message}`);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const plan = fs.readFileSync(planPath, 'utf8');
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
  const namespaceDefinition = namespaceDefinitions[namespace];
  if (!definition) fail(`no work package for ${id}`);
  if (!namespaceDefinition) fail(`no namespace definition for ${id}`);
  const line = source.slice(0, match.index).split('\n').length;
  const canonicalTarget = targetOverrides[id] ?? namespaceDefinition.target;
  requirements.push({
    id,
    namespace,
    title: title.trim(),
    baselineStatus: statusCodes.get(status),
    baselineStatusLabel: status,
    finding: finding.trim(),
    workPackage,
    owner: ownerOverrides[id] ?? namespaceDefinition.owner,
    canonicalTarget,
    targetState: fs.existsSync(path.join(root, canonicalTarget)) ? 'current' : 'planned',
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
if (!source.includes('Davon sind 47 Punkte vollständig vorhanden,\n144 zu erweitern und 70 fehlen komplett.')) {
  fail('human-readable audit summary does not state V/E/F 47/144/70');
}

for (const packageId of Object.keys(packageDefinitions)) {
  if (!plan.includes(`### ${packageId} —`)) fail(`${planRelative} has no heading for ${packageId}`);
}

for (const requirement of requirements) {
  if (!requirement.owner.trim()) fail(`${requirement.id} has no owner`);
  if (!requirement.canonicalTarget.startsWith('docs/')) {
    fail(`${requirement.id} target is outside docs/site`);
  }
  if (!requirement.canonicalTarget.endsWith('.md')) {
    fail(`${requirement.id} target is not a Markdown page`);
  }
  if (requirement.baselineStatus === 'V' && requirement.targetState !== 'current') {
    fail(`${requirement.id} is complete but its canonical target does not exist`);
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
