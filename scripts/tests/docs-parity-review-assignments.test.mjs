import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildReviewAssignments, runCli } from '../docs-parity-review-assignments.mjs';

function writeJson(root, relative, value) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-assignments-'));
  writeJson(root, 'docs/config/documentation-parity-batches.json', {
    schemaVersion: 'kubeclaw-documentation-parity-batches.v1', purpose: 'fixture',
    sourceSetAuthorityRevision: 'a'.repeat(40),
    sourceSetAuthoritySha256: 'b'.repeat(64),
    batches: [{ id: 'alpha', owner: 'team-alpha', patterns: ['^docs/alpha/'] }],
  });
  writeJson(root, 'docs/config/documentation-tree-classification.json', {
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1', baselineRevision: '1'.repeat(40),
    files: [{ path: 'docs/_legacy-source/alpha/guide.md', class: 'legacy-extraction-source', purpose: 'fixture',
      originalPath: 'docs/alpha/guide.md', expectedPath: 'docs/_legacy-source/alpha/guide.md', introducedAfterBaseline: false }],
  });
  writeJson(root, 'docs/generated/inventory/documentation-parity-batches.json', {
    schemaVersion: 'kubeclaw-documentation-parity-batch-inventory.v1', sourceCount: 1, batchCount: 1,
    counts: { alpha: 1 }, assignments: [{ originalPath: 'docs/alpha/guide.md',
      legacyPath: 'docs/_legacy-source/alpha/guide.md', batchId: 'alpha', owner: 'team-alpha' }],
  });
  return root;
}

test('generates stable separated roles for every exact batch source', () => {
  const root = fixture();
  const first = runCli({ root });
  const second = buildReviewAssignments(root);
  assert.deepEqual(second, first);
  assert.deepEqual(first.assignments[0], {
    assignmentId: first.assignments[0].assignmentId,
    originalPath: 'docs/alpha/guide.md',
    authorId: 'parity-author:alpha',
    reviewerId: 'parity-reviewer:alpha',
    issuedBy: 'documentation-governance',
  });
  assert.match(first.assignments[0].assignmentId, /^parity-assignment:[0-9a-f]{64}$/u);
  assert.notEqual(first.assignments[0].authorId, first.assignments[0].reviewerId);
  runCli({ root, args: ['--check'] });
});

test('check mode is read-only and rejects stale authority', () => {
  const root = fixture();
  runCli({ root });
  const output = path.join(root, 'docs/config/documentation-parity-review-assignments.json');
  fs.appendFileSync(output, 'stale\n');
  assert.throws(() => runCli({ root, args: ['--check'] }), /is stale/u);
  assert.match(fs.readFileSync(output, 'utf8'), /stale\n$/u);
});

test('rejects duplicate and incomplete source assignments', () => {
  const duplicate = fixture();
  const inventoryPath = path.join(duplicate, 'docs/generated/inventory/documentation-parity-batches.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  inventory.assignments.push(inventory.assignments[0]);
  inventory.sourceCount = 2;
  inventory.counts.alpha = 2;
  writeJson(duplicate, 'docs/generated/inventory/documentation-parity-batches.json', inventory);
  assert.throws(() => buildReviewAssignments(duplicate), /sourceCount is stale|assignment count is stale|duplicate source/u);

  const missing = fixture();
  const missingInventory = JSON.parse(fs.readFileSync(
    path.join(missing, 'docs/generated/inventory/documentation-parity-batches.json'), 'utf8'));
  missingInventory.assignments = [];
  writeJson(missing, 'docs/generated/inventory/documentation-parity-batches.json', missingInventory);
  assert.throws(() => buildReviewAssignments(missing), /assignment count is stale/u);
});

test('rejects stale owner and ambiguous batch pattern assignments', () => {
  const owner = fixture();
  const inventoryPath = path.join(owner, 'docs/generated/inventory/documentation-parity-batches.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  inventory.assignments[0].owner = 'wrong-team';
  writeJson(owner, 'docs/generated/inventory/documentation-parity-batches.json', inventory);
  assert.throws(() => buildReviewAssignments(owner), /batch owner is stale/u);

  const ambiguous = fixture();
  const configPath = path.join(ambiguous, 'docs/config/documentation-parity-batches.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.batches.push({ id: 'other', owner: 'other-team', patterns: ['guide\\.md$'] });
  const ambiguousInventory = JSON.parse(fs.readFileSync(
    path.join(ambiguous, 'docs/generated/inventory/documentation-parity-batches.json'), 'utf8'));
  ambiguousInventory.batchCount = 2;
  ambiguousInventory.counts.other = 0;
  writeJson(ambiguous, 'docs/config/documentation-parity-batches.json', config);
  writeJson(ambiguous, 'docs/generated/inventory/documentation-parity-batches.json', ambiguousInventory);
  assert.throws(() => buildReviewAssignments(ambiguous), /stale or ambiguous/u);
});

test('rejects symlinked inputs and outputs without touching external files', () => {
  const input = fixture();
  const configPath = path.join(input, 'docs/config/documentation-parity-batches.json');
  const outsideInput = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-assignment-outside-')), 'batches.json');
  fs.copyFileSync(configPath, outsideInput);
  fs.unlinkSync(configPath);
  fs.symlinkSync(outsideInput, configPath);
  assert.throws(() => buildReviewAssignments(input), /symlinks are not allowed/u);

  const output = fixture();
  const outputPath = path.join(output, 'docs/config/documentation-parity-review-assignments.json');
  const outsideOutput = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-assignment-output-')), 'authority.json');
  fs.writeFileSync(outsideOutput, 'external\n');
  fs.symlinkSync(outsideOutput, outputPath);
  assert.throws(() => runCli({ root: output }), /symlinks are not allowed/u);
  assert.equal(fs.readFileSync(outsideOutput, 'utf8'), 'external\n');
});

test('rejects mixed check and unknown CLI arguments without writing', () => {
  const root = fixture();
  const output = path.join(root, 'docs/config/documentation-parity-review-assignments.json');
  assert.throws(() => runCli({ root, args: ['--check', '--generate'] }), /unknown argument/u);
  assert.equal(fs.existsSync(output), false);
});

test('preserves the previous authority file when generation fails during a write', () => {
  const root = fixture();
  runCli({ root });
  const output = path.join(root, 'docs/config/documentation-parity-review-assignments.json');
  const before = fs.readFileSync(output, 'utf8');
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = (target, value, ...rest) => {
    if (typeof target === 'number') {
      originalWrite(target, value.slice(0, 17), ...rest);
      throw new Error('simulated interrupted write');
    }
    return originalWrite(target, value, ...rest);
  };
  try {
    assert.throws(() => runCli({ root }), /simulated interrupted write/u);
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(fs.readFileSync(output, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.dirname(output)).filter((name) => name.includes('.tmp-')), []);
});
