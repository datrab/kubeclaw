#!/usr/bin/env node

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { buildSourceSurfaceMap, assertSourceSurfaceMap, renderAuthorityMatrixSummary, generatedPageFreshnessChecks } from './lib/docs-source-surface-map.mjs';
import { assertRouteContinuity } from './lib/docs-route-continuity.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'docs', 'site');
const target = path.join(siteRoot, 'reference', 'generated-documentation-map.json');
const routeRegistryPath = path.join(siteRoot, 'reference', 'documentation-route-registry.json');
const check = process.argv.includes('--check');
const metadataFields = ['Status', 'Audience', 'Owner', 'Evidence', 'Applies to', 'Last verified'];
const configurationPages = new Set(JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/generated/ap09-catalogue.json'), 'utf8'))
  .requirements.filter((record) => record.id.startsWith('CFG-')).map((record) => record.canonicalTarget));
const operatorPages = new Set(JSON.parse(fs.readFileSync(path.join(root, 'docs/operator-tasks.json'), 'utf8'))
  .tasks.map((task) => task.canonical.split('#')[0]));
const generatedReferencePages = new Set(['cli', 'secrets', 'helm-values', 'environment-variables', 'plugin-configuration', 'endpoints', 'verification-commands', 'workflows', 'sdk-exports']
  .map((name) => `docs/site/reference/${name}.md`));
generatedReferencePages.add('docs/site/reference/configuration.md');
const markedRegionOwners = new Map([
  ['docs/site/product-surfaces.md', 'scripts/docs-governance.mjs'],
  ['docs/site/reference/schemas.md', 'scripts/docs-schema-fields.mjs'],
  ['docs/site/reference/events.md', 'scripts/docs-event-contracts.mjs'],
]);
const platformInventoryPage = 'docs/site/reference/platform-surfaces-generated.md';
const platformInventoryGenerator = 'scripts/docs-platform-surface-inventory.mjs';
const promptContractPage = 'docs/site/extend/contracts.md';
const promptContractDirectory = 'skills/common/plugins/prompt-contract';
const promptContractSource = `${promptContractDirectory}/src/index.ts`;
const promptContractChecks = ['npm run build --workspace @kubeclaw/prompt-contract', 'npm test --workspace @kubeclaw/prompt-contract'];
const prismGuidePages = new Set(['docs/site/understand/prism.md', 'docs/site/understand/prism-runtime.md', 'docs/site/understand/prism-data.md',
  'docs/site/use/prism-studio.md', 'docs/site/extend/platform/prism.md']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : entry.isFile() ? [item] : [];
  });
}

function relative(item) {
  return path.relative(root, item).split(path.sep).join('/');
}

function metadata(text, field) {
  return text.match(new RegExp(`^${field}: (.+)$`, 'mu'))?.[1] ?? null;
}

function publicRoute(item) {
  const siteRelative = path.relative(siteRoot, item).split(path.sep).join('/');
  if (siteRelative === 'README.md') return '/';
  if (siteRelative.endsWith('/README.md')) return `/${siteRelative.slice(0, -'README.md'.length)}`;
  return `/${siteRelative.slice(0, -'.md'.length)}/`;
}

