#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = 'docs/config/documentation-parity-batches.json';
const classificationPath = 'docs/config/documentation-tree-classification.json';
const outputPath = 'docs/generated/inventory/documentation-parity-batches.json';
const checkOnly = process.argv.includes('--check');

function readJson(relative) {
  return JSON.parse(fs.readFileSync(safeRepositoryPath(relative, relative), 'utf8'));
}

function safeRepositoryPath(relative, label, { allowMissing = false } = {}) {
  assert.equal(typeof relative, 'string', `${label}: path must be a string`);
  assert(relative && !relative.includes('\\') && !path.posix.isAbsolute(relative)
    && path.posix.normalize(relative) === relative && !relative.split('/').includes('..'),
  `${label}: unsafe repository path`);
  const absolute = path.resolve(root, relative);
  assert(absolute.startsWith(`${root}${path.sep}`), `${label}: path escapes repository root`);
  let cursor = root;
  for (const component of relative.split('/')) {
    cursor = path.join(cursor, component);
    try {
      assert(!fs.lstatSync(cursor).isSymbolicLink(), `${label}: symlinks are not allowed`);
    } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return absolute;
}

function writeAtomic(relative, rendered) {
  const absolute = safeRepositoryPath(relative, relative, { allowMissing: true });
  const directory = path.dirname(absolute);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, rendered, { flag: 'wx' });
    fs.renameSync(temporary, absolute);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

const config = readJson(configPath);
assert.equal(config.schemaVersion, 'kubeclaw-documentation-parity-batches.v1');
assert(Array.isArray(config.batches) && config.batches.length > 0, `${configPath}: batches must be a non-empty array`);

const ids = new Set();
const compiled = config.batches.map((batch) => {
  assert(batch && typeof batch === 'object', `${configPath}: invalid batch`);
  assert(typeof batch.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(batch.id),
    `${configPath}: invalid batch id ${String(batch.id)}`);
  assert(!ids.has(batch.id), `${configPath}: duplicate batch id ${batch.id}`);
  ids.add(batch.id);
  assert(typeof batch.owner === 'string' && batch.owner, `${batch.id}: owner is required`);
  assert(Array.isArray(batch.patterns) && batch.patterns.length > 0, `${batch.id}: patterns are required`);
  return { ...batch, expressions: batch.patterns.map((value) => new RegExp(value, 'u')) };
});

const classification = readJson(classificationPath);
assert(Array.isArray(classification.files), `${classificationPath}: files must be an array`);
const classificationPaths = new Set();
const classificationOriginalPaths = new Set();
for (const [index, file] of classification.files.entries()) {
  const label = `${classificationPath}.files[${index}]`;
  assert(file && typeof file === 'object', `${label}: invalid classification record`);
  assert(typeof file.path === 'string' && file.path, `${label}: path is required`);
  assert(typeof file.originalPath === 'string' && file.originalPath, `${label}: originalPath is required`);
  assert(!classificationPaths.has(file.path), `${classificationPath}: duplicate path ${file.path}`);
  assert(!classificationOriginalPaths.has(file.originalPath),
    `${classificationPath}: duplicate originalPath ${file.originalPath}`);
  classificationPaths.add(file.path);
  classificationOriginalPaths.add(file.originalPath);
}
const sources = classification.files
  .filter((file) => file.class === 'legacy-extraction-source')
  .sort((a, b) => a.originalPath.localeCompare(b.originalPath));

const assignments = sources.map((source) => {
  const matches = compiled.filter((batch) => batch.expressions.some((expression) => expression.test(source.originalPath)));
  assert.equal(matches.length, 1,
    `${source.originalPath}: expected exactly one parity batch, matched ${matches.map((item) => item.id).join(', ') || 'none'}`);
  return {
    originalPath: source.originalPath,
    legacyPath: source.path,
    batchId: matches[0].id,
    owner: matches[0].owner,
  };
});

const counts = Object.fromEntries(compiled.map((batch) => [batch.id,
  assignments.filter((item) => item.batchId === batch.id).length]));
for (const [id, count] of Object.entries(counts)) assert(count > 0, `${id}: batch has no extraction sources`);

const output = {
  schemaVersion: 'kubeclaw-documentation-parity-batch-inventory.v1',
  sourceCount: assignments.length,
  batchCount: compiled.length,
  counts,
  assignments,
};
const rendered = `${JSON.stringify(output, null, 2)}\n`;
const absoluteOutput = safeRepositoryPath(outputPath, outputPath, { allowMissing: true });
if (checkOnly) {
  assert(fs.existsSync(absoluteOutput), `${outputPath} is missing; run npm run docs:parity:batches`);
  assert.equal(fs.readFileSync(absoluteOutput, 'utf8'), rendered,
    `${outputPath} is stale; run npm run docs:parity:batches`);
  process.stdout.write(`documentation parity batches passed (${assignments.length} sources in ${compiled.length} batches)\n`);
} else {
  writeAtomic(outputPath, rendered);
  process.stdout.write(`generated ${outputPath} (${assignments.length} sources in ${compiled.length} batches)\n`);
}
