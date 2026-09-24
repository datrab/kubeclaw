#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blueprintRoot = path.join(root, 'docs', 'blueprint');
const generatedRoot = path.join(blueprintRoot, 'generated');
const checkMode = process.argv.includes('--check');

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : entry.isFile() ? [filePath] : [];
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function write(fileName, content) {
  const value = `${content.trimEnd()}\n`;
  const target = path.join(generatedRoot, fileName);
  if (checkMode) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== value) {
      throw new Error(`Documentation blueprint output is stale: ${rel(target)}`);
    }
    return;
  }
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.writeFileSync(target, value);
}

const pluginFiles = walk(path.join(root, 'skills'))
  .filter((filePath) => ['plugin.json', 'openclaw.plugin.json'].includes(path.basename(filePath)))
  .sort();

const roleFiles = walk(path.join(root, 'packaging', 'runtime', 'roles'))
  .filter((filePath) => filePath.endsWith('.json'))
  .sort();
const roles = roleFiles.map((filePath) => ({ file: rel(filePath), ...readJson(filePath) }));

const plugins = pluginFiles.map((filePath) => {
  const manifest = readJson(filePath);
  const pipeline = path.basename(filePath) === 'plugin.json';
  const registrations = [];
  for (const [kind, key] of [
    ['stage', 'stages'],
    ['observer', 'observers'],
    ['adapter', 'adapters'],
    ['test provider', 'testProviders'],
    ['report adapter', 'reportAdapters'],
  ]) {
    for (const registration of manifest[key] ?? []) {
      registrations.push({ ...registration, kind });
    }
  }
  const bundledBy = roles
    .filter((role) => role.plugins.includes(manifest.id))
    .map((role) => role.role);
  return {
    id: manifest.id,
    version: manifest.packageVersion ?? manifest.version,
    kind: pipeline ? 'pipeline-plugin' : 'openclaw-plugin',
    file: rel(filePath),
    docsTarget: `/extend/plugin-catalogue/${manifest.id}`,
    bundledBy,
    registrations,
  };
});

const capabilities = readJson(path.join(root, 'packaging', 'runtime', 'package-ownership.json'));
const capabilityVocabulary = fs.readFileSync(
  path.join(root, 'skills', 'common', 'plugin-runtime', 'foundation', 'registry', 'capability-vocabulary.ts'),
  'utf8',
);
const capabilityIds = [...capabilityVocabulary.matchAll(/^\s{2}'([^']+)': definition\(/gmu)]
  .map((match) => match[1]);
const coreOnlyCapabilityIds = [...capabilityVocabulary.matchAll(/^\s{2}'([^']+)',$/gmu)]
  .map((match) => match[1])
  .filter((id) => ['lifecycle.write', 'scheduler.advance', 'canonical_events.modify', 'registry.mutate'].includes(id));

