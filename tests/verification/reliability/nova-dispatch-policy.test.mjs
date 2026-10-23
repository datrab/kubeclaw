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
import {readSessionState,findRegisteredSession,cancelSession} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-session.ts';
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
 const f=await fixture(t),a={workspaceOwnerMaximumBytes:2048,cleanupPollIntervalMs:7,resultReadMaximumBytes:8,collectorWaitTimeoutSeconds:2,sessionListCacheTtlMs:250,sessionListMinimumRecentMinutes:11,sessionListPaddingMinutes:4};f.publish(a);const captured=inspectRuntimeConfiguration(f.platform(),f.definition);
 assert.equal(captured.adapterConfigurations[id].workspaceOwnerMaximumBytes,2048);assert.equal(captured.adapterConfigurations[id].resultReadMaximumBytes,8);assert.equal(captured.adapterConfigurations[id].collectorWaitTimeoutSeconds,2);assert.equal(captured.adapterConfigurations[id].cleanupPollIntervalMs,7);
 const first=await runPipelineV2(f.platform(),f.definition,'dispatch:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const initialLists=f.received.filter(call=>call.tool==='subagents');assert(initialLists.length>0);assert(initialLists.every(call=>call.args.recentMinutes===11));
 const aRoot=runRoot(f.source.storageRoot,'dispatch:A'),snapshot=readRunSnapshot(aRoot);assert.deepEqual(snapshot.registry.configuration.adapters[id],captured.adapterConfigurations[id]);
 f.publish({workspaceOwnerMaximumBytes:4096,cleanupPollIntervalMs:31,resultReadMaximumBytes:7,collectorWaitTimeoutSeconds:3,sessionListCacheTtlMs:0,sessionListMinimumRecentMinutes:2,sessionListPaddingMinutes:8});assert.equal((await runPipelineV2(f.platform(),f.definition,'dispatch:B')).status,'waiting');
 const afterB=f.received.filter(call=>call.tool==='subagents');assert(afterB.length>initialLists.length);assert(afterB.slice(initialLists.length).every(call=>call.args.recentMinutes===9));
 assert.deepEqual(f.received.filter(call=>call.tool==='agents_wait').map(call=>call.args.timeoutSeconds),[2,3]);assert.equal(captured.adapterConfigurations[id].workspaceOwnerMaximumBytes,2048);assert.equal(captured.adapterConfigurations[id].resultReadMaximumBytes,8);
 fs.unlinkSync(f.coreFile);const wait=first.stages.get('probe').wait;
 assert.equal((await resumePipelineV2(f.platform(),f.definition,'dispatch:A',{schemaVersion:'resume-signal.v2',signalId:'signal:dispatch',idempotencyKey:'signal-key:dispatch',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}})).status,'succeeded');
 assert.deepEqual(f.received.filter(call=>call.tool==='agents_wait').map(call=>call.args.timeoutSeconds),[2,3,2]);assert.deepEqual(readRunSnapshot(aRoot),snapshot);assert.equal(snapshot.registry.configuration.adapters[id].workspaceOwnerMaximumBytes,2048);
 const afterResume=f.received.filter(call=>call.tool==='subagents');assert(afterResume.length>afterB.length);assert(afterResume.slice(afterB.length).every(call=>call.args.recentMinutes===11));
 await assert.rejects(runPipelineV2(f.platform(),f.definition,'dispatch:missing'),/ENOENT/);
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

