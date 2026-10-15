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
import {runPipelineV2,resumePipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {targetsFrom} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-config.ts';
import {readOpenClawResult} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-result.ts';
import {pollSession} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-session.ts';
import {dispatchOpenClaw} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw.ts';
import {readSessionState} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-session.ts';
import {readResult} from '../../../skills/common/plugins/runtime-dispatch/src/result-persistence.ts';
const id='kubeclaw.runtime-dispatch:openclaw';
async function fixture(t,{pendingBeforeDone=0}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-dispatch-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const repo=path.join(root,'repository');fs.mkdirSync(repo);let sequence=0;const received=[],pollCounts=new Map();
 const env='DISPATCH_POLICY_'+crypto.randomBytes(8).toString('hex').toUpperCase();process.env[env]='policy-test-token';t.after(()=>{delete process.env[env];});
 // Controlled gateway protocol vectors, not native model/collector execution.
 const server=http.createServer(async(request,response)=>{
  assert.equal(request.headers.authorization,'Bearer policy-test-token');const chunks=[];for await(const chunk of request)chunks.push(chunk);const call=JSON.parse(Buffer.concat(chunks));received.push({...call,at:performance.now()});
  let details;if(call.tool==='subagents')details={active:[],recent:[]};
  else if(call.tool==='sessions_spawn'){sequence++;details={status:'accepted',childSessionKey:'session:policy-'+sequence,runId:'run:policy-'+sequence,resolvedModel:'test/model'};}
  else if(call.tool==='agents_wait'){const run=call.args.ids[0],n=(pollCounts.get(run)??0)+1;pollCounts.set(run,n);details=n<=pendingBeforeDone?{completed:[],pending:[run]}:{completed:[{runId:run,status:'done',sessionKey:'session:policy-'+sequence,structured:{ok:true}}],pending:[]};}
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
const timing=overrides=>({...TEST_CORE_POLICY.openClawDispatch.targetTimingProfiles.standard,...overrides});
function selectedTargets(f,profiles,bindings={worker:'fixture'}){
 const config=selectedAdapterConfigurations({[id]:{targets:Object.fromEntries(Object.entries(bindings).map(([name,profile])=>[name,{...f.target,timingProfile:profile}]))}},captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,targetTimingProfiles:profiles}}))[id];return targetsFrom(config);
}
function httpContext(){return {async invokeConfidential(capability,request,options){
 if(capability==='secrets.read')return {value:'policy-test-token'};
 if(capability==='git.repository.read')throw new Error('REPOSITORY_FILE_NOT_FOUND');
 assert.equal(capability,'network.http');const response=await fetch(request.resource.canonicalId,{method:'POST',headers:request.payload.headers,body:JSON.stringify(request.payload.body),signal:options?.signal});return {status:response.status,body:await response.json()};
}};}
test('actual Nova timing-profile A/B controls poll cutoff and retained A resumes after current B disappears',async t=>{
 const f=await fixture(t,{pendingBeforeDone:1}),a=timing({spawnIntervalMs:0,pollMs:10,maxPollMs:20,maxPolls:3,sessionTimeoutMs:1000});
 f.publish({targetTimingProfiles:{fixture:a}});const captured=inspectRuntimeConfiguration(f.platform(),f.definition),effective=targetsFrom(captured.adapterConfigurations[id]).get('worker');
 for(const field of Object.keys(a))assert.equal(effective[field],a[field]);assert(Object.isFrozen(effective));
 const first=await runPipelineV2(f.platform(),f.definition,'timing:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const aRoot=runRoot(f.source.storageRoot,'timing:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 f.publish({targetTimingProfiles:{fixture:{...a,maxPolls:1}}});const rejected=await runPipelineV2(f.platform(),f.definition,'timing:B');assert.equal(rejected.status,'blocked');assert.match(fs.readFileSync(path.join(runRoot(f.source.storageRoot,'timing:B'),'events.jsonl'),'utf8'),/OPENCLAW_SESSION_TIMEOUT/);
 assert.equal(effective.maxPolls,3);
 f.source.adapters[id].targets.worker.timingProfile='missing-current-B';fs.writeFileSync(path.join(f.root,'platform.json'),JSON.stringify(f.source));
 fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 assert.equal((await resumePipelineV2(f.platform(),f.definition,'timing:A',{schemaVersion:'resume-signal.v2',signalId:'signal:timing',idempotencyKey:'signal-key:timing',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}})).status,'succeeded');assert.deepEqual(readRunSnapshot(aRoot),snapshot);
 assert.equal(f.source.adapters[id].targets.worker.timingProfile,'missing-current-B');
 const originalEndpoint=f.source.adapters[id].targets.worker.endpoint;f.source.adapters[id].targets.worker.endpoint=originalEndpoint+'/changed';fs.writeFileSync(path.join(f.root,'platform.json'),JSON.stringify(f.source));
 await assert.rejects(recoverPipelineV2(f.platform(),f.definition,'timing:A'),/RECOVERY_RUNTIME_CONFIGURATION_MISMATCH/);
});
test('separate target profiles reach real poll/backoff/deadline consumers over controlled HTTP with restored positives',async t=>{
 const f=await fixture(t,{pendingBeforeDone:2});
 const a=timing({spawnIntervalMs:0,pollMs:10,maxPollMs:15,maxPolls:4,sessionTimeoutMs:1000}),b=timing({spawnIntervalMs:0,pollMs:20,maxPollMs:20,maxPolls:4,sessionTimeoutMs:1000});
 const targets=selectedTargets(f,{first:a,second:b},{worker:'first',other:'second'});assert.equal(targets.get('worker').timingProfile,'first');assert.equal(targets.get('other').timingProfile,'second');
 const context=httpContext(),identity=name=>({runId:'run:'+name,sessionKey:'session:'+name,model:'test/model'});
 for(const [name,target,bounds]of [['worker',targets.get('worker'),[7,12]],['other',targets.get('other'),[17,17]]]){
  const result=await pollSession(context,target,'policy-test-token',identity(name),new AbortController().signal);assert.equal(result.terminal,true);
  const calls=f.received.filter(call=>call.tool==='agents_wait'&&call.args.ids[0]==='run:'+name);assert.equal(calls.length,3);assert(calls[1].at-calls[0].at>=bounds[0]);assert(calls[2].at-calls[1].at>=bounds[1]);
 }
 const cutoff=selectedTargets(f,{fixture:{...a,maxPolls:1}}).get('worker');await assert.rejects(pollSession(context,cutoff,'policy-test-token',identity('cutoff'),new AbortController().signal),/OPENCLAW_SESSION_TIMEOUT/);assert.equal(f.received.filter(call=>call.tool==='agents_wait'&&call.args.ids[0]==='run:cutoff').length,1);
 const deadline=selectedTargets(f,{fixture:{...a,maxPolls:100,sessionTimeoutMs:15}}).get('worker');await assert.rejects(pollSession(context,deadline,'policy-test-token',identity('deadline'),new AbortController().signal),/OPENCLAW_SESSION_TIMEOUT/);
 assert.equal((await pollSession(context,targets.get('worker'),'policy-test-token',identity('restored'),new AbortController().signal)).terminal,true);
});
test('selected spawn interval changes actual spawn-to-poll pacing without a hidden 1500ms fallback',async t=>{
 const f=await fixture(t),profiles={immediate:timing({spawnIntervalMs:0,pollMs:10,maxPollMs:10,maxPolls:3,sessionTimeoutMs:1000}),paced:timing({spawnIntervalMs:80,pollMs:10,maxPollMs:10,maxPolls:3,sessionTimeoutMs:1000})},targets=selectedTargets(f,profiles,{worker:'immediate',other:'paced'}),context=httpContext();
 for(const name of ['worker','other']){
  const before=f.received.length;const result=await dispatchOpenClaw(context,name,targets.get(name),{protocol:'test.timing',task:'Return JSON'},new AbortController().signal,'dispatch:'+name);assert.deepEqual(result.result,{ok:true});
  const calls=f.received.slice(before),spawn=calls.find(call=>call.tool==='sessions_spawn'),poll=calls.find(call=>call.tool==='agents_wait');assert(spawn&&poll);const elapsed=poll.at-spawn.at;assert(elapsed<750,'explicit profile must not use old1500ms fallback');if(name==='other')assert(elapsed>=75,'selected80ms spawn pacing is enforced');
 }
});
test('profile fields/selectors mandatory; raw old authors, malformed profiles and relations reject with restored positive',async t=>{
 const f=await fixture(t),base=TEST_CORE_POLICY.openClawDispatch.targetTimingProfiles.standard;
 for(const field of Object.keys(base)){
  const missing=structuredClone(TEST_CORE_POLICY);delete missing.openClawDispatch.targetTimingProfiles.standard[field];assert.throws(()=>captureCoreRuntimePolicy(missing),/INVALID/);
  for(const value of ['1',null,-1,1.5,Number.MAX_SAFE_INTEGER+1]){const bad=structuredClone(TEST_CORE_POLICY);bad.openClawDispatch.targetTimingProfiles.standard[field]=value;assert.throws(()=>captureCoreRuntimePolicy(bad),/INVALID/);assert.throws(()=>targetsFrom({...f.source.adapters[id],...f.policyBase,targetTimingProfiles:{fixture:bad.openClawDispatch.targetTimingProfiles.standard}}),/INVALID/);}
  for(const value of [base[field],null])assert.throws(()=>targetsFrom({...f.source.adapters[id],...f.policyBase,targets:{worker:{...f.target,[field]:value}}}),/UNKNOWN_TARGET_FIELD/);
 }
 for(const profile of [undefined,'missing',null])assert.throws(()=>targetsFrom({...f.source.adapters[id],...f.policyBase,targets:{worker:{...f.target,timingProfile:profile}}}),/timingProfile/);
 for(const bad of [{...base,maxPollMs:base.pollMs-1},{...base,sessionTimeoutMs:base.pollMs-1}])assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,targetTimingProfiles:{fixture:bad}}}),/BUDGET_INVALID/);
 assert.throws(()=>selectedAdapterConfigurations({[id]:{...f.source.adapters[id],targetTimingProfiles:f.policyBase.targetTimingProfiles}},TEST_CORE_POLICY),/COMPETING_AUTHOR/);
 assert.equal(targetsFrom({...f.source.adapters[id],...f.policyBase}).get('worker').spawnIntervalMs,0);
});
