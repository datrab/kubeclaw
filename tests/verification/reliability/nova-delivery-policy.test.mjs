import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {runPipelineV2,resumePipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {inspectRuntimeConfiguration,selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {activate as operatorActivate} from '../../../skills/common/plugins/operator-messaging/src/adapter.ts';
import {activate as publisherActivate} from '../../../skills/common/plugins/transport-publisher/src/adapter.ts';
import http from 'node:http';
import {once} from 'node:events';
import crypto from 'node:crypto';
const operatorId='kubeclaw.operator-messaging:operator',publisherId='kubeclaw.transport-publisher:publisher';
async function fixture(t,kind){
 const id=kind==='operator'?operatorId:publisherId,policyKey=kind==='operator'?'operatorMessagingStore':'transportPublisherStore',capability=kind==='operator'?'operator.request':'transport.publish';
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-artifact-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const received=[],secret='selected-policy-test-secret';
 const env='DELIVERY_POLICY_'+crypto.randomBytes(8).toString('hex').toUpperCase();process.env[env]=secret;t.after(()=>{delete process.env[env];});
 const server=http.createServer(async(request,response)=>{const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks).toString('utf8');
 const transport=kind==='publisher';const signed=transport?'operators\n'+request.headers['idempotency-key']+'\n'+body:request.headers['idempotency-key']+'.'+body;assert.equal(request.headers['x-kubeclaw-signature'],(transport?'sha256=':'v1=')+crypto.createHmac('sha256',secret).update(signed).digest('hex'));received.push(body);response.writeHead(202,{'content-type':'application/json'});response.end(JSON.stringify(kind==='publisher'?{accepted:true,publicationId:'publication:policy'}:{messageId:'policy-received'}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const origin='http://127.0.0.1:'+server.address().port;
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 await context.invoke('operator.request',{operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload:{type:'test.policy',message:'ééé'}});
 if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
 return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.guidance',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:artifact-policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}`);
 if(kind==='publisher'){const entry=path.join(plugin,'entry.mjs');fs.writeFileSync(entry,fs.readFileSync(entry,'utf8').replace("'operator.request'","'transport.publish'").replace("'operator.target'","'transport.target'").replace("payload:{type:'test.policy',message:'ééé'}","payload:{message:{text:'ééé'}}"));}
 const schemas={config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}};
 for(const [name,value]of Object.entries(schemas))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.artifact-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'probe',type:'test.artifact-policy',module:'entry.mjs',export:'execute',requiredCapabilities:[capability],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const coreFile=path.join(root,'core.json'),artifactRoot=path.join(root,'artifacts');
 const publish=limits=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,[policyKey]:limits}}}}));
 publish(TEST_CORE_POLICY[policyKey]);
 const common=path.resolve('skills/common/plugins');
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{[capability]:id,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets'},grants:{'test.artifact-policy:probe':{[capability]:{allowedTargets:['operators']}},[id]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['policy.token']}}},adapters:{[id]:{deliveryRoot:artifactRoot,targets:{operators:{endpoint:origin+'/messages',...(kind==='operator'?{tokenSecret:'policy.token',payloadProfile:'standard'}:{signingSecret:'policy.token',payloadProfile:'standard'})}}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature','x-kubeclaw-target']},'kubeclaw.secret-resolver:secrets':{environment:{'policy.token':env}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'artifact-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.artifact-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 return {root,source,definition,coreFile,publish,received,write:()=>fs.writeFileSync(platformFile,JSON.stringify(source)),publishPayload:profiles=>{const d=JSON.parse(fs.readFileSync(coreFile,'utf8'));d.profiles.selected.settings[kind==='operator'?'operatorMessagingPayload':'transportPublisherPayload']={...d.profiles.selected.settings[kind==='operator'?'operatorMessagingPayload':'transportPublisherPayload'],targetPayloadProfiles:profiles};fs.writeFileSync(coreFile,JSON.stringify(d));},platform:()=>loadPlatformConfig(platformFile)};
}
for(const kind of ['operator','publisher']) {
 const id=kind==='operator'?operatorId:publisherId,policyKey=kind==='operator'?'operatorMessagingStore':'transportPublisherStore',activate=kind==='operator'?operatorActivate:publisherActivate;
test(kind+' actual Nova delivery A/B store ceilings, real signed HTTP and retained A resume without B',async t=>{
 const f=await fixture(t,kind),a=TEST_CORE_POLICY[policyKey];f.publish(a);const captured=inspectRuntimeConfiguration(f.platform(),f.definition);
 assert.equal(captured.adapterConfigurations[id].maximumDeliveryRecords,a.maximumDeliveryRecords);assert.equal(captured.adapterConfigurations[id].maximumDeliveryBytes,a.maximumDeliveryBytes);assert.equal(captured.adapterConfigurations[id].maximumRecordBytes,a.maximumRecordBytes);
 const first=await runPipelineV2(f.platform(),f.definition,'delivery:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));assert.equal(f.received.length,1);
 const aRoot=runRoot(f.source.storageRoot,'delivery:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 for(const key of Object.keys(a)){
  f.publish({...a,[key]:1});const result=await runPipelineV2(f.platform(),f.definition,'delivery:B-'+key);assert.equal(result.status,'blocked');
  assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'delivery:B-'+key),'events.jsonl'),'utf8'),key==='maximumRecordBytes'?/DURABLE_RECORD_SIZE_EXCEEDED/:/DURABLE_RECORD_STORE_FULL|OBSERVABILITY_REPLAY_INVALID:snapshot-size/);assert.equal(f.received.length,1);
 }
 fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(f.platform(),f.definition,'delivery:A',{schemaVersion:'resume-signal.v2',signalId:'signal:delivery',idempotencyKey:'signal-key:delivery',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded');assert.equal(f.received.length,2);assert.deepEqual(readRunSnapshot(aRoot),snapshot);
});
test(kind+' delivery policy leaves mandatory; malformed central/direct values and duplicate raw authors reject',async t=>{
 const f=await fixture(t,kind);
 for(const key of Object.keys(TEST_CORE_POLICY[policyKey])){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing[policyKey][key];assert.throws(()=>captureCoreRuntimePolicy(missing),/INVALID/);assert.throws(()=>activate({config:{...f.source.adapters[id],...missing[policyKey]}}),/INVALID/);
  for(const value of [0,'1',null,1.5,Number.MAX_SAFE_INTEGER+1]){
   const bad=structuredClone(TEST_CORE_POLICY);bad[policyKey][key]=value;assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);assert.throws(()=>activate({config:{...f.source.adapters[id],...bad[policyKey]}}),/INVALID/);
  }
  for(const value of [TEST_CORE_POLICY[policyKey][key],null])assert.throws(()=>selectedAdapterConfigurations({[id]:{...f.source.adapters[id],[key]:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 }
});

}

test('publisher central payload exact UTF-8/overflow/restored positives and original A selectors without current B',async t=>{
 const f=await fixture(t,'publisher');const cap=Buffer.byteLength(JSON.stringify({message:{text:'ééé'}}),'utf8');
 f.publishPayload({standard:{maxPayloadBytes:cap},small:{maxPayloadBytes:cap-1}});
 const inspected=inspectRuntimeConfiguration(f.platform(),f.definition);assert.equal(inspected.adapterConfigurations[publisherId].targetPayloadProfiles.standard.maxPayloadBytes,cap);
 const first=await runPipelineV2(f.platform(),f.definition,'payload:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));assert.equal(f.received.length,1);
 const aRoot=runRoot(f.source.storageRoot,'payload:A'),saved=readRunSnapshot(aRoot);
 f.source.adapters[publisherId].targets.operators.payloadProfile='small';f.write();
 const small=await runPipelineV2(f.platform(),f.definition,'payload:B');assert.equal(small.status,'blocked');assert.equal(f.received.length,1);assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'payload:B'),'events.jsonl'),'utf8'),/TRANSPORT_PAYLOAD_SIZE_EXCEEDED/);
 f.source.adapters[publisherId].targets.operators.payloadProfile='standard';f.write();
 assert.equal((await runPipelineV2(f.platform(),f.definition,'payload:restored')).status,'waiting');assert.equal(f.received.length,2);
 f.source.adapters[publisherId].targets.operators.payloadProfile='missing-current-B';
 f.source.adapters[publisherId].targets.operators.endpoint='http://127.0.0.1:1/current-B';
 f.source.adapters[publisherId].targets.operators.signingSecret='missing-B-secret';
 f.write();fs.unlinkSync(f.coreFile);
 // Original endpoint, secret reference and payload selection are received together.
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_SIGNAL_REQUIRED/);
 assert.equal(f.received.length,2);assert.deepEqual(readRunSnapshot(aRoot),saved);
 const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(f.platform(),f.definition,'payload:A',{schemaVersion:'resume-signal.v2',signalId:'signal:payload',idempotencyKey:'signal-key:payload',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded');assert.equal(f.received.length,3);assert.deepEqual(readRunSnapshot(aRoot),saved);
 // Current endpoint B is no longer an author for retained A. Terminal A
 // must reject before another effect; changed grants remain a real admission negative.
 const journalFile=path.join(aRoot,'effects.jsonl'),prefix=fs.readFileSync(journalFile);
 f.source.adapters[publisherId].targets.operators.endpoint+='/changed';f.write();
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_RUN_TERMINAL:payload:A:run.succeeded/);
 assert.equal(f.received.length,3);assert.deepEqual(fs.readFileSync(journalFile),prefix);assert.deepEqual(readRunSnapshot(aRoot),saved);
 const originalGrants=structuredClone(f.source.grants[publisherId]);
 f.source.grants[publisherId]['network.http'].allowedOrigins=['https://changed.invalid'];f.write();
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
 assert.equal(f.received.length,3);assert.deepEqual(fs.readFileSync(journalFile),prefix);assert.deepEqual(readRunSnapshot(aRoot),saved);
 f.source.grants[publisherId]=originalGrants;f.write();
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_RUN_TERMINAL:payload:A:run.succeeded/);
 assert.equal(f.received.length,3);assert.deepEqual(fs.readFileSync(journalFile),prefix);assert.deepEqual(readRunSnapshot(aRoot),saved);
});
test('publisher mandatory central payload profiles and selectors reject all former defaults/duplicates',async t=>{
 const f=await fixture(t,'publisher'),policy=TEST_CORE_POLICY.transportPublisherPayload;
 const raw=f.source.adapters[publisherId],valid={...raw,...TEST_CORE_POLICY.transportPublisherStore,...TEST_CORE_POLICY.transportPublisherFailure,...TEST_CORE_POLICY.transportPublisherStructure,...policy};
 assert.doesNotThrow(()=>publisherActivate({config:valid}));
 for(const value of [undefined,null,'262144',0,1.5,1048577]){
  const profiles={standard:{maxPayloadBytes:value}};if(value===undefined)delete profiles.standard.maxPayloadBytes;
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,transportPublisherPayload:{targetPayloadProfiles:profiles}}),/INVALID/);
  assert.throws(()=>publisherActivate({config:{...valid,targetPayloadProfiles:profiles}}),/INVALID/);
 }
 for(const value of [undefined,null,{}, {standard:{maxPayloadBytes:1,extra:true}}])assert.throws(()=>publisherActivate({config:{...valid,targetPayloadProfiles:value}}),/INVALID/);
 for(const value of [undefined,null,'absent'])assert.throws(()=>publisherActivate({config:{...valid,targets:{operators:{...raw.targets.operators,payloadProfile:value}}}}),/payloadProfile/);
 for(const value of [262144,null])assert.throws(()=>publisherActivate({config:{...valid,targets:{operators:{...raw.targets.operators,maxPayloadBytes:value}}}}),/INVALID:target/);
 for(const value of [policy.targetPayloadProfiles,null])assert.throws(()=>selectedAdapterConfigurations({[publisherId]:{...raw,targetPayloadProfiles:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 assert.doesNotThrow(()=>publisherActivate({config:valid}));
});

test('operator central payload exact UTF-8/overflow/restored positives and original A selectors without current B',async t=>{
 const f=await fixture(t,'operator');const cap=Buffer.byteLength(JSON.stringify({type:'test.policy',message:'ééé'}),'utf8');
 f.publishPayload({standard:{maxPayloadBytes:cap},small:{maxPayloadBytes:cap-1}});
 const inspected=inspectRuntimeConfiguration(f.platform(),f.definition);assert.equal(inspected.adapterConfigurations[operatorId].targetPayloadProfiles.standard.maxPayloadBytes,cap);
 const first=await runPipelineV2(f.platform(),f.definition,'payload:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));assert.equal(f.received.length,1);
 const aRoot=runRoot(f.source.storageRoot,'payload:A'),saved=readRunSnapshot(aRoot);
 f.source.adapters[operatorId].targets.operators.payloadProfile='small';f.write();
 const small=await runPipelineV2(f.platform(),f.definition,'payload:B');assert.equal(small.status,'blocked');assert.equal(f.received.length,1);assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'payload:B'),'events.jsonl'),'utf8'),/OPERATOR_PAYLOAD_SIZE_EXCEEDED/);
 f.source.adapters[operatorId].targets.operators.payloadProfile='standard';f.write();
 assert.equal((await runPipelineV2(f.platform(),f.definition,'payload:restored')).status,'waiting');assert.equal(f.received.length,2);
 f.source.adapters[operatorId].targets.operators.payloadProfile='missing-current-B';
 f.source.adapters[operatorId].targets.operators.endpoint='http://127.0.0.1:1/current-B';
 f.source.adapters[operatorId].targets.operators.tokenSecret='missing-B-secret';
 f.write();fs.unlinkSync(f.coreFile);
 // Original endpoint, secret reference and payload selection are received together.
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_SIGNAL_REQUIRED/);
 assert.equal(f.received.length,2);assert.deepEqual(readRunSnapshot(aRoot),saved);
 const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(f.platform(),f.definition,'payload:A',{schemaVersion:'resume-signal.v2',signalId:'signal:payload',idempotencyKey:'signal-key:payload',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});
 assert.equal(resumed.status,'succeeded');assert.equal(f.received.length,3);assert.deepEqual(readRunSnapshot(aRoot),saved);
 // Current endpoint B is no longer an author for retained A. Terminal A
 // must reject before another effect; changed grants remain a real admission negative.
 const journalFile=path.join(aRoot,'effects.jsonl'),prefix=fs.readFileSync(journalFile);
 f.source.adapters[operatorId].targets.operators.endpoint+='/changed';f.write();
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_RUN_TERMINAL:payload:A:run.succeeded/);
 assert.equal(f.received.length,3);assert.deepEqual(fs.readFileSync(journalFile),prefix);assert.deepEqual(readRunSnapshot(aRoot),saved);
 const originalGrants=structuredClone(f.source.grants[operatorId]);
 f.source.grants[operatorId]['network.http'].allowedOrigins=['https://changed.invalid'];f.write();
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
 assert.equal(f.received.length,3);assert.deepEqual(fs.readFileSync(journalFile),prefix);assert.deepEqual(readRunSnapshot(aRoot),saved);
 f.source.grants[operatorId]=originalGrants;f.write();
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'payload:A'),/RECOVERY_RUN_TERMINAL:payload:A:run.succeeded/);
 assert.equal(f.received.length,3);assert.deepEqual(fs.readFileSync(journalFile),prefix);assert.deepEqual(readRunSnapshot(aRoot),saved);
});
test('operator mandatory central payload profiles and selectors reject all former defaults/duplicates',async t=>{
 const f=await fixture(t,'operator'),policy=TEST_CORE_POLICY.operatorMessagingPayload;
 const raw=f.source.adapters[operatorId],valid={...raw,...TEST_CORE_POLICY.operatorMessagingFailure,...TEST_CORE_POLICY.operatorMessagingStore,...policy};
 assert.doesNotThrow(()=>operatorActivate({config:valid}));
 for(const value of [undefined,null,'65536',0,1.5,1048577]){
  const profiles={standard:{maxPayloadBytes:value}};if(value===undefined)delete profiles.standard.maxPayloadBytes;
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,operatorMessagingPayload:{targetPayloadProfiles:profiles}}),/INVALID/);
  assert.throws(()=>operatorActivate({config:{...valid,targetPayloadProfiles:profiles}}),/INVALID/);
 }
 for(const value of [undefined,null,{}, {standard:{maxPayloadBytes:1,extra:true}}])assert.throws(()=>operatorActivate({config:{...valid,targetPayloadProfiles:value}}),/INVALID/);
 for(const value of [undefined,null,'absent'])assert.throws(()=>operatorActivate({config:{...valid,targets:{operators:{...raw.targets.operators,payloadProfile:value}}}}),/payloadProfile/);
 for(const value of [65536,null])assert.throws(()=>operatorActivate({config:{...valid,targets:{operators:{...raw.targets.operators,maxPayloadBytes:value}}}}),/UNKNOWN_TARGET_FIELD/);
 for(const value of [policy.targetPayloadProfiles,null])assert.throws(()=>selectedAdapterConfigurations({[operatorId]:{...raw,targetPayloadProfiles:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 assert.doesNotThrow(()=>operatorActivate({config:valid}));
});


test('transport failure excerpt is selected, immutable, durable and rejects absent or competing authors',async t=>{
 const f=await fixture(t,'publisher'),raw=f.source.adapters[publisherId];
 const request={capability:'transport.publish',operation:'publish',resource:{type:'transport.target',canonicalId:'operators'},payload:{message:{text:'test'}},idempotencyKey:'excerpt:key',attempt:{runId:'run:excerpt',stageId:'probe',attemptId:'attempt:excerpt',attemptNumber:1}};
 const reason='abcdef failure detail';
 for(const maximum of [4,8,2048]) {
  const policy=captureCoreRuntimePolicy({...TEST_CORE_POLICY,transportPublisherFailure:{failureExcerptCharacters:maximum}});
  const config=structuredClone(selectedAdapterConfigurations({[publisherId]:{...raw,deliveryRoot:path.join(f.root,'failure-'+maximum)}},policy)[publisherId]);
  let sends=0;const adapter=publisherActivate({config,async invoke(capability){if(capability==='secrets.read')return {value:'test-only-key'};sends++;throw new Error(reason);}});
  config.failureExcerptCharacters=1;
  const invoke=()=>adapter.invoke({request,confidential:true,signal:new AbortController().signal});
  await assert.rejects(invoke(),error=>error.message===reason);
  await assert.rejects(invoke(),error=>error.message===reason.slice(0,maximum));
  assert.equal(sends,1,'durable failure replay does not resend');
  await adapter.shutdown();
 }
 for(const value of [undefined,null,0,-1,1.5,'4',2049]) {
  const invalid={failureExcerptCharacters:value};
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,transportPublisherFailure:invalid}),/INVALID/);
  assert.throws(()=>publisherActivate({config:{...selectedAdapterConfigurations({[publisherId]:raw},TEST_CORE_POLICY)[publisherId],...invalid}}),/TRANSPORT_CONFIG_INVALID/);
 }
 for(const value of [4,null])assert.throws(()=>selectedAdapterConfigurations({[publisherId]:{...raw,failureExcerptCharacters:value}},TEST_CORE_POLICY),/TRANSPORT_FAILURE_POLICY_COMPETING_AUTHOR/);
});