test('selected session-list cache TTL controls actual gateway reads, exact expiry, failure eviction and retained targets',async t=>{
 const f=await fixture(t);
 const select=ttl=>targetsFrom(selectedAdapterConfigurations(f.source.adapters,captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,sessionListCacheTtlMs:ttl}}))[id]).get('worker');
 const a=select(250),b=select(0);let now=10000,fail=false;
 t.mock.method(Date,'now',()=>now);
 const context={async invokeConfidential(capability,request){
  assert.equal(capability,'network.http');
  if(fail){fail=false;throw new Error('TEST_TRANSIENT_GATEWAY');}
  const response=await fetch(request.resource.canonicalId,{method:'POST',headers:request.payload.headers,body:JSON.stringify(request.payload.body)});
  return {status:response.status,body:await response.json()};
 }};
 const read=target=>findRegisteredSession(context,target,'policy-test-token','missing');
 const count=()=>f.received.filter(call=>call.tool==='subagents').length;
 await read(a);await read(a);assert.equal(count(),1);
 now+=249;await read(a);assert.equal(count(),1);
 now+=1;await read(a);assert.equal(count(),2);
 await read(b);await read(b);assert.equal(count(),4); // zero explicitly disables reuse
 await read(a);assert.equal(count(),4); // B must not overwrite retained A's cache partition
 now+=250;fail=true;await assert.rejects(read(a),/TEST_TRANSIENT_GATEWAY/);
 await read(a);assert.equal(count(),5); // failed cached promise is evicted
 fs.unlinkSync(f.coreFile);await read(a);assert.equal(count(),5);assert.equal(a.sessionListCacheTtlMs,250);assert(Object.isFrozen(a));
 assert.throws(()=>inspectRuntimeConfiguration(f.platform(),f.definition),/ENOENT/);
 for(const value of [undefined,null,'250',-1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(read({...a,sessionListCacheTtlMs:value}),/SESSION_LIST_CACHE_TTL_INVALID/);
 assert.equal(count(),5);now+=250;await read(a);assert.equal(count(),6);
});

 test('selected lookback reaches uncached polling and cancellation identity lookup with minute rounding',async t=>{
 const f=await fixture(t), selected=targetsFrom(selectedAdapterConfigurations(f.source.adapters,captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,sessionListMinimumRecentMinutes:2,sessionListPaddingMinutes:3}}))[id]).get('worker');
 const target={...selected,collectorMode:false,sessionTimeoutMs:60001};
 const identity={runId:'run:lookback',sessionKey:'session:lookback',label:'lookback',model:'test/model'};const calls=[];
 const context={async invokeConfidential(_capability,request){
 const {tool,args}=request.payload.body;calls.push({tool,args});
 return {status:200,body:{ok:true,toolName:tool,source:'core',output:{content:[],details:{active:[{...identity,taskId:'task:lookback',status:'running'}],recent:[]}}}};
 }};
 assert.equal((await readSessionState(context,target,'token',identity)).state,'running');
 await cancelSession(context,target,'token',identity);
 assert.deepEqual(calls.map(call=>call.args.action),['list','list','cancel']);
 assert.deepEqual(calls.slice(0,2).map(call=>call.args.recentMinutes),[5,5]);
 assert.equal(calls[2].args.taskId,'task:lookback');
 for(const key of ['sessionListMinimumRecentMinutes','sessionListPaddingMinutes'])for(const value of [undefined,null,'1',-1,1.5,2147483648]) {
  const bad={...target,[key]:value};
  await assert.rejects(readSessionState(context,bad,'token',identity),/LOOKBACK_INVALID/);
  await assert.rejects(cancelSession(context,bad,'token',identity),/LOOKBACK_INVALID/);
 }
 assert.equal(calls.length,3);
 });

test('late-spawn cleanup uses selected lookback and rejects missing policy before gateway IO',async t=>{
 const f=await fixture(t),selected=targetsFrom(selectedAdapterConfigurations(f.source.adapters,captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,sessionListMinimumRecentMinutes:2,sessionListPaddingMinutes:3}}))[id]).get('worker');
 const {reconcileOpenClawFailure}=await import('../../../skills/common/plugins/runtime-dispatch/src/openclaw-cleanup.ts');
 const identity={runId:'run:cleanup',sessionKey:'session:cleanup',label:'cleanup',model:'test/model',taskId:'task:cleanup'};
 const calls=[];const context={async invokeConfidential(_capability,request){
 const {tool,args}=request.payload.body;calls.push({tool,args});
 const details=args.action==='cancel'?{status:'accepted'}:{active:[],recent:[{...identity,status:'done'}]};
 return {status:200,body:{ok:true,toolName:tool,source:'core',output:{content:[],details}}};
 },async withCleanup(run){return run({...context,signal:new AbortController().signal});}};
 const pending={label:identity.label,spawning:new Promise(()=>{})};
 for(const [minimum,padding,expected] of [[2,3,5],[13,1,13]]){
  const start=calls.length;
  await assert.rejects(reconcileOpenClawFailure(context,{...selected,sessionTimeoutMs:60001,sessionListMinimumRecentMinutes:minimum,sessionListPaddingMinutes:padding},'token',pending,new Error('TEST_FAILURE')),/TEST_FAILURE; OPENCLAW_SESSION_TERMINAL_CONFIRMED:run:cleanup/);
  assert.deepEqual(calls.slice(start).map(call=>call.args.action),['list','cancel','list']);
  assert(calls.slice(start).filter(call=>call.args.action==='list').every(call=>call.args.recentMinutes===expected));
 }
 const count=calls.length;
 await assert.rejects(reconcileOpenClawFailure(context,{...selected,sessionListPaddingMinutes:undefined},'token',pending,new Error('TEST_FAILURE')),/CLEANUP_UNRESOLVED:.*LOOKBACK_INVALID/);
 assert.equal(calls.length,count);
});


