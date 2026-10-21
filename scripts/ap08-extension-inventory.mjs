#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const checkMode = process.argv.includes('--check');
const jsonTarget = path.join(root, 'docs/blueprint/generated/ap08-extension-inventory.json');
const markdownTarget = path.join(root, 'docs/blueprint/generated/ap08-extension-inventory.md');
const auditTarget = path.join(root, 'docs/blueprint/AP08-audit-ledger.json');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (['.git', 'dist', 'node_modules'].includes(entry.name)) return [];
        return walk(target);
      }
      return entry.isFile() ? [target] : [];
    });
}

function relative(target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function countWords(target) {
  if (!target || !fs.existsSync(target)) return 0;
  return (fs.readFileSync(target, 'utf8').match(/[A-Za-z0-9][A-Za-z0-9._/-]*/gu) ?? []).length;
}

const registrationKeys = [
  ['stage', 'stages'],
  ['observer', 'observers'],
  ['adapter', 'adapters'],
  ['test-provider', 'testProviders'],
  ['report-adapter', 'reportAdapters'],
];

const roleFiles = walk(path.join(root, 'packaging/runtime/roles'))
  .filter((target) => target.endsWith('.json'));
const roles = roleFiles.map((target) => ({ target, manifest: readJson(target) }));
const catalogueRoot = path.join(root, 'docs/site/extend/plugin-catalogue');
const cataloguePages = walk(catalogueRoot)
  .filter((target) => target.endsWith('.md') && path.basename(target) !== 'README.md');

const skillManifests = walk(path.join(root, 'skills'))
  .filter((target) => ['plugin.json', 'openclaw.plugin.json'].includes(path.basename(target)));
const codexManifests = walk(path.join(root, 'plugins'))
  .filter((target) => path.basename(target) === 'plugin.json'
    && path.basename(path.dirname(target)) === '.codex-plugin');

const manifestRecords = [
  ...skillManifests.map((manifestPath) => ({
    manifestPath,
    host: path.basename(manifestPath) === 'openclaw.plugin.json' ? 'openclaw' : 'pipeline-runtime',
  })),
  ...codexManifests.map((manifestPath) => ({ manifestPath, host: 'codex' })),
];

const rawPackages = manifestRecords.map(({ manifestPath, host }) => {
  const manifest = readJson(manifestPath);
  const packageRoot = path.dirname(manifestPath);
  const packageFile = path.join(packageRoot, 'package.json');
  const packageManifest = fs.existsSync(packageFile) ? readJson(packageFile) : null;
  const pipeline = host === 'pipeline-runtime';
  const openclaw = host === 'openclaw';
  const id = manifest.id ?? manifest.name;
  const rootPath = openclaw || pipeline ? packageRoot : path.dirname(packageRoot);
  const guideCandidates = [
    path.join(rootPath, 'README.md'),
    path.join(rootPath, 'SKILL.md'),
    ...walk(path.join(rootPath, 'skills')).filter((target) => path.basename(target) === 'SKILL.md'),
  ];
  const guide = guideCandidates.find((target) => fs.existsSync(target)) ?? null;
  const tests = walk(rootPath)
    .filter((target) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path.basename(target)));
  const registrations = pipeline
    ? registrationKeys.flatMap(([kind, key]) => (manifest[key] ?? []).map((registration) => ({
        kind,
        id: registration.id,
        publicType: registration.type ?? registration.contractId ?? registration.id,
        module: registration.module,
        export: registration.export ?? null,
        requiredCapabilities: registration.requiredCapabilities ?? [],
        providedCapabilities: registration.providesCapabilities ?? [],
      })))
    : openclaw
      ? (packageManifest?.openclaw?.extensions ?? []).map((module, index) => ({
          kind: 'openclaw-extension',
          id: index === 0 ? id : `${id}-${index + 1}`,
          module,
        }))
      : [{ kind: 'codex-plugin', id, skills: manifest.skills ?? null }];
  const includedRoles = roles
    .filter(({ manifest: role }) => (role.plugins ?? []).includes(id) || (role.extensions ?? []).includes(id))
    .map(({ manifest: role }) => role.role)
    .sort();
  const cataloguePage = path.join(catalogueRoot, `${id}.md`);
  return {
    id,
    host,
    version: manifest.packageVersion ?? manifest.version,
    root: relative(rootPath),
    manifest: relative(manifestPath),
    packageManifest: packageManifest ? relative(packageFile) : null,
    registrations,
    includedRoles,
    authoredGuide: guide ? relative(guide) : null,
    authoredGuideWords: countWords(guide),
    testScript: packageManifest?.scripts?.test ?? null,
    testFiles: tests.map(relative),
    cataloguePage: fs.existsSync(cataloguePage) ? relative(cataloguePage) : null,
    catalogueWords: countWords(cataloguePage),
  };
}).sort((left, right) => left.id.localeCompare(right.id));

