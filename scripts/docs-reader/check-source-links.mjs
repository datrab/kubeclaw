import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { sourceLinkVerifier } from './source-links.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = fs.realpathSync(path.resolve(process.argv[2] ?? '.tmp/docs-publication'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'reader-manifest.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 'kubeclaw-reader-artifact.v1');
const links = new Set(); let htmlPages = 0;
for (const entry of manifest.outputs.filter(item => item.path.endsWith('.html'))) {
  assert(entry.path === path.posix.normalize(entry.path) && !entry.path.startsWith('../') && !path.isAbsolute(entry.path) && !entry.path.includes('\\'));
  const file = path.join(root, entry.path);
  assert.equal(fs.realpathSync(file), file);
  const bytes = fs.readFileSync(file);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Rendered source-link input changed: ${entry.path}`);
  function walk(node) {
    const href = node.attrs?.find(item => item.name === 'href')?.value;
    if (href && /^https?:/iu.test(href)) links.add(href);
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parse(bytes.toString('utf8'))); htmlPages++;
}
const verifier = sourceLinkVerifier(repositoryRoot);
const pending = [...links].sort(); let cursor = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < pending.length) {
    const href = pending[cursor++]; await verifier.verify(href);
    // Synchronous local Git reads must not starve upstream response/timer IO.
    if (cursor % 32 === 0) await new Promise(resolve => setImmediate(resolve));
  }
}));
console.log(JSON.stringify({ htmlPages, ...verifier.observations(), limit: 'Primary source object/revision/line or Markdown-fragment verification only; not semantic or live-runtime acceptance.' }, null, 2));
