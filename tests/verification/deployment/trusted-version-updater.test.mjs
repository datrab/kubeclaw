import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { versionOutputs } from '../../../scripts/versions.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

test('the actual trusted updater runs from an isolated read-only module set without workspace scripts or npm dependencies', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-trusted-updater-'));
  const repository = path.join(temporary, 'repository');
  const trusted = path.join(temporary, 'trusted');
  try {
    for (const file of ['versions.json', 'package-lock.json', ...versionOutputs(root).keys()]) {
      const target = path.join(repository, file);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target);
    }
    for (const name of ['python-tools', 'go-tools', 'runtime-tool-locks.json']) {
      fs.cpSync(path.join(root, 'docker', name), path.join(repository, 'docker', name), { recursive: true });
    }
    fs.mkdirSync(path.join(trusted, 'updates'), { recursive: true });
    for (const file of ['versions.mjs', 'infrastructure-chart-lock.mjs', 'runtime-tool-locks.mjs', 'browser-archive-lock.mjs', 'trivy-database-lock.mjs', 'updates/refresh-versions.mjs', 'updates/upstream-fetch.mjs']) {
      const target = path.join(trusted, file);
      fs.copyFileSync(path.join(root, 'scripts', file), target); fs.chmodSync(target, 0o444);
    }
    fs.writeFileSync(path.join(repository, 'scripts/versions.mjs'), 'throw new Error("UNTRUSTED_WORKSPACE_SCRIPT_EXECUTED");\n');
    fs.mkdirSync(path.join(repository, 'scripts/updates'), { recursive: true });
    fs.writeFileSync(path.join(repository, 'scripts/updates/refresh-versions.mjs'), 'throw new Error("UNTRUSTED_WORKSPACE_SCRIPT_EXECUTED");\n');
    for (const args of [['init', '-q'], ['config', 'user.name', 'Trusted updater test'],
      ['config', 'user.email', 'updater@example.invalid'], ['add', '.'], ['commit', '-qm', 'Unchanged input fixture']]) {
      execFileSync('git', args, { cwd: repository, timeout: 30000 });
    }
    fs.chmodSync(path.join(trusted, 'updates'), 0o555); fs.chmodSync(trusted, 0o555);
    assert.equal(fs.existsSync(path.join(temporary, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(repository, 'node_modules')), false);
    const output = execFileSync(process.execPath, [path.join(trusted, 'updates/refresh-versions.mjs')],
      { cwd: repository, encoding: 'utf8', timeout: 30000 });
    assert.match(output, /"changed":\[\]/);
    assert.match(output, /"inputs":4,"locks":5/);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }), '');
  } finally {
    if (fs.existsSync(trusted)) fs.chmodSync(trusted, 0o755);
    if (fs.existsSync(path.join(trusted, 'updates'))) fs.chmodSync(path.join(trusted, 'updates'), 0o755);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});


test('the actual Ops Helm updater pins source bytes without restoring precompiled binary authors', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-helm-source-updater-'));
  try {
    for (const file of ['versions.json', 'package-lock.json', ...versionOutputs(root).keys()]) {
      const target = path.join(temporary, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    for (const name of ['python-tools', 'go-tools', 'runtime-tool-locks.json']) {
      fs.cpSync(path.join(root, 'docker', name), path.join(temporary, 'docker', name), { recursive: true });
    }
    for (const args of [['init', '-q'], ['config', 'user.name', 'Helm updater test'],
      ['config', 'user.email', 'updater@example.invalid'], ['add', '.'], ['commit', '-qm', 'Original source pin']]) {
      execFileSync('git', args, { cwd: temporary, timeout: 30000 });
    }
    const manifestPath = path.join(temporary, 'versions.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.imageOverrides['ops-pod'].HELM_VERSION = 'v3.99.9';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const preload = path.join(temporary, 'upstream-fixture.mjs');
    fs.writeFileSync(preload, `
      import assert from 'node:assert/strict';
      globalThis.fetch = async url => {
        assert.equal(String(url), 'https://codeload.github.com/helm/helm/tar.gz/refs/tags/v3.99.9');
        return new Response('exact Helm source bytes');
      };
    `);
    execFileSync(process.execPath, ['--import', preload, path.join(root, 'scripts/updates/refresh-versions.mjs')],
      { cwd: temporary, timeout: 30000, stdio: 'pipe' });
    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.buildArgs.HELM_SOURCE_SHA256 = createHash('sha256').update('exact Helm source bytes').digest('hex');
    assert.deepEqual(updated, manifest);
    const dockerfile = fs.readFileSync(path.join(temporary, 'ops/pod/Dockerfile'), 'utf8');
    assert.ok(dockerfile.includes('ARG HELM_VERSION=v3.99.9'));
    assert.ok(dockerfile.includes('ARG HELM_SOURCE_SHA256=' + manifest.buildArgs.HELM_SOURCE_SHA256));
    assert.equal('HELM_SHA256_AMD64' in updated.imageOverrides['ops-pod'], false);
    assert.equal('HELM_SHA256_ARM64' in updated.imageOverrides['ops-pod'], false);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
