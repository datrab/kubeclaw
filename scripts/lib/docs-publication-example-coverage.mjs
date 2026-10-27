import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const MarkdownIt = createRequire(new URL('../docs-reader/renderer.mjs', import.meta.url))('markdown-it');
const markdown = new MarkdownIt({ html: true, linkify: false, typographer: false });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

export function publicationExampleBlocks(text) {
  return markdown.parse(text, {}).filter(token => ['fence', 'code_block'].includes(token.type))
    .map((token, index) => ({ ordinal: index + 1, type: token.type,
      info: token.type === 'fence' ? token.info.trim() : 'indented',
      sha256: digest(token.content), content: token.content }));
}

export function publicationExampleProse(text) {
  const offsets = [0];
  for (const line of text.matchAll(/\n/gu)) offsets.push(line.index + 1);
  const regions = [];
  let cursor = 0;
  const append = end => {
    if (end > cursor) {
      const content = text.slice(cursor, end);
      regions.push({ ordinal: regions.length + 1, sha256: digest(content), content });
    }
    cursor = end;
  };
  for (const token of markdown.parse(text, {})) {
    if (!['fence', 'code_block'].includes(token.type)) continue;
    assert(token.map?.length === 2, 'example parser returned a block without source boundaries');
    append(offsets[token.map[0]] ?? text.length);
    cursor = offsets[token.map[1]] ?? text.length;
  }
  append(text.length);
  return regions;
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: unexpected/missing fields`);
}
function text(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label}: missing substantive declaration`);
}
function uniqueBy(items, key, label) {
  assert(Array.isArray(items), `${label}: expected array`);
  const result = new Map();
  for (const item of items) {
    text(item[key], `${label}.${key}`);
    assert(!result.has(item[key]), `${label}: duplicate ${item[key]}`);
    result.set(item[key], item);
  }
  return result;
}
function regularBytes(root, relative) {
  assert(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\')
    && relative === path.posix.normalize(relative) && !path.isAbsolute(relative)
    && !relative.startsWith('../'), `example authority outside repository: ${relative}`);
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    assert(!fs.lstatSync(current).isSymbolicLink(), `example authority symlink: ${relative}`);
  }
  assert(fs.statSync(current).isFile(), `example authority not regular: ${relative}`);
  return fs.readFileSync(current);
}

