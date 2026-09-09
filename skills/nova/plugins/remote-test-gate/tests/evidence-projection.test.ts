// Remote envelopes below are explicit contract vectors. Their auth payload comes
// from the original controller + real local app test; no native worker execution is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {buildRegistry,discoverPackages,resolveCapabilityGrants,FileNovaGateImportStore,NovaRemoteGateImporter,AdapterRuntime,EffectCoordinator,FileEffectJournal,FileResourceLockManager,activateRegistry} from '@kubeclaw/nova-core';
import {HttpRemotePlanTransport} from '../../../core/test-gates/remote-dispatch.ts';
import {activate as artifactStore} from '../../../../common/plugins/artifact-store/src/adapter.ts';
import {activate} from '../src/evidence-adapter.ts';
import {authorizeCapabilityInvocation} from '../../../core/execution/authorization.ts';
import {projectDemoEvidence} from '../src/demo-evidence.ts';
import {demoImportVectors} from './demo-import-fixture.ts';
const repository=fileURLToPath(new URL('../../../../../',import.meta.url));
const limits={maximumRecords:100,maximumBytes:8*1024**2,maximumRecordBytes:2*1024**2};


test('original HTTP importer, artifact store and evidence adapter preserve ownership across reopen; envelopes are contract vectors',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demo-projection-'));const bundlePath=path.join(root,'auth.json');
 const childEnvironment:NodeJS.ProcessEnv={...process.env,KUBECLAW_DEMO_AUTH_TEST_RESULT:bundlePath};delete childEnvironment.NODE_TEST_CONTEXT;
 execFileSync(process.execPath,['--test',path.join(repository,'skills/buster/plugins/demo-auth-smoke/tests/live-function.test.ts')],{cwd:repository,env:childEnvironment});
 const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));const roots=['common','nova','buster'].map(role=>path.join(repository,'skills',role,'plugins'));
 const fixtureRoot=path.join(root,'plugins'),fixture=path.join(fixtureRoot,'consumer');fs.mkdirSync(fixture,{recursive:true});
 fs.writeFileSync(path.join(fixture,'plugin.json'),JSON.stringify({id:'test.evidence-consumer',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'consume',type:'test.evidence-consumer',module:'stage.mjs',export:'execute',requiredCapabilities:['test.plan.evidence'],configSchema:'schema.json',inputSchema:'schema.json',resultSchema:'schema.json'}]}));
 fs.writeFileSync(path.join(fixture,'schema.json'),JSON.stringify({type:'object'}));fs.writeFileSync(path.join(fixture,'stage.mjs'),`export async function execute(input,context){return context.invoke('test.plan.evidence',input);}`);roots.push(fixtureRoot);
 const registry=buildRegistry(discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:projection'}}));
 resolveCapabilityGrants(registry,{enabledRegistrations:new Set(['kubeclaw.remote-test-gate:evidence']),providers:new Map([['artifacts.read','kubeclaw.artifact-store:artifact-store']]),grants:new Map([['kubeclaw.remote-test-gate:evidence',new Map([['artifacts.read',{allowedNamespaces:['kubeclaw.project-summary','kubeclaw.buster-quality-gate']}]])]])});
 const grant:any={capability:'test.plan.evidence',constraints:{allowedNamespaces:['kubeclaw.project-summary']}};
 const capabilityRequest:any={operation:'demo',resource:{type:'test.plan.evidence',canonicalId:'summary'},payload:{namespace:'kubeclaw.project-summary'}};
 authorizeCapabilityInvocation(grant,capabilityRequest);
 assert.throws(()=>authorizeCapabilityInvocation(grant,{...capabilityRequest,resource:{...capabilityRequest.resource,type:'artifact.object'}}),/RESOURCE/);
 assert.throws(()=>authorizeCapabilityInvocation(grant,{...capabilityRequest,payload:{namespace:'foreign'}}),/RESOURCE_DENIED/);
 assert.throws(()=>authorizeCapabilityInvocation(grant,{...capabilityRequest,operation:'write'}));
 const {job,result,status,policy}=demoImportVectors(registry,bundle);
 const server=http.createServer((request,response)=>{if(request.url?.includes('/results/'))response.end(JSON.stringify(result));else if(request.url?.includes('/evidence/'))response.end('local application manifest contract vector');else response.writeHead(404).end();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 const transport=new HttpRemotePlanTransport({endpoint:`http://127.0.0.1:${address.port}`,authentication:'spiffe-proxy',maximumResponseBytes:2*1024**2});
 const storePath=path.join(root,'imports');const options={recordLimits:limits,maximumEvidenceStoreBytes:2*1024**2};
 const store=new FileNovaGateImportStore(storePath,options);const importer=new NovaRemoteGateImporter({store,evidence:transport,results:transport,maximumEvidenceBytes:2*1024**2,maximumResultBytes:2*1024**2});
 const artifacts=artifactStore({config:{artifactRoot:path.join(root,'artifacts')}} as any);await artifacts.ready();
 try{
  const decision=await importer.import(job,status);assert.equal(decision.state,'passed');
  const producer=(stageId:string)=>({runId:job.plan.runId,stageId,attemptId:`attempt:${stageId}`,attemptNumber:1});
  const write=async(id:string,namespace:string,value:unknown,stageId:string)=>artifacts.invoke({confidential:true,signal:new AbortController().signal,request:{capability:'artifacts.write',operation:'put_json',resource:{type:'artifact.object',canonicalId:id},payload:{namespace,mediaType:'application/json',value},attempt:producer(stageId),idempotencyKey:id}} as any);
  const decisionRef=(await write('quality:decision:1','kubeclaw.buster-quality-gate',decision,'final-test')).artifact;
  const manifestBase={schemaVersion:'delivery-manifest.v2',projectId:'demo',runId:job.plan.runId,sourceRevision:'a'.repeat(40),modules:[],final:{sourceRevision:'a'.repeat(40),testStageId:'final-test',expectedCoverage:policy,decisionDigest:decision.decisionDigest,resultDigest:decision.resultDigest,coverage:decision.coverage},evidence:[decisionRef]};
  const manifest=(await write('summary:demo','kubeclaw.project-summary',{...manifestBase,digest:sha256Text(canonicalJson(manifestBase))},'project-summary')).artifact;
  const adapter=activate({config:{stateRoot:root,manifestStageId:'project-summary',gateStageId:'final-test'},invoke:(capability:string,request:unknown)=>artifacts.invoke({confidential:true,signal:new AbortController().signal,request:{...(request as object),capability,attempt:producer('demo-evidence'),idempotencyKey:'read:demo'}} as any)} as any);
  const request:any={confidential:true,signal:new AbortController().signal,request:{capability:'test.plan.evidence',operation:'demo',resource:{type:'test.plan.evidence',canonicalId:(manifest as any).artifactId},payload:{manifest,namespace:'kubeclaw.project-summary',authNodeId:'auth'},attempt:producer('demo-evidence')}};
  const projected=await adapter.invoke(request);assert.equal((projected.authentication as any).credentialDigest,bundle.result.outputs[0].value.credentialDigest);
  assert.deepEqual(await adapter.invoke(request),projected);
  // Original nonconfidential effect coordination: the projection owns its real
  // logical resource, while the nested artifact read retains the artifact lock.
  const granted=resolveCapabilityGrants(registry,{enabledRegistrations:new Set(['test.evidence-consumer:consume']),providers:new Map([['test.plan.evidence','kubeclaw.remote-test-gate:evidence'],['artifacts.read','kubeclaw.artifact-store:artifact-store']]),
   grants:new Map([['test.evidence-consumer:consume',new Map([['test.plan.evidence',{allowedNamespaces:['kubeclaw.project-summary']}]])],['kubeclaw.remote-test-gate:evidence',new Map([['artifacts.read',{allowedNamespaces:['kubeclaw.project-summary','kubeclaw.buster-quality-gate']}]])]])});
  const activated=await activateRegistry(granted.snapshot,new Set(granted.grants.keys()));
  const durable=new AdapterRuntime({granted,activated,configs:new Map([['kubeclaw.remote-test-gate:evidence',{stateRoot:root,manifestStageId:'project-summary',gateStageId:'final-test'}],['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(root,'artifacts')}]]),shutdownTimeoutMs:1000,async emitDomainEvent(){},
   effects:new EffectCoordinator(new FileEffectJournal(path.join(root,'effects.jsonl')),undefined,undefined,new FileResourceLockManager(path.join(root,'locks')))});
  await durable.start();try {
   assert.deepEqual(await durable.invoke('test.plan.evidence',producer('demo-evidence'),'original-effect:projection',request.request,new AbortController().signal),projected);
   assert.deepEqual(await durable.invoke('test.plan.evidence',producer('demo-evidence'),'original-effect:projection',request.request,new AbortController().signal),projected);
   await assert.rejects(durable.invoke('test.plan.evidence',{...producer('demo-evidence'),runId:'foreign'},'original-effect:foreign',request.request,new AbortController().signal),/ARTIFACT_OWNER_INVALID/);
  }finally{await durable.shutdown();}

  await assert.rejects(adapter.invoke({...request,request:{...request.request,attempt:{...request.request.attempt,runId:'foreign-run'}}}),/ARTIFACT_OWNER_INVALID/);
  const reopen=new FileNovaGateImportStore(storePath,options);const binding={jobId:job.jobId,runId:job.plan.runId,pipelineStageId:'final-test',sourceRevision:job.sourceSnapshot.revision,decisionDigest:decision.decisionDigest,resultDigest:result.resultDigest};
  const verified=await reopen.readVerifiedResult(binding);assert.equal(projectDemoEvidence(verified,'auth').resultDigest,result.resultDigest);
  for(const changed of [{runId:'foreign'},{sourceRevision:'git:foreign'},{decisionDigest:sha256Text('wrong')},{resultDigest:sha256Text('wrong')},{pipelineStageId:'foreign'}])await assert.rejects(reopen.readVerifiedResult({...binding,...changed}),/BINDING_MISMATCH/);
  const changedGeneration=structuredClone(verified);const authAttempt=changedGeneration.result.attempts.find(item=>item.nodeId==='auth')!;
  (authAttempt.outputs[0] as any).value.exposureGeneration+=1;assert.throws(()=>projectDemoEvidence(changedGeneration,'auth'),/SOURCE_MISMATCH/);
  const changed=structuredClone(verified);changed.source.plan.links=changed.source.plan.links.filter(link=>link.to.input!=='credentials');assert.throws(()=>projectDemoEvidence(changed,'auth'),/NATIVE_LINK_REQUIRED/);
  const noImage=structuredClone(verified);noImage.source.plan.links=noImage.source.plan.links.filter(link=>link.to.input!=='image');assert.throws(()=>projectDemoEvidence(noImage,'auth'),/SOURCE_LINK_REQUIRED/);
  const swapped=structuredClone(verified);const build=swapped.result.attempts.find(item=>item.nodeId==='build')!;(build.outputs[0] as any).value.reference='foreign';assert.throws(()=>projectDemoEvidence(swapped,'auth'),/BUILT_IMAGE_MISMATCH/);
  await adapter.shutdown(new AbortController().signal);
 }finally{await artifacts.shutdown(new AbortController().signal);await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});
