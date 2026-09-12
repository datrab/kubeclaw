import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { renderRegistryLocal } from '../../../scripts/render-registry-local.mjs';

const binary = process.env.KUBECLAW_REGISTRY_BINARY;
if (!binary || !path.isAbsolute(binary)) throw new Error('Set KUBECLAW_REGISTRY_BINARY to the original Distribution 3.0.0 binary');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('original Distribution persists digest-only manifests and sweeps only unreferenced blobs', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-native-'));
  let child, exited;
  let logs = '';
  const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const docs = renderRegistryLocal({ capacity: '8Gi', storageClassName: 'test-csi' });
  const config = parse(docs.find(doc => doc.kind === 'ConfigMap').data['config.yml']);
  config.storage.filesystem.rootdirectory = path.join(root, 'data');
  config.http.addr = `127.0.0.1:${port}`;
  const configFile = path.join(root, 'config.yml'); fs.writeFileSync(configFile, stringify(config));
  const request = async (url, options = {}) => fetch(url.startsWith('/') ? `${base}${url}` : url, { ...options, signal: AbortSignal.timeout(5000) });
  async function start() {
    child = spawn(binary, ['serve', configFile], { env: { ...process.env, OTEL_TRACES_EXPORTER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
    exited = once(child, 'exit');
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Registry exited: ${logs}`);
      try { const response = await request('/v2/'); await response.arrayBuffer(); if (response.status === 200) return; } catch { /* bounded startup */ }
      await delay(50);
    }
    throw new Error(`Registry did not become ready: ${logs}`);
  }
  async function stop() { if (child && child.exitCode === null) { child.kill('SIGTERM'); await exited; } child = undefined; }
  async function blob(bytes) {
    const first = await request('/v2/retained/blobs/uploads/', { method: 'POST' });
    assert.equal(first.status, 202); await first.arrayBuffer();
    const location = new URL(first.headers.get('location'), base); location.searchParams.set('digest', digest(bytes));
    const uploaded = await request(location.href, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(uploaded.status, 201, await uploaded.text()); return digest(bytes);
  }
  const objectPath = hash => path.join(root, 'data/docker/registry/v2/blobs/sha256', hash.slice(7, 9), hash.slice(7), 'data');
  try {
    await start();
    const shared = Buffer.from('shared layer'), old = Buffer.from('retained old layer'), fresh = Buffer.from('new layer');
    const cfg = Buffer.from(JSON.stringify({ architecture: 'amd64', os: 'linux', rootfs: { type: 'layers', diff_ids: [] } }));
    const configDigest = await blob(cfg);
    const orphanBytes = Buffer.alloc(65536, 17); const orphan = await blob(orphanBytes);
    const manifests = [];
    for (const layer of [old, fresh]) {
      const layers = [];
      for (const bytes of [shared, layer]) layers.push({ mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', digest: await blob(bytes), size: bytes.length });
      const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
        config: { mediaType: 'application/vnd.docker.container.image.v1+json', digest: configDigest, size: cfg.length }, layers });
      const put = await request('/v2/retained/manifests/latest', { method: 'PUT', headers: { 'Content-Type': 'application/vnd.docker.distribution.manifest.v2+json' }, body: manifest });
      assert.equal(put.status, 201, await put.text()); manifests.push(manifest);
    }
    const denied = await request(`/v2/retained/manifests/${digest(manifests[0])}`, { method: 'DELETE' });
    assert.equal(denied.status, 405, await denied.text());
    await stop();
    const before = fs.readFileSync(objectPath(orphan));
    const runGc = dry => {
      const result = spawnSync(binary, ['garbage-collect', ...(dry ? ['--dry-run'] : []), configFile], { env: { ...process.env, OTEL_TRACES_EXPORTER: 'none' }, encoding: 'utf8', timeout: 15000 });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); return result.stdout;
    };
    runGc(true); assert.deepEqual(fs.readFileSync(objectPath(orphan)), before);
    runGc(false); assert.equal(fs.existsSync(objectPath(orphan)), false);
    await start();
    for (const manifest of manifests) {
      const response = await request(`/v2/retained/manifests/${digest(manifest)}`, { headers: { Accept: 'application/vnd.docker.distribution.manifest.v2+json' } });
      assert.equal(response.status, 200); assert.equal(await response.text(), manifest);
    }
    for (const bytes of [cfg, shared, old, fresh]) {
      const response = await request(`/v2/retained/blobs/${digest(bytes)}`); assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    console.log(JSON.stringify({ orphanBlobBytesReleased: orphanBytes.length, retainedManifestCount: manifests.length, retainedBlobCount: 4, restart: true }));
  } finally { await stop(); fs.rmSync(root, { recursive: true, force: true }); }
});