// This checks completeness and exact identity of an authored semantic assignment.
// It does not turn a hash, role label or old review into native execution proof.
export function bindPublicationExampleCoverage(root, pages, assets, declaration) {
  exactKeys(declaration, ['schemaVersion', 'pages', 'assets', 'checks', 'authorities', 'contracts'], 'example claims');
  assert.equal(declaration.schemaVersion, 'kubeclaw-publication-example-claims.v1');
  const checks = uniqueBy(declaration.checks, 'id', 'example checks');
  for (const check of checks.values()) {
    exactKeys(check, ['id', 'validator', 'inputs', 'claim', 'limit'], `check ${check.id}`);
    text(check.validator, check.id); text(check.claim, check.id); text(check.limit, check.id);
    assert(Array.isArray(check.inputs) && check.inputs.every(input => typeof input === 'string'), `invalid inputs: ${check.id}`);
  }
  const declaredPages = uniqueBy(declaration.pages, 'path', 'example pages');
  const declaredAssets = uniqueBy(declaration.assets, 'path', 'example assets');
  const sources = new Map();
  const usedChecks = new Set();
  function responsibilities(record, label, sourceKey) {
    for (const field of ['owner', 'claim', 'executionBoundary', 'basis']) text(record[field], `${label}.${field}`);
    assert(Array.isArray(record.checks) && record.checks.length > 0, `${label}: missing check assignment`);
    assert.equal(new Set(record.checks).size, record.checks.length, `${label}: duplicate check assignment`);
    let consumed = false;
    for (const id of record.checks) {
      assert(checks.has(id), `${label}: unknown native/fidelity check ${id}`);
      if (checks.get(id).inputs.includes(sourceKey)) consumed = true;
      usedChecks.add(id);
    }
    assert(consumed, `${label}: no assigned check consumes ${sourceKey}`);
  }
  for (const file of pages) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const record = declaredPages.get(relative);
    assert(record, `unclassified publication example page: ${relative}`);
    exactKeys(record, ['path', 'sha256', 'owner', 'claim', 'executionBoundary', 'basis', 'checks', 'blocks', 'prose'], relative);
    const bytes = regularBytes(root, relative);
    assert.equal(digest(bytes), record.sha256, `publication inline/prose example claims changed: ${relative}`);
    responsibilities(record, relative, relative);
    sources.set(relative, bytes.toString('utf8'));
    const blocks = publicationExampleBlocks(bytes.toString('utf8'));
    assert(Array.isArray(record.blocks) && record.blocks.length === blocks.length,
      `unclassified publication example block: ${relative}`);
    for (const [index, block] of blocks.entries()) {
      const item = record.blocks[index];
      exactKeys(item, ['ordinal', 'type', 'info', 'sha256', 'owner', 'claim', 'executionBoundary', 'basis', 'checks', 'role'], `${relative} block ${index + 1}`);
      for (const key of ['ordinal', 'type', 'info', 'sha256']) assert.equal(item[key], block[key], `${relative} block ${index + 1}: ${key} changed`);
      text(item.role, `${relative} block ${index + 1}: role`);
      responsibilities(item, `${relative} block ${index + 1}`, `${relative}#block-${block.ordinal}`);
      sources.set(`${relative}#block-${block.ordinal}`, block.content);
    }
    const prose = publicationExampleProse(bytes.toString('utf8'));
    assert(Array.isArray(record.prose) && record.prose.length === prose.length,
      `unclassified publication inline/prose region: ${relative}`);
    for (const [index, region] of prose.entries()) {
      const item = record.prose[index];
      exactKeys(item, ['ordinal', 'sha256', 'owner', 'claim', 'executionBoundary', 'basis', 'checks'], `${relative} prose ${index + 1}`);
      assert.equal(item.ordinal, region.ordinal, `${relative} prose region reordered`);
      assert.equal(item.sha256, region.sha256, `publication inline/prose region changed: ${relative} ${index + 1}`);
      responsibilities(item, `${relative} prose ${index + 1}`, `${relative}#prose-${region.ordinal}`);
      sources.set(`${relative}#prose-${region.ordinal}`, region.content);
    }
    declaredPages.delete(relative);
  }
  assert.equal(declaredPages.size, 0, `missing classified example pages: ${[...declaredPages.keys()]}`);
  for (const asset of assets) {
    const relative = `docs/site/${asset}`;
    const record = declaredAssets.get(relative);
    assert(record, `unclassified publication example asset: ${relative}`);
    exactKeys(record, ['path', 'sha256', 'owner', 'claim', 'executionBoundary', 'basis', 'checks'], relative);
    const bytes = regularBytes(root, relative);
    assert.equal(digest(bytes), record.sha256, `publication example asset changed: ${relative}`);
    responsibilities(record, relative, relative); sources.set(relative, bytes.toString('utf8'));
    declaredAssets.delete(relative);
  }
  assert.equal(declaredAssets.size, 0, `missing classified example assets: ${[...declaredAssets.keys()]}`);
  for (const authority of declaration.authorities) {
    exactKeys(authority, ['path', 'sha256', 'responsibility'], 'example authority');
    text(authority.responsibility, authority.path);
    assert.equal(digest(regularBytes(root, authority.path)), authority.sha256, `example native/source authority changed: ${authority.path}`);
  }
  for (const check of checks.values()) {
    assert(usedChecks.has(check.id), `orphan publication example check: ${check.id}`);
    for (const input of check.inputs) assert(sources.has(input), `check ${check.id}: unknown input ${input}`);
  }
  return { sources, checks: [...checks.values()] };
}