test('transport selected JSON depth exact/overflow/restored, captured policy and mandatory single author',async t=>{
 const f=await fixture(t,'publisher'),raw=f.source.adapters[publisherId];
 const nested=n=>{let value='leaf';for(let i=0;i<n;i++)value={child:value};return value;};
 for(const maximum of [1,2,64]){
  const policy=captureCoreRuntimePolicy({...TEST_CORE_POLICY,transportPublisherStructure:{maxJsonDepth:maximum}});
  const config=structuredClone(selectedAdapterConfigurations({[publisherId]:{...raw,deliveryRoot:path.join(f.root,'depth-'+maximum)}},policy)[publisherId]);
  let sends=0;const adapter=publisherActivate({config,async invoke(capability){if(capability==='secrets.read')return {value:'test-only-key'};sends++;return {status:202,headers:{},body:{accepted:true,publicationId:'depth:ok'}};}});
  config.maxJsonDepth=maximum===1?64:1;
  const invoke=(depth,key)=>adapter.invoke({request:{capability:'transport.publish',operation:'publish',resource:{type:'transport.target',canonicalId:'operators'},payload:{message:nested(depth)},idempotencyKey:key,attempt:{runId:'run:depth',stageId:'probe',attemptId:'attempt:depth',attemptNumber:1}},confidential:true,signal:new AbortController().signal});
  await invoke(maximum,'exact');assert.equal(sends,1);
  await assert.rejects(invoke(maximum+1,'overflow'),/TRANSPORT_PAYLOAD_DEPTH_EXCEEDED/);assert.equal(sends,1);
  await invoke(maximum,'restored');assert.equal(sends,2);await adapter.shutdown();
 }
 for(const value of [undefined,null,0,-1,1.5,'2',65]){
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,transportPublisherStructure:{maxJsonDepth:value}}),/INVALID/);
  assert.throws(()=>publisherActivate({config:{...selectedAdapterConfigurations({[publisherId]:raw},TEST_CORE_POLICY)[publisherId],maxJsonDepth:value}}),/TRANSPORT_CONFIG_INVALID/);
 }
 for(const value of [64,null])assert.throws(()=>selectedAdapterConfigurations({[publisherId]:{...raw,maxJsonDepth:value}},TEST_CORE_POLICY),/TRANSPORT_STRUCTURE_POLICY_COMPETING_AUTHOR/);
});

