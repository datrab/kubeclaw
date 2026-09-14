import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const source = path.join(root, 'ops/pod/kubectl-build');
const selected = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8')).imageOverrides['ops-pod'].KUBECTL_VERSION;
const check = (version, cwd = source) => spawnSync('sh', ['verify-version.sh', version], { cwd, encoding: 'utf8' });

test('resolved kubectl source agrees with its advertised release and rejects patch/minor drift', () => {
  const valid = check(selected);
  assert.equal(valid.status, 0, valid.stderr || String(valid.error));
  const [major, minor, patch] = selected.split('.');
  for (const version of [`${major}.${minor}.${Number(patch) + 1}`, `${major}.${Number(minor) + 1}.${patch}`]) {
    const mismatch = check(version);
    assert.equal(mismatch.status, 1, mismatch.stderr);
    assert.match(mismatch.stderr, /kubectl source\/version mismatch/);
  }
});

test('a Go replacement cannot pass the kubectl source version check', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'kubectl-replaced-'));
  try {
    for (const file of ['go.mod', 'go.sum', 'verify-version.sh']) fs.copyFileSync(path.join(source, file), path.join(copy, file));
    const moduleVersion = selected.replace(/^v1\./, 'v0.');
    // Real Go module resolution, even when the replacement names the same release.
    execFileSync('go', ['mod', 'edit', `-replace=k8s.io/kubectl=k8s.io/kubectl@${moduleVersion}`], { cwd: copy });
    const replaced = check(selected, copy);
    assert.equal(replaced.status, 1, replaced.stderr);
    assert.match(replaced.stderr, /kubectl source\/version mismatch: k8s.io\/kubectl .* replaced/);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});

test('Renovate pins every release-coupled module to the selected patch in the Ops module only', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'renovate.json'), 'utf8'));
  const rule = config.packageRules.find(item => item.matchFileNames?.includes('ops/pod/kubectl-build/go.mod'));
  assert.deepEqual(rule.matchManagers, ['gomod']);
  assert.equal(rule.allowedVersions, selected.replace(/^v1\./, '0.'));
  const release = new RegExp(`^\\s*(k8s\\.io/\\S+) v0\\.${selected.split('.')[1]}\\.\\d+(?:\\s|$)`, 'gm');
  const modules = [...fs.readFileSync(path.join(source, 'go.mod'), 'utf8').matchAll(release)].map(match => match[1]);
  assert.equal(modules.length, 8);
  assert.deepEqual([...rule.matchPackageNames].sort(), modules.sort());
});
