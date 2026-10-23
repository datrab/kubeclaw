import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {channel} from 'node:diagnostics_channel';
import {exposureAPI} from './tailscale-api-fixture.mjs';
import {TailscaleExposureCapabilityInvoker} from '../../../skills/buster/engine/test-gates/tailscale-exposure-runtime.ts';
import {observedExposureHandoff} from '../../../skills/buster/engine/test-gates/exposure-handoff.ts';
import {provider} from '../../../skills/buster/plugins/tailscale-exposure/src/provider.js';

test('original provider and kubectl transfer pending exposure ownership without extending its lease',async(t)=>{
 const started=performance.now();const events=[];
 const record=event=>{if(events.length===150)events.shift();events.push({atMs:Math.round(performance.now()-started),...event});};
 const children=channel('child_process');
 const observeChild=({process:child})=>{
  const began=performance.now();const entry={event:'child-created'};record(entry);
  child.once('spawn',()=>record({event:'child-spawn',executable:child.spawnfile,verb:child.spawnargs?.[1]}));
  child.once('error',error=>record({event:'child-error',code:error.code,elapsedMs:Math.round(performance.now()-began)}));
  child.once('close',(code,signal)=>record({event:'child-close',executable:child.spawnfile,code,signal,elapsedMs:Math.round(performance.now()-began)}));
 };
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demo-handoff-'));const api=await exposureAPI(root,{onRequest:record});
 let kubectl;
 children.subscribe(observeChild);
 const original=process.env.KUBECONFIG;process.env.KUBECONFIG=api.config;
 try{
  kubectl=execFileSync('which',['kubectl'],{encoding:'utf8'}).trim();
  const expiresAt=new Date(Date.now()+3600_000).toISOString();api.state.lease.status.expiresAt=expiresAt;
  Object.assign(api.state.lease.spec,{ttlSeconds:3600,cleanupPolicy:'retain',verifiedImage:`registry.example/app@sha256:${'a'.repeat(64)}`,manifestDigest:`sha256:${'b'.repeat(64)}`});
  const options={shortCommandTimeoutMs:15000,maximumCommandOutputBytes:1048576,processInputPolicy:{ cleanupTimeoutMs: 1500, terminationGraceMs: 250, acknowledgementPollMs: 10 },kubectlExecutable:kubectl,controllerNamespace:'kubeclaw',leaseApiGroup:'kubeclaw.forgestack.ai',leaseApiVersion:'v1alpha1',allowedNamespacePrefixes:['test'],allowedHostSuffixes:['.ts.net'],maximumExecutionMs:10_000,pollIntervalMs:10};
  let runtime=new TailscaleExposureCapabilityInvoker(options);
  const context={invoke:(capability,request)=>runtime.invoke(capability,request,new AbortController().signal),log:()=>{}};
  const invocation={attemptId:'attempt:demo-one',timeoutMs:5000,configuration:{values:{path:'/current',retentionMode:'await-readiness'}},inputs:[{name:'deployment',kind:'value',schemaId:'kubeclaw.kubernetes-deployment-fixture@1',value:{schemaVersion:'kubernetes-deployment-fixture.v1',leaseName:'preview-one',namespace:'test-one',expiresAt,endpoints:[{name:'web',url:'http://web.test-one.svc.cluster.local:80'}]}}]};
  const originalProvider=provider();const result=await originalProvider.execute(invocation,context);const exposure=result.outputs[0].value;
  assert.equal(exposure.handoff.phase,'awaiting-readiness');assert.equal(exposure.handoff.leaseUID,'lease-uid');assert.equal(exposure.expiresAt,expiresAt);
  assert.equal(exposure.handoff.exposureGeneration,api.state.lease.metadata.generation);assert.equal(exposure.handoff.exposureGeneration,api.state.lease.status.exposureGeneration);
  assert.equal(api.state.lease.spec.ttlSeconds,3600);assert.equal(api.state.lease.status.expiresAt,expiresAt);
  const patches=api.state.patches.length;await originalProvider.cleanup(invocation,context);
  assert.equal(api.state.patches.length,patches,'old attempt cleanup cannot release handed-off exposure');assert.equal(api.state.lease.spec.exposure.provider,'tailscale-ingress');
  runtime=new TailscaleExposureCapabilityInvoker(options);
  const replay=await originalProvider.execute(invocation,context);assert.deepEqual(replay.outputs,result.outputs);assert.equal(api.state.patches.length,patches);
  const altered=structuredClone(invocation);altered.configuration.values.retentionMode='release';
  await assert.rejects(originalProvider.execute(altered,context),/HANDOFF_SOURCE_REQUEST_CHANGED/);assert.equal(api.state.patches.length,patches);
  api.state.lease.status.exposureGeneration-=1;
  assert.throws(()=>observedExposureHandoff(api.state.lease,{owner:exposure.handoff.sourceOwner,request:exposure.handoff.sourceRequest}),/OBSERVED_GENERATION_REQUIRED/);assert.equal(api.state.patches.length,patches);
  api.state.lease.status.exposureGeneration+=1;
  api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/readiness-handoff']='{}';
  await assert.rejects(originalProvider.execute(invocation,context),/HANDOFF_RECORD_INVALID|HANDOFF_RECORD_CHANGED/);
  assert.equal(api.state.patches.length,patches);assert.equal(api.state.lease.status.expiresAt,expiresAt);
 }catch(error){
  children.unsubscribe(observeChild);
  let identity;
  try{identity=execFileSync(kubectl,['version','--client','-o','json'],{encoding:'utf8',timeout:1000,maxBuffer:65536});}
  catch(probeError){identity={code:probeError.code,message:'client identity unavailable'};}
  t.diagnostic(JSON.stringify({diagnostic:'demo-handoff-failure',node:process.version,platform:process.platform,arch:process.arch,kubectl:identity,events}));
  throw error;
 }finally{children.unsubscribe(observeChild);if(original===undefined)delete process.env.KUBECONFIG;else process.env.KUBECONFIG=original;await api.close();fs.rmSync(root,{recursive:true,force:true});}
});