test('operator failure excerpt is selected, immutable, durable and rejects absent or competing authors',async t=>{
 const f=await fixture(t,'operator'),raw=f.source.adapters[operatorId];
 const request={capability:'operator.request',operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload:{type:'test.policy',message:'test'},idempotencyKey:'excerpt:key',attempt:{runId:'run:excerpt',stageId:'probe',attemptId:'attempt:excerpt',attemptNumber:1}};
 const reason='abcdef failure detail';
 for(const maximum of [4,8,2048]) {
  const policy=captureCoreRuntimePolicy({...TEST_CORE_POLICY,operatorMessagingFailure:{failureExcerptCharacters:maximum}});
  const config=structuredClone(selectedAdapterConfigurations({[operatorId]:{...raw,deliveryRoot:path.join(f.root,'failure-'+maximum)}},policy)[operatorId]);
  let sends=0;const adapter=operatorActivate({config,async invoke(capability){sends++;throw new Error(reason);}});
  config.failureExcerptCharacters=1;
  const invoke=()=>adapter.invoke({request,confidential:true,signal:new AbortController().signal});
  await assert.rejects(invoke(),error=>error.message===reason);
  await assert.rejects(invoke(),error=>error.message===reason.slice(0,maximum));
  assert.equal(sends,1,'durable not-sent failure replay does not retry secret resolution');
  await adapter.shutdown();
 }
 for(const value of [undefined,null,0,-1,1.5,'4',2049]) {
  const invalid={failureExcerptCharacters:value};
  assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,operatorMessagingFailure:invalid}),/INVALID/);
  assert.throws(()=>operatorActivate({config:{...selectedAdapterConfigurations({[operatorId]:raw},TEST_CORE_POLICY)[operatorId],...invalid}}),/OPERATOR_CONFIG_INVALID/);
 }
 for(const value of [4,null])assert.throws(()=>selectedAdapterConfigurations({[operatorId]:{...raw,failureExcerptCharacters:value}},TEST_CORE_POLICY),/OPERATOR_FAILURE_POLICY_COMPETING_AUTHOR/);
});
