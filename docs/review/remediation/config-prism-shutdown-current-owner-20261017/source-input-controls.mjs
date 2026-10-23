import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const at = name => pathToFileURL(path.resolve(name)).href;
const { writeWorkerShutdownPolicy } = await import(at('skills/prism/tests/fixtures/worker-shutdown-policy.mts'));
const { readTestPipeline, writeTestPipeline } = await import(at('tests/fixtures/config/pipeline-components.mjs'));
const { captureSwarmSettings } = await import(at('skills/common/plugin-runtime/foundation/config/swarm.ts'));
const original = readTestPipeline();
const instanceId = 'kubeclaw/prism/prism-worker';
const selection = { role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
  bindings: original.entry.bindings.filter(row => row.instanceId === instanceId).map(({role, ...row}) => row) };
const workerBinding = selection.bindings.find(row => row.owner === 'prism-worker');
assert.ok(workerBinding);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-shutdown-owner-'));
const capture = file => captureSwarmSettings(file, selection).components['prism-worker'].settings;
try {
  const aFile = writeWorkerShutdownPolicy(path.join(root,'A'),1500,23456,1000,100);
  const a = capture(aFile);
  assert.equal(a.ingress.shutdownTimeoutMs,1500); assert.equal(a.ingress.port,23456);
  assert.equal(a.supervisor.closeTimeoutMs,1000); assert.equal(a.supervisor.drainTimeoutMs,100);
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.ingress)); assert.ok(Object.isFrozen(a.supervisor));
  const bFile = writeWorkerShutdownPolicy(path.join(root,'B'),30,23457,20,5);
  const b = capture(bFile);
  assert.equal(b.ingress.shutdownTimeoutMs,30); assert.equal(b.ingress.port,23457);
  assert.equal(b.supervisor.closeTimeoutMs,20); assert.equal(b.supervisor.drainTimeoutMs,5);
  const expected = structuredClone(original);
  const settings = expected['prism-worker'].profiles[workerBinding.profileId].settings;
  Object.assign(settings.ingress,{shutdownTimeoutMs:1500,port:23456});
  Object.assign(settings.supervisor,{closeTimeoutMs:1000,drainTimeoutMs:100});
  assert.deepEqual(readTestPipeline(aFile),expected,'all other owners, profiles, bindings and settings unchanged');
  assert.equal(a.ingress.port,23456,'B must not change A snapshot');
  const invalid = readTestPipeline(bFile);
  delete invalid['prism-worker'].profiles[workerBinding.profileId].settings.supervisor.drainTimeoutMs;
  writeTestPipeline(bFile,invalid);
  assert.throws(()=>capture(bFile),/SWARM_CONFIG_INVALID/);
  writeWorkerShutdownPolicy(path.join(root,'B'),30,23457,20,5);
  assert.deepEqual(capture(bFile),b,'restored B');
  assert.deepEqual(readTestPipeline(),original,'central original author not modified');
  console.log(JSON.stringify({status:'PASS_SOURCE_ONLY',coupledProfiles:2,authoredLeavesPerProfile:4,
    completeFileSetUnchangedOutsideLeaves:true,immutableCapture:true,missingLeafRejected:true,restoredPositive:true,
    nativeExecuted:false,bootAuthenticated:false,fullAcceptance:'OPEN'},null,2));
} finally { fs.rmSync(root,{recursive:true,force:true}); }
