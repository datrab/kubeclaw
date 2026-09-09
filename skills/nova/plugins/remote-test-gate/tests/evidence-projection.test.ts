// Remote envelopes below are explicit contract vectors. Their auth payload comes
// from the original controller + real local app test; no native worker execution is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {buildRegistry,discoverPackages,resolveCapabilityGrants,FileNovaGateImportStore,NovaRemoteGateImporter} from '@kubeclaw/nova-core';
import {createRemotePlanJob,HttpRemotePlanTransport} from '../../../core/test-gates/remote-dispatch.ts';
import {activate as artifactStore} from '../../../../common/plugins/artifact-store/src/adapter.ts';
import {activate} from '../src/evidence-adapter.ts';
import {authorizeCapabilityInvocation} from '../../../core/execution/authorization.ts';
import {projectDemoEvidence} from '../src/demo-evidence.ts';
import {attemptResultDigest,nodeResultDigest,remotePlanDigest,remotePlanResultDigest,remotePlanResultReceipt,resolvedTestPlanDigest,attestSourceSnapshot,gateCoverageDigest,stableTestIdentity} from '@kubeclaw/pipeline-test-gate-contract';
const repository=fileURLToPath(new URL('../../../../../',import.meta.url));
const limits={maximumRecords:100,maximumBytes:8*1024**2,maximumRecordBytes:2*1024**2};

