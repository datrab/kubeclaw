import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeWorkerShutdownPolicy} from '../../../../skills/prism/tests/fixtures/worker-shutdown-policy.mts';
import {preparePrismProcessPublication, spawnInstalledPrismProcess} from '../../../../skills/prism/tests/fixtures/published-process.mjs';

// The unavailable installed guest is a denial, not a skipped process PASS.
assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, undefined);
await assert.rejects(() => spawnInstalledPrismProcess({after() {assert.fail('no hook before admission');}},
  '/not-a-policy-root/pipeline.config.json', 'prism-worker', {}), /explicit isolated process test guest/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'original-worker-receiving-'));
try {
  let packageRoot;
  for (const [port, shutdown, close, drain, endpoint] of [[23456,1500,1000,100,'http://127.0.0.1:23458/'],[23457,30,20,5,'http://127.0.0.1:1/']]) {
    const source = path.join(root, String(port)); fs.mkdirSync(source);
    const entry = writeWorkerShutdownPolicy(source, shutdown, port, close, drain, endpoint);
    const original = fs.readFileSync(entry);
    const p = await preparePrismProcessPublication(entry, 'prism-worker', packageRoot);
    if (!packageRoot) { packageRoot = path.join(root, 'genuine-role'); fs.cpSync(p.code, packageRoot, {recursive:true, verbatimSymlinks:true}); }
    try {
      const boot = await import(pathToFileURL(path.join(p.code, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')));
      const consumer = await import(pathToFileURL(path.join(p.code, 'skills/packages/prism-engine/server/worker-config.ts')));
      const load = () => boot.capturePipelineBootReceipts(p.mount, p.system, 'prism-worker', p.code, '/app/prism/skills');
      const capture = load();
      const secrets = {WORKER_TRUST_SPIFFE_ENABLED:'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID:'spiffe://local/control', PRISM_WORKER_SECRET:'local', DATABASE_URL:''};
      assert.equal(consumer.loadWorkerConfig(capture, secrets).port, port);
      const settings = consumer.loadWorkerConfig(capture, secrets);
      assert.equal(settings.shutdownTimeoutMs, shutdown);
      assert.equal(settings.native.supervisor.closeTimeoutMs, close);
      assert.equal(settings.native.supervisor.drainTimeoutMs, drain);
      assert.equal(settings.controlInternalUrl.href, endpoint);
      for (const key of ['PRISM_CONTROL_INTERNAL_URL', 'PORT']) {
        assert.throws(() => consumer.loadWorkerConfig(capture, {...secrets, [key]: key === 'PRISM_CONTROL_INTERNAL_URL' ? endpoint : entry}), /SWARM_CONFIG_LEGACY_OVERRIDE/);
      }
      assert.equal(fs.readlinkSync(path.join(p.mount, '..data')), 'version-A');
      assert.deepEqual(fs.readFileSync(entry), original);
      for (const member of ['pipeline.config.json', ...fs.readdirSync(path.join(source, 'components')).map(n => `components/${n}`)]) {
        assert.deepEqual(fs.readFileSync(path.join(p.author, member)), fs.readFileSync(path.join(source, member)));
      }
      fs.writeFileSync(entry, '{}');
      assert.equal(consumer.loadWorkerConfig(capture, secrets).port, port);
      const entrypoint = path.join(p.code, 'skills/packages/prism-engine/server/worker.ts');
      const bytes = fs.readFileSync(entrypoint);
      try { fs.appendFileSync(entrypoint, '\n// omitted original package identity\n'); assert.throws(load, /RUNTIME_.*(?:MISMATCH|CHANGED)|PIPELINE_.*(?:MISMATCH|CHANGED)/); }
      finally { fs.writeFileSync(entrypoint, bytes); }
      assert.equal(consumer.loadWorkerConfig(load(), secrets).port, port);
      const sharedEntrypoint = path.join(packageRoot, 'skills/packages/prism-engine/server/worker.ts');
      const sharedBytes = fs.readFileSync(sharedEntrypoint);
      try {
        fs.appendFileSync(sharedEntrypoint, '\n// actual changed shared package byte\n');
        // Restore original source so rejection cannot be credited to malformed authors.
        fs.writeFileSync(entry, original);
        await assert.rejects(() => preparePrismProcessPublication(entry, 'prism-worker', packageRoot), /RUNTIME_.*(?:MISMATCH|CHANGED)|PIPELINE_.*(?:MISMATCH|CHANGED)/);
      } finally { fs.writeFileSync(sharedEntrypoint, sharedBytes); }
      const restored = await preparePrismProcessPublication(entry, 'prism-worker', packageRoot);
      fs.rmSync(restored.root, {recursive:true, force:true});
      console.log(`PASS authentic publication/source preservation/original consumer/changed-entrypoint rejection/restored positive: ${port}`);
    } finally {fs.rmSync(p.root, {recursive: true, force: true});}
  }
} finally {fs.rmSync(root, {recursive: true, force: true});}
console.log('Original six installed signal/drain/deadline process cases NOT VERIFIED; no isolated guest.');
