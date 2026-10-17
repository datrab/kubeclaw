import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {runPipelineV2,resumePipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {inspectRuntimeConfiguration,selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
const id='kubeclaw.artifact-store:artifact-store';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-artifact-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 const stored=await context.invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:'policy:'+context.contract.lease.attempt.attemptId},payload:{namespace:'test.policy',mediaType:'application/json',value:'ééé'}});
 if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact]};
 return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.guidance',message:'waiting'},artifacts:[stored.artifact],wait:{schemaVersion:'wait-request.v2',waitId:'wait:artifact-policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}`);
 const schemas={config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}};
 for(const [name,value]of Object.entries(schemas))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.artifact-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'probe',type:'test.artifact-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['artifacts.write'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const coreFile=path.join(root,'core.json'),artifactRoot=path.join(root,'artifacts');
 const publish=limits=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,artifactStore:limits}}}}));
 publish(TEST_CORE_POLICY.artifactStore);
 const common=path.resolve('skills/common/plugins');
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'artifacts.write':id},grants:{'test.artifact-policy:probe':{'artifacts.write':{allowedNamespaces:['test.policy']}}},adapters:{[id]:{artifactRoot}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'artifact-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.artifact-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 return {root,source,definition,coreFile,publish,platform:()=>loadPlatformConfig(platformFile)};
}
test('actual Nova startup selects A/B artifact UTF8 cap, snapshots A and resumes A without current B',async t=>{
 const f=fixture(t),a={...TEST_CORE_POLICY.artifactStore,maxArtifactBytes:8};f.publish(a);
 const captured=inspectRuntimeConfiguration(f.platform(),f.definition);assert.deepEqual(captured.adapterConfigurations[id],{artifactRoot:path.join(f.root,'artifacts'),...a});assert(Object.isFrozen(captured.adapterConfigurations[id]));
 const first=await runPipelineV2(f.platform(),f.definition,'artifact:A');assert.equal(first.status,'waiting');
 const aRoot=runRoot(f.source.storageRoot,'artifact:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 const b={...a,maxArtifactBytes:7};f.publish(b);assert.equal(captured.adapterConfigurations[id].maxArtifactBytes,8);
 const rejected=await runPipelineV2(f.platform(),f.definition,'artifact:B');assert.equal(rejected.status,'blocked');
 const bEvents=fs.readFileSync(path.join(runRoot(f.source.storageRoot,'artifact:B'),'events.jsonl'),'utf8');assert.match(bEvents,/ARTIFACT_SIZE_EXCEEDED/);
 const wait=first.stages.get('probe').wait;
 fs.unlinkSync(f.coreFile);
 const resumed=await resumePipelineV2(f.platform(),f.definition,'artifact:A',{schemaVersion:'resume-signal.v2',signalId:'signal:artifact',idempotencyKey:'signal-key:artifact',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded');assert.deepEqual(readRunSnapshot(aRoot),snapshot);
});
test('central artifact limits required and relationally valid; raw duplicate authors reject even equal or null before activation',t=>{
 const f=fixture(t);
 for(const key of Object.keys(TEST_CORE_POLICY.artifactStore)){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing.artifactStore[key];assert.throws(()=>captureCoreRuntimePolicy(missing),/CORE_RUNTIME_POLICY_INVALID/);
  const bad=structuredClone(TEST_CORE_POLICY);bad.artifactStore[key]=0;assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);
  for(const value of [TEST_CORE_POLICY.artifactStore[key],null])assert.throws(()=>selectedAdapterConfigurations({[id]:{artifactRoot:f.root,[key]:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
  assert.throws(()=>activate({config:{artifactRoot:f.root,...missing.artifactStore}}),/invalid/);
 }
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,artifactStore:{...TEST_CORE_POLICY.artifactStore,maxArtifactBytes:TEST_CORE_POLICY.artifactStore.maximumStoreBytes+1}}),/BUDGET_INVALID/);
 assert.deepEqual(selectedAdapterConfigurations({[id]:{artifactRoot:f.root}},TEST_CORE_POLICY)[id],{artifactRoot:f.root,...TEST_CORE_POLICY.artifactStore});
});
const invocation=(key,value)=>({signal:new AbortController().signal,fence:{assertCurrent(){}},request:{capability:'artifacts.write',operation:'put_json',resource:{type:'artifact.object',canonicalId:key},payload:{namespace:'test.policy',mediaType:'application/json',value},attempt:{runId:'run:boundary',stageId:'probe',attemptId:'attempt:boundary',attemptNumber:1},idempotencyKey:key}});
test('actual artifact consumer enforces independently selected record count, metadata bytes and blob-store bytes with restored positives',async t=>{
 const f=fixture(t);
 const open=(name,limits)=>activate({config:selectedAdapterConfigurations({[id]:{artifactRoot:path.join(f.root,name)}},captureCoreRuntimePolicy({...TEST_CORE_POLICY,artifactStore:{...TEST_CORE_POLICY.artifactStore,...limits}}))[id]});
 const records=open('records',{maximumRecords:1});await records.invoke(invocation('one',1));await assert.rejects(()=>records.invoke(invocation('two',2)),/DURABLE_RECORD/);
 const restored=open('records',{maximumRecords:2});await restored.invoke(invocation('two',2));
 const metadata=open('metadata',{maximumRecordBytes:1});await assert.rejects(()=>metadata.invoke(invocation('one',1)),/DURABLE_RECORD_SIZE_EXCEEDED/);await open('metadata',{maximumRecordBytes:65536}).invoke(invocation('one',1));
 // Metadata and blobs each have their existing independent accounting against
 // the same selected store ceiling; choose payloads above metadata overhead.
 const value='x'.repeat(5000),blob=open('blob',{maxArtifactBytes:6000,maximumRecordBytes:1024,maximumStoreBytes:6000});await blob.invoke(invocation('one',value));await assert.rejects(()=>blob.invoke(invocation('two',value+'y')),/DURABLE_BLOB|STORE/);
 await open('blob',{maxArtifactBytes:6000,maximumRecordBytes:1024,maximumStoreBytes:12000}).invoke(invocation('two',value+'y'));
});

 test('original durable store roots survive B relocation without effects at B; grants still bind',async t=>{
 const f=fixture(t),runId='artifact:root';
 const first=await runPipelineV2(f.platform(),f.definition,runId);assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const original=runRoot(f.source.storageRoot,runId),snapshot=readRunSnapshot(original);
 const changed=structuredClone(f.platform()),ids=['kubeclaw.artifact-store:artifact-store'];
 const bRoots=ids.map((id,i)=>path.join(f.root,'forbidden-B-'+i));
 ids.forEach((id,i)=>{const key=id.includes('artifact-store')?'artifactRoot':'root';changed.adapters[id][key]=bRoots[i];});
 fs.unlinkSync(f.coreFile);
 const wait=first.stages.get('probe').wait,signal={schemaVersion:'resume-signal.v2',signalId:'signal:root',idempotencyKey:'signal-key:root',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}};
 const denied=structuredClone(changed);denied.grants={};
 await assert.rejects(()=>resumePipelineV2(denied,f.definition,runId,signal));
 assert.deepEqual(readRunSnapshot(original),snapshot);bRoots.forEach(root=>assert.equal(fs.existsSync(root),false));
 const resumed=await resumePipelineV2(changed,f.definition,runId,signal);assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));
 assert.deepEqual(readRunSnapshot(original),snapshot);bRoots.forEach(root=>assert.equal(fs.existsSync(root),false));
 });
