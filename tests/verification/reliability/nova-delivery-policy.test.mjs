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
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common],trustedBuiltinRoots:[path.join(root,'plugins'),common],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{[capability]:id,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets'},grants:{'test.artifact-policy:probe':{[capability]:{allowedTargets:['operators']}},[id]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['policy.token']}}},adapters:{[id]:{deliveryRoot:artifactRoot,targets:{operators:{endpoint:origin+'/messages',...(kind==='operator'?{tokenSecret:'policy.token'}:{signingSecret:'policy.token'})}}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature','x-kubeclaw-target']},'kubeclaw.secret-resolver:secrets':{environment:{'policy.token':env}}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'artifact-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.artifact-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};
 return {root,source,definition,coreFile,publish,received,platform:()=>loadPlatformConfig(platformFile)};
}
for(const kind of ['operator','publisher']) {
 const id=kind==='operator'?operatorId:publisherId,policyKey=kind==='operator'?'operatorMessagingStore':'transportPublisherStore',activate=kind==='operator'?operatorActivate:publisherActivate;
test(kind+' actual Nova delivery A/B store ceilings, real signed HTTP and retained A resume without B',async t=>{
 const f=await fixture(t,kind),a=TEST_CORE_POLICY[policyKey];f.publish(a);const captured=inspectRuntimeConfiguration(f.platform(),f.definition);
 assert.equal(captured.adapterConfigurations[id].maximumDeliveryRecords,a.maximumDeliveryRecords);assert.equal(captured.adapterConfigurations[id].maximumDeliveryBytes,a.maximumDeliveryBytes);
 const first=await runPipelineV2(f.platform(),f.definition,'delivery:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));assert.equal(f.received.length,1);
 const aRoot=runRoot(f.source.storageRoot,'delivery:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 for(const key of Object.keys(a)){
  f.publish({...a,[key]:1});const result=await runPipelineV2(f.platform(),f.definition,'delivery:B-'+key);assert.equal(result.status,'blocked');
  assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'delivery:B-'+key),'events.jsonl'),'utf8'),/DURABLE_RECORD_STORE_FULL|OBSERVABILITY_REPLAY_INVALID:snapshot-size/);assert.equal(f.received.length,1);
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
