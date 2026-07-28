import assert from'node:assert/strict';import fs from'node:fs';import http from'node:http';import os from'node:os';import path from'node:path';import{pathToFileURL}from'node:url';
const repository=path.resolve('../../../..');const core=await import(pathToFileURL(path.join(repository,'skills/common/plugin-runtime/core/src/index.ts')).href);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kubeclaw-buster-quality-'));
const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({result:{outcome:'passed',runId:'run-1',gateId:'quality',attempt:1,summary:'Passed.',failureClass:'none',findings:[]}}));});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('server unavailable');
const origin=`http://127.0.0.1:${address.port}`;const secret='KUBECLAW_BUSTER_QUALITY_TOKEN';process.env[secret]='quality-secret';
const roots=['common','nova','buster'].map((role)=>path.join(repository,`skills/${role}/plugins`));
try{
 const snapshot=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:buster-quality'},now:()=>new Date('2026-07-26T00:00:00Z')}));
 const enabled=new Set(['kubeclaw.buster-quality-gate:quality']);const granted=core.resolveCapabilityGrants(snapshot,{enabledRegistrations:enabled,
  providers:new Map([['runtime.dispatch','kubeclaw.runtime-dispatch:runtime'],['network.http','kubeclaw.network-http:http'],['secrets.read','kubeclaw.secret-resolver:secrets'],['artifacts.write','kubeclaw.artifact-store:artifact-store']]),
  grants:new Map([['kubeclaw.buster-quality-gate:quality',new Map([['runtime.dispatch',{allowedAgents:['gate']}],['artifacts.write',{allowedNamespaces:['kubeclaw.buster-quality-gate']}]])],
   ['kubeclaw.runtime-dispatch:runtime',new Map([['network.http',{allowedOrigins:[origin]}],['secrets.read',{allowedNames:['gate.agent']} ]])]])});
 const activated=await core.activateRegistry(granted.snapshot,new Set(granted.grants.keys()));const effectsPath=path.join(temporary,'effects.jsonl');
 const adapters=new core.AdapterRuntime({granted,activated,configs:new Map([
  ['kubeclaw.runtime-dispatch:runtime',{targets:{gate:{endpoint:`${origin}/dispatch`,tokenSecret:'gate.agent'}}}],
  ['kubeclaw.network-http:http',{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']}],
  ['kubeclaw.secret-resolver:secrets',{environment:{'gate.agent':secret}}],['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(temporary,'artifacts')}],
 ]),effects:new core.EffectCoordinator(new core.FileEffectJournal(effectsPath),undefined,undefined,new core.MemoryResourceLockManager()),shutdownTimeoutMs:1000,async emitDomainEvent(){}});
 await adapters.start();try{
  const runner=new core.PipelineRunner({definition:{schemaVersion:'pipeline-definition.v2',id:'pipeline:buster-quality',maxConcurrency:1,stages:[{
   id:'quality',type:'kubeclaw.test.quality-evaluation',dependsOn:[],config:{agent:'gate'},input:{runId:'run-1',gateId:'quality',attempt:1,task:'Evaluate.',suiteEvidence:[{suite:'unit',passed:true,summary:'ok'}]},
   execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:5000}}]},registry:granted,activated,adapters,journal:new core.FileJournal(path.join(temporary,'events.jsonl'))});
  assert.equal((await runner.run('run:buster-quality')).status,'succeeded');assert.match(fs.readFileSync(path.join(temporary,'artifacts','catalog.jsonl'),'utf8'),/buster-quality:quality:1/);
  assert.equal(fs.readFileSync(effectsPath,'utf8').includes('quality-secret'),false);
 }finally{await adapters.shutdown();}
}finally{delete process.env[secret];await new Promise((resolve)=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.buster-quality-gate',suite:'live-function'}));
