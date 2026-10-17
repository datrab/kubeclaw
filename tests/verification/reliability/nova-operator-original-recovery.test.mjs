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
import {captureOperatorRuntimeBindings,restoreOperatorRuntimeBindings} from '../../../skills/nova/core/execution/operator-runtime-binding.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
const id='kubeclaw.operator-messaging:operator';

for (const version of ['v1','v3']) test(`real Nova ${version} resume and authenticated admin retry/replay restore original Operator binding without current-source refill`,async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'operator-original-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const wire=[];
 const server=http.createServer((request,response)=>{const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');wire.push({url:request.url,body});assert.equal(request.headers['x-kubeclaw-signature'],'v1='+crypto.createHmac('sha256','original-fixture-secret').update(request.headers['idempotency-key']+'.'+body).digest('hex'));response.writeHead(202,{'content-type':'application/json'});response.end(JSON.stringify({messageId:'message:original'}));});});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});fs.writeFileSync(path.join(plugin,'package.json'),' {"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 if(input.administrative && context.contract.lease.attempt.attemptNumber===1)return {schemaVersion:'stage-result.v2',outcome:'blocked',reason:{code:'test.admin',message:'requires authorized retry'},artifacts:[]};
 if(!input.administrative && !context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.operator',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:operator',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};
 await context.invoke('operator.request',{operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload:{type:'event.test',artifact:{original:true}}});
 return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};}`);
 for(const [name,value] of Object.entries({config:{type:'object',additionalProperties:false},input:{type:'object',properties:{administrative:{type:'boolean'}},additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.operator-original',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'test.operator-original',module:'entry.mjs',export:'execute',requiredCapabilities:['operator.request'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const settings=version==='v1'?structuredClone(TEST_CORE_POLICY):JSON.parse(fs.readFileSync(TEST_CORE_POLICY_SELECTION.file,'utf8')).profiles.standard.settings;
 if(settings.reviewPolicySelection)settings.reviewPolicySelection.file=path.resolve(path.dirname(TEST_CORE_POLICY_SELECTION.file),settings.reviewPolicySelection.file);
 const core=path.join(root,'core.json');fs.writeFileSync(core,JSON.stringify({schemaVersion:`nova-core-runtime-policy.${version}`,profiles:{selected:{settings}}}));
 const secretEnv='OPERATOR_ORIGINAL_RECOVERY_TEST';const previous=process.env[secretEnv];process.env[secretEnv]='original-fixture-secret';t.after(()=>{if(previous===undefined)delete process.env[secretEnv];else process.env[secretEnv]=previous;});
 const common=path.resolve('skills/common/plugins');
 const original={deliveryRoot:path.join(root,'original-deliveries'),targets:{operators:{endpoint:origin+'/original',tokenSecret:'operator.original',payloadProfile:'standard',format:'json'}}};
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:core,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'operator.request':id,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets'},grants:{'test.operator-original:probe':{'operator.request':{allowedTargets:['operators']}},[id]:{'secrets.read':{allowedNames:['operator.original']},'network.http':{allowedOrigins:[origin]}}},adapters:{[id]:original,'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},'kubeclaw.secret-resolver:secrets':{environment:{'operator.original':secretEnv}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[{type:'administrator',id:'admin:operator'}]};
 const file=path.join(root,'platform.json'),publish=()=>fs.writeFileSync(file,JSON.stringify(source)),platform=()=>loadPlatformConfig(file);publish();
 const definition={schemaVersion:'pipeline-definition.v2',id:'operator-original',maxConcurrency:1,stages:[{id:'probe',type:'test.operator-original',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 const first=await runPipelineV2(platform(),definition,'operator:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const administrativeDefinition=structuredClone(definition);administrativeDefinition.stages[0].input={administrative:true};
 assert.equal((await runPipelineV2(platform(),administrativeDefinition,'operator:admin')).status,'blocked');
 const adminRoot=runRoot(source.storageRoot,'operator:admin'),adminSnapshot=readRunSnapshot(adminRoot);
 const aRoot=runRoot(source.storageRoot,'operator:A'),snapshot=readRunSnapshot(aRoot),retained=retainedRuntimePolicies(aRoot);
 assert.deepEqual(retained.operatorBindings,{[id]:original});assert(Object.isFrozen(retained.operatorBindings));for(const config of Object.values(retained.operatorBindings))assert(Object.isFrozen(config));
 source.adapters[id]={deliveryRoot:path.join(root,'current-deliveries'),targets:{operators:{endpoint:origin+'/current',tokenSecret:'operator.current',payloadProfile:'standard',format:'json'}}};publish();
 const current=await runPipelineV2(platform(),definition,'operator:B');assert.equal(current.status,'waiting');assert.equal(readRunSnapshot(runRoot(source.storageRoot,'operator:B')).registry.configuration.adapters[id].targets.operators.endpoint,origin+'/current');
 // Mutating current grants remains a recovery failure, not original authority.
 source.grants[id]['secrets.read'].allowedNames=['operator.current'];publish();
 const wait=first.stages.get('probe').wait,signal={schemaVersion:'resume-signal.v2',signalId:'signal:operator',idempotencyKey:'signal-key:operator',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}};
 await assert.rejects(resumePipelineV2(platform(),definition,'operator:A',signal),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);assert.equal(wire.length,0);
 source.grants[id]['secrets.read'].allowedNames=['operator.original'];publish();fs.unlinkSync(core);
 await assert.rejects(recoverPipelineV2(platform(),definition,'operator:A'),/RECOVERY_SIGNAL_REQUIRED/);assert.equal(wire.length,0);
 assert.equal((await resumePipelineV2(platform(),definition,'operator:A',signal)).status,'succeeded');assert.deepEqual(readRunSnapshot(aRoot),snapshot);assert.equal(wire.length,1);
 assert.equal(wire[0].url,'/original');assert.equal(JSON.parse(wire[0].body).artifact.original,true);assert(fs.existsSync(original.deliveryRoot));assert.equal(fs.existsSync(path.join(root,'current-deliveries')),false);
 // The separately blocked original follows actual administrative retry, not a
 // forged journal or helper-only restoration. Current B/Core removal persists.
 const decision={schemaVersion:'administrative-reopen.v2',decisionId:'decision:operator',idempotencyKey:'key:operator',runId:'operator:admin',stageId:'probe',actor:{type:'administrator',id:'admin:operator'},reason:{code:'test.operator-original'},continuation:'retry',decidedAt:new Date().toISOString()};
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
 assert.equal(retained.operatorBindings[id].targets.operators.endpoint,origin+'/original');assert(Object.isFrozen(retained.operatorBindings[id].targets.operators));
});


test('operator original capture rejects incomplete/policy-mixed/foreign captures and preserves original legacy/current policies',()=>{
 const raw={deliveryRoot:'/original/deliveries',targets:{operators:{endpoint:'http://127.0.0.1:9/original',tokenSecret:'original.key',payloadProfile:'standard',format:'json'}}};
 const effective=selectedAdapterConfigurations({[id]:raw},TEST_CORE_POLICY)[id];
 const bindings=captureOperatorRuntimeBindings({[id]:effective},TEST_CORE_POLICY);
 assert.deepEqual(bindings,{[id]:raw});assert(Object.isFrozen(bindings[id].targets.operators));
 for(const key of Object.keys(effective)){const invalid=structuredClone(effective);delete invalid[key];assert.throws(()=>captureOperatorRuntimeBindings({[id]:invalid},TEST_CORE_POLICY),/RECOVERY_OPERATOR_/);}
 assert.throws(()=>captureOperatorRuntimeBindings({[id]:{...effective,failureExcerptCharacters:1}},TEST_CORE_POLICY),/POLICY_MISMATCH/);
 assert.throws(()=>captureOperatorRuntimeBindings({[id]:{...effective,extra:true}},TEST_CORE_POLICY),/CONFIGURATION_INVALID/);
 assert.throws(()=>restoreOperatorRuntimeBindings({},bindings),/REGISTRATION_MISMATCH/);
 assert.throws(()=>restoreOperatorRuntimeBindings({[id]:raw},{}),/REGISTRATION_MISMATCH/);
 assert.throws(()=>restoreOperatorRuntimeBindings({}, {foreign:raw}),/CONFIGURATION_INVALID/);
 const restored=restoreOperatorRuntimeBindings({[id]:{wrong:true}},bindings);assert.deepEqual(restored[id],raw);restored[id].targets.operators.endpoint='mutated';assert.equal(bindings[id].targets.operators.endpoint,raw.targets.operators.endpoint);
 assert.deepEqual(restoreOperatorRuntimeBindings({},{}),{});
});

test('current v3 original operator capture compares nested structure and version before reprojecting',()=>{
 const policy=loadCoreRuntimePolicy(TEST_CORE_POLICY_SELECTION),raw={deliveryRoot:'/original',targets:{operators:{endpointOrigin:'http://127.0.0.1:9',endpointSecret:'operator.webhook',payloadProfile:'standard',format:'discord_webhook'}}};
 const effective=selectedAdapterConfigurations({[id]:raw},policy)[id];
 assert.equal(effective.payloadPolicyVersion,'operator-payload.v2');
 const bindings=captureOperatorRuntimeBindings({[id]:effective},policy);
 assert.deepEqual(bindings,{[id]:raw});
 const b=structuredClone(raw);b.targets.operators.endpointOrigin='http://127.0.0.1:1';
 assert.deepEqual(selectedAdapterConfigurations(restoreOperatorRuntimeBindings({[id]:b},bindings),policy)[id],effective);
 for(const key of ['payloadPolicyVersion','payloadStructure']){const invalid=structuredClone(effective);delete invalid[key];assert.throws(()=>captureOperatorRuntimeBindings({[id]:invalid},policy),/POLICY_MISMATCH/);}
 const invalid=structuredClone(effective);invalid.payloadStructure.maximumDepth+=1;assert.throws(()=>captureOperatorRuntimeBindings({[id]:invalid},policy),/POLICY_MISMATCH/);
});