const contracts = fs.readdirSync(path.join(root, 'contracts'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const versions = fs.readdirSync(path.join(root, 'contracts', entry.name), { withFileTypes: true })
      .filter((version) => version.isDirectory())
      .map((version) => version.name)
      .sort();
    return { id: entry.name, versions, path: `contracts/${entry.name}` };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const registrationCounts = Object.fromEntries(
  ['stage', 'observer', 'adapter', 'test provider', 'report adapter'].map((kind) => [
    kind,
    plugins.flatMap((plugin) => plugin.registrations).filter((registration) => registration.kind === kind).length,
  ]),
);

const status = git('status', '--porcelain=v1');
const conflictPaths = status.split('\n').filter((line) => /^(?:DD|AU|UD|UA|DU|AA|UU) /u.test(line)).map((line) => line.slice(3));
const baseline = {
  source: 'current source tree; release identity resolves during publication',
  conflictPaths,
};

const inventory = {
  schemaVersion: 'kubeclaw-documentation-blueprint-inventory.v1',
  baseline,
  runtimeRoles: roles.map((role) => ({
    role: role.role,
    file: role.file,
    packages: role.packages,
    plugins: role.plugins,
    extensions: role.extensions,
    externalCapabilities: role.externalCapabilities,
  })),
  platformComponents: [
    { id: 'nova-core', status: 'implemented', kind: 'orchestrator core', evidence: ['skills/nova/core', 'packaging/runtime/roles/nova.json'] },
    { id: 'worker-core', status: 'implemented', kind: 'neutral worker lifecycle and attempt execution', evidence: ['skills/worker/core', 'contracts/pipeline-worker-core/v1'] },
    { id: 'buster', status: 'implemented', kind: 'separate runtime role and Worker Core test engine', evidence: ['skills/buster/engine', 'skills/buster/runtime.ts', 'packaging/runtime/roles/buster.json', 'my-values/buster-values.yaml'] },
    { id: 'forge', status: 'implemented-agent-boundary', kind: 'dispatched implementation specialist; not a packaged Worker Core engine', evidence: ['skills/nova/plugins/implementation-agent', 'my-values/nova-values.yaml'] },
    { id: 'echo', status: 'implemented-agent-boundary-changing', kind: 'dispatched review specialist governed by the Nova review plugin; not a packaged Worker Core engine', evidence: ['skills/nova/plugins/review', 'my-values/nova-values.yaml'] },
    { id: 'prism', status: 'integration-in-progress', kind: 'standalone design engine, Studio, runtime role, and pipeline adapters; live production proof pending', evidence: ['docs/implementation/prism-production-integration-plan.md', 'packaging/runtime/roles/prism.json', 'charts/prism/Chart.yaml'] },
  ],
  plugins,
  registrationCounts,
  capabilityIds,
  coreOnlyCapabilityIds,
  contracts,
  packageOwnership: capabilities,
};
write('platform-inventory.json', JSON.stringify(inventory, null, 2));

const inventoryLines = [
  '# Verified platform inventory',
  '',
  '> Generated by `scripts/docs-blueprint-generate.mjs`. Do not edit by hand.',
  '',
  'Verification baseline: current source tree. Publication resolves the release commit.',
  `Unresolved conflicts: ${conflictPaths.length ? conflictPaths.map((item) => `\`${item}\``).join(', ') : 'none'}.`,
  '',
  '## Runtime and specialist boundaries',
  '',
  '| Component | Verified status | Actual boundary | Evidence |',
  '| --- | --- | --- | --- |',
  ...inventory.platformComponents.map((component) => `| ${component.id} | ${component.status} | ${component.kind} | ${component.evidence.map((item) => `\`${item}\``).join('<br>')} |`),
  '',
  '## Runtime roles',
  '',
  '| Role | Packages | Plugins | External capabilities |',
  '| --- | ---: | ---: | --- |',
  ...roles.map((role) => `| ${role.role} | ${role.packages.length} | ${role.plugins.length} | ${(role.externalCapabilities ?? []).map((item) => item.id).join(', ') || 'none'} |`),
  '',
  '## Contracts',
  '',
  '| Contract family | Versions | Source |',
  '| --- | --- | --- |',
  ...contracts.map((contract) => `| ${contract.id} | ${contract.versions.join(', ')} | \`${contract.path}\` |`),
  '',
  '## Extension surfaces',
  '',
  '| Surface | Registrations found | Canonical contract |',
  '| --- | ---: | --- |',
  ...Object.entries(registrationCounts).map(([kind, count]) => `| ${kind} | ${count} | \`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json\` |`),
  '',
  `Capability vocabulary: ${capabilityIds.length} grantable capabilities and ${coreOnlyCapabilityIds.length} core-only capabilities.`,
  '',
  '## Plugin packages',
  '',
  '| Plugin | Version | Bundle | Registrations | Required/provided capabilities | Manifest |',
  '| --- | --- | --- | --- | --- | --- |',
  ...plugins.map((plugin) => {
    const registrations = plugin.registrations.map((registration) => `${registration.kind}: ${registration.id}${registration.type ? ` (${registration.type})` : ''}`).join('<br>');
    const required = [...new Set(plugin.registrations.flatMap((registration) => registration.requiredCapabilities ?? []))];
    const provided = [...new Set(plugin.registrations.flatMap((registration) => registration.providesCapabilities ?? []))];
    const capabilityText = [`requires: ${required.join(', ') || 'none'}`, `provides: ${provided.join(', ') || 'none'}`].join('<br>');
    return `| ${plugin.id} | ${plugin.version} | ${plugin.bundledBy.join(', ') || 'not role-bundled'} | ${registrations || 'none'} | ${capabilityText} | \`${plugin.file}\` |`;
  }),
  '',
  '## Completeness boundary',
  '',
  'This inventory proves what exists in current manifests, role packaging, contracts, and source boundaries. It does not promote planned behavior to implemented behavior. Files with unresolved merge conflicts must be reverified before publication.',
];
write('platform-inventory.md', inventoryLines.join('\n'));

