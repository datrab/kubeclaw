import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { verifySourceEvidencePin } from '../docs-source-evidence-pin.mjs';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-evidence-pin-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init');
    git('config', 'user.name', 'Source evidence fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    fs.writeFileSync(path.join(root, 'unchanged.ts'), 'one\ntwo\nthree\n');
    git('add', '.'); git('commit', '-m', 'Original reviewed source');
    const original = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(root, 'current.ts'), 'current\n');
    git('add', '.'); git('commit', '-m', 'Additional reviewed source');
    const current = git('rev-parse', 'HEAD');
    const verify = overrides => verifySourceEvidencePin(root, {
      page: 'topic.md', revision: original, source: 'unchanged.ts', first: 1, last: 3,
      allowedRevisions: [original, current], requireRange: true, maximumSpan: 60,
      ...overrides,
    });
    run({ root, original, current, verify });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('mixed reviewed immutable revisions verify their own source, not one page header', () => fixture(({ current, verify }) => {
  verify({});
  verify({ revision: current, source: 'current.ts', first: 1, last: 1 });
}));

test('a valid old pin cannot hide any current source-byte change', () => fixture(({ root, verify }) => {
  fs.appendFileSync(path.join(root, 'unchanged.ts'), 'changed outside cited excerpt\n');
  assert.throws(() => verify({ first: 1, last: 1 }), /changed after/);
}));

test('unreviewed and unavailable revisions remain different fail-closed cases', () => fixture(({ current, verify }) => {
  assert.throws(() => verify({ revision: current, allowedRevisions: [] }), /unreviewed source revision/);
  const unavailable = 'f'.repeat(40);
  assert.throws(() => verify({ revision: unavailable, allowedRevisions: [unavailable] }), /unavailable revision\/source/);
}));

test('range and bounded-excerpt requirements survive mixed revision support', () => fixture(({ verify }) => {
  assert.throws(() => verify({ first: 1, last: 100 }), /invalid line range/);
  assert.throws(() => verify({ first: 0, last: 1 }), /invalid line range/);
  assert.throws(() => verify({ first: undefined, last: undefined }), /without an explicit line range/);
  assert.throws(() => verify({ maximumSpan: 1 }), /evidence range wider/);
}));
