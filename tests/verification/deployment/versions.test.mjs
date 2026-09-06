import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { syncVersions, versionOutputs } from '../../../scripts/versions.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

test('central versions update actual build/deployment files and reject drift without repairing it', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-versions-'));
  try {
    for (const file of ['versions.json', ...versionOutputs(root).keys()]) {
      fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(copy, file));
    }
    assert.equal(syncVersions(copy).changed.length, 0);
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'versions.json'), 'utf8'));
    // A synthetic version tests propagation only; it is never built or declared a real release.
    manifest.openclaw.version = '2099.1.1';
    manifest.buildArgs.KUBECTL_VERSION = '1.99.9';
    fs.writeFileSync(path.join(copy, 'versions.json'), JSON.stringify(manifest));
    const before = fs.readFileSync(path.join(copy, 'docker/Dockerfile.prism-agent'), 'utf8');
    assert.throws(() => syncVersions(copy), /Version drift/);
    assert.equal(fs.readFileSync(path.join(copy, 'docker/Dockerfile.prism-agent'), 'utf8'), before);
    assert.ok(syncVersions(copy, false).changed.includes('charts/kubeclaw/values.yaml'));
    for (const role of ['nova', 'prism-agent', 'buster-gateway']) {
      const dockerfile = fs.readFileSync(path.join(copy, `docker/Dockerfile.${role}`), 'utf8');
      assert.ok(dockerfile.includes('openclaw:2099.1.1@sha256:'));
      assert.ok(dockerfile.includes('ARG OPENCLAW_PLUGIN_VERSION=2099.1.1'));
    }
    assert.ok(fs.readFileSync(path.join(copy, 'charts/kubeclaw/values.yaml'), 'utf8').includes('npm:@openclaw/acpx@2099.1.1'));
    const policy = fs.readFileSync(path.join(copy, 'charts/kubeclaw/files/config/lint-policy.json'), 'utf8');
    assert.ok(policy.includes('"kubernetes_version": "1.99.9"'));
    assert.ok(policy.includes('/v1.99.9-standalone-strict/'));
    assert.deepEqual(syncVersions(copy).changed, []);
    assert.deepEqual(syncVersions(copy, false).changed, []);
    fs.appendFileSync(path.join(copy, 'docker/Dockerfile.prism-agent'), '\nARG UNMANAGED_VERSION=1.0\n');
    assert.throws(() => syncVersions(copy, false), /unmanaged version argument/);
    fs.writeFileSync(path.join(copy, 'docker/Dockerfile.prism-agent'), before);
    manifest.openclaw.digest = 'sha256:invalid';
    fs.writeFileSync(path.join(copy, 'versions.json'), JSON.stringify(manifest));
    assert.throws(() => syncVersions(copy, false), /Invalid OpenClaw/);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});

test('every central base requires a digest, including non-OpenClaw runtimes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
  for (const [key, value] of Object.entries(manifest.buildArgs)) {
    if (key.endsWith('_BASE')) assert.match(value, /@sha256:[a-f0-9]{64}$/);
  }
  assert.equal(fs.existsSync(path.join(root, 'docker/Dockerfile.general')), false);
});