function vectors(registry:any,bundle:any){
 const runId=bundle.invocation.runId,planId=bundle.invocation.planId;
 const modules=[{moduleId:'app',ownedPaths:['src'],requirements:[{id:'demo-auth',statement:'Demo authenticated workspace is usable'}]}];
 const policyBase={schemaVersion:'gate-coverage.v1',projectId:'demo',kind:'cumulative',baseRevision:'a'.repeat(40),modules,integrationRequirements:[],requiredChecks:[{checkId:'auth',requirementRefs:[{moduleId:'app',requirementId:'demo-auth'}],nodeIds:['auth']}]};
 const policy={...policyBase,policyDigest:gateCoverageDigest(policyBase as any)};
 const nodes=[['build','kubeclaw.container-build@1'],['manifest','kubeclaw.direct-command@1'],['deployment','kubeclaw.kubernetes-fixture@1'],['exposure','kubeclaw.tailscale-exposure@1'],['auth','kubeclaw.demo-auth-smoke@1']].map(([id,contract])=>{
  const entry=registry.testProviderContracts.get(contract);const registration=entry.registration;
  return {id,executionId:`execution:${id}`,testIdentity:stableTestIdentity({project:"demo",moduleId:null,gateId:"final-test",suiteInstanceId:null,nodeId:id,variation:{}}),suiteInstanceId:null,kind:registration.kind,provider:{...registration.package,registrationId:registration.registrationId,contractId:contract},reportAdapters:[],mode:registration.kind==='test'?'blocking':null,
   configuration:{schemaVersion:'provider-configuration.v1',contractId:contract,schemaDigest:entry.configSchemaDigest,values:id==='auth'?bundle.invocation.configuration.values:{}},dependencies:['build','manifest'].includes(id)?[]:(id==='deployment'?['build','manifest']:id==='auth'?['deployment','exposure']:['deployment']).map(nodeId=>({nodeId,acceptedResults:['passed']})),timeoutMs:3000,limits:{cpuMillis:1000,memoryBytes:67108864,logBytes:65536,artifactBytes:65536,artifactFiles:1,processes:1},retryCount:0,concurrencyGroup:null,parentNodeId:null,variation:{},evidence:{onPass:[],onFail:[],onError:[]},skipReason:null};
 });
 const link=(from:string,output:string,to:string,input:string,schemaId:string)=>({schemaVersion:'typed-link.v1',kind:'value',from:{nodeId:from,output},to:{nodeId:to,input},schemaId});
 const unsigned:any={schemaVersion:'resolved-test-plan.v1',planId,runId,project:'demo',scope:{moduleId:null,gateId:'final-test'},registrySnapshotDigest:registry.snapshotDigest,createdAt:new Date().toISOString(),suites:[],nodes,
  coverage:{policy,excludedNodeIds:[]},links:[link('build','image','deployment','image','kubeclaw.container-image@1'),{schemaVersion:'typed-link.v1',kind:'artifact',from:{nodeId:'manifest',output:'artifact-1'},to:{nodeId:'deployment',input:'checked-manifest'},mediaType:'application/vnd.kubeclaw.checked-kubernetes-yaml'},link('deployment','deployment','auth','deployment','kubeclaw.kubernetes-deployment-fixture@1'),link('deployment','demo-credentials','auth','credentials','kubeclaw.generated-demo-credentials@1'),link('exposure','exposure','auth','exposure','kubeclaw.public-endpoint-fixture@1'),link('deployment','deployment','exposure','deployment','kubeclaw.kubernetes-deployment-fixture@1')],concurrencyLimits:{default:1}};
 const plan={...unsigned,planDigest:resolvedTestPlanDigest(unsigned)};
 const archive=Buffer.from('explicit source envelope contract vector');
 const key=crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 const sourceSnapshot=attestSourceSnapshot({schemaVersion:'source-snapshot.v1',sourceType:'git-commit',pipelineStageId:'final-test',repositoryId:'contract:repository',revision:`git:${'a'.repeat(40)}`,tree:`git:${'b'.repeat(40)}`,archiveContentDigest:sha256Text(archive.toString()),archiveSizeBytes:archive.length,creatorAuthority:'test:envelope'},key);
 const job=createRemotePlanJob({idempotencyKey:'demo:contract',pipelineStageId:'final-test',plan,sourceSnapshot,repositoryArchive:archive,grants:new Map(nodes.map(node=>[node.id,[]])),maximumConcurrency:1,submittedAt:new Date().toISOString()});
 const outputs=bundle.invocation.inputs;
 const get=(name:string)=>outputs.find((item:any)=>item.name===name).value;
 const authority=(digest:string,id:string)=>({receiptId:id,receiptDigest:remotePlanDigest({authorityId:`test-runner:${plan.planDigest}`,receiptId:id,resultDigest:digest})});
 const attempts=nodes.map(node=>{
  const base:any={schemaVersion:'attempt-result.v1',planId,runId,moduleId:null,gateId:'final-test',suiteInstanceId:null,nodeId:node.id,executionId:node.executionId,testIdentity:node.testIdentity,nodeKind:node.kind,
   attemptId:node.id==='auth'?bundle.invocation.attemptId:`attempt:${node.id}`,attemptNumber:1,provider:node.provider,mode:node.mode,executionState:'completed',outcome:'passed',startedAt:new Date(Date.now()-10000).toISOString(),completedAt:new Date().toISOString(),durationMs:1,summary:'Explicit terminal contract vector',counts:node.id==='auth'?bundle.result.counts:{total:1,passed:1,failed:0,skipped:0},findings:[],metrics:[],reports:[],evidence:[],resources:{logBytes:0,artifactBytes:0},exitCode:0,signal:null,providerDetails:null,
   outputs:node.id==='build'?[{name:'image',kind:'value',schemaId:'kubeclaw.container-image@1',value:{schemaVersion:'container-image.v1',reference:get('deployment').immutableImage,digest:get('deployment').immutableImage.split('@')[1]}}]:node.id==='manifest'?[{name:'artifact-1',kind:'artifact',artifact:{artifactId:'manifest:contract',type:'artifact',mediaType:'application/vnd.kubeclaw.checked-kubernetes-yaml',contentDigest:get('deployment').manifestDigest,sizeBytes:Buffer.byteLength('local application manifest contract vector'),storageUrl:'artifact://contract/manifest'}}]:node.id==='auth'?bundle.result.outputs:node.id==='deployment'?[{name:'deployment',kind:'value',schemaId:'kubeclaw.kubernetes-deployment-fixture@1',value:get('deployment')},{name:'demo-credentials',kind:'value',schemaId:'kubeclaw.generated-demo-credentials@1',value:get('credentials')}]:[{name:'exposure',kind:'value',schemaId:'kubeclaw.public-endpoint-fixture@1',value:get('exposure')}]};
  const resultDigest=attemptResultDigest(base);return {...base,resultDigest,receipt:authority(resultDigest,`receipt:${node.id}`)};
 });
 const results=nodes.map((node,index)=>{const base:any={schemaVersion:'node-result.v1',planId,runId,moduleId:null,gateId:'final-test',suiteInstanceId:null,nodeId:node.id,executionId:node.executionId,testIdentity:node.testIdentity,nodeKind:node.kind,mode:node.mode,state:'completed',outcome:'passed',attemptIds:[attempts[index].attemptId],finalAttemptId:attempts[index].attemptId,unstable:false,skipReason:null};const resultDigest=nodeResultDigest(base);return {...base,resultDigest,receipt:authority(resultDigest,`node:${node.id}`)};});
 const resultBase:any={schemaVersion:'buster-plan-result.v1',workerRevision:'c'.repeat(40),jobId:job.jobId,planId,planDigest:plan.planDigest,runId,attempts,nodes:results,cleanupErrors:[],completedAt:new Date().toISOString()};
 const resultDigest=remotePlanResultDigest(resultBase);const result={...resultBase,resultDigest,receipt:remotePlanResultReceipt(job.jobId,resultDigest)};
 const bytes=JSON.stringify(result);const status:any={schemaVersion:'buster-plan-status.v1',jobId:job.jobId,requestDigest:job.requestDigest,state:'completed',submittedAt:job.submittedAt,updatedAt:result.completedAt,result:{schemaVersion:'buster-plan-result-ref.v1',resultDigest,contentDigest:sha256Text(bytes),sizeBytes:Buffer.byteLength(bytes)},error:null};
 return {job,result,status,policy};
}