function checksFor(page, text) {
  const checks = ['npm run docs:governance:check', 'npm run docs:publication:check', 'npm run docs:check:refs'];
  if (page.startsWith('docs/site/extend/deep-guides/')) checks.unshift('npm run docs:plugin-complexity:check');
  if (page === 'docs/site/status/open-issues.md') checks.unshift('npm run docs:status:check');
  if (page === promptContractPage) checks.unshift(...promptContractChecks);
  checks.unshift(...generatedPageFreshnessChecks(page, configurationPages, generatedReferencePages,
    text.match(/^Source snapshot: `([0-9a-f]{40})`$/mu)?.[1]));
  if (/^docs\/site\/reference\/common-errors(?:-[a-z]+)?\.md$/u.test(page)) checks.unshift('npm run docs:errors:check');
  if (page === 'docs/site/reference/schemas.md') checks.unshift('node scripts/docs-schema-fields.mjs --check --reference');
  if (page === 'docs/site/reference/events.md') checks.unshift('npm run docs:events:check');
  if (page === platformInventoryPage) {
    checks.unshift('npm run docs:ap09:platform-inventory:check', 'npm run docs:ap09:platform-drift:mutations');
  }
  if (operatorPages.has(page)) checks.unshift('npm run docs:operator-tasks:check');
  if (prismGuidePages.has(page)) checks.unshift('npm run docs:prism-guides:check');
  if (page === 'docs/site/reference/helm-values.md') checks.unshift('npm run docs:inventory:local-helm:check');
  if (page === 'docs/site/reference/lint-policy-generated.md') checks.unshift('npm run docs:lint-policy:check');
  if (['docs/site/reference/sdk.md', 'docs/site/reference/sdk-exports.md'].includes(page)) {
    checks.unshift('npm run docs:sdk:check');
  }
  if (page.includes('/buster') || page === 'docs/site/extend/platform/buster.md') {
    checks.unshift('npm run docs:buster-guides:check');
  }
  if (page === 'docs/site/reference/capabilities.md' || page.startsWith('docs/site/extend/plugin-catalogue/')) {
    checks.unshift('npm run docs:publication:check');
  }
  return [...new Set(checks)];
}

function contentKind(page, text) {
  if (markedRegionOwners.has(page)) return 'authored-with-generated-region';
  if (page === 'docs/site/extend/deep-guides/README.md') return 'generated';
  if (page === platformInventoryPage || metadata(text, 'Generator') || generatedReferencePages.has(page)) return 'generated';
  if (page === 'docs/site/status/open-issues.md'
    || page === 'docs/site/reference/capabilities.md'
    || [
      'docs/site/reference/cli.md',
      'docs/site/reference/environment-variables.md',
      'docs/site/reference/helm-values.md',
      'docs/site/reference/secrets.md',
      'docs/site/reference/verification-commands.md',
      'docs/site/reference/workflows.md',
      'docs/site/reference/buster-error-codes.md',
      'docs/site/reference/buster-provider-configuration.md',
      'docs/site/reference/lint-policy-generated.md',
    ].includes(page)
    || page.startsWith('docs/site/extend/plugin-catalogue/')) return 'generated';
  return 'authored';
}

const pages = walk(siteRoot)
  .filter((item) => item.endsWith('.md'))
  .sort()
  .map((item) => {
    const text = fs.readFileSync(item, 'utf8');
    const page = relative(item);
    const values = Object.fromEntries(metadataFields.map((field) => [field, metadata(text, field)]));
    const missing = metadataFields.filter((field) => values[field] === null);
    if (missing.length) throw new Error(`${page} lacks metadata: ${missing.join(', ')}`);
    const evidence = values.Evidence.split(';').map((value) => value.trim());
    const generator = metadata(text, 'Generator')
      ?? markedRegionOwners.get(page)
      ?? (page === platformInventoryPage ? platformInventoryGenerator
        : page === 'docs/site/extend/deep-guides/README.md' ? 'scripts/docs-plugin-complexity.mjs'
        : generatedReferencePages.has(page) ? 'scripts/docs-generate.mjs' : null);
    return {
      page,
      route: publicRoute(item),
      contentKind: contentKind(page, text),
      status: values.Status,
      audience: values.Audience,
      owner: values.Owner,
      appliesTo: values['Applies to'],
      lastVerified: values['Last verified'],
      sourceDependencies: [...new Set(generator ? [generator, ...evidence] : evidence)],
      checks: checksFor(page, text),
    };
  });