const oldDocFiles = walk(path.join(root, 'docs'))
  .map(rel)
  .filter((filePath) => !filePath.startsWith('docs/blueprint/') && !filePath.startsWith('docs/site/'))
  .sort();

function originalDocumentationPath(filePath) {
  const prefix = 'docs/_legacy-source/';
  return filePath.startsWith(prefix) ? `docs/${filePath.slice(prefix.length)}` : filePath;
}

function migration(filePath) {
  const name = path.basename(filePath);
  if (filePath === 'docs/operator-tasks.json') return ['internal-machine-authority', 'documentation build pipeline', 'Keep the operator-task registry outside the published reader site; publish only the validated task procedures and reference views.'];
  if (filePath.startsWith('docs/diagrams/') && filePath.endsWith('.svg')) return ['replace-then-delete', '/architecture/interactive', 'Extract topology, labels, flows, and accessibility text; implement as responsive HTML.'];
  if (filePath.startsWith('docs/generated/inventory/')) return ['regenerate-internal', '/reference/generated', 'Keep source data in build output; publish rendered reference pages, not raw internal inventory navigation.'];
  if (filePath.startsWith('docs/generated/reference/')) return ['internal-only', 'documentation build pipeline', 'Retain generator documentation outside the published site.'];
  if (filePath.startsWith('docs/config/')) return ['internal-machine-authority', 'documentation build pipeline', 'Keep documentation mapping and generator configuration outside the published reader site.'];
  if (filePath.startsWith('docs/status/')) return ['internal-machine-authority', '/status', 'Keep machine-readable status authority outside the reader site; publish only its generated reader view.'];
  if (filePath.startsWith('docs/review/')) return ['delete-after-reader-coverage', 'Git history', 'Remove this internal review artifact after the canonical site contains every current fact and durable decision.'];
  if (filePath.includes('/templates/')) return ['internal-only', 'documentation contributor tooling', 'Retain only if used by the new documentation pipeline; do not publish as product documentation.'];
  if (filePath.startsWith('docs/examples/')) return ['keep-and-verify', '/extend/examples', 'Execute or schema-check the example and link it from the relevant task page.'];
  if (filePath.startsWith('docs/decisions/')) return ['extract-decisions-then-delete', '/decisions', 'Promote durable current decisions with implementation evidence; remove migration-specific ledger bookkeeping.'];
  if (filePath.startsWith('docs/implementation/')) return ['extract-then-delete', '/architecture, /use, /extend, /decisions', 'Extract verified current facts and durable decisions; keep implementation history outside published product documentation.'];
  if (filePath.startsWith('docs/spikes/')) return ['move-out-of-product-docs', 'engineering research records', 'Retain verified research outside product documentation; publish only current boundaries and accepted decisions.'];
  if (filePath === 'docs/DOCUMENTATION_TOPIC_MAP.md') return ['delete-after-replacement', 'docs/blueprint/02-three-track-site-map.md', 'Replace the stale internal map with the approved three-track site map and generated coverage data.'];
  if (filePath === 'docs/ROADMAP.md') return ['move-out-of-product-docs', 'project planning or website roadmap', 'Keep future work separate from current platform guarantees.'];
  if (filePath === 'docs/CONTRIBUTING.md') return ['rewrite-and-keep', '/extend/contributing/documentation', 'Keep public contribution guidance; remove internal migration workflow.'];
  if (filePath === 'docs/README.md') return ['rewrite-and-keep', '/', 'Replace with the three independent reader entrances and global search.'];
  if (filePath.startsWith('docs/reference/')) return ['replace-with-generated-reference', `/reference/${name.replace(/\.md$/u, '')}`, 'Generate factual tables from code and add only concise human context.'];
  if (filePath.startsWith('docs/operators/')) return ['rewrite-and-keep', `/use/${name === 'README.md' ? '' : name.replace(/\.md$/u, '')}`, 'Rewrite as a self-contained operator task or concept; link to architecture only for optional depth.'];
  if (filePath.startsWith('docs/ops/') || filePath.startsWith('docs/operations/')) return ['rewrite-and-keep', `/use/operations/${name.replace(/\.md$/u, '')}`, 'Rewrite as a self-contained operator task and verify each command.'];
  if (filePath.startsWith('docs/runbooks/')) return ['rewrite-and-keep', `/use/runbooks/${name.replace(/\.md$/u, '')}`, 'Keep recovery procedures in the operator track and verify each recovery path.'];
  if (filePath.startsWith('docs/security/')) return ['split-rewrite-then-delete', '/architecture/security and /decisions', 'Separate current security controls from durable decisions and implementation history.'];
  if (filePath.startsWith('docs/user-guides/')) return ['rewrite-and-keep', `/use/${name.replace(/\.md$/u, '')}`, 'Rewrite as a self-contained user task and verify each normal journey.'];
  if (filePath.startsWith('docs/deployment/')) return ['merge-into-operator-track', `/use/deploy/${name === 'README.md' ? '' : name.replace(/\.md$/u, '')}`, 'Merge deployment procedures into the operator track and verify every command.'];
  if (filePath.startsWith('docs/developers/')) return ['rewrite-and-keep', `/extend/${name === 'README.md' ? '' : name.replace(/\.md$/u, '')}`, 'Rewrite as a self-contained extension task or reference page backed by SDK contracts and runnable examples.'];
  if (filePath === 'docs/pipeline/architecture.md') return ['merge-then-delete', '/architecture/runtime-flow', 'Extract the current runtime flow into the canonical architecture track.'];
  if (filePath.startsWith('docs/architecture/')) {
    if (/decision-ledger|\.json$/u.test(filePath)) return ['extract-decisions-then-delete', '/decisions', 'Promote durable decisions with current code evidence; discard phase bookkeeping.'];
    if (/phase|audit|implementation-plan|roadmap|baseline|unit-baseline|closeout|changelog/u.test(name)) return ['extract-then-delete', '/architecture, /use, /extend, /decisions', 'Extract verified current facts and durable reasoning; delete phase history and implementation bookkeeping after coverage is proven.'];
    if (/vision|design|architecture|contract|security|lifecycle|routing|packaging/u.test(name)) return ['split-rewrite-then-delete', '/architecture and /decisions', 'Separate current behavior from decisions and proposals; rewrite canonical pages, then remove the mixed source document.'];
    return ['review-extract-then-delete', '/architecture or /decisions', 'Classify each claim as current, decision, proposal, or obsolete before removal.'];
  }
  return ['review', 'not yet assigned', 'Classify before deletion; no file may disappear without an extraction decision.'];
}