test('original HTTP importer, artifact store and evidence adapter preserve ownership across reopen; envelopes are contract vectors',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demo-projection-'));const bundlePath=path.join(root,'auth.json');
 const childEnvironment:NodeJS.ProcessEnv={...process.env,KUBECLAW_DEMO_AUTH_TEST_RESULT:bundlePath};delete childEnvironment.NODE_TEST_CONTEXT;
 execFileSync(process.execPath,['--test',path.join(repository,'skills/buster/plugins/demo-auth-smoke/tests/live-function.test.ts')],{cwd:repository,env:childEnvironment});
 const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));const roots=['common','nova','buster'].map(role=>path.join(repository,'skills',role,'plugins'));
 const registry=buildRegistry(discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:projection'}}));
 resolveCapabilityGrants(registry,{enabledRegistrations:new Set(['kubeclaw.remote-test-gate:evidence']),providers:new Map([['artifacts.read','kubeclaw.artifact-store:artifact-store']]),grants:new Map([['kubeclaw.remote-test-gate:evidence',new Map([['artifacts.read',{allowedNamespaces:['kubeclaw.project-summary','kubeclaw.buster-quality-gate']}]])]])});
 const grant:any={capability:'test.plan.evidence',constraints:{allowedNamespaces:['kubeclaw.project-summary']}};
 const capabilityRequest:any={operation:'demo',resource:{type:'artifact.object',canonicalId:'summary'},payload:{namespace:'kubeclaw.project-summary'}};
 authorizeCapabilityInvocation(grant,capabilityRequest);
 assert.throws(()=>authorizeCapabilityInvocation(grant,{...capabilityRequest,payload:{namespace:'foreign'}}),/RESOURCE_DENIED/);
 assert.throws(()=>authorizeCapabilityInvocation(grant,{...capabilityRequest,operation:'write'}));
 const {job,result,status,policy}=vectors(registry,bundle);
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
  const request:any={confidential:true,signal:new AbortController().signal,request:{capability:'test.plan.evidence',operation:'demo',resource:{type:'artifact.object',canonicalId:(manifest as any).artifactId},payload:{manifest,namespace:'kubeclaw.project-summary',authNodeId:'auth'},attempt:producer('demo-evidence')}};
  const projected=await adapter.invoke(request);assert.equal((projected.authentication as any).credentialDigest,bundle.result.outputs[0].value.credentialDigest);
  assert.deepEqual(await adapter.invoke(request),projected);
  await assert.rejects(adapter.invoke({...request,request:{...request.request,attempt:{...request.request.attempt,runId:'foreign-run'}}}),/ARTIFACT_OWNER_INVALID/);
  const reopen=new FileNovaGateImportStore(storePath,options);const binding={jobId:job.jobId,runId:job.plan.runId,pipelineStageId:'final-test',sourceRevision:job.sourceSnapshot.revision,decisionDigest:decision.decisionDigest,resultDigest:result.resultDigest};
  const verified=await reopen.readVerifiedResult(binding);assert.equal(projectDemoEvidence(verified,'auth').resultDigest,result.resultDigest);
  for(const changed of [{runId:'foreign'},{sourceRevision:'git:foreign'},{decisionDigest:sha256Text('wrong')},{resultDigest:sha256Text('wrong')},{pipelineStageId:'foreign'}])await assert.rejects(reopen.readVerifiedResult({...binding,...changed}),/BINDING_MISMATCH/);
  const changed=structuredClone(verified);changed.source.plan.links=changed.source.plan.links.filter(link=>link.to.input!=='credentials');assert.throws(()=>projectDemoEvidence(changed,'auth'),/NATIVE_LINK_REQUIRED/);
  const noImage=structuredClone(verified);noImage.source.plan.links=noImage.source.plan.links.filter(link=>link.to.input!=='image');assert.throws(()=>projectDemoEvidence(noImage,'auth'),/SOURCE_LINK_REQUIRED/);
  const swapped=structuredClone(verified);const build=swapped.result.attempts.find(item=>item.nodeId==='build')!;(build.outputs[0] as any).value.reference='foreign';assert.throws(()=>projectDemoEvidence(swapped,'auth'),/BUILT_IMAGE_MISMATCH/);
  await adapter.shutdown(new AbortController().signal);
 }finally{await artifacts.shutdown(new AbortController().signal);await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});
