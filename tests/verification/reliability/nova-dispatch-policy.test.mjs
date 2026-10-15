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
import {inspectRuntimeConfiguration,selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {runPipelineV2,resumePipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {targetsFrom} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-config.ts';
import {readOpenClawResult} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-result.ts';
import {readSessionState} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-session.ts';
import {readResult} from '../../../skills/common/plugins/runtime-dispatch/src/result-persistence.ts';
const id='kubeclaw.runtime-dispatch:openclaw';
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-dispatch-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=path.join(root,'repository');fs.mkdirSync(repo);let sequence=0;const received=[];
 const env='DISPATCH_POLICY_'+crypto.randomBytes(8).toString('hex').toUpperCase();process.env[env]='policy-test-token';t.after(()=>{delete process.env[env];});
 // Controlled gateway protocol vectors, not native model/collector execution.
 const server=http.createServer(async(request,response)=>{
  assert.equal(request.headers.authorization,'Bearer policy-test-token');const chunks=[];for await(const chunk of request)chunks.push(chunk);const call=JSON.parse(Buffer.concat(chunks));received.push(call);
  let details;if(call.tool==='subagents')details={active:[],recent:[]};
  else if(call.tool==='sessions_spawn'){sequence++;details={status:'accepted',childSessionKey:'session:policy-'+sequence,runId:'run:policy-'+sequence,resolvedModel:'test/model'};}
  else if(call.tool==='agents_wait')details={completed:[{runId:call.args.ids[0],status:'done',sessionKey:'session:policy-'+sequence,structured:{ok:true}}],pending:[]};
  else throw new Error('UNEXPECTED_GATEWAY_TOOL:'+call.tool);
  response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,toolName:call.tool,output:{content:[],details},source:'core'}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const origin='http://127.0.0.1:'+server.address().port;
 const plugin=path.join(root,'plugins/probe');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`export async function execute(input,context){
 await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'worker'},payload:{protocol:'test.policy',task:'Return a JSON object'}});
 if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
 return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.guidance',message:'waiting'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:dispatch',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}`);
 for(const [name,value]of Object.entries({config:{type:'object',additionalProperties:false},input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'}}))fs.writeFileSync(path.join(plugin,'schemas',name+'.json'),JSON.stringify(value));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.dispatch-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],observers:[],stages:[{id:'probe',type:'test.dispatch-policy',module:'entry.mjs',export:'execute',requiredCapabilities:['runtime.dispatch'],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}]}));
 const policyBase={...TEST_CORE_POLICY.openClawDispatch,targetTimingProfiles:{fixture:{...TEST_CORE_POLICY.openClawDispatch.targetTimingProfiles.standard,spawnIntervalMs:0,pollMs:10,maxPollMs:10,maxPolls:3,sessionTimeoutMs:1000}}};
 const coreFile=path.join(root,'core.json'),publish=limits=>fs.writeFileSync(coreFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,openClawDispatch:{...policyBase,...limits}}}}}));publish(policyBase);
 const common=path.resolve('skills/common/plugins');
 const target={endpoint:origin+'/tools/invoke',tokenSecret:'policy.token',runtime:'subagent',agentId:'codex',agentRole:'worker',model:'test/model',collectorMode:true,cwd:repo,repositoryRoot:repo,resultPathPrefix:'results',timingProfile:'fixture'};
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:coreFile,profile:'selected'},installationRoots:[path.join(root,'plugins'),common,path.resolve('skills/nova/plugins')],trustedBuiltinRoots:[path.join(root,'plugins'),common,path.resolve('skills/nova/plugins')],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{'runtime.dispatch':id,'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets','git.repository.read':'kubeclaw.repository-adapter:repository'},grants:{'test.dispatch-policy:probe':{'runtime.dispatch':{allowedAgents:['worker']}},[id]:{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['policy.token']},'git.repository.read':{allowedPrefixes:['results']}}},adapters:{[id]:{targets:{worker:target}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['authorization','content-type']},'kubeclaw.secret-resolver:secrets':{environment:{'policy.token':env}},'kubeclaw.repository-adapter:repository':{repositoryRoot:repo}},activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'dispatch-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.dispatch-policy',dependsOn:[],input:{},config:{},execution:{maxAttempts:2,maxRemediationCycles:0,timeoutMs:5000}}]};return {root,repo,target,received,coreFile,publish,source,definition,policyBase,platform:()=>loadPlatformConfig(platformFile)};
}
test('real Nova dispatch startup captures A/B, sends configured collector wait over HTTP and resumes retained A without B',async t=>{
 const f=await fixture(t),a={resultReadMaximumBytes:8,collectorWaitTimeoutSeconds:2};f.publish(a);const captured=inspectRuntimeConfiguration(f.platform(),f.definition);
 assert.equal(captured.adapterConfigurations[id].resultReadMaximumBytes,8);assert.equal(captured.adapterConfigurations[id].collectorWaitTimeoutSeconds,2);
 const first=await runPipelineV2(f.platform(),f.definition,'dispatch:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const aRoot=runRoot(f.source.storageRoot,'dispatch:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 f.publish({resultReadMaximumBytes:7,collectorWaitTimeoutSeconds:3});assert.equal((await runPipelineV2(f.platform(),f.definition,'dispatch:B')).status,'waiting');
 assert.deepEqual(f.received.filter(call=>call.tool==='agents_wait').map(call=>call.args.timeoutSeconds),[2,3]);assert.equal(captured.adapterConfigurations[id].resultReadMaximumBytes,8);
 fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 assert.equal((await resumePipelineV2(f.platform(),f.definition,'dispatch:A',{schemaVersion:'resume-signal.v2',signalId:'signal:dispatch',idempotencyKey:'signal-key:dispatch',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}})).status,'succeeded');
 assert.deepEqual(f.received.filter(call=>call.tool==='agents_wait').map(call=>call.args.timeoutSeconds),[2,3,2]);assert.deepEqual(readRunSnapshot(aRoot),snapshot);
});
test('actual local result receiver enforces selected exact/over UTF8 read cap with restored positive',async t=>{
 const f=await fixture(t),workspace=path.join(f.root,'workspace');fs.mkdirSync(workspace);fs.mkdirSync(path.join(workspace,'results'));fs.writeFileSync(path.join(workspace,'results/out.json'),'"ééé"');
 const receive=limits=>{const config=selectedAdapterConfigurations({[id]:{targets:{worker:{...f.target,cwd:workspace}}}},captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,...limits}}))[id];const selected=targetsFrom(config).get('worker');
 // Existing workspace branch selector is a test vector only; this test proves
 // physical read/size receiving, not workspace/lease/source authorization.
 return readOpenClawResult({invokeConfidential(){throw new Error('UNEXPECTED_FALLBACK');}},{...selected,workspaceReference:{}},{payload:{},relative:'results/out.json',key:'session:read',token:'',startedAt:new Date().toISOString(),state:{state:'completed'}});};
 assert.equal((await receive({resultReadMaximumBytes:8,collectorWaitTimeoutSeconds:2})).result,'ééé');
 await assert.rejects(receive({resultReadMaximumBytes:7,collectorWaitTimeoutSeconds:2}),error=>error.message==='OPENCLAW_RESULT_PATH_INVALID'&&error.cause?.message==='OPENCLAW_RESULT_SIZE_INVALID');
 assert.equal((await receive({resultReadMaximumBytes:8,collectorWaitTimeoutSeconds:2})).result,'ééé');assert.throws(()=>readResult(workspace,'results/out.json'),/OPENCLAW_RESULT_LIMIT_INVALID/);
});
test('both central/adapter fields required, no target duplicate authors and no malformed values/defaults',async t=>{
 const f=await fixture(t);
 for(const key of Object.keys(TEST_CORE_POLICY.openClawDispatch)){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing.openClawDispatch[key];assert.throws(()=>captureCoreRuntimePolicy(missing),/INVALID/);assert.throws(()=>targetsFrom({...f.source.adapters[id],...missing.openClawDispatch}),/INVALID/);
  for(const value of ['1',null,-1,1.5,Number.MAX_SAFE_INTEGER+1]){const bad=structuredClone(TEST_CORE_POLICY);bad.openClawDispatch[key]=value;assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);assert.throws(()=>targetsFrom({...f.source.adapters[id],...bad.openClawDispatch}),/INVALID/);}
  for(const value of [TEST_CORE_POLICY.openClawDispatch[key],null])assert.throws(()=>selectedAdapterConfigurations({[id]:{...f.source.adapters[id],[key]:value}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
  assert.throws(()=>targetsFrom({...f.source.adapters[id],...f.policyBase,targets:{worker:{...f.target,[key]:TEST_CORE_POLICY.openClawDispatch[key]}}}),/UNKNOWN_TARGET_FIELD/);
 }
 assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...TEST_CORE_POLICY.openClawDispatch,resultReadMaximumBytes:0}}),/INVALID/);
 assert.equal(targetsFrom({...f.source.adapters[id],...f.policyBase,collectorWaitTimeoutSeconds:0}).get('worker').collectorWaitTimeoutSeconds,0);
 const identity={runId:'run:direct',sessionKey:'session:direct',model:'test/model'};
 for(const value of [undefined,null,'1',-1,1.5,2147484])await assert.rejects(readSessionState({invokeConfidential(){throw new Error('UNEXPECTED_GATEWAY');}},{...f.target,collectorWaitTimeoutSeconds:value},'',identity),/OPENCLAW_COLLECTOR_WAIT_INVALID/);
 let requested;await readSessionState({async invokeConfidential(_capability,request){requested=request.payload.body.args.timeoutSeconds;return {status:200,body:{ok:true,toolName:'agents_wait',output:{content:[],details:{completed:[],pending:['run:direct']}},source:'core'}};}},{...f.target,collectorWaitTimeoutSeconds:0},'',identity);assert.equal(requested,0);
});