const ledgerRows = oldDocFiles.map((filePath) => {
  const [disposition, destination, extraction] = migration(originalDocumentationPath(filePath));
  return { source: filePath, disposition, destination, extraction, proof: 'pending rewrite; source path existence verified' };
});
const ledgerHeader = ['source', 'disposition', 'destination', 'required extraction', 'completion proof'];
write('migration-ledger.csv', [ledgerHeader, ...ledgerRows.map((row) => [row.source, row.disposition, row.destination, row.extraction, row.proof])]
  .map((row) => row.map(csvCell).join(','))
  .join('\n'));

const dispositionCounts = Object.fromEntries([...new Set(ledgerRows.map((row) => row.disposition))].sort().map((value) => [value, ledgerRows.filter((row) => row.disposition === value).length]));
write('migration-ledger-summary.md', [
  '# Old-document migration and deletion ledger',
  '',
  '> Generated by `scripts/docs-blueprint-generate.mjs`. The exhaustive row-level ledger is `migration-ledger.csv`.',
  '',
  `Files classified: ${ledgerRows.length}. Unclassified files: ${ledgerRows.filter((row) => row.disposition === 'review').length}.`,
  '',
  '| Disposition | Count |',
  '| --- | ---: |',
  ...Object.entries(dispositionCounts).map(([key, value]) => `| ${key} | ${value} |`),
  '',
  'Deletion is gated: a row can be deleted only after its destination exists, extracted facts have code evidence, durable reasoning has an accepted or proposed decision record, links are migrated, and the completion-proof field is updated from `pending`.',
].join('\n'));

