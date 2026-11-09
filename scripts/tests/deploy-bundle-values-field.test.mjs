import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const helper = path.resolve(import.meta.dirname, '../bundle-values-field.mjs');
test('actual bundle YAML helper preserves folded strings, selected-key precedence and fail-closed parse behavior', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-values-field-'));
  const base = path.join(root, 'base.yaml');
  const overlay = path.join(root, 'overlay.yaml');
  const run = (text, field = 'archiveUrl', key) => {
    fs.writeFileSync(overlay, text);
    return spawnSync(process.execPath, [helper, base, overlay, field, ...(key ? [key] : [])], { encoding: 'utf8' });
  };
  try {
    fs.writeFileSync(base, 'codeBundle:\n  archiveUrl: https://base.example/archive.tar.gz\n  auth:\n    existingSecret: base-secret\n');
    const folded = run('codeBundle:\n  archiveUrl: >-\n    https://overlay.example/\n    archive.tar.gz\n');
    assert.equal(folded.status, 0);
    assert.equal(folded.stdout, 'https://overlay.example/ archive.tar.gz\n');
    for (const empty of ['null', '""']) {
      const value = run(`codeBundle:\n  archiveUrl: ${empty}\n`);
      assert.equal(value.status, 0);
      assert.equal(value.stdout, 'https://base.example/archive.tar.gz\n');
    }
    const selected = run('codeBundle:\n  auth:\n    existingSecret: overlay-secret\n', 'auth', 'existingSecret');
    assert.equal(selected.status, 0);
    assert.equal(selected.stdout, 'overlay-secret\n');
    const absent = run('codeBundle: {}\n', 'missing');
    assert.equal(absent.status, 0);
    assert.equal(absent.stdout, '');
    const wrongType = run('codeBundle:\n  archiveUrl: 123\n');
    assert.notEqual(wrongType.status, 0);
    assert.equal(wrongType.stdout, '');
    assert.match(wrongType.stderr, /Bundle field must be a string/);
    const malformed = run('codeBundle: [\n');
    assert.notEqual(malformed.status, 0);
    assert.equal(malformed.stdout, '');
    assert.match(malformed.stderr, /YAMLException/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
