import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'parse5';

const root = path.resolve(process.argv[2] ?? '.tmp/docs-publication');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'reader-manifest.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 'kubeclaw-reader-artifact.v1');
const records = new Map();
const paths = new Set();
let localLinks = 0;
for (const entry of manifest.outputs) {
  assert.equal(entry.path, path.posix.normalize(entry.path));
  assert(!entry.path.startsWith('../') && !path.isAbsolute(entry.path) && !entry.path.includes('\\'));
  assert(!paths.has(entry.path), `Duplicate manifest output: ${entry.path}`);
  paths.add(entry.path);
  const file = path.join(root, entry.path);
  assert.equal(fs.realpathSync(file), file, `Non-physical artifact output: ${entry.path}`);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, entry.bytes, `Output size changed: ${entry.path}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Output digest changed: ${entry.path}`);
  if (!entry.path.endsWith('.html')) continue;
  const ids = new Set();
  const links = [];
  function walk(node) {
    const attributes = Object.fromEntries((node.attrs ?? []).map(item => [item.name, item.value]));
    if (attributes.id) {
      assert(!ids.has(attributes.id), `Duplicate rendered ID: ${entry.path}#${attributes.id}`);
      ids.add(attributes.id);
    }
    if (node.tagName === 'a' && attributes.name) ids.add(attributes.name);
    if (attributes.href) links.push(attributes.href);
    if (['img', 'script'].includes(node.tagName) && attributes.src) links.push(attributes.src);
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parse(bytes.toString('utf8')));
  records.set(entry.path, { ids, links });
}
assert(records.size >= manifest.pageCount, 'Reader manifest lost selected pages');
for (const [page, { links }] of records) {
  for (const link of links) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(link)) continue;
    const url = new URL(link, `http://artifact/${page}`);
    const target = decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, target);
    assert(file.startsWith(`${root}${path.sep}`), `Artifact link escapes output: ${page}: ${link}`);
    assert(fs.statSync(file).isFile(), `Artifact link is not a file: ${page}: ${link}`);
    assert.equal(fs.realpathSync(file), file, `Artifact link follows a symlink: ${page}: ${link}`);
    if (url.hash && records.has(target)) assert(records.get(target).ids.has(decodeURIComponent(url.hash.slice(1))), `Missing rendered fragment: ${page}: ${link}`);
    localLinks++;
  }
}
console.log(JSON.stringify({ selectedPages: manifest.pageCount, htmlPages: records.size, localLinks, verifiedOutputDigests: paths.size }));