test('cleanup retries use selected A/B intervals for late identity and terminal confirmation, invalid intervals deny before IO',async t=>{
 const f=await fixture(t),selected=targetsFrom(selectedAdapterConfigurations(f.source.adapters,captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:f.policyBase}))[id]).get('worker');
 const {reconcileOpenClawFailure}=await import('../../../skills/common/plugins/runtime-dispatch/src/openclaw-cleanup.ts');
 const identity={runId:'run:retry',sessionKey:'session:retry',label:'retry',model:'test/model',taskId:'task:retry'};
 const realSetTimeout=globalThis.setTimeout;const delays=[];
 // Observe actual timer scheduling without wall-clock thresholds/flaky elapsed assertions.
 t.mock.method(globalThis,'setTimeout',(callback,ms,...args)=>{const cleanupTimer=new Error().stack.includes('/openclaw-cleanup.ts:');if(cleanupTimer)delays.push(ms);return realSetTimeout(callback,cleanupTimer?0:ms,...args);});
 for(const interval of [7,31]){
  let lists=0,cancels=0;const context={async invokeConfidential(_capability,request){
   const {tool,args}=request.payload.body;let details;
   if(args.action==='cancel'){cancels++;details={status:'accepted'};}
   else{lists++;details=lists===1?{active:[],recent:[]}:{active:[],recent:[{...identity,status:lists===3?'running':'done'}]};}
   return {status:200,body:{ok:true,toolName:tool,source:'core',output:{content:[],details}}};
  },async withCleanup(run){return run({...context,signal:new AbortController().signal});}};
  const start=delays.length;
  await assert.rejects(reconcileOpenClawFailure(context,{...selected,cleanupPollIntervalMs:interval},'token',{label:identity.label,spawning:new Promise(()=>{})},new Error('RETRY_FAILURE')),/RETRY_FAILURE; OPENCLAW_SESSION_TERMINAL_CONFIRMED:run:retry/);
  assert.equal(lists,4);assert.equal(cancels,1);assert.deepEqual(delays.slice(start),[interval,interval]);
 }
 for(const value of [undefined,null,'25',0,-1,1.5,2147483648]){
  const context={withCleanup(){assert.fail('invalid interval entered cleanup');},invokeConfidential(){assert.fail('invalid interval reached gateway');}};
  await assert.rejects(reconcileOpenClawFailure(context,{...selected,cleanupPollIntervalMs:value},'token',{label:identity.label,spawning:new Promise(()=>{})},new Error('RETRY_FAILURE')),/CLEANUP_UNRESOLVED:.*OPENCLAW_CLEANUP_INTERVAL_INVALID/);
 }
});


test('central workspace owner cap reaches actual filesystem read, retains A, and rejects equal duplicate authors',async t=>{
 const f=await fixture(t);
 const {workspaceTarget}=await import('../../../skills/common/plugins/runtime-dispatch/src/workspace-target.ts');
 const {runtimeWorkspaceOwnerFile}=await import('@kubeclaw/plugin-sdk');
 const root=fs.realpathSync(f.root),workspace=path.join(root,'owned');fs.mkdirSync(workspace);
 const attempt={runId:'owner:A',stageId:'implement-a',attemptId:'attempt:A',attemptNumber:1};
 const ref={schemaVersion:'runtime-workspace.v1',repositoryRoot:f.repo,workspaceRoot:root,workspacePath:workspace,branch:'nova/test/a',sourceRevision:'a'.repeat(40),owner:attempt};
 const ownerFile=path.join(root,runtimeWorkspaceOwnerFile(workspace));fs.mkdirSync(path.dirname(ownerFile));fs.writeFileSync(ownerFile,JSON.stringify(ref));
 const bytes=fs.statSync(ownerFile).size,request={attempt,payload:{workspaceReference:ref}};
 const select=limit=>targetsFrom(selectedAdapterConfigurations({[id]:{targets:{worker:{...f.target,workspaceRoot:root}}}},captureCoreRuntimePolicy({...TEST_CORE_POLICY,openClawDispatch:{...f.policyBase,workspaceOwnerMaximumBytes:limit}}))[id]).get('worker');
 const a=select(bytes),b=select(bytes-1);assert.equal(workspaceTarget(a,request).cwd,workspace);
 assert.throws(()=>workspaceTarget(b,request),/RUNTIME_WORKSPACE_OWNER_INVALID/);
 assert.equal(workspaceTarget(a,request).cwd,workspace);assert(Object.isFrozen(a));
 assert.throws(()=>workspaceTarget({...a,workspaceOwnerMaximumBytes:undefined},request),/OWNER_LIMIT_INVALID/);
 fs.writeFileSync(ownerFile,JSON.stringify({...ref,branch:'nova/test/foreign'}));
 assert.throws(()=>workspaceTarget(select(32768),request),/OWNER_MISMATCH/);
});
