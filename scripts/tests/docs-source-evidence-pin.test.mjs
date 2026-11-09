import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createHash } from 'node:crypto';
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

test('explicit upstream evidence binds page, revision, file digest and range without adopting runtime source', () => fixture(({ root, original, current, verify }) => {
  const upstreamSnapshot = { schemaVersion: 1, revision: original, pages: ['topic.md'],
    sources: { 'unchanged.ts': createHash('sha256').update('one\ntwo\nthree\n').digest('hex') } };
  fs.appendFileSync(path.join(root, 'unchanged.ts'), 'different branch source\n');
  verify({ upstreamSnapshot });
  assert.throws(() => verify({}), /changed after/);
  assert.throws(() => verify({ upstreamSnapshot, page: 'other.md' }), /no admitted upstream scope/);
  assert.throws(() => verify({ upstreamSnapshot, revision: current }), /no admitted upstream scope/);
  assert.throws(() => verify({ upstreamSnapshot: { ...upstreamSnapshot, sources: {} } }), /digest missing or changed/);
  assert.throws(() => verify({ upstreamSnapshot, last: 99 }), /invalid line range/);
}));

test('dated Ops reader evidence verifies its actual page roster, immutable source bytes and excerpts', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const upstreamSnapshot = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ops-mcp-docs-upstream.json'), 'utf8'));
  assert.equal(upstreamSnapshot.revision, '34cf38ef53ee41381543785d0ffae90a37fac9ca');
  for (const page of upstreamSnapshot.pages) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert(text.includes('Upstream source scope:'), `${page} omits its upstream boundary`);
    const links = [...text.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([a-f0-9]{40})\/([^#)]+)#L(\d+)-L(\d+)/gu)]
      .filter(match => match[1] === upstreamSnapshot.revision);
    assert(links.length > 0, `${page} lacks its upstream evidence`);
    for (const [, revision, source, first, last] of links) {
      verifySourceEvidencePin(root, { page, revision, source, first, last,
        allowedRevisions: [upstreamSnapshot.revision], requireRange: true, maximumSpan: 60, upstreamSnapshot });
    }
  }
});

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