const duplicateIds = rawPackages
  .map((item) => item.id)
  .filter((id, index, values) => values.indexOf(id) !== index);
if (rawPackages.some((item) => typeof item.id !== 'string' || item.id.length === 0)) {
  throw new Error('Every AP08 extension manifest must declare a non-empty id or name');
}
if (duplicateIds.length > 0) {
  throw new Error(`Duplicate AP08 extension ids: ${[...new Set(duplicateIds)].join(', ')}`);
}

const audit = readJson(auditTarget);
const allowedAuditStatuses = [
  'pending',
  'source-reviewed',
  'content-written',
  'locally-verified',
  'reader-accepted',
];
if (audit.schemaVersion !== 'ap08-extension-audit-ledger.v1') {
  throw new Error(`Unsupported AP08 audit-ledger schema: ${audit.schemaVersion}`);
}
if (JSON.stringify(audit.statusOrder) !== JSON.stringify(allowedAuditStatuses)) {
  throw new Error('AP08 audit-ledger status order does not match the generator');
}
if (!Array.isArray(audit.records)) {
  throw new Error('AP08 audit-ledger records must be an array');
}
if (!allowedAuditStatuses.includes(audit.defaultStatus)) {
  throw new Error(`Invalid AP08 default audit status: ${audit.defaultStatus}`);
}
const auditRecords = new Map();
for (const record of audit.records ?? []) {
  if (!rawPackages.some((item) => item.id === record.id)) {
    throw new Error(`AP08 audit ledger contains an unknown package: ${record.id}`);
  }
  if (auditRecords.has(record.id)) {
    throw new Error(`AP08 audit ledger contains a duplicate package: ${record.id}`);
  }
  if (!allowedAuditStatuses.includes(record.status)) {
    throw new Error(`Invalid AP08 audit status for ${record.id}: ${record.status}`);
  }
  auditRecords.set(record.id, record);
}
const packages = rawPackages.map((item) => ({
  ...item,
  auditStatus: auditRecords.get(item.id)?.status ?? audit.defaultStatus,
}));

const registrationCounts = Object.fromEntries([
  ...registrationKeys.map(([kind]) => [kind, 0]),
  ['openclaw-extension', 0],
  ['codex-plugin', 0],
]);
for (const item of packages) {
  for (const registration of item.registrations) registrationCounts[registration.kind] += 1;
}

const hostCounts = Object.fromEntries(
  ['pipeline-runtime', 'openclaw', 'codex'].map((host) => [
    host,
    packages.filter((item) => item.host === host).length,
  ]),
);
const packageIds = new Set(packages.map((item) => item.id));
const catalogueIds = cataloguePages.map((target) => path.basename(target, '.md'));
const roleReferencesWithoutManifest = roles.flatMap(({ manifest: role }) =>
  [...(role.plugins ?? []), ...(role.extensions ?? [])]
    .filter((id) => !packageIds.has(id))
    .map((id) => ({ role: role.role, id })));
