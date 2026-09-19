#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'docs', 'site');
const target = path.join(siteRoot, 'reference', 'generated-documentation-map.json');
const routeRegistryPath = path.join(siteRoot, 'reference', 'documentation-route-registry.json');
const check = process.argv.includes('--check');
const metadataFields = ['Status', 'Audience', 'Owner', 'Evidence', 'Applies to', 'Last verified'];

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

function checksFor(page) {
  const checks = ['npm run docs:governance:check', 'npm run docs:publication:check', 'npm run docs:check:refs'];
  if (page === 'docs/site/status/open-issues.md') checks.unshift('npm run docs:status:check');
  if (page.includes('/buster') || page === 'docs/site/extend/platform/buster.md') {
    checks.unshift('npm run docs:buster-guides:check');
  }
  if (page === 'docs/site/reference/capabilities.md' || page.startsWith('docs/site/extend/plugin-catalogue/')) {
    checks.unshift('npm run docs:publication:check');
  }
  return [...new Set(checks)];
}

function contentKind(page) {
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
    return {
      page,
      route: publicRoute(item),
      contentKind: contentKind(page),
      status: values.Status,
      audience: values.Audience,
      owner: values.Owner,
      appliesTo: values['Applies to'],
      lastVerified: values['Last verified'],
      sourceDependencies: evidence,
      checks: checksFor(page),
    };
  });

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

const output = `${JSON.stringify({
  schemaVersion: 'kubeclaw-documentation-map.v1',
  authority: 'Page metadata supplies ownership and source dependencies. This file is generated and must not be edited by hand.',
  generatedBy: 'scripts/docs-governance.mjs',
  routeRegistry: relative(routeRegistryPath),
  pageCount: pages.length,
  pages,
}, null, 2)}\n`;

if (check) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
    console.error(`${relative(target)} is stale. Run npm run docs:governance:generate.`);
    process.exit(1);
  }
  console.log(`documentation governance passed (${pages.length} pages mapped)`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  console.log(`generated ${relative(target)} (${pages.length} pages)`);
}
