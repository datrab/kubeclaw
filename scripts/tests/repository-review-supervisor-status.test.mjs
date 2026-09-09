import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture } from './fixtures/review-supervisor.mjs';

test('original supervisor fails visibly on unreadable status and accepts a later readable success', t => {
  const f = fixture(t);
  for (const prepare of [() => {}, () => fs.writeFileSync(f.platform, '{broken')]) {
    prepare();
    const result = f.invoke();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /REVIEW_SUPERVISOR_STATUS_FAILED/u);
    assert.equal(result.stdout, '');
    assert.equal(fs.existsSync(f.lease), false);
  }
  f.writePlatform(); f.terminal('succeeded');
  const success = f.invoke();
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).status, 'succeeded');
  assert.equal(fs.existsSync(f.lease), false);
});

test('original supervisor preserves artifact read failure despite a terminal journal', t => {
  const f = fixture(t); f.writePlatform(); f.terminal('succeeded');
  fs.mkdirSync(path.join(f.artifactRoot, 'records'), { recursive: true });
  fs.writeFileSync(path.join(f.artifactRoot, 'records/store.json'), '{broken');
  const result = f.invoke();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REVIEW_SUPERVISOR_STATUS_FAILED/u);
  assert.match(result.stderr, /SyntaxError/u);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(f.lease), false);
});

for (const status of ['failed', 'blocked', 'cancelled']) {
  test(`original supervisor reports confirmed ${status} without claiming success`, t => {
    const f = fixture(t); f.writePlatform(); f.terminal(status);
    const result = f.invoke();
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, status);
    assert.equal(fs.existsSync(f.lease), false);
  });
}

