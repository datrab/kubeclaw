import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { githubSourceTarget, sourceLinkVerifier } from '../docs-reader/source-links.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-source-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('remote', 'add', 'origin', 'https://github.com/example/fixture.git');
  fs.writeFileSync(path.join(root, 'source.go'), 'first\nsecond\n');
  fs.writeFileSync(path.join(root, 'empty.go'), '');
  fs.symlinkSync('source.go', path.join(root, 'alias.go'));
  fs.mkdirSync(path.join(root, 'directory')); fs.writeFileSync(path.join(root, 'directory', 'readme.md'), '# Directory\n');
  git('add', '.'); git('-c', 'user.name=Reader test', '-c', 'user.email=reader@example.invalid', 'commit', '-qm', 'fixture');
  return { root, revision: git('rev-parse', 'HEAD') };
}

test('exact local commit/regular-source/range checks reject missing, symlink and out-of-bounds evidence', async t => {
  const { root, revision } = fixture(t);
  const verifier = sourceLinkVerifier(root);
  const link = file => `https://github.com/example/fixture/blob/${revision}/${file}`;
  await verifier.verify(link('source.go#L1-L2'));
  await assert.rejects(verifier.verify(link('source.go#L2-L3')), /Source range outside/u);
  await assert.rejects(verifier.verify(link('source.go#L0-L1')), /Source range outside/u);
  await assert.rejects(verifier.verify(link('empty.go#L1')), /Source range outside/u);
  await assert.rejects(verifier.verify(link('missing.go')), /not a tracked regular blob/u);
  await assert.rejects(verifier.verify(link('alias.go#L1')), /not a tracked regular blob/u);
  await verifier.verify(`https://github.com/example/fixture/tree/${revision}/directory`);
  await assert.rejects(verifier.verify(link('directory')), /Source view\/type mismatch/u);
  assert.equal(verifier.observations().uniqueVerifiedLinks, 2);
});

test('upstream source is checked once per exact object; named anchors and line ranges use the actual returned bytes', async t => {
  const { root } = fixture(t); let reads = 0;
  const verifier = sourceLinkVerifier(root, { readRemote: async target => {
    reads++; assert.equal(target.repository, 'upstream/project'); assert.equal(target.revision, 'a'.repeat(40));
    return Buffer.from('# Source\n\n## Exact anchor\n\nBody.\n');
  } });
  const base = `https://github.com/upstream/project/blob/${'a'.repeat(40)}/README.md`;
  await Promise.all([verifier.verify(`${base}#L1-L5`), verifier.verify(`${base}#exact-anchor`)]);
  assert.equal(reads, 1);
  await assert.rejects(verifier.verify(`${base}#missing-anchor`), /Missing source Markdown anchor/u);
  await assert.rejects(verifier.verify(`${base}#L6`), /Source range outside/u);
  assert.equal(verifier.observations().uniqueVerifiedLinks, 2);
  assert.equal(verifier.observations().primarySources[0].sha256.length, 64);
});

test('only canonical full-revision GitHub source locators enter primary-source verification', () => {
  assert.equal(githubSourceTarget('https://example.org/reference'), null);
  assert.throws(() => githubSourceTarget('https://github.com/example/fixture/blob/main/file.go'), /full commit revision/u);
  assert.throws(() => githubSourceTarget(`https://github.com/example/fixture/blob/${'a'.repeat(40)}/dir%2F..%2Fsecret`), /Non-canonical source path/u);
  assert.throws(() => githubSourceTarget(`https://name:password@github.com/example/fixture/blob/${'a'.repeat(40)}/file.go`), /Non-canonical source origin/u);
  assert.throws(() => githubSourceTarget(`http://github.com/example/fixture/blob/${'a'.repeat(40)}/file.go`), /Non-canonical source origin/u);
  assert.throws(() => githubSourceTarget(`https://www.github.com/example/fixture/blob/${'a'.repeat(40)}/file.go`), /Non-canonical source origin/u);
});
