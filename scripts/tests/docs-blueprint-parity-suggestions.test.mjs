import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { authoredParitySuggestion } from '../lib/docs-blueprint-parity-suggestions.mjs';

function setup(t, value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-parity-suggestion-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'docs/config/documentation-parity/example.md.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (value !== undefined) fs.writeFileSync(file, JSON.stringify(value));
  return { root, file };
}
const record = () => ({ schemaVersion: 'kubeclaw-documentation-parity-decision.v1',
  source: { originalPath: 'docs/example.md', legacyPath: 'docs/_legacy-source/example.md',
    baselineRevision: 'a'.repeat(40), gitObject: 'b'.repeat(40), extractionDigest: 'c'.repeat(64), classification: 'legacy-extraction-source' },
  claims: [{ disposition: 'mapped', targets: [{ path: 'docs/site/guide.md' }] }] });
const bindings = new Map([['docs/example.md', record().source]]);
const pages = new Set(['docs/site/guide.md', 'docs/site/second.md']);

test('missing and untriaged author records do not become suggestions', t => {
  for (const value of [undefined, { schemaVersion: 'kubeclaw-documentation-parity-untriaged.v1' }]) {
    const { root } = setup(t, value);
    assert.equal(authoredParitySuggestion(root, 'docs/example.md', pages, bindings), null);
  }
});
test('explicit author targets replace filename guesses without approving anything', t => {
  const input = record(); input.claims[0].targets.push({ path: 'docs/site/second.md' }, { path: 'docs/site/guide.md' });
  const { root, file } = setup(t, input); const before = fs.readFileSync(file);
  const result = authoredParitySuggestion(root, 'docs/example.md', pages, bindings);
  assert.equal(result[0], 'author-parity-proposal');
  assert.equal(result[1], 'docs/site/guide.md; docs/site/second.md');
  assert.match(result[2], /independent content, reference and deletion approval remain required/);
  assert.deepEqual(fs.readFileSync(file), before);
});
test('mismatched source bindings fail rather than silently using a different author', t => {
  const input = record(); input.source.originalPath = 'docs/different.md'; const { root } = setup(t, input);
  assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /source binding/);
});
test('noncanonical targets cannot become blueprint destinations', t => {
  const input = record(); input.claims[0].targets = [{ path: 'docs/internal.md' }]; const { root } = setup(t, input);
  assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /not a canonical page/);
});
test('open claims remain unsuggested and malformed mapped or omitted claims fail', t => {
  for (const disposition of ['open', 'unknown']) {
    const input = record(); input.claims[0].disposition = disposition; const { root } = setup(t, input);
    assert.equal(authoredParitySuggestion(root, 'docs/example.md', pages, bindings), null);
  }
  for (const claim of [{ disposition: 'mapped', targets: [] }, { disposition: 'omitted', targets: [{ path: 'docs/site/guide.md' }] }]) {
    const input = record(); input.claims = [claim]; const { root } = setup(t, input);
    assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /canonical target/);
  }
});
test('all-omitted proposals are still unapproved author suggestions', t => {
  const input = record(); input.claims = [{ disposition: 'omitted', targets: [] }]; const { root } = setup(t, input);
  const result = authoredParitySuggestion(root, 'docs/example.md', pages, bindings);
  assert.equal(result[1], 'Author proposes no canonical replacement'); assert.match(result[2], /approval remain required/);
});
test('traversal and symlink author files are rejected', t => {
  const { root, file } = setup(t, record());
  assert.throws(() => authoredParitySuggestion(root, 'docs/../example.md', pages, bindings), /normalized/);
  fs.renameSync(file, file + '.real'); fs.symlinkSync(file + '.real', file);
  assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /regular author/);
});


test('parent-directory symlinks cannot redirect author metadata lookup', t => {
  const { root, file } = setup(t, record());
  const directory = path.dirname(file);
  fs.renameSync(directory, directory + '.real');
  fs.symlinkSync(directory + '.real', directory, 'dir');
  assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /contains a symlink/);
});

 test('all authoritative source binding fields are enforced', t => {
  for (const key of ['legacyPath', 'baselineRevision', 'gitObject', 'extractionDigest', 'classification']) {
    const input = record(); input.source[key] = 'wrong'; const { root } = setup(t, input);
    assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /source binding/);
  }
});
test('dangling file and parent symlinks fail closed rather than falling back', t => {
  for (const parent of [false, true]) {
    const { root, file } = setup(t, record());
    const target = parent ? path.dirname(file) : file;
    fs.rmSync(target, { recursive: true, force: true }); fs.symlinkSync(target + '.missing', target);
    assert.throws(() => authoredParitySuggestion(root, 'docs/example.md', pages, bindings), /symlink/);
  }
});
