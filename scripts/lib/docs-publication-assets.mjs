import fs from 'node:fs';
import path from 'node:path';

// Only canonical reader inputs belong in the published artifact. Keep this
// allowlist separate from the source tree's internal documentation inputs.
const files = new Set([
  'extend/examples/minimal-stage/package.json',
  'extend/examples/minimal-stage/plugin.json',
  'extend/examples/minimal-stage/schemas/config.schema.json',
  'extend/examples/minimal-stage/schemas/input.schema.json',
  'extend/examples/minimal-stage/schemas/result.schema.json',
  'extend/examples/minimal-stage/src/stage.js',
  'extend/examples/minimal-stage/tests/stage.test.mjs',
  'extend/examples/observer-lifecycle/journey.mjs',
  'extend/examples/observer-lifecycle/plugin/package.json',
  'extend/examples/observer-lifecycle/plugin/plugin.json',
  'extend/examples/observer-lifecycle/plugin/schemas/checkpoint.schema.json',
  'extend/examples/observer-lifecycle/plugin/schemas/config.schema.json',
  'extend/examples/observer-lifecycle/plugin/src/observer.js',
  'extend/examples/platform-change-nova-lifecycle.json',
  'reference/generated-documentation-map.json',
  'reference/documentation-route-registry.json',
  'use/workflows/examples/buster-fixture-matrix-report.pipeline.json',
  'use/workflows/examples/compiled-project.mjs',
  'use/workflows/examples/compiled-project-input.mjs',
  'use/workflows/examples/compiled-project-verification.mjs',
  'use/workflows/examples/first-project.mjs',
  'use/workflows/examples/local-core.mjs',
  'use/workflows/examples/repair-retry.mjs',
  'use/workflows/examples/request-trace-redis-unavailable.json',
  'use/workflows/examples/request-trace-success.json',
  'use/workflows/wait-resume/approval.pipeline.json',
  'use/workflows/wait-resume/platform.template.json',
  'use/workflows/wait-resume/signal.template.json',
]);

export function publicationPages(siteRoot, classification) {
  if (classification?.schemaVersion !== 'kubeclaw-documentation-tree-classification.v1'
    || !Array.isArray(classification.files)) throw new Error('Publication needs the explicit documentation classification');
  const registered = new Set();
  const seen = new Set();
  for (const record of classification.files) {
    if (!record || typeof record.path !== 'string' || seen.has(record.path)) {
      throw new Error('Invalid or duplicate documentation classification path');
    }
    seen.add(record.path);
    if (!record.path.startsWith('docs/site/') || !record.path.endsWith('.md')) continue;
    const relative = record.path.slice('docs/site/'.length);
    if (relative !== path.posix.normalize(relative) || relative.startsWith('../')
      || relative.includes('\\') || path.isAbsolute(relative)
      || record.class !== 'canonical-reader-documentation' || record.expectedPath !== record.path) {
      throw new Error(`Page has no canonical publication classification: ${record.path}`);
    }
    registered.add(relative);
  }
  const pages = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Publication source must not be a symlink: ${source}`);
      if (entry.isDirectory()) { visit(source); continue; }
      if (!entry.isFile()) throw new Error(`Publication source must be a regular file: ${source}`);
      const relative = path.relative(siteRoot, source).split(path.sep).join('/');
      if (!relative.endsWith('.md')) continue;
      if (!registered.delete(relative)) throw new Error(`Reader page has no publication allowance: ${relative}`);
      pages.push(source);
    }
  }
  visit(siteRoot);
  if (registered.size) throw new Error(`Registered reader pages are missing: ${[...registered].sort().join(', ')}`);
  return pages.sort();
}

export function publicationAssets(siteRoot) {
  const assets = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Publication source must not be a symlink: ${source}`);
      if (entry.isDirectory()) { visit(source); continue; }
      if (!entry.isFile()) throw new Error(`Publication source must be a regular file: ${source}`);
      const relative = path.relative(siteRoot, source).split(path.sep).join('/');
      if (relative.endsWith('.md')) continue;
      if (!files.has(relative)) {
        throw new Error(`Reader asset has no publication allowance: ${relative}`);
      }
      assets.push(relative);
    }
  }
  visit(siteRoot);
  return assets.sort();
}

export function copyPublicationAssets(siteRoot, outputRoot, assets) {
  for (const relative of assets) {
    const target = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(siteRoot, relative), target);
  }
}

// Routes describe the HTML evidence artifact, not a claimed deployment host.
// This reuses the existing strict positive selector and rejects Markdown links
// or unclassified pages instead of discovering a broader publication authority.
export function publicationManifest(siteRoot, classification) {
  const pages = publicationPages(siteRoot, classification).map(file => {
    const sourcePath = `docs/site/${path.relative(siteRoot, file).split(path.sep).join('/')}`;
    const route = `/${sourcePath.slice('docs/site/'.length, -3)}.html`;
    return { sourcePath, route, canonicalUrl: route };
  });
  if (!pages.length) throw new Error('Publication manifest must contain reader pages');
  return { schemaVersion: 'kubeclaw-publication-manifest.v1', pages };
}
