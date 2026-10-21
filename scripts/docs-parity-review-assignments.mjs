#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = 'docs/config/documentation-parity-batches.json';
const inventoryPath = 'docs/generated/inventory/documentation-parity-batches.json';
const classificationPath = 'docs/config/documentation-tree-classification.json';
const outputPath = 'docs/config/documentation-parity-review-assignments.json';

function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: unexpected or missing fields`);
}

function nonempty(value, label) {
  assert.equal(typeof value, 'string', `${label}: must be a string`);
  assert(value.trim(), `${label}: must not be empty`);
}

function safeRepositoryPath(root, relative, label, { allowMissing = false } = {}) {
  assert.equal(typeof relative, 'string', `${label}: path must be a string`);
  assert(relative && !relative.includes('\\') && !path.posix.isAbsolute(relative)
    && path.posix.normalize(relative) === relative && !relative.split('/').includes('..'),
  `${label}: unsafe repository path`);
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, relative);
  assert(absolute.startsWith(`${resolvedRoot}${path.sep}`), `${label}: path escapes repository root`);
  let cursor = resolvedRoot;
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

function readJson(root, relative) {
  const absolute = safeRepositoryPath(root, relative, relative);
  assert(fs.existsSync(absolute) && fs.lstatSync(absolute).isFile(), `${relative}: must be a regular file`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function writeAtomically(absolute, rendered) {
  const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o666);
    fs.writeFileSync(descriptor, rendered);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, absolute);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}

function assignmentId(assignment) {
  const identity = JSON.stringify({ originalPath: assignment.originalPath, legacyPath: assignment.legacyPath,
    batchId: assignment.batchId, owner: assignment.owner });
  return `parity-assignment:${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

export function buildReviewAssignments(root = defaultRoot) {
  const config = readJson(root, configPath);
  exactKeys(config, ['schemaVersion', 'purpose', 'sourceSetAuthorityRevision', 'sourceSetAuthoritySha256', 'batches'], configPath);
  assert.equal(config.schemaVersion, 'kubeclaw-documentation-parity-batches.v1', `${configPath}: unsupported schemaVersion`);
  assert(Array.isArray(config.batches) && config.batches.length > 0, `${configPath}: batches must be non-empty`);
  const batches = new Map();
  for (const [index, batch] of config.batches.entries()) {
    const label = `${configPath}.batches[${index}]`;
    exactKeys(batch, ['id', 'owner', 'patterns'], label);
    nonempty(batch.id, `${label}.id`);
    nonempty(batch.owner, `${label}.owner`);
    assert(!batches.has(batch.id), `${configPath}: duplicate batch id ${batch.id}`);
    assert(Array.isArray(batch.patterns) && batch.patterns.length > 0, `${label}.patterns: must be non-empty`);
    const expressions = batch.patterns.map((pattern, patternIndex) => {
      nonempty(pattern, `${label}.patterns[${patternIndex}]`);
      return new RegExp(pattern, 'u');
    });
    batches.set(batch.id, { owner: batch.owner, expressions });
  }

  const classification = readJson(root, classificationPath);
  assert.equal(classification.schemaVersion, 'kubeclaw-documentation-tree-classification.v1',
    `${classificationPath}: unsupported schemaVersion`);
  assert(Array.isArray(classification.files), `${classificationPath}.files: must be an array`);
  const sources = classification.files.filter((record) => record.class === 'legacy-extraction-source');
  const sourceByOriginal = new Map();
  for (const source of sources) {
    nonempty(source.originalPath, `${classificationPath}: source originalPath`);
    nonempty(source.path, `${classificationPath}: source path`);
    assert(!sourceByOriginal.has(source.originalPath), `${classificationPath}: duplicate source ${source.originalPath}`);
    sourceByOriginal.set(source.originalPath, source);
  }

  const inventory = readJson(root, inventoryPath);
  exactKeys(inventory, ['schemaVersion', 'sourceCount', 'batchCount', 'counts', 'assignments'], inventoryPath);
  assert.equal(inventory.schemaVersion, 'kubeclaw-documentation-parity-batch-inventory.v1',
    `${inventoryPath}: unsupported schemaVersion`);
  assert.equal(inventory.sourceCount, sources.length, `${inventoryPath}: sourceCount is stale`);
  assert.equal(inventory.batchCount, batches.size, `${inventoryPath}: batchCount is stale`);
  exactKeys(inventory.counts, [...batches.keys()], `${inventoryPath}.counts`);
  assert(Array.isArray(inventory.assignments), `${inventoryPath}.assignments: must be an array`);
  assert.equal(inventory.assignments.length, sources.length, `${inventoryPath}: assignment count is stale`);
  const seenSources = new Set();
  const counts = Object.fromEntries([...batches.keys()].map((id) => [id, 0]));
  const assignments = inventory.assignments.map((sourceAssignment, index) => {
    const label = `${inventoryPath}.assignments[${index}]`;
    exactKeys(sourceAssignment, ['originalPath', 'legacyPath', 'batchId', 'owner'], label);
    assert(!seenSources.has(sourceAssignment.originalPath), `${inventoryPath}: duplicate source ${sourceAssignment.originalPath}`);
    seenSources.add(sourceAssignment.originalPath);
    const source = sourceByOriginal.get(sourceAssignment.originalPath);
    assert(source, `${label}: source is absent from ${classificationPath}`);
    assert.equal(sourceAssignment.legacyPath, source.path, `${label}: legacyPath is stale`);
    const batch = batches.get(sourceAssignment.batchId);
    assert(batch, `${label}: unknown batch ${sourceAssignment.batchId}`);
    assert.equal(sourceAssignment.owner, batch.owner, `${label}: batch owner is stale`);
    const matches = [...batches].filter(([, candidate]) => candidate.expressions
      .some((expression) => expression.test(sourceAssignment.originalPath))).map(([id]) => id);
    assert.deepEqual(matches, [sourceAssignment.batchId], `${label}: batch pattern assignment is stale or ambiguous`);
    counts[sourceAssignment.batchId] += 1;
    const result = {
      assignmentId: assignmentId(sourceAssignment),
      originalPath: sourceAssignment.originalPath,
      authorId: `parity-author:${sourceAssignment.batchId}`,
      reviewerId: `parity-reviewer:${sourceAssignment.batchId}`,
      issuedBy: 'documentation-governance',
    };
    assert.notEqual(result.authorId, result.reviewerId, `${label}: author and reviewer must differ`);
    return result;
  }).sort((left, right) => left.originalPath.localeCompare(right.originalPath));
  assert.deepEqual([...seenSources].sort(), [...sourceByOriginal.keys()].sort(),
    `${inventoryPath}: source set differs from classification`);
  assert.deepEqual(counts, inventory.counts, `${inventoryPath}: batch counts are stale`);
  assert.equal(new Set(assignments.map((item) => item.assignmentId)).size, assignments.length,
    'generated review assignment IDs are not unique');
  return { schemaVersion: 'kubeclaw-documentation-parity-review-assignments.v1', assignments };
}

export function runCli({ root = defaultRoot, args = process.argv.slice(2) } = {}) {
  assert(args.every((argument) => argument === '--check'), `unknown argument ${args.find((argument) => argument !== '--check')}`);
  assert(args.length <= 1, 'duplicate --check argument');
  const checkOnly = args.includes('--check');
  const value = buildReviewAssignments(root);
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  const absolute = safeRepositoryPath(root, outputPath, outputPath, { allowMissing: true });
  if (checkOnly) {
    assert(fs.existsSync(absolute), `${outputPath} is missing; run npm run docs:parity:assignments`);
    assert.equal(fs.readFileSync(absolute, 'utf8'), rendered,
      `${outputPath} is stale; run npm run docs:parity:assignments`);
  } else {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    writeAtomically(absolute, rendered);
  }
  process.stdout.write(`${checkOnly ? 'checked' : 'generated'} ${assignmentsLabel(value.assignments.length)}\n`);
  return value;
}

function assignmentsLabel(count) { return `${count} documentation parity review assignments`; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(); } catch (error) {
    process.stderr.write(`documentation parity review assignments: FAIL\n${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
