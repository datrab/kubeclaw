#!/usr/bin/env node

// Structural consistency is not a substitute for the independent content review.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = new Map([
  ['A97', 12], ['A98', 14], ['A99', 13], ['A910', 14],
  ['A911', 12], ['A912', 12], ['A913', 12],
]);
const historicalGates = new Map([
  ['A911-09', 'c559e97960a89a0f80487483addb91d2e6e4527d'],
  ['A911-10', 'ee1a67d4aa21a8104625d6e7b2aa4e46c7b70120'],
]);
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function text(value, name) {
  assert(typeof value === 'string' && value.trim(), `${name} must be nonempty text`);
}
function unique(values, name) {
  assert(Array.isArray(values), `${name} must be an array`);
  assert.equal(new Set(values).size, values.length, `${name} must be unique`);
}
function strings(values, name) {
  unique(values, name);
  for (const value of values) text(value, name);
}
function trackedFile(revision, file) {
  text(file, 'file path');
  assert(!path.isAbsolute(file) && !file.split('/').some(p => p === '..' || p === '.' || !p)
    && !file.includes('\\') && !file.includes('\n') && !file.includes('\t'), `invalid path: ${file}`);
  const entry = git('ls-tree', revision, '--', file);
  const match = /^(100644|100755) blob [a-f0-9]{40}\t(.+)$/u.exec(entry);
  assert(match && match[2] === file, `not a regular tracked file at ${revision}: ${file}`);
}

export function validateCompletionRecords(matrix, catalogue, rows, repo = {
  git, trackedFile,
}) {
  const records = matrix.completionRecords;
  assert(Array.isArray(records), 'completionRecords must be an array');
  unique(records.map(r => r.id), 'completion record IDs');
  const gates = new Map(rows.map(row => [row.id, row]));
  const requirements = new Map(catalogue.requirements.map(row => [row.id, row]));
  const passedGates = new Set();
  const passedRequirements = new Set();
  for (const record of records) {
    for (const field of ['id', 'author', 'reviewer', 'summary']) text(record[field], field);
    assert(['PASS', 'FAIL', 'NOT_READY'].includes(record.verdict), 'invalid completion verdict');
    assert(/^[a-f0-9]{40}$/u.test(record.revision), 'reviewed revision must be a full commit SHA');
    assert.equal(repo.git('rev-parse', `${record.revision}^{commit}`), record.revision);
    repo.git('merge-base', '--is-ancestor', record.revision, 'HEAD');
    for (const field of ['gateIds', 'requirementIds', 'pages', 'sources', 'limits', 'openIssues']) {
      strings(record[field], field);
    }
    assert(record.gateIds.length + record.requirementIds.length > 0, 'record must identify checked items');
    for (const id of record.gateIds) assert(gates.has(id), `unknown gate: ${id}`);
    for (const id of record.requirementIds) assert(requirements.has(id), `unknown requirement: ${id}`);
    assert(record.pages.length > 0 && record.sources.length > 0, 'pages and sources must be explicit');
    for (const page of record.pages) {
      assert(page.startsWith('docs/site/') && page.endsWith('.md'), `not a reader page: ${page}`);
    }
    for (const file of [...record.pages, ...record.sources]) repo.trackedFile(record.revision, file);
    if (record.verdict !== 'PASS') continue;
    assert.notEqual(record.author.trim().toLowerCase(), record.reviewer.trim().toLowerCase(),
      'author cannot be the independent reviewer');
    assert.equal(record.openIssues.length, 0, 'PASS cannot have open documentation issues');
    for (const aspect of ['sourceAccuracy', 'readerUsability', 'quality']) {
      assert.equal(record.review?.[aspect], 'PASS', `independent review missing: ${aspect}`);
    }
    assert(Array.isArray(record.checks) && record.checks.length > 0, 'PASS requires relevant checks');
    for (const check of record.checks) {
      text(check.command, 'check.command');
      text(check.observation, 'check.observation');
      assert.equal(check.exitCode, 0, 'PASS contains a failed or unexecuted check');
    }
    const changed = repo.git('diff', '--name-only', record.revision, '--',
      ...record.pages.map(p => `:(literal)${p}`), ...record.sources.map(p => `:(literal)${p}`));
    assert.equal(changed, '', `${record.id}: relevant files changed; recheck only affected scope`);
    for (const id of record.requirementIds) {
      assert(record.pages.includes(requirements.get(id).canonicalTarget),
        `${id}: canonical reader page missing from review`);
      assert(!passedRequirements.has(id), `duplicate accepted requirement: ${id}`);
      passedRequirements.add(id);
    }
    for (const id of record.gateIds) {
      assert(!passedGates.has(id), `duplicate accepted gate: ${id}`);
      passedGates.add(id);
    }
  }
  for (const [items, passed, legacy] of [
    [matrix.gates, passedGates, historicalGates],
    [matrix.requirements, passedRequirements, new Map()],
  ]) {
    for (const item of items) {
      const historical = legacy.has(item.id) && item.state === 'accepted'
        && item.evidence?.some(e => e.revision === legacy.get(item.id))
        && ['source', 'reader', 'quality'].every(role => item.reviews?.some(
          r => r.role === role && r.verdict === 'PASS'));
      if (passed.has(item.id)) assert.equal(item.state, 'accepted', `${item.id}: register PASS atomically`);
      else if (!historical) assert.notEqual(item.state, 'accepted', `${item.id}: accepted without reviewed completion`);
    }
  }
}

