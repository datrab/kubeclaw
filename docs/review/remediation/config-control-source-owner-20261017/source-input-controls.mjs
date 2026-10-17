import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const at = name => pathToFileURL(path.resolve(name)).href;
const { writeControlPolicy } = await import(at('skills/prism/tests/fixtures/control-policy.mts'));
const { readTestPipeline, writeTestPipeline } = await import(at('tests/fixtures/config/pipeline-components.mjs'));
const { captureSwarmSettings } = await import(at('skills/common/plugin-runtime/foundation/config/swarm.ts'));
const original = readTestPipeline();
const instanceId = 'kubeclaw/prism/prism-control';
const selection = { role: 'prism', callerId: 'prism-control', serviceInstanceId: instanceId,
  bindings: original.entry.bindings.filter(row => row.instanceId === instanceId).map(({role, ...row}) => row) };
const binding = selection.bindings.find(row => row.owner === 'prism-control');
assert.ok(binding);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-source-owner-'));
const capture = file => captureSwarmSettings(file, selection).components['prism-control'].settings;
try {
  const aFile = writeControlPolicy(path.join(root,'A'),{port:23456}).SWARM_CONFIG;
  const a = capture(aFile);
  const bFile = writeControlPolicy(path.join(root,'B'),{port:23457}).SWARM_CONFIG;
  const b = capture(bFile);
  assert.equal(a.port,23456); assert.equal(b.port,23457);
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(b));
  const expected = structuredClone(original);
  expected['prism-control'].profiles[binding.profileId].settings.port = 23456;
  assert.deepEqual(readTestPipeline(aFile),expected,'complete source file-set equality except explicit port');
  const invalids = [undefined, null, '8080', 0, -1, 1.5, 65536, true];
  for (const port of invalids) {
    const file = writeControlPolicy(path.join(root,'invalid'),{port}).SWARM_CONFIG;
    assert.throws(()=>capture(file),/SWARM_CONFIG_INVALID/);
  }
  const restored = writeControlPolicy(path.join(root,'invalid'),{port:23457}).SWARM_CONFIG;
  assert.deepEqual(capture(restored),b);
  fs.writeFileSync(path.join(root,'A/components/prism-control.config.json'),'{}');
  assert.equal(a.port,23456,'capture survives source mutation');
  assert.deepEqual(readTestPipeline(),original,'central original author unchanged');
  console.log(JSON.stringify({status:'PASS_SOURCE_ONLY',profiles:2,invalidPortsRejected:invalids.length,
    completeFileSetConserved:true,immutableCapture:true,restoredPositive:true,bootAuthenticated:false,
    nativeExecuted:false,fullAcceptance:'OPEN'},null,2));
} finally { fs.rmSync(root,{recursive:true,force:true}); }
