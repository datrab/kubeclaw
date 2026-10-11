import fs from 'node:fs';
import path from 'node:path';

// Only canonical reader inputs belong in the published artifact. Keep this
// allowlist separate from the source tree's internal documentation inputs.
const files = new Set([
  'reference/generated-documentation-map.json',
  'reference/documentation-route-registry.json',
]);
const directories = [
  'extend/examples/minimal-stage/',
  'use/workflows/examples/',
  'use/workflows/wait-resume/',
];

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
      if (!files.has(relative) && !directories.some(prefix => relative.startsWith(prefix))) {
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