export function checkContract() {
  assert.equal(process.argv.length, 2,
    'No raw --evidence mode: record compact topic reviews in documentation-completion-matrix.json');
  const source = fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-contract.md'), 'utf8');
  const rows = [...source.matchAll(/^\| (A9\d{1,2}-\d{2}) \| (.+) \| (.+) \|$/gmu)]
    .map(m => ({ id: m[1], pass: m[2], fail: m[3] }));
  unique(rows.map(r => r.id), 'contract gate IDs');
  assert.equal(rows.length, 89);
  for (const [prefix, count] of expected) {
    assert.deepEqual(rows.filter(r => r.id.startsWith(prefix + '-')).map(r => r.id),
      Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`));
  }
  for (const row of rows) {
    assert(row.pass.length >= 80 && row.fail.length >= 40, `${row.id}: insufficient substantive condition`);
  }
  const catalogue = read('docs/blueprint/generated/ap09-catalogue.json');
  assert.equal(catalogue.total, 261);
  assert.equal(catalogue.requirements.length, 261);
  unique(catalogue.requirements.map(r => r.id), 'catalogue IDs');
  const matrix = read('docs/blueprint/documentation-completion-matrix.json');
  assert.equal(matrix.acceptancePolicy, 'compact-topic-review-20261019');
  for (const [items, ids, label] of [
    [matrix.gates, rows.map(r => r.id), 'matrix gates'],
    [matrix.requirements, catalogue.requirements.map(r => r.id), 'matrix requirements'],
  ]) {
    unique(items.map(r => r.id), label);
    assert.deepEqual(items.map(r => r.id).sort(), [...ids].sort(), `${label} differ from authority`);
    for (const item of items) assert(['accepted', 'not-accepted'].includes(item.state), `${item.id}: invalid state`);
  }
  for (const row of rows) {
    const item = matrix.gates.find(g => g.id === row.id);
    assert.equal(item.passCondition, row.pass, `${row.id}: matrix condition differs from contract`);
    assert.equal(item.automaticFailure, row.fail, `${row.id}: matrix failure condition differs from contract`);
  }
  for (const row of catalogue.requirements) {
    assert.equal(matrix.requirements.find(r => r.id === row.id).canonicalTarget, row.canonicalTarget,
      `${row.id}: matrix reader target differs from catalogue`);
  }
  validateCompletionRecords(matrix, catalogue, rows);
  const acceptedGates = matrix.gates.filter(r => r.state === 'accepted').length;
  const acceptedRequirements = matrix.requirements.filter(r => r.state === 'accepted').length;
  return { ok: true, policy: matrix.acceptancePolicy, acceptancePoints: rows.length,
    catalogueRequirements: catalogue.total, acceptedGates, acceptedRequirements,
    complete: acceptedGates === rows.length && acceptedRequirements === catalogue.total,
    contentReviewPerformedByChecker: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(checkContract()) + '\n');
}