const requiredBlueprintFiles = [
  'docs/blueprint/01-platform-inventory.md',
  'docs/blueprint/02-three-track-site-map.md',
  'docs/blueprint/03-migration-and-deletion.md',
  'docs/blueprint/04-evidence-matrix.md',
  'docs/blueprint/05-decision-record-catalogue.md',
  'docs/blueprint/06-automation-and-publication.md',
];
const missingBlueprintFiles = requiredBlueprintFiles.filter((filePath) => !fs.existsSync(path.join(root, filePath)));
const evidenceText = fs.existsSync(path.join(blueprintRoot, '04-evidence-matrix.md')) ? fs.readFileSync(path.join(blueprintRoot, '04-evidence-matrix.md'), 'utf8') : '';
const missingContractEvidence = contracts.filter((contract) => !evidenceText.includes(`\`${contract.path}`)).map((contract) => contract.id);
const missingPluginTargets = plugins.filter((plugin) => !plugin.docsTarget);
const missingEvidencePaths = [...evidenceText.matchAll(/`([^`]+)`/gu)]
  .map((match) => match[1])
  .filter((value) => /^(?:skills|contracts|packaging|scripts|tests|charts|my-values|docker|docs)\//u.test(value))
  .filter((value) => !value.includes('*') && !fs.existsSync(path.join(root, value)));
const completeness = {
  requiredBlueprintFiles: { expected: requiredBlueprintFiles.length, missing: missingBlueprintFiles },
  oldDocumentLedger: { expected: oldDocFiles.length, rows: ledgerRows.length, unclassified: ledgerRows.filter((row) => row.disposition === 'review').map((row) => row.source) },
  plugins: { manifests: plugins.length, inventoried: plugins.length, missingTargets: missingPluginTargets.map((plugin) => plugin.file) },
  registrations: registrationCounts,
  contracts: { families: contracts.length, missingEvidenceRows: missingContractEvidence },
  evidencePaths: { missing: [...new Set(missingEvidencePaths)].sort() },
  conflictsRequiringPublicationReverification: conflictPaths,
};
write('completeness.json', JSON.stringify(completeness, null, 2));
write('completeness-report.md', [
  '# Blueprint completeness report',
  '',
  '> Generated by `scripts/docs-blueprint-generate.mjs`.',
  '',
  `- Required blueprint artifacts: ${requiredBlueprintFiles.length - missingBlueprintFiles.length}/${requiredBlueprintFiles.length}.`,
  `- Existing documentation files classified: ${ledgerRows.length}/${oldDocFiles.length}.`,
  `- Unclassified documentation files: ${ledgerRows.filter((row) => row.disposition === 'review').length}.`,
  `- Plugin manifests inventoried: ${plugins.length}/${pluginFiles.length}.`,
  `- Extension registrations inventoried: ${Object.values(registrationCounts).reduce((sum, count) => sum + count, 0)}.`,
  `- Contract families linked in the evidence matrix: ${contracts.length - missingContractEvidence.length}/${contracts.length}.`,
  `- Missing local evidence paths: ${new Set(missingEvidencePaths).size}.`,
  `- Unresolved source conflicts requiring pre-publication reverification: ${conflictPaths.length}.`,
  '',
  missingBlueprintFiles.length ? `Missing artifacts: ${missingBlueprintFiles.map((item) => `\`${item}\``).join(', ')}` : 'All six required artifacts exist.',
  missingContractEvidence.length ? `Missing contract evidence: ${missingContractEvidence.join(', ')}` : 'Every contract family has an evidence-matrix row.',
  missingEvidencePaths.length ? `Missing evidence paths: ${[...new Set(missingEvidencePaths)].map((item) => `\`${item}\``).join(', ')}` : 'Every concrete local evidence path exists.',
].join('\n'));

if (missingBlueprintFiles.length || ledgerRows.some((row) => row.disposition === 'review') || missingPluginTargets.length || missingContractEvidence.length || missingEvidencePaths.length) {
  process.exitCode = 1;
}
