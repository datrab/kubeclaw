import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BrowserVisualCapabilityInvoker, BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'visual-remote-vertical-')); const repository=path.join(root,'repository');
const token='visual-remote-vertical-token-0001'; const keys=crypto.generateKeyPairSync('ed25519');
const privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}); const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const server=http.createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><html><body><main style="width:320px;height:180px"><h1>Visual proof</h1></main></body></html>');});
try{
  for(const directory of ['.swarm/visual','baselines']) fs.mkdirSync(path.join(repository,directory),{recursive:true});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address(); if(!address||typeof address==='string') throw new Error('VISUAL_REMOTE_BIND_FAILED'); const origin=`http://127.0.0.1:${address.port}`;
  const executable='/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'; assert.equal(fs.existsSync(executable),true,'real Chromium required');
  const profile={name:'desktop',browser:'chromium' as const,viewport:{width:640,height:480},colorScheme:'light',reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC',deviceScaleFactor:1,hasTouch:false,isMobile:false};
  const captureInvoker=new BrowserVisualCapabilityInvoker({allowedOrigins:[origin],allowedBrowsers:['chromium'],browserExecutables:{chromium:executable},maximumCombinations:2,maximumConcurrency:1,maximumExecutionMs:60000,maximumResultBytes:33554432,maximumScreenshotBytes:8388608,maximumMasksPerCombination:4});
  const capture:any=await captureInvoker.invoke('browser.visual',{operation:'capture',resource:{type:'network.url',canonicalId:origin},payload:{combinations:[{id:'home',route:'/',profile,masks:[]}],timeoutMs:30000}},new AbortController().signal);
  const image=Buffer.from(capture.results[0].data,'base64'); const imageDigest=`sha256:${crypto.createHash('sha256').update(image).digest('hex')}`;
  fs.writeFileSync(path.join(repository,'baselines/home.png'),image);
  fs.writeFileSync(path.join(repository,'.swarm/visual/profiles.json'),JSON.stringify({schemaVersion:'kubeclaw.browser-profiles.v1',profiles:{desktop:{...profile,name:undefined}}},(_key,value)=>value===undefined?undefined:value));
  const bundleDigest=`sha256:${crypto.createHash('sha256').update(imageDigest).digest('hex')}`;
  fs.writeFileSync(path.join(repository,'.swarm/visual/manifest.json'),JSON.stringify({schemaVersion:'kubeclaw.visual-baselines.v1',baselineBundleDigest:bundleDigest,entries:[{id:'home',route:'/',profile:'desktop',baselineFile:'baselines/home.png',sha256:imageDigest,browser:'chromium',viewport:profile.viewport,pageConditions:{colorScheme:'light',reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC',deviceScaleFactor:1,hasTouch:false,isMobile:false,fullPage:true}}]}));
  execFileSync('git',['-C',repository,'init','-q']);execFileSync('git',['-C',repository,'config','user.email','visual@example.invalid']);execFileSync('git',['-C',repository,'config','user.name','Visual Proof']);execFileSync('git',['-C',repository,'add','.']);execFileSync('git',['-C',repository,'commit','-qm','Visual fixture']);
  const pluginRoot=path.resolve('skills/buster/plugins'); const registry=buildRegistry(discoverPackages({installationRoots:[pluginRoot],trustPolicy:{trustedBuiltinRoots:[pluginRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'visual-remote-vertical'}}));
  const limits={cpuMillis:120000,memoryBytes:1073741824,logBytes:1048576,artifactBytes:67108864,artifactFiles:32,processes:64};
  const plan=resolveTestPlan({planId:'plan:visual:remote',runId:'run:visual:remote',project:'visual-remote',scope:{moduleId:'visual',gateId:null},createdAt:'2026-09-03T00:00:00.000Z',declaration:{tests:{visual:{uses:'kubeclaw.visual@1',mode:'blocking',retries:0,concurrencyGroup:'visual',config:{url:origin,manifestFile:'.swarm/visual/manifest.json',profileFile:'.swarm/visual/profiles.json',targets:['home'],comparisonProfile:'strict-v1'}}},concurrencyLimits:{visual:1}},suiteTemplates:[],registry,facts:{changedPaths:['.swarm/visual/manifest.json'],moduleType:'service',pipelineStage:'test'},policy:{defaultTimeoutMs:120000,maximumTimeoutMs:120000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:1,maximumMatrixSize:1,maximumNodes:2,defaultConcurrencyLimit:1,maximumConcurrencyLimits:{visual:1}}});
  const records={maximumRecords:100,maximumBytes:134217728,maximumRecordBytes:67108864};
  const store=new FileBusterPlanJobStore(path.join(root,'buster-state'),{recordLimits:records,maximumArchiveBytes:8388608,maximumResultBytes:67108864,maximumResultStoreBytes:134217728,trustedSourceAuthority:'nova:production',sourceAttestationPublicKey:publicKey});
  const service=new BusterRemotePlanService({store,registry,workerRevision:'b'.repeat(40),runtimeRoot:path.join(root,'buster-runs'),tarExecutable:'/usr/bin/tar',maximumExtractedBytes:33554432,allowedCapabilities:new Set(['browser.visual']),browserVisual:{allowedOrigins:[origin],allowedBrowsers:['chromium'],browserExecutables:{chromium:executable},maximumCombinations:2,maximumConcurrency:1,maximumExecutionMs:60000,maximumResultBytes:33554432,maximumScreenshotBytes:8388608,maximumMasksPerCombination:4}});
  const runtime=new BusterRemotePlanRuntime({service,host:'127.0.0.1',port:0,token,maximumRequestBytes:16777216,maximumResponseBytes:65536,maximumResultBytes:67108864,shutdownTimeoutMs:5000}); const runtimeAddress=await runtime.start();
  try{
    const gate=createProductionNovaTestGate({stateRoot:path.join(root,'nova-state'),endpoint:`http://127.0.0.1:${runtimeAddress.port}`,token,sourceAuthority:'nova:production',sourceAttestationPrivateKey:privateKey,pollMilliseconds:10,maximumResponseBytes:65536,maximumResultBytes:67108864,maximumArchiveBytes:8388608,maximumArchiveStoreBytes:33554432,maximumEvidenceBytes:67108864,maximumEvidenceStoreBytes:134217728,recordLimits:records});
    const executed=await gate.execute({idempotencyKey:'visual:remote:vertical',pipelineStageId:'stage:visual',plan,repositoryRoot:repository,repositoryId:'repository:visual',maximumConcurrency:1,grants:new Map([['visual',['browser.visual']]]),submittedAt:'2026-09-03T00:00:00.000Z',timeoutMs:180000});
    assert.equal(executed.remote.status.state,'completed');const reference=executed.remote.status.result!;
    const result=JSON.parse((await service.result(executed.remote.status.jobId,reference.contentDigest,reference.sizeBytes)).toString('utf8'));
    assert.equal(executed.remote.decision.state,'passed',JSON.stringify(result));
    assert.equal(result.attempts[0].evidence.filter((item:any)=>item.type.startsWith('visual-')).length,3);assert.equal(result.attempts[0].providerDetails.values.results[0].browser,'chromium');
    const imports=JSON.parse(fs.readFileSync(path.join(root,'nova-state/imports/records/store.json'),'utf8')).records;assert.equal(imports.some((record:any)=>record.payload?.decision?.decisionDigest===executed.remote.decision.decisionDigest),true);
  }finally{await runtime.stop();}
}finally{await new Promise<void>((resolve)=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify({ok:true,phase:'visual-remote-vertical',authenticatedDispatch:true,evidenceImported:true,realChromium:true,mocks:0,wrappers:0}));
