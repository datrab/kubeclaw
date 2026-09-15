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
    const busterPath = path.join(copy, 'docker/Dockerfile.buster-runtime');
    const buster = fs.readFileSync(busterPath, 'utf8');
    assert.match(buster, /^ARG TRIVY_DATABASE_REFRESH=manual$/m);
    assert.match(buster, /^RUN test -n "\$TRIVY_DATABASE_REFRESH" && setpriv /m);
    assert.equal((buster.match(/TRIVY_DATABASE_REFRESH/g) ?? []).length, 2);
    fs.appendFileSync(busterPath, '\nARG TRIVY_DATABASE_REFRESH_VERSION=1.0\n');
    assert.throws(() => versionOutputs(copy), /unmanaged version argument/);
    fs.writeFileSync(busterPath, buster.replace(/^FROM \S+/m, 'FROM ${TRIVY_DATABASE_REFRESH}'));
    assert.throws(() => versionOutputs(copy), /unknown base argument/);
    fs.writeFileSync(busterPath, buster);
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'versions.json'), 'utf8'));
    // A synthetic version tests propagation only; it is never built or declared a real release.
    manifest.openclaw.version = '2099.1.1';
    manifest.redisProduction.chartVersion = '25.99.1';
    manifest.redisProduction.image = `registry-1.docker.io/bitnami/redis:latest@sha256:${'a'.repeat(64)}`;
    manifest.buildArgs.KUBECTL_VERSION = '1.99.9';
    manifest.buildArgs.BUILDKIT_BASE = `moby/buildkit:v99.0.0-rootless@sha256:${'c'.repeat(64)}`;
    manifest.imageOverrides['ops-pod'].HELM_VERSION = 'v3.99.9';
    fs.writeFileSync(path.join(copy, 'versions.json'), JSON.stringify(manifest));
    const before = fs.readFileSync(path.join(copy, 'docker/Dockerfile.prism-agent'), 'utf8');
    assert.throws(() => syncVersions(copy), /Version drift/);
    assert.equal(fs.readFileSync(path.join(copy, 'docker/Dockerfile.prism-agent'), 'utf8'), before);
    assert.ok(syncVersions(copy, false).changed.includes('charts/kubeclaw/values.yaml'));
    assert.match(fs.readFileSync(path.join(copy, 'gitops/platform/bootstrap/redis.yaml'), 'utf8'), /targetRevision: 25\.99\.1/);
    assert.ok(fs.readFileSync(path.join(copy, 'gitops/platform/values/redis.yaml'), 'utf8').includes(`digest: sha256:${'a'.repeat(64)}`));
    assert.equal(JSON.parse(fs.readFileSync(path.join(copy, 'versions.json'), 'utf8')).infrastructureCharts.redis.version, manifest.infrastructureCharts.redis.version);
    const deploy = fs.readFileSync(path.join(copy, 'scripts/deploy.sh'), 'utf8');
    assert.ok(deploy.includes(`BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="${'${BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE:-'}${manifest.buildArgs.BUILDKIT_BASE}}"`));
    assert.ok(fs.readFileSync(path.join(copy, 'docker/Dockerfile.buster-runtime'), 'utf8')
      .includes(`ARG BUILDKIT_BASE=${manifest.buildArgs.BUILDKIT_BASE}`));
    for (const role of ['nova', 'prism-agent', 'buster-gateway']) {
      const dockerfile = fs.readFileSync(path.join(copy, `docker/Dockerfile.${role}`), 'utf8');
      assert.ok(dockerfile.includes('openclaw:2099.1.1@sha256:'));
      assert.ok(dockerfile.includes('ARG OPENCLAW_PLUGIN_VERSION=2099.1.1'));
    }
    assert.ok(fs.readFileSync(path.join(copy, 'charts/kubeclaw/values.yaml'), 'utf8').includes('npm:@openclaw/acpx@2099.1.1'));
    const policy = fs.readFileSync(path.join(copy, 'charts/kubeclaw/files/config/lint-policy.json'), 'utf8');
    assert.ok(policy.includes('"kubernetes_version": "1.99.9"'));
    assert.ok(policy.includes('/v1.99.9-standalone-strict/'));
    const opsWorkflow = fs.readFileSync(path.join(copy, '.github/workflows/build-ops-mcp.yaml'), 'utf8');
    assert.equal((opsWorkflow.match(/^          version: v3\.99\.9$/gm) ?? []).length, 2);
    fs.writeFileSync(path.join(copy, '.github/workflows/build-ops-mcp.yaml'), opsWorkflow.replace('          version: v3.99.9', '          removed: true'));
    assert.throws(() => versionOutputs(copy), /version field missing or ambiguous/);
    fs.writeFileSync(path.join(copy, '.github/workflows/build-ops-mcp.yaml'), opsWorkflow);
    assert.deepEqual(syncVersions(copy).changed, []);
    assert.deepEqual(syncVersions(copy, false).changed, []);
    manifest.imageOverrides['buster-runtime'].BUILDKIT_BASE = `moby/buildkit:v99.1.0-rootless@sha256:${'d'.repeat(64)}`;
    fs.writeFileSync(path.join(copy, 'versions.json'), JSON.stringify(manifest));
    syncVersions(copy, false);
    const effectiveBuildkit = manifest.imageOverrides['buster-runtime'].BUILDKIT_BASE;
    assert.ok(fs.readFileSync(path.join(copy, 'scripts/deploy.sh'), 'utf8')
      .includes(`BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE="${'${BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE:-'}${effectiveBuildkit}}"`));
    assert.ok(fs.readFileSync(path.join(copy, 'docker/Dockerfile.buster-runtime'), 'utf8')
      .includes(`ARG BUILDKIT_BASE=${effectiveBuildkit}`));
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
