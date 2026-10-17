import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const moduleAt = name => pathToFileURL(path.resolve(name)).href;
const { captureNativePreparationSettings } = await import(moduleAt('tests/fixtures/test-gate/native-preparation.mts'));
const { canonicalPipelineEntry, readTestPipeline, writeTestPipeline, busterRuntimeSelection } =
  await import(moduleAt('tests/fixtures/config/pipeline-components.mjs'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-central-owner-'));
try {
  const original = readTestPipeline();
  const binding = busterRuntimeSelection(original).bindings.find(row => row.owner === 'buster-engine');
  assert.ok(binding);
  const a = captureNativePreparationSettings(canonicalPipelineEntry);
  assert.deepEqual(a, original['buster-engine'].profiles[binding.profileId].settings.preparation);
  assert.ok(Object.isFrozen(a));
  const modified = structuredClone(original);
  modified['buster-engine'].profiles[binding.profileId].settings.preparation.maximumRecords = 2;
  const bFile = path.join(root, 'B', 'pipeline.config.json');
  writeTestPipeline(bFile, modified);
  const b = captureNativePreparationSettings(bFile);
  assert.equal(b.maximumRecords, 2);
  assert.deepEqual(b, { ...a, maximumRecords: 2 });
  assert.equal(a.maximumRecords, original['buster-engine'].profiles[binding.profileId].settings.preparation.maximumRecords);
  const inactive = Object.keys(modified['buster-engine'].profiles).find(id => id !== binding.profileId);
  assert.ok(inactive);
  modified['buster-engine'].profiles[inactive].settings.preparation.maximumRecords = 3;
  writeTestPipeline(bFile, modified);
  assert.deepEqual(captureNativePreparationSettings(bFile), b, 'valid inactive profile cannot replace actual runtime selection');
  modified['buster-engine'].profiles[inactive].settings.preparation.maximumRecords = 0;
  writeTestPipeline(bFile, modified);
  assert.throws(() => captureNativePreparationSettings(bFile), 'invalid inactive profile must reject whole-author capture');
  writeTestPipeline(bFile, original);
  assert.deepEqual(captureNativePreparationSettings(bFile), a, 'restored complete A');
  const missing = structuredClone(original);
  missing.entry.bindings = missing.entry.bindings.filter(row => row.owner !== 'buster-engine' || row.instanceId !== binding.instanceId);
  writeTestPipeline(bFile, missing);
  assert.throws(() => captureNativePreparationSettings(bFile), 'no missing-binding fallback');
  assert.throws(() => captureNativePreparationSettings(path.resolve('charts/kubeclaw/files/config/swarm.config.json')),
    'retired flat author cannot replace current central root');
  console.log(JSON.stringify({ status: 'SOURCE_INPUT_CONTROLS_PASS', actualSelectedProfile: binding.profileId,
    nativeExecuted: false, nativeAcceptance: 'OPEN', productiveBootAuthenticated: false,
    controls: ['complete A', 'immutable capture', 'quota B exactly two records', 'A unchanged',
      'valid inactive cannot replace selection', 'invalid inactive rejected', 'restored A', 'missing binding rejected', 'retired author rejected'] }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
