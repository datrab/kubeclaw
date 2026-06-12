#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs');
const matrixPath = 'docs/archive/audits/2026-06-12-documentation-coverage-matrix.md';
const topicMapPath = 'docs/archive/audits/2026-06-12-documentation-topic-map.md';

const validRatings = new Set(['rich', 'adequate', 'shallow', 'stale', 'misleading', 'duplicate', 'missing']);
const allowedWeakRatings = new Set(['shallow', 'stale', 'misleading']);
const adequateRationaleRe = /Accepted adequate rationale: (Historical context|Historical\/planning context|Intentionally an index\/router|Generated\/static visual artifact|Generated\/static example artifact|Generated wrapper\/artifact|Generated wrapper|Narrow reference|Narrow reference\/template)/;
const vagueTopicLanguage = /\bremaining weakness\b|\bunresolved weakness\b|\bvague weakness\b/i;

const errors = [];

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function walk(dir, predicate = () => true) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(filePath, predicate));
    else if (entry.isFile() && predicate(filePath)) out.push(filePath);
  }
  return out;
}

function activeDocsFiles() {
  return walk(docsRoot, (filePath) => true)
    .filter((filePath) => !rel(filePath).startsWith('docs/archive/'))
    .map(rel)
    .sort();
}

function parseMatrixRows() {
  const text = fs.readFileSync(path.join(root, matrixPath), 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('| docs/') && !line.startsWith('| README.md')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 12) continue;
    rows.push({
      line,
      doc: cells[1],
      purpose: cells[2],
      audience: cells[3],
      rating: cells[4],
      missingDetails: cells[8],
      recommendedAction: cells[10],
      priority: cells[11],
    });
  }
  return rows;
}

function checkMatrix() {
  const rows = parseMatrixRows();
  const active = activeDocsFiles();
  const byDoc = new Map();

  for (const row of rows) {
    if (byDoc.has(row.doc)) errors.push(`coverage matrix has duplicate row for ${row.doc}`);
    byDoc.set(row.doc, row);

    if (!fs.existsSync(path.join(root, row.doc))) {
      errors.push(`coverage matrix path does not exist: ${row.doc}`);
    }
    if (!validRatings.has(row.rating)) {
      errors.push(`coverage matrix has invalid rating for ${row.doc}: ${row.rating}`);
    }
    if (row.rating === 'adequate' && !adequateRationaleRe.test(row.line)) {
      errors.push(`adequate matrix row lacks accepted rationale: ${row.doc}`);
    }
    if (allowedWeakRatings.has(row.rating) && !/Explicitly allowed weak coverage:/i.test(row.line)) {
      errors.push(`${row.doc} is rated ${row.rating} without an explicit weak-coverage allowance`);
    }
  }

  for (const doc of active) {
    if (!byDoc.has(doc)) errors.push(`active docs file is missing from coverage matrix: ${doc}`);
  }
}

function normalizeRef(raw) {
  let ref = raw.trim().replace(/^[`'"]+|[`'",.;)]+$/g, '');
  ref = ref.replace(/^git-repo\/kubeclaw-main\//, '');
  ref = ref.replace(/^\.\/+/, '');
  ref = ref.replace(/:\d+(:\d+)?$/, '');
  ref = ref.split('#')[0];
  return ref;
}

function checkTopicMap() {
  const text = fs.readFileSync(path.join(root, topicMapPath), 'utf8');
  if (vagueTopicLanguage.test(text)) {
    errors.push(`${topicMapPath} contains vague unresolved weakness language`);
  }

  const pathRe = /`?(docs\/[A-Za-z0-9._/@*{}<>=-]+)`?/g;
  let match;
  while ((match = pathRe.exec(text))) {
    const ref = normalizeRef(match[1]);
    if (!ref || ref.includes('*') || ref.includes('<') || ref.includes('>') || ref.endsWith('/')) continue;
    if (!fs.existsSync(path.join(root, ref))) {
      errors.push(`${topicMapPath} cites missing docs path: ${ref}`);
    }
  }
}

checkMatrix();
checkTopicMap();

if (errors.length) {
  console.error('docs coverage check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = parseMatrixRows().reduce((acc, row) => {
  acc[row.rating] = (acc[row.rating] || 0) + 1;
  return acc;
}, {});

console.log(`docs coverage check passed (${activeDocsFiles().length} active docs files, ratings: ${JSON.stringify(counts)})`);
