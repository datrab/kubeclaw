import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isImageInput, isDeploymentInput, inputDigest } from '../../../scripts/updates/runtime-inputs.mjs';

test('locked input installers and their locks trigger image and deployment selection', () => {
  for (const file of ['scripts/browser-archive-lock.mjs', 'scripts/trivy-database-lock.mjs',
    'docker/browser-archives.lock.json', 'docker/trivy-databases.lock.json']) {
    assert.equal(isImageInput(file), true, file);
    assert.equal(isDeploymentInput(file), true, file);
  }
});

test('real Git input identities change for installer code and authored archive identities', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-input-locks-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  const commit = () => {
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'input identity');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  const versions = { openclaw: {}, buildArgs: {}, imageOverrides: {}, platformCharts: {}, trivyDatabases: {}, browserArchives: {} };
  write('versions.json', JSON.stringify(versions));
  let previous = commit();
  for (const field of ['trivyDatabases', 'browserArchives']) {
    // Only the authored input changes. Even an unregenerated lock must trigger
    // the build/check path, where version drift can be rejected explicitly.
    versions[field] = { selectedFixtureIdentity: 'sha256:' + 'a'.repeat(64) };
    write('versions.json', JSON.stringify(versions));
    const current = commit();
    for (const predicate of [isImageInput, isDeploymentInput]) {
      assert.notEqual(inputDigest(root, previous, predicate), inputDigest(root, current, predicate), field);
    }
    previous = current;
  }
  for (const file of ['scripts/browser-archive-lock.mjs', 'scripts/trivy-database-lock.mjs']) {
    write(file, '// original installer fixture\n'); const original = commit();
    write(file, '// changed installer fixture\n'); const changed = commit();
    assert.notEqual(inputDigest(root, original, isImageInput), inputDigest(root, changed, isImageInput), file);
    fs.unlinkSync(path.join(root, file)); const removed = commit();
    assert.notEqual(inputDigest(root, changed, isImageInput), inputDigest(root, removed, isImageInput), `deleted ${file}`);
    previous = removed;
  }
  versions.platformCharts = { spire: { version: 'fixture-infrastructure-only' } };
  write('versions.json', JSON.stringify(versions)); const infrastructure = commit();
  assert.equal(inputDigest(root, previous, isImageInput), inputDigest(root, infrastructure, isImageInput),
    'unrelated infrastructure-only version changes still reuse runtime images');
});