// Existing dependency-only workspace export: require a retrievable source,
// canonical owner and real package-check route, not a fabricated registration.
const promptContract = pages.find(page => page.page === promptContractPage);
const promptPackage = JSON.parse(fs.readFileSync(path.join(root, 'skills/common/plugins/prompt-contract/package.json'), 'utf8'));
if (!promptContract || promptContract.owner !== 'plugin-foundation'
  || !promptContract.sourceDependencies.includes(promptContractDirectory)
  || !fs.existsSync(path.join(root, promptContractSource)) || !fs.statSync(path.join(root, promptContractSource)).isFile()
  || !promptContractChecks.every(command => promptContract.checks.includes(command))
  || promptPackage.name !== '@kubeclaw/prompt-contract' || promptPackage.exports?.['.'] !== './src/index.ts'
  || !['build', 'test'].every(script => typeof promptPackage.scripts?.[script] === 'string' && promptPackage.scripts[script].trim())) {
  throw new Error('Prompt-contract source/owner/package-check route is incomplete; review the existing contracts guide and actual package scripts.');
}

const routeRegistry = JSON.parse(fs.readFileSync(routeRegistryPath, 'utf8'));
const activeRoutes = new Set(pages.map((page) => page.route));
const redirectSources = new Set();
for (const redirect of routeRegistry.redirects ?? []) {
  if (typeof redirect.from !== 'string' || typeof redirect.to !== 'string' || typeof redirect.reason !== 'string') {
    throw new Error('Each route redirect needs from, to, and reason strings.');
  }
  if (redirectSources.has(redirect.from)) throw new Error(`Duplicate redirect source: ${redirect.from}`);
  if (activeRoutes.has(redirect.from)) throw new Error(`Redirect source is still an active route: ${redirect.from}`);
  if (!activeRoutes.has(redirect.to)) throw new Error(`Redirect target is not an active route: ${redirect.to}`);
  if (redirect.from === redirect.to) throw new Error(`Redirect points to itself: ${redirect.from}`);
  redirectSources.add(redirect.from);
}

// Pinned once to the published af792991 map. A new snapshot is not an
// automatic escape hatch for a removed route; changing this pin needs review.
const baselinePath = path.join(root, 'scripts/docs-published-route-baseline.json');
const baselineBytes = fs.readFileSync(baselinePath);
if (createHash('sha256').update(baselineBytes).digest('hex') !== 'c9fd21962ade0616a71cc5f0a30363b0020ed26028fd88444a9934197d76f6b7') {
  throw new Error('Published-route baseline bytes changed; do not repin to hide route loss.');
}
assertRouteContinuity(JSON.parse(baselineBytes), pages, routeRegistry);

const sourceSurfaceMap = buildSourceSurfaceMap(root, pages);
const productSurfacePath = path.join(siteRoot, 'product-surfaces.md');
const productSurfaceText = fs.readFileSync(productSurfacePath, 'utf8');
const productSurfaceOutput = renderAuthorityMatrixSummary(sourceSurfaceMap.authorityMatrix, productSurfaceText);
const output = `${JSON.stringify({
  schemaVersion: 'kubeclaw-documentation-map.v1',
  authority: 'Page metadata supplies ownership and source dependencies. This file is generated and must not be edited by hand.',
  generatedBy: 'scripts/docs-governance.mjs',
  routeRegistry: relative(routeRegistryPath),
  pageCount: pages.length,
  pages,
  sourceSurfaceMap,
}, null, 2)}\n`;

if (check) {
  if (fs.existsSync(target)) assertSourceSurfaceMap(JSON.parse(fs.readFileSync(target, 'utf8')).sourceSurfaceMap, sourceSurfaceMap);
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output
    || productSurfaceText !== productSurfaceOutput) {
    console.error(`${relative(target)} is stale. Run npm run docs:governance:generate.`);
    process.exit(1);
  }
  console.log(`documentation governance passed (${pages.length} pages mapped)`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  fs.writeFileSync(productSurfacePath, productSurfaceOutput);
  console.log(`generated ${relative(target)} (${pages.length} pages)`);
}
