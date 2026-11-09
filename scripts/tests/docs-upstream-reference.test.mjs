import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { upstreamReferenceResolver } from '../lib/docs-upstream-reference.mjs';

for (const format of ['sha1', 'sha256']) test(`resolves byte-preserved documents with strict ${format} commit provenance`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-upstream-reference-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  const write = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  const retained = 'docs/blueprint/upstream-main-20261017/source.md';
  try {
    git('init', '-q', `--object-format=${format}`);
    write('docs/original/source.md', '[Target](../target.md#real-heading)\n');
    write('docs/target.md', '# Real Heading\n');
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    const revision = git('rev-parse', 'HEAD');
    const bytes = fs.readFileSync(path.join(root, 'docs/original/source.md'));
    const entry = { upstreamRevision: revision, upstreamPath: 'docs/original/source.md', retainedPath: retained,
      gitBlob: git('rev-parse', `${revision}:docs/original/source.md`), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    write(retained, bytes);
    const save = () => write('docs/blueprint/upstream-main-20261017/manifest.json', JSON.stringify({ inputs: [entry] }));
    save();
    // Working-tree content is intentionally unrelated; only the pinned original is authority.
    write('docs/target.md', '# Wrong Current Heading\n');
    const resolve = upstreamReferenceResolver(root);
    const source = path.join(root, retained);
    assert.equal(resolve(source, '../target.md', 'real-heading'), true);
    assert.equal(resolve(source, '../', ''), true);
    assert.equal(resolve(source, '../../', ''), true);
    assert.throws(() => resolve(source, '../target.md/', ''), /directory link targets a file/);
    assert.equal(resolve(path.join(root, 'docs/unregistered.md'), 'anything', ''), false);
    assert.throws(() => resolve(source, '../missing.md', ''), /missing or unsafe/);
    assert.throws(() => resolve(source, '../target.md', 'missing-heading'), /missing upstream Markdown anchor/);
    assert.throws(() => resolve(source, '../../../outside.md', ''), /escapes original repository/);
    write(retained, 'tampered');
    assert.throws(() => upstreamReferenceResolver(root), /byte mismatch/);
    write(retained, bytes);
    entry.upstreamRevision = git('rev-parse', `${revision}^{tree}`); save();
    assert.throws(() => upstreamReferenceResolver(root), /must identify a commit object/);
    entry.upstreamRevision = revision.slice(0, -1); save();
    assert.throws(() => upstreamReferenceResolver(root), /invalid upstream provenance entry/);
    entry.upstreamRevision = revision;
    entry.gitBlob = '0'.repeat(revision.length); save();
    assert.throws(() => upstreamReferenceResolver(root), /byte mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
