import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadPlatformConfig} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations,inspectRuntimeConfiguration} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {runPipelineV2,resumePipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {activate} from '../../../skills/common/plugins/runtime-dispatch/src/adapter.ts';
const id='kubeclaw.runtime-dispatch:runtime',payload={task:'ééé'},responseBody={answer:'ééé'};
const size=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const profiles=limits=>({targetByteProfiles:{chosen:limits}});
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-http-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const received=[],secret='http-policy-test-secret',env='HTTP_POLICY_'+crypto.randomBytes(8).toString('hex').toUpperCase();process.env[env]=secret;t.after(()=>{delete process.env[env];});
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString('utf8');assert.equal(req.headers['x-kubeclaw-signature'],'v1='+crypto.createHmac('sha256',secret).update(req.headers['idempotency-key']+'.'+body).digest('hex'));received.push(body);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(responseBody));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const origin='http://127.0.0.1:'+server.address().port;
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'worker'},payload:${JSON.stringify(payload)}});if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.guidance',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:http-policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}`);
 for(const [name,value] of Object.entries({config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.http-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],adapters:[],stages:[{id:'probe',type:'test.http-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['runtime.dispatch'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const coreFile=path.join(root,'core.json'),publish=limits=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,httpDispatch:profiles(limits)}}}}));publish({maxRequestBytes:1000,maxResponseBytes:1000});
 const common=path.resolve('skills/common/plugins');const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'runtime.dispatch':id,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets'},grants:{'test.http-policy:probe':{'runtime.dispatch':{allowedAgents:['worker']}},[id]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['policy.token']}}},adapters:{[id]:{targets:{worker:{endpoint:origin+'/dispatch',tokenSecret:'policy.token',byteProfile:'chosen'}}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},'kubeclaw.secret-resolver:secrets':{environment:{'policy.token':env}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json'),write=()=>fs.writeFileSync(platformFile,JSON.stringify(source));write();const definition={schemaVersion:'pipeline-definition.v2',id:'http-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.http-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};return {root,source,definition,received,coreFile,publish,write,platform:()=>loadPlatformConfig(platformFile),secret};
}
test('actual Nova HTTP request/response A/B boundaries and retained A selector+values without B',async t=>{
 const f=await fixture(t),a={maxRequestBytes:size(payload),maxResponseBytes:size(responseBody)};f.publish(a);
 const selected=inspectRuntimeConfiguration(f.platform(),f.definition);assert.deepEqual(selected.adapterConfigurations[id].targetByteProfiles,profiles(a).targetByteProfiles);
 const first=await runPipelineV2(f.platform(),f.definition,'http:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));assert.equal(f.received.length,1);const saved=readRunSnapshot(runRoot(f.source.storageRoot,'http:A'));
 for(const field of Object.keys(a)) {f.publish({...a,[field]:a[field]-1});const before=f.received.length,result=await runPipelineV2(f.platform(),f.definition,'http:B-'+field);assert.equal(result.status,'blocked');assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'http:B-'+field),'events.jsonl'),'utf8'),field==='maxRequestBytes'?/RUNTIME_REQUEST_SIZE_EXCEEDED/:/RUNTIME_RESPONSE_SIZE_EXCEEDED/);assert.equal(f.received.length,before+(field==='maxResponseBytes'?1:0));}
 f.source.adapters[id].targets.worker.byteProfile='missing-current-B';f.write();fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 const resumed=await resumePipelineV2(f.platform(),f.definition,'http:A',{schemaVersion:'resume-signal.v2',signalId:'signal:http',idempotencyKey:'signal-key:http',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}});assert.equal(resumed.status,'succeeded');assert.deepEqual(readRunSnapshot(runRoot(f.source.storageRoot,'http:A')),saved);assert.equal(f.source.adapters[id].targets.worker.byteProfile,'missing-current-B');
 f.source.adapters[id].targets.worker.endpoint+='/changed';f.write();await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'http:A'),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
});
test('actual HTTP receiver selects distinct byte profiles, captures immutable caps and restores positives',async t=>{
 const f=await fixture(t),a={maxRequestBytes:size(payload),maxResponseBytes:size(responseBody)},raw=f.source.adapters[id];
 const byteProfiles={exact:a,small:{...a,maxRequestBytes:a.maxRequestBytes-1}};
 const policy=captureCoreRuntimePolicy({...TEST_CORE_POLICY,httpDispatch:{targetByteProfiles:byteProfiles}});
 const config=structuredClone(selectedAdapterConfigurations({[id]:{targets:{worker:{...raw.targets.worker,byteProfile:'exact'},small:{...raw.targets.worker,byteProfile:'small'}}}},policy)[id]);
 const instance=activate({config,async invokeConfidential(capability,request){if(capability==='secrets.read')return {value:f.secret};const res=await fetch(request.resource.canonicalId,{method:'POST',headers:request.payload.headers,body:JSON.stringify(request.payload.body)});return {status:res.status,body:await res.json()};}});
 config.targetByteProfiles.exact.maxRequestBytes=1; // structured input is captured at activation, not reread.
 const invoke=target=>instance.invoke({request:{capability:'runtime.dispatch',operation:'dispatch',resource:{type:'runtime.agent',canonicalId:target},payload,idempotencyKey:'direct:'+target},signal:new AbortController().signal,confidential:true});
 assert.deepEqual(await invoke('worker'),responseBody);await assert.rejects(invoke('small'),/RUNTIME_REQUEST_SIZE_EXCEEDED/);assert.deepEqual(await invoke('worker'),responseBody);assert.equal(f.received.length,2);
});
test('HTTP policy missing/invalid/legacy duplicates/profile bindings fail closed with restored positive',async t=>{
 const f=await fixture(t),base=profiles({maxRequestBytes:20,maxResponseBytes:20}),raw=f.source.adapters[id],valid={...raw,...base};assert.doesNotThrow(()=>activate({config:valid}));
 for(const field of ['maxRequestBytes','maxResponseBytes']) {
  for(const value of [undefined,null,'20',0,1.5,8388609]) {const bad=structuredClone(base);if(value===undefined)delete bad.targetByteProfiles.chosen[field];else bad.targetByteProfiles.chosen[field]=value;assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,httpDispatch:bad}),/INVALID/);assert.throws(()=>activate({config:{...raw,...bad}}),/INVALID/);}
  for(const value of [20,null])assert.throws(()=>activate({config:{...valid,targets:{worker:{...raw.targets.worker,[field]:value}}}}),/UNKNOWN_TARGET_FIELD/);
 }
 for(const value of [undefined,{},null])assert.throws(()=>activate({config:{...raw,targetByteProfiles:value}}),/INVALID/);
 for(const value of [undefined,'absent',null])assert.throws(()=>activate({config:{...valid,targets:{worker:{...raw.targets.worker,byteProfile:value}}}}),/byteProfile/);
 for(const value of [base.targetByteProfiles,null])assert.throws(()=>selectedAdapterConfigurations({[id]:{...raw,targetByteProfiles:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 assert.doesNotThrow(()=>activate({config:valid}));
});
