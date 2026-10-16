import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_CORE_POLICY } from '../../fixtures/core-runtime-policy.mjs';
import { captureCoreRuntimePolicy } from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import { selectedAdapterConfigurations } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { activate } from '../../../skills/common/plugins/command-runner/src/adapter.ts';
const id='kubeclaw.command-runner:command',executable=fs.realpathSync(process.execPath);
const base={allowedExecutables:[executable],allowedWorkingRoots:[os.tmpdir()],maxOutputBytes:4096,maxExecutionMs:300,terminationGraceMs:60};
test('selected cleanup A/B reaches real stubborn process termination and remains captured',async t=>{
 const selected=(cleanupPollIntervalMs,exitAcknowledgementMs)=>selectedAdapterConfigurations({[id]:base},captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandProcessCleanup:{cleanupPollIntervalMs,exitAcknowledgementMs,sandboxMinimumGraceMs:250}}))[id];
 const original=setTimeout,delays=[];
 const timer=t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{delays.push(ms);return original(fn,ms,...args);});
 for(const poll of [3,7]){
  const config={...selected(poll,1300)},adapter=activate({config});
  config.cleanupPollIntervalMs=29;config.exitAcknowledgementMs=1;
  const start=delays.length;
  try {
   await adapter.invoke({confidential:true,signal:new AbortController().signal,request:{capability:'command.execute',operation:'run',resource:{type:'command.executable',canonicalId:executable},payload:{workingDirectory:os.tmpdir(),args:['-e',"const cp=require('node:child_process');const child=cp.spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)\"],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>{child.stdout.destroy();child.unref();});"]}}});
   assert.ok(delays.slice(start).includes(poll),'real cleanup polls use captured original selection');
   assert.ok(!delays.slice(start).includes(29),'caller mutation cannot change running policy');
  }finally{await adapter.shutdown();}
 }
 timer.mock.restore();
});
test('cleanup author is required, closed and timer safe; platform cannot duplicate it',()=>{
 const selected=selectedAdapterConfigurations({[id]:base},TEST_CORE_POLICY)[id];
 for(const field of ['cleanupPollIntervalMs','exitAcknowledgementMs','sandboxMinimumGraceMs']){
  for(const value of [undefined,0,-1,1.5,'10',2147483648])assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandProcessCleanup:{...TEST_CORE_POLICY.commandProcessCleanup,[field]:value}}),/INVALID/);
  assert.throws(()=>activate({config:{...selected,[field]:undefined}}),/positive integer/);
  assert.throws(()=>selectedAdapterConfigurations({[id]:{...base,[field]:10}},TEST_CORE_POLICY),/COMMAND_CLEANUP_POLICY_COMPETING_AUTHOR/);
 }
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandProcessCleanup:undefined}),/INVALID/);
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,commandProcessCleanup:{...TEST_CORE_POLICY.commandProcessCleanup,extra:1}}),/INVALID/);
});
