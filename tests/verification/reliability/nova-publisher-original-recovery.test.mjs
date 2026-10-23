import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {TEST_CORE_POLICY,TEST_CORE_POLICY_SELECTION} from '../../fixtures/core-runtime-policy.mjs';
import {loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {runPipelineV2,resumePipelineV2,recoverPipelineV2,reopenBlockedPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {readRunSnapshot,retainedRuntimePolicies} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {capturePublisherRuntimeBindings,restorePublisherRuntimeBindings} from '../../../skills/nova/core/execution/publisher-runtime-binding.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
const id='kubeclaw.transport-publisher:publisher';

for (const version of ['v1','v3']) test(`real Nova ${version} resume and authenticated admin retry/replay restore original Publisher binding without current-source refill`,async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publisher-original-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const wire=[];
 const server=http.createServer((request,response)=>{const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');wire.push({url:request.url,body});assert.equal(request.headers['x-kubeclaw-signature'],'sha256='+crypto.createHmac('sha256','original-fixture-secret').update(request.headers['x-kubeclaw-target']+'\n'+request.headers['idempotency-key']+'\n'+body).digest('hex'));response.writeHead(202,{'content-type':'application/json'});response.end(JSON.stringify({accepted:true,publicationId:'publication:original'}));});});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});fs.writeFileSync(path.join(plugin,'package.json'),' {"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 if(input.administrative && context.contract.lease.attempt.attemptNumber===1)return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'test.admin',message:'requires authorized retry'},artifacts:[]};
 if(!input.administrative && !context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.publisher',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:publisher',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};
 await context.invoke('transport.publish',{operation:'publish',resource:{type:'transport.target',canonicalId:'publishers'},payload:{message:{original:true}}});
 return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};}`);
 for(const [name,value] of Object.entries({config:{type:'object',additionalProperties:false},input:{type:'object',properties:{administrative:{type:'boolean'}},additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.publisher-original',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'test.publisher-original',module:'entry.mjs',export:'execute',requiredCapabilities:['transport.publish'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const settings=version==='v1'?structuredClone(TEST_CORE_POLICY):JSON.parse(fs.readFileSync(TEST_CORE_POLICY_SELECTION.file,'utf8')).profiles.standard.settings;
 if(settings.reviewPolicySelection)settings.reviewPolicySelection.file=path.resolve(path.dirname(TEST_CORE_POLICY_SELECTION.file),settings.reviewPolicySelection.file);
 const core=path.join(root,'core.json');fs.writeFileSync(core,JSON.stringify({schemaVersion:`nova-core-runtime-policy.${version}`,profiles:{selected:{settings}}}));
 const secretEnv='PUBLISHER_ORIGINAL_RECOVERY_TEST';const previous=process.env[secretEnv];process.env[secretEnv]='original-fixture-secret';t.after(()=>{if(previous===undefined)delete process.env[secretEnv];else process.env[secretEnv]=previous;});
 const common=path.resolve('skills/common/plugins');
 const original={deliveryRoot:path.join(root,'original-deliveries'),targets:{publishers:{endpoint:origin+'/original',signingSecret:'publisher.original',payloadProfile:'standard'}}};
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:core,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'transport.publish':id,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets'},grants:{'test.publisher-original:probe':{'transport.publish':{allowedTargets:['publishers']}},[id]:{'secrets.read':{allowedNames:['publisher.original']},'network.http':{allowedOrigins:[origin]}}},adapters:{[id]:original,'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature','x-kubeclaw-target']},'kubeclaw.secret-resolver:secrets':{environment:{'publisher.original':secretEnv}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[{type:'administrator',id:'admin:publisher'}]};
 const file=path.join(root,'platform.json'),publish=()=>fs.writeFileSync(file,JSON.stringify(source)),platform=()=>loadPlatformConfig(file);publish();
 const definition={schemaVersion:'pipeline-definition.v2',id:'publisher-original',maxConcurrency:1,stages:[{id:'probe',type:'test.publisher-original',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 const first=await runPipelineV2(platform(),definition,'publisher:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const administrativeDefinition=structuredClone(definition);administrativeDefinition.stages[0].input={administrative:true};
 assert.equal((await runPipelineV2(platform(),administrativeDefinition,'publisher:admin')).status,'blocked');
 const adminRoot=runRoot(source.storageRoot,'publisher:admin'),adminSnapshot=readRunSnapshot(adminRoot);
 const aRoot=runRoot(source.storageRoot,'publisher:A'),snapshot=readRunSnapshot(aRoot),retained=retainedRuntimePolicies(aRoot);
 assert.deepEqual(retained.publisherBindings,{[id]:original});assert(Object.isFrozen(retained.publisherBindings));for(const config of Object.values(retained.publisherBindings))assert(Object.isFrozen(config));
 source.adapters[id]={deliveryRoot:path.join(root,'current-deliveries'),targets:{currenttarget:{endpoint:origin+'/current',signingSecret:'publisher.current',payloadProfile:'standard'}}};publish();
 const current=await runPipelineV2(platform(),definition,'publisher:B');assert.equal(current.status,'waiting');assert.equal(readRunSnapshot(runRoot(source.storageRoot,'publisher:B')).registry.configuration.adapters[id].targets.currenttarget.endpoint,origin+'/current');
 // Mutating current grants remains a recovery failure, not original authority.
 source.grants[id]['secrets.read'].allowedNames=['publisher.current'];publish();
 const wait=first.stages.get('probe').wait,signal={schemaVersion:'resume-signal.v2',signalId:'signal:publisher',idempotencyKey:'signal-key:publisher',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}};
 await assert.rejects(resumePipelineV2(platform(),definition,'publisher:A',signal),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);assert.equal(wire.length,0);
 source.grants[id]['secrets.read'].allowedNames=['publisher.original'];publish();fs.unlinkSync(core);
 await assert.rejects(recoverPipelineV2(platform(),definition,'publisher:A'),/RECOVERY_SIGNAL_REQUIRED/);assert.equal(wire.length,0);
 const resumed=await resumePipelineV2(platform(),definition,'publisher:A',signal);assert.equal(resumed.status,'succeeded',JSON.stringify([...resumed.stages]));assert.deepEqual(readRunSnapshot(aRoot),snapshot);assert.equal(wire.length,1);
 assert.equal(wire[0].url,'/original');assert.equal(JSON.parse(wire[0].body).message.original,true);assert(fs.existsSync(original.deliveryRoot));assert.equal(fs.existsSync(path.join(root,'current-deliveries')),false);
 // The separately blocked original follows actual administrative retry, not a
 // forged journal or helper-only restoration. Current B/Core removal persists.
 const decision={schemaVersion:'administrative-reopen.v2',decisionId:'decision:publisher',idempotencyKey:'key:publisher',runId:'publisher:admin',stageId:'probe',actor:{type:'administrator',id:'admin:publisher'},reason:{code:'test.publisher-original'},continuation:'retry',decidedAt:new Date().toISOString()};
 const decisionsFile=path.join(adminRoot,'administrative-decisions.jsonl');
 const decisionsBefore=fs.existsSync(decisionsFile)?fs.readFileSync(decisionsFile,'utf8'):'';
 await assert.rejects(reopenBlockedPipelineV2(platform(),administrativeDefinition,decision,()=>({type:'administrator',id:'admin:foreign'})),/ADMIN_REOPEN_ACTOR_MISMATCH/);
 assert.equal(wire.length,1);assert.equal(fs.existsSync(decisionsFile)?fs.readFileSync(decisionsFile,'utf8'):'',decisionsBefore);
 const admin=await reopenBlockedPipelineV2(platform(),administrativeDefinition,decision,value=>value.actor);
 assert.equal(admin.status,'succeeded',JSON.stringify([...admin.stages]));assert.equal(admin.stages.get('probe').attemptsUsed,2);
 assert.equal(wire.length,2);assert.deepEqual(readRunSnapshot(adminRoot),adminSnapshot);
 assert.equal(wire[1].url,'/original');assert.equal(fs.existsSync(path.join(root,'current-deliveries')),false);
 const journalBefore=fs.readFileSync(path.join(adminRoot,'events.jsonl'),'utf8');
 assert.equal((await reopenBlockedPipelineV2(platform(),administrativeDefinition,decision,()=>{throw new Error('recorded authorized decision must replay');})).status,'succeeded');
 assert.equal(wire.length,2);assert.equal(fs.readFileSync(path.join(adminRoot,'events.jsonl'),'utf8'),journalBefore);
 assert(!JSON.stringify(adminSnapshot).includes('original-fixture-secret'));
 assert(!JSON.stringify(snapshot).includes('original-fixture-secret'));
 // Current source and returned maps do not become a mutable original writer.
 assert.equal(retained.publisherBindings[id].targets.publishers.endpoint,origin+'/original');assert(Object.isFrozen(retained.publisherBindings[id].targets.publishers));
});


test('publisher original capture rejects incomplete/policy-mixed/foreign captures and preserves original legacy/current policies',()=>{
 const raw={deliveryRoot:'/original/deliveries',targets:{publishers:{endpoint:'http://127.0.0.1:9/original',signingSecret:'original.key',payloadProfile:'standard'}}};
 const effective=selectedAdapterConfigurations({[id]:raw},TEST_CORE_POLICY)[id];
 const bindings=capturePublisherRuntimeBindings({[id]:effective},TEST_CORE_POLICY);
 assert.deepEqual(bindings,{[id]:raw});assert(Object.isFrozen(bindings[id].targets.publishers));
 for(const key of Object.keys(effective)){const invalid=structuredClone(effective);delete invalid[key];assert.throws(()=>capturePublisherRuntimeBindings({[id]:invalid},TEST_CORE_POLICY),/RECOVERY_PUBLISHER_/);}
 assert.throws(()=>capturePublisherRuntimeBindings({[id]:{...effective,failureExcerptCharacters:1}},TEST_CORE_POLICY),/POLICY_MISMATCH/);
 assert.throws(()=>capturePublisherRuntimeBindings({[id]:{...effective,extra:true}},TEST_CORE_POLICY),/CONFIGURATION_INVALID/);
 const changed=structuredClone(effective);changed.targetPayloadProfiles.standard.maxPayloadBytes+=1;assert.throws(()=>capturePublisherRuntimeBindings({[id]:changed},TEST_CORE_POLICY),/POLICY_MISMATCH/);
 assert.throws(()=>restorePublisherRuntimeBindings({},bindings),/REGISTRATION_MISMATCH/);
 assert.throws(()=>restorePublisherRuntimeBindings({[id]:raw},{}),/REGISTRATION_MISMATCH/);
 assert.throws(()=>restorePublisherRuntimeBindings({}, {foreign:raw}),/CONFIGURATION_INVALID/);
 const restored=restorePublisherRuntimeBindings({[id]:{wrong:true}},bindings);assert.deepEqual(restored[id],raw);restored[id].targets.publishers.endpoint='mutated';assert.equal(bindings[id].targets.publishers.endpoint,raw.targets.publishers.endpoint);
 assert.deepEqual(restorePublisherRuntimeBindings({},{}),{});
});

