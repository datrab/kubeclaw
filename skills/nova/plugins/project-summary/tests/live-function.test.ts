import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const repository=path.resolve('../../../..');const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kubeclaw-project-summary-'));
const core=await import(pathToFileURL(path.join(repository,'skills/nova/core/src/index.ts')).href);
const roots=['common','nova','buster'].map((role)=>path.join(repository,`skills/${role}/plugins`));
try{
  const snapshot=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:project-summary'},now:()=>new Date('2026-07-26T00:00:00Z')}));
  const enabled=new Set(['kubeclaw.project-summary:summary']);
  const granted=core.resolveCapabilityGrants(snapshot,{enabledRegistrations:enabled,providers:new Map([['artifacts.read','kubeclaw.artifact-store:artifact-store'],['artifacts.write','kubeclaw.artifact-store:artifact-store']]),
    grants:new Map([['kubeclaw.project-summary:summary',new Map([['artifacts.read',{allowedNamespaces:['kubeclaw.implementation-agent','kubeclaw.lint','kubeclaw.review','kubeclaw.buster-quality-gate']}],['artifacts.write',{allowedNamespaces:['kubeclaw.project-summary']}]])]])});
  const activated=await core.activateRegistry(granted.snapshot,new Set(granted.grants.keys()));
  const adapters=new core.AdapterRuntime({granted,activated,configs:new Map([['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(temporary,'artifacts')}]]),
    effects:new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary,'effects.jsonl')),undefined,undefined,new core.MemoryResourceLockManager()),shutdownTimeoutMs:1000,async emitDomainEvent(){}});
  await adapters.start();
  try{
    const runner=new core.PipelineRunner({definition:{schemaVersion:'pipeline-definition.v2',id:'pipeline:summary',maxConcurrency:1,stages:[{
      id:'summary',type:'kubeclaw.report.project-summary',dependsOn:[],config:{},input:{projectId:'api',modules:[{moduleId:'api',sourceStageId:'forge',testStageId:'test'}],final:{sourceStageId:'forge',testStageId:'test',lintStageId:'lint',reviewStageId:'review'}},
      execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:5000}}]},registry:granted,activated,adapters,journal:new core.FileJournal(path.join(temporary,'events.jsonl'))});
    assert.equal((await runner.run('run:summary')).status,'blocked');
    assert.equal(fs.existsSync(path.join(temporary,'artifacts','records','store.json')),false);
  }finally{await adapters.shutdown();}
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
console.log(JSON.stringify({ok:true,plugin:'kubeclaw.project-summary',suite:'live-function'}));