const inventory = {
  schemaVersion: 'ap08-extension-inventory.v1',
  generatedBy: 'scripts/ap08-extension-inventory.mjs',
  scope: {
    installableManifests: ['skills/**/plugin.json', 'skills/**/openclaw.plugin.json', 'plugins/**/.codex-plugin/plugin.json'],
    separateAuthoringSurfaces: [
      'configuration-only changes',
      'pipeline runtime packages and registrations',
      'OpenClaw host extensions',
      'Codex plugins and skills',
      'Worker Core engines and runtime-role inclusion',
      'core changes',
    ],
    limit: 'This file inventories installable manifests. AP08 must audit non-manifest authoring surfaces separately.',
  },
  summary: {
    installablePackages: packages.length,
    hosts: hostCounts,
    registrations: registrationCounts,
    cataloguePages: cataloguePages.length,
    cataloguePagesForPackages: packages.filter((item) => item.cataloguePage).length,
    missingCataloguePages: packages.filter((item) => !item.cataloguePage).map((item) => item.id),
    orphanCataloguePages: catalogueIds.filter((id) => !packageIds.has(id)),
    roleReferencesWithoutManifest,
    packagesWithoutDetectedTestFiles: packages.filter((item) => item.testFiles.length === 0).map((item) => item.id),
    packagesWithoutPackageTestScript: packages.filter((item) => !item.testScript).map((item) => item.id),
    packagesWithoutDetectedTestEntry: packages
      .filter((item) => item.testFiles.length === 0 && !item.testScript)
      .map((item) => item.id),
    packagesWithoutDetectedGuide: packages.filter((item) => !item.authoredGuide).map((item) => item.id),
    auditStatuses: Object.fromEntries(allowedAuditStatuses.map((status) => [
      status,
      packages.filter((item) => item.auditStatus === status).length,
    ])),
  },
  roleManifests: roles.map(({ target, manifest }) => ({
    role: manifest.role,
    manifest: relative(target),
    plugins: manifest.plugins ?? [],
    extensions: manifest.extensions ?? [],
  })),
  packages,
};

const tableRows = packages.map((item) => [
  item.id,
  item.host,
  [...new Set(item.registrations.map((entry) => entry.kind))]
    .map((kind) => {
      const count = item.registrations.filter((entry) => entry.kind === kind).length;
      return count === 1 ? kind : `${kind} (${count})`;
    }).join(', ') || 'none',
  item.includedRoles.join(', ') || 'none',
  item.authoredGuide ?? 'missing',
  `${item.testFiles.length}/${item.testScript ? 'yes' : 'no'}`,
  item.cataloguePage ?? 'missing',
  item.auditStatus,
].map((value) => String(value).replaceAll('|', '\\|')).join(' | '));

const markdown = `# AP08 extension inventory

Status: generated mechanical baseline; not a content audit

Generated by \`scripts/ap08-extension-inventory.mjs\`.

## Counts

- Installable manifests: ${packages.length}
- Pipeline packages: ${hostCounts['pipeline-runtime']}
- OpenClaw packages: ${hostCounts.openclaw}
- Codex packages: ${hostCounts.codex}
- Pipeline registrations: ${registrationKeys.reduce((sum, [kind]) => sum + registrationCounts[kind], 0)}
- Catalogue pages: ${inventory.summary.cataloguePages}
- Missing catalogue pages: ${inventory.summary.missingCataloguePages.map((id) => `\`${id}\``).join(', ') || 'none'}
- Catalogue pages without a manifest: ${inventory.summary.orphanCataloguePages.map((id) => `\`${id}\``).join(', ') || 'none'}
- Runtime-role references without a manifest: ${inventory.summary.roleReferencesWithoutManifest.map((item) => `\`${item.role}:${item.id}\``).join(', ') || 'none'}
- Audit status: ${Object.entries(inventory.summary.auditStatuses).map(([status, count]) => `${status} ${count}`).join('; ')}

## Registration surfaces

| Surface | Count |
| --- | ---: |
${Object.entries(registrationCounts).map(([kind, count]) => `| ${kind} | ${count} |`).join('\n')}

## Installable packages

| ID | Host | Registration kinds | Runtime roles | Detected guide | Test files/test script | Catalogue page | Audit status |
| --- | --- | --- | --- | --- | ---: | --- | --- |
${tableRows.map((row) => `| ${row} |`).join('\n')}

## Boundary

This inventory proves file presence and declared relationships only. It does not prove content quality, activation, runtime behavior, compatibility, or live deployment. AP08 audits those claims separately.
`;

function writeOrCheck(target, content) {
  if (checkMode) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
      throw new Error(`${relative(target)} is stale; run npm run docs:ap08:inventory`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

try {
  writeOrCheck(jsonTarget, `${JSON.stringify(inventory, null, 2)}\n`);
  writeOrCheck(markdownTarget, markdown);
  console.log(`${checkMode ? 'verified' : 'generated'} AP08 extension inventory (${packages.length} manifests)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
