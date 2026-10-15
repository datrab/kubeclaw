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
import {activate} from '../../../skills/common/plugins/telemetry-store/src/adapter.ts';
const id='kubeclaw.telemetry-store:telemetry';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-artifact-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 await context.invoke('telemetry.emit',{operation:'append',resource:{type:'telemetry.event',canonicalId:'test.policy'},payload:{message:'ééé',token:'top-secret-telemetry'}});
 if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
 return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.guidance',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:artifact-policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}`);
 const schemas={config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}};
 for(const [name,value]of Object.entries(schemas))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.artifact-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'probe',type:'test.artifact-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['telemetry.emit'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const coreFile=path.join(root,'core.json'),artifactRoot=path.join(root,'artifacts');
 const publish=limits=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,telemetryStore:limits}}}}));
 publish(TEST_CORE_POLICY.telemetryStore);
 const common=path.resolve('skills/common/plugins');
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'telemetry.emit':id},grants:{'test.artifact-policy:probe':{'telemetry.emit':{allowedEventPrefixes:['test.']}}},adapters:{[id]:{root:artifactRoot}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'artifact-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.artifact-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 return {root,source,definition,coreFile,publish,platform:()=>loadPlatformConfig(platformFile)};
}
test('actual Nova telemetry A/B record cap, redaction and retained A resume without B use selected snapshot',async t=>{
 const f=fixture(t),a={...TEST_CORE_POLICY.telemetryStore,maxRecordBytes:128};f.publish(a);
 const captured=inspectRuntimeConfiguration(f.platform(),f.definition);assert.deepEqual(captured.adapterConfigurations[id],{root:path.join(f.root,'artifacts'),...a});
 const first=await runPipelineV2(f.platform(),f.definition,'telemetry:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const aRoot=runRoot(f.source.storageRoot,'telemetry:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 assert.doesNotMatch(fs.readFileSync(path.join(f.root,'artifacts/records/store.json'),'utf8'),/top-secret-telemetry/);
 f.publish({...a,maxRecordBytes:1});const rejected=await runPipelineV2(f.platform(),f.definition,'telemetry:B');assert.equal(rejected.status,'blocked');
 assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'telemetry:B'),'events.jsonl'),'utf8'),/TELEMETRY_RECORD_SIZE_EXCEEDED/);
 assert.equal(captured.adapterConfigurations[id].maxRecordBytes,128);fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(f.platform(),f.definition,'telemetry:A',{schemaVersion:'resume-signal.v2',signalId:'signal:telemetry',idempotencyKey:'signal-key:telemetry',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded');assert.deepEqual(readRunSnapshot(aRoot),snapshot);
});
const invocation=(key,payload={message:'ééé',token:'top-secret-telemetry'})=>({confidential:true,signal:new AbortController().signal,request:{capability:'telemetry.emit',operation:'append',resource:{type:'telemetry.event',canonicalId:'test.policy'},payload,attempt:{runId:'run:boundary',stageId:'probe',attemptId:'attempt:boundary',attemptNumber:1},idempotencyKey:key}});
test('selected actual telemetry byte/count/store limits enforce exact UTF8 boundaries and restored positives',async t=>{
 const f=fixture(t),open=(name,limits)=>activate({config:selectedAdapterConfigurations({[id]:{root:path.join(f.root,name)}},captureCoreRuntimePolicy({...TEST_CORE_POLICY,telemetryStore:{...TEST_CORE_POLICY.telemetryStore,...limits}}))[id]});
 const value={message:'ééé'},size=Buffer.byteLength(JSON.stringify(value));
 await open('entry',{maxRecordBytes:size}).invoke(invocation('one',value));
 await assert.rejects(()=>open('over',{maxRecordBytes:size-1}).invoke(invocation('one',value)),/TELEMETRY_RECORD_SIZE_EXCEEDED/);
 await open('over',{maxRecordBytes:size}).invoke(invocation('one',value));
 await open('records',{maximumRecords:1}).invoke(invocation('one'));
 await assert.rejects(()=>open('records',{maximumRecords:1}).invoke(invocation('two')),/DURABLE_RECORD_STORE_FULL/);
 await open('records',{maximumRecords:2}).invoke(invocation('two'));
 await open('bytes',{maximumStoreBytes:4096}).invoke(invocation('one'));
 const exact=fs.statSync(path.join(f.root,'bytes/records/store.json')).size;await open('bytes',{maximumStoreBytes:exact}).ready();
 await assert.rejects(()=>open('bytes',{maximumStoreBytes:exact}).invoke(invocation('two')),/DURABLE_RECORD_STORE_FULL/);
 await assert.rejects(()=>open('bytes',{maximumStoreBytes:exact-1}).ready(),/OBSERVABILITY_REPLAY_INVALID:snapshot-size/);
 await open('bytes',{maximumStoreBytes:4096}).invoke(invocation('two'));
});
test('all central telemetry leaves required; malformed direct/central values and duplicate authors reject',t=>{
 const f=fixture(t);
 for(const key of Object.keys(TEST_CORE_POLICY.telemetryStore)){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing.telemetryStore[key];assert.throws(()=>captureCoreRuntimePolicy(missing),/INVALID/);assert.throws(()=>activate({config:{root:f.root,...missing.telemetryStore}}),/invalid/);
  for(const value of [0,'1',null,1.5,Number.MAX_SAFE_INTEGER+1]){
   const bad=structuredClone(TEST_CORE_POLICY);bad.telemetryStore[key]=value;assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);assert.throws(()=>activate({config:{root:f.root,...bad.telemetryStore}}),/invalid/);
  }
  for(const value of [TEST_CORE_POLICY.telemetryStore[key],null])assert.throws(()=>selectedAdapterConfigurations({[id]:{root:f.root,[key]:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 }
});

test('selected telemetry structural budgets enforce exact boundaries, capture and restored positives',async t=>{
 const f=fixture(t),open=(name,limits)=>{const config={root:path.join(f.root,name),...TEST_CORE_POLICY.telemetryStore,...limits};const adapter=activate({config});config.maxJsonDepth=100;config.maxJsonNodes=100;return adapter;};
 const nested={child:{value:null}}; // root depth0, child1, leaf2; three total nodes.
 await open('exact',{maxJsonDepth:2,maxJsonNodes:3}).invoke(invocation('one',nested));
 await assert.rejects(()=>open('depth',{maxJsonDepth:1,maxJsonNodes:3}).invoke(invocation('one',nested)),/TELEMETRY_JSON_DEPTH_LIMIT/);
 await open('depth',{maxJsonDepth:2,maxJsonNodes:3}).invoke(invocation('one',nested));
 await assert.rejects(()=>open('nodes',{maxJsonDepth:2,maxJsonNodes:2}).invoke(invocation('one',nested)),/TELEMETRY_JSON_NODE_LIMIT/);
 await open('nodes',{maxJsonDepth:2,maxJsonNodes:3}).invoke(invocation('one',nested));
});
