import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeControlPolicy} from '../../../../skills/prism/tests/fixtures/control-policy.mts';
import {preparePrismProcessPublication, spawnInstalledPrismProcess} from '../../../../skills/prism/tests/fixtures/published-process.mjs';

// The unavailable installed guest is a denial, not a skipped process PASS.
assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, undefined);
await assert.rejects(() => spawnInstalledPrismProcess({after() {assert.fail('no hook before admission');}},
  '/not-a-policy-root/pipeline.config.json', 'prism-control', {}), /explicit isolated process test guest/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'original-control-receiving-'));
try {
  for (const port of [23456, 23457]) {
    const source = path.join(root, String(port)); fs.mkdirSync(source);
    const {SWARM_CONFIG: entry} = writeControlPolicy(source, {port});
    const original = fs.readFileSync(entry);
    const p = await preparePrismProcessPublication(entry, 'prism-control');
    try {
      const boot = await import(pathToFileURL(path.join(p.code, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')));
      const consumer = await import(pathToFileURL(path.join(p.code, 'skills/packages/prism-engine/server/control-config.ts')));
      const load = () => boot.capturePipelineBootReceipts(p.mount, p.system, 'prism-control', p.code, '/app/prism/skills');
      const capture = load();
      const secrets = {PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test', PRISM_INGESTION_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test'};
      assert.equal(consumer.loadControlServerConfig(capture, secrets).port, port);
      assert.equal(fs.readlinkSync(path.join(p.mount, '..data')), 'version-A');
      assert.deepEqual(fs.readFileSync(entry), original);
      for (const member of ['pipeline.config.json', ...fs.readdirSync(path.join(source, 'components')).map(n => `components/${n}`)]) {
        assert.deepEqual(fs.readFileSync(path.join(p.author, member)), fs.readFileSync(path.join(source, member)));
      }
      fs.writeFileSync(entry, '{}');
      assert.equal(consumer.loadControlServerConfig(capture, secrets).port, port);
      const entrypoint = path.join(p.code, 'skills/packages/prism-engine/server/control.ts');
      const bytes = fs.readFileSync(entrypoint);
      try { fs.appendFileSync(entrypoint, '\n// omitted original package identity\n'); assert.throws(load, /RUNTIME_.*(?:MISMATCH|CHANGED)|PIPELINE_.*(?:MISMATCH|CHANGED)/); }
      finally { fs.writeFileSync(entrypoint, bytes); }
      assert.equal(consumer.loadControlServerConfig(load(), secrets).port, port);
      console.log(`PASS authentic publication/source preservation/original consumer/changed-entrypoint rejection/restored positive: ${port}`);
    } finally {fs.rmSync(p.root, {recursive: true, force: true});}
  }
} finally {fs.rmSync(root, {recursive: true, force: true});}
console.log('Installed HTTP/diagnostic-sink/native process execution NOT VERIFIED; no isolated guest.');
