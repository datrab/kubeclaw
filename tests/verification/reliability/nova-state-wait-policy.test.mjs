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
import {activate as stateStore} from '../../../skills/common/plugins/state-store/src/adapter.ts';
import {activate as waitStore} from '../../../skills/common/plugins/wait-store/src/adapter.ts';
const stateId='kubeclaw.state-store:state',waitId='kubeclaw.wait-store:waits';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-artifact-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 await context.invoke('state.append',{operation:'append',resource:{type:'state.namespace',canonicalId:'test.policy'},payload:{text:'ééé'}});
 const stored=await context.invoke('signal.wait',{operation:'create',resource:{type:'signal.wait',canonicalId:'policy:wait'},payload:{kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null,request:{summary:'ééé'}}});
 if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
 return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.guidance',message:'waiting'},artifacts:[],wait:stored.wait};}`);
 const schemas={config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}};
 for(const [name,value]of Object.entries(schemas))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.artifact-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'probe',type:'test.artifact-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['state.append','signal.wait'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const coreFile=path.join(root,'core.json'),artifactRoot=path.join(root,'artifacts');
 const publish=policy=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:policy}}}));
 publish(TEST_CORE_POLICY);
 const common=path.resolve('skills/common/plugins');
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'state.append':stateId,'signal.wait':waitId},grants:{'test.artifact-policy:probe':{'state.append':{allowedNamespaces:['test.policy']},'signal.wait':{allowedSignalTypes:['core.orchestrator.resume'],allowedIssuerIds:['nova']}}},adapters:{[stateId]:{root:path.join(root,'state-adapter')},[waitId]:{root:path.join(root,'wait-adapter')}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'artifact-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.artifact-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 return {root,source,definition,coreFile,publish,platform:()=>loadPlatformConfig(platformFile)};
}

test('actual Nova state/wait A/B entry policies reach both real adapters and retained A resumes without B',async t=>{
 const f=fixture(t),a={...TEST_CORE_POLICY,stateStore:{...TEST_CORE_POLICY.stateStore,maxEntryBytes:512},waitStore:{...TEST_CORE_POLICY.waitStore,maxEntryBytes:1024}};f.publish(a);
 const captured=inspectRuntimeConfiguration(f.platform(),f.definition);
 assert.equal(captured.adapterConfigurations[stateId].maxEntryBytes,512);assert.equal(captured.adapterConfigurations[waitId].maxEntryBytes,1024);
 const first=await runPipelineV2(f.platform(),f.definition,'store:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const aRoot=runRoot(f.source.storageRoot,'store:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters,captured.adapterConfigurations);
 for(const [name,field,error] of [['state','stateStore','STATE_ENTRY_SIZE_EXCEEDED'],['wait','waitStore','WAIT_ENTRY_SIZE_EXCEEDED']]){
  f.publish({...a,[field]:{...a[field],maxEntryBytes:1}});
  const result=await runPipelineV2(f.platform(),f.definition,'store:B-'+name);assert.equal(result.status,'blocked');
  assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'store:B-'+name),'events.jsonl'),'utf8'),new RegExp(error));
 }
 assert.equal(captured.adapterConfigurations[stateId].maxEntryBytes,512);assert.equal(captured.adapterConfigurations[waitId].maxEntryBytes,1024);
 fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(f.platform(),f.definition,'store:A',{schemaVersion:'resume-signal.v2',signalId:'signal:stores',idempotencyKey:'signal-key:stores',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));assert.deepEqual(readRunSnapshot(aRoot),snapshot);
});
const invocation=(kind,key,text='ééé')=>({confidential:true,signal:new AbortController().signal,request:{capability:kind==='state'?'state.append':'signal.wait',operation:kind==='state'?'append':'create',resource:{type:kind==='state'?'state.namespace':'signal.wait',canonicalId:'test.policy'},idempotencyKey:key,payload:kind==='state'?{text}:{kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null,request:{text}}}});
test('selected state and wait entry bytes, records and store capacities enforce actual boundaries and restore positives',async t=>{
 const f=fixture(t);
 for(const [kind,field,id,activate] of [['state','stateStore',stateId,stateStore],['wait','waitStore',waitId,waitStore]]){
  const open=(name,limits)=>activate({config:selectedAdapterConfigurations({[id]:{root:path.join(f.root,kind+'-'+name)}},captureCoreRuntimePolicy({...TEST_CORE_POLICY,[field]:{...TEST_CORE_POLICY[field],...limits}}))[id]});
  const first=await open('entry',{maxEntryBytes:4096}).invoke(invocation(kind,'one'));
  const payload=kind==='state'?{schemaVersion:'plugin-state-value.v1',value:{text:'ééé'}}:{schemaVersion:'wait-value.v1',wait:first.wait};
  const size=Buffer.byteLength(JSON.stringify(payload));
  await open('exact',{maxEntryBytes:size}).invoke(invocation(kind,'one'));
  await assert.rejects(()=>open('over',{maxEntryBytes:size-1}).invoke(invocation(kind,'one')),new RegExp(kind.toUpperCase()+'_ENTRY_SIZE_EXCEEDED'));
  await open('over',{maxEntryBytes:size}).invoke(invocation(kind,'one'));
  await open('records',{maximumRecords:1}).invoke(invocation(kind,'one'));
  await assert.rejects(()=>open('records',{maximumRecords:1}).invoke(invocation(kind,'two')),/DURABLE_RECORD_STORE_FULL/);
  await open('records',{maximumRecords:2}).invoke(invocation(kind,'two'));
  await open('bytes',{maximumStoreBytes:4096}).invoke(invocation(kind,'one'));
  const storedBytes=fs.statSync(path.join(f.root,kind+'-bytes/records/store.json')).size;
  await open('bytes',{maximumStoreBytes:storedBytes}).ready();
  await assert.rejects(()=>open('bytes',{maximumStoreBytes:storedBytes}).invoke(invocation(kind,'two')),/DURABLE_RECORD_STORE_FULL/);
  await assert.rejects(()=>open('bytes',{maximumStoreBytes:storedBytes-1}).ready(),/OBSERVABILITY_REPLAY_INVALID:snapshot-size/);
  await open('bytes',{maximumStoreBytes:4096}).invoke(invocation(kind,'two'));
 }
});
test('all six central leaves are mandatory; malformed, missing and raw duplicate authors reject without defaults',t=>{
 const f=fixture(t);
 for(const [field,id,activate] of [['stateStore',stateId,stateStore],['waitStore',waitId,waitStore]])for(const key of Object.keys(TEST_CORE_POLICY[field])){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing[field][key];assert.throws(()=>captureCoreRuntimePolicy(missing),/INVALID/);
  assert.throws(()=>activate({config:{root:f.root,...missing[field]}}),/invalid/);
  for(const value of [0,'1',null,1.5,Number.MAX_SAFE_INTEGER+1]){
   const bad=structuredClone(TEST_CORE_POLICY);bad[field][key]=value;assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);assert.throws(()=>activate({config:{root:f.root,...bad[field]}}),/invalid/);
  }
  for(const value of [TEST_CORE_POLICY[field][key],null])assert.throws(()=>selectedAdapterConfigurations({[id]:{root:f.root,[key]:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 }
});

 test('original durable store roots survive B relocation without effects at B; grants still bind',async t=>{
 const f=fixture(t),runId='stores:root';
 const first=await runPipelineV2(f.platform(),f.definition,runId);assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const original=runRoot(f.source.storageRoot,runId),snapshot=readRunSnapshot(original);
 const changed=structuredClone(f.platform()),ids=['kubeclaw.state-store:state', 'kubeclaw.wait-store:waits'];
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
