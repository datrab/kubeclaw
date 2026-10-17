import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readTestPipeline, writeTestPipeline} from '../../../../tests/fixtures/config/pipeline-components.mjs';
import {preparePrismProcessPublication, spawnInstalledPrismProcess} from '../../../../skills/prism/tests/fixtures/published-process.mjs';
assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, undefined);
await assert.rejects(() => spawnInstalledPrismProcess({after(){assert.fail('no admission');}}, '/absent/pipeline.config.json', 'prism-worker', {}), /explicit isolated process test guest/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'listener-publication-'));
try {
  const entry = path.join(root, 'source/pipeline.config.json');
  const docs = readTestPipeline(); writeTestPipeline(entry, docs);
  const valid = await preparePrismProcessPublication(entry, 'prism-worker');
  try {
    const boot = await import(pathToFileURL(path.join(valid.code, 'skills/packages/plugin-foundation/config/pipeline-boot.mjs')));
    const consumer = await import(pathToFileURL(path.join(valid.code, 'skills/packages/prism-engine/server/worker-config.ts')));
    const capture = boot.capturePipelineBootReceipts(valid.mount, valid.system, 'prism-worker', valid.code, '/app/prism/skills');
    for (const PORT of ['', '8080']) assert.throws(() => consumer.loadWorkerConfig(capture, {PORT,WORKER_TRUST_SPIFFE_ENABLED:'true',PRISM_TRUSTED_CONTROL_SPIFFE_ID:'spiffe://listener/control'}), /SWARM_CONFIG_LEGACY_OVERRIDE:PORT/);
    const binding = docs.entry.bindings.find(b => b.owner === 'prism-worker' && b.instanceId === 'kubeclaw/prism/prism-worker');
    assert.ok(binding);
    const ingress = docs['prism-worker'].profiles[binding.profileId].settings.ingress;
    const port = ingress.port;
    for (const invalid of [undefined, 0, 65536]) {
      ingress.port = invalid; writeTestPipeline(entry, docs);
      await assert.rejects(() => preparePrismProcessPublication(entry, 'prism-worker', valid.code), /SWARM_CONFIG_INVALID/);
      console.log(`PASS actual selected-author invalid port ${String(invalid)} rejected BEFORE publication; not entrypoint execution`);
    }
    ingress.port = port; writeTestPipeline(entry, docs);
    const restored = await preparePrismProcessPublication(entry, 'prism-worker', valid.code);
    fs.rmSync(restored.root,{recursive:true,force:true});
    console.log('PASS restored actual publication; both original PORT values rejected by authentic immutable consumer; isolated guest guard enforced');
  } finally {fs.rmSync(valid.root,{recursive:true,force:true});}
} finally {fs.rmSync(root,{recursive:true,force:true});}
