import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadPlatformConfig,resolvePlatformConfigValue} from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import {captureCoreRuntimePolicy,loadCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {runPipelineV2,resumePipelineV2,recoverPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {readRunSnapshot,retainedCoreRuntimePolicy} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {auditResult} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {withRunMutationLock} from '../../../skills/nova/core/execution/run-mutation.ts';
import {FileJournal} from '../../../skills/nova/core/state/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-core-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const plugin=path.join(root,'plugins','probe'),output=path.join(root,'observed.jsonl');fs.mkdirSync(path.join(plugin,'schemas'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(plugin,'entry.mjs'),`import fs from 'node:fs';
 export function execute(input,context){fs.appendFileSync(context.contract.config.output,JSON.stringify({kind:'stage',memory:context.contract.lease.limits.memoryBytes,run:context.contract.lease.attempt.runId})+'\\n');
  if(context.contract.guidance?.approved)return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
  return {schemaVersion:'stage-result.v2',outcome:'orchestrator_required',reason:{code:'test.needs_guidance',message:'Guidance required'},artifacts:[],wait:{schemaVersion:'wait-request.v2',waitId:'wait:policy',kind:'orchestrator',signalType:'core.orchestrator.resume',authorizedIssuer:{type:'orchestrator',id:'nova'},expiresAt:null}};}
 export function observe(delivery,context){fs.appendFileSync(context.contract.config.output,JSON.stringify({kind:'observer',memory:context.contract.lease.limits.memoryBytes,run:context.contract.lease.attempt.runId})+'\\n');}
 `);
 const configSchema={type:'object',additionalProperties:false,required:['output'],properties:{output:{type:'string'}}};
 for(const [name,schema] of Object.entries({config:configSchema,input:{type:'object',additionalProperties:false},result:{$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'},checkpoint:{type:'object',required:['sequence','eventId'],properties:{sequence:{type:'integer'},eventId:{type:'string'}}}}))fs.writeFileSync(path.join(plugin,'schemas',`${name}.json`),JSON.stringify(schema));
 fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.core-policy',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',adapters:[],stages:[{id:'probe',type:'test.core-policy',module:'entry.mjs',export:'execute',requiredCapabilities:[],configSchema:'schemas/config.json',inputSchema:'schemas/input.json',resultSchema:'schemas/result.json'}],observers:[{id:'observer',module:'entry.mjs',export:'observe',subscriptions:['attempt.dispatched'],delivery:'at_least_once',ordering:'per_run',failurePolicy:{mode:'best_effort',maxAttempts:1,backoffMs:0,timeoutMs:1000},requiredCapabilities:[],configSchema:'schemas/config.json',checkpointSchema:'schemas/checkpoint.json'}]}));
 const policyFile=path.join(root,'core.json');
 const publish=(policy)=>fs.writeFileSync(policyFile,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:policy}}}));
 publish(TEST_CORE_POLICY);
 const source={schemaVersion:'pipeline-platform.v2',corePolicySelection:{file:'core.json',profile:'selected'},installationRoots:['plugins'],trustedBuiltinRoots:['plugins'],externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},providers:{},grants:{},adapters:{},activeAdapters:[],observers:{'test.core-policy:observer':{output}},storageRoot:'state',shutdownTimeoutMs:1000,effectLockTtlMs:300000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
 const platformFile=path.join(root,'platform.json');fs.writeFileSync(platformFile,JSON.stringify(source));
 const definition={schemaVersion:'pipeline-definition.v2',id:'core-policy',maxConcurrency:1,stages:[{id:'probe',type:'test.core-policy',dependsOn:[],config:{output},input:{},execution:{maxAttempts:3,maxRemediationCycles:0,timeoutMs:1000}}]};
 return {root,source,platformFile,policyFile,publish,definition,output};
}

test('explicit reference resolves against author, pure preparation performs no policy I/O, all fields required and snapshots owned',t=>{
 const f=fixture(t),loaded=loadPlatformConfig(f.platformFile);
 assert.equal(loaded.corePolicySelection.file,f.policyFile);assert(Object.isFrozen(loaded.corePolicySelection));
 const a=loadCoreRuntimePolicy(loaded.corePolicySelection);assert.deepEqual(a,TEST_CORE_POLICY);assert(Object.isFrozen(a.recovery.attempts));
 fs.rmSync(f.policyFile);assert.deepEqual(resolvePlatformConfigValue(f.source,f.root),loaded);
 assert.throws(()=>loadCoreRuntimePolicy(loaded.corePolicySelection),/ENOENT/);
 for(const key of Object.keys(TEST_CORE_POLICY)){
  const changed=structuredClone(TEST_CORE_POLICY);delete changed[key];assert.throws(()=>captureCoreRuntimePolicy(changed),/CORE_RUNTIME_POLICY/);
 }
 const unusable=structuredClone(TEST_CORE_POLICY);unusable.recovery.admission.maximumBytes=1024;unusable.recovery.admission.maximumIngressBytes=1;assert.throws(()=>captureCoreRuntimePolicy(unusable),/CORE_RUNTIME_POLICY_INVALID/);
 const changed=structuredClone(TEST_CORE_POLICY);changed.runMutationRenewalMs=changed.runMutationTtlMs;assert.throws(()=>captureCoreRuntimePolicy(changed),/BUDGET/);
 f.publish({...TEST_CORE_POLICY,extra:1});assert.throws(()=>loadCoreRuntimePolicy(loaded.corePolicySelection),/INVALID/);
 f.publish(TEST_CORE_POLICY);assert.deepEqual(loadCoreRuntimePolicy(loaded.corePolicySelection),a);
});

test('real stage/observer startup A/B leases and retained A resume survive missing current policy B',async t=>{
 const f=fixture(t),platform=loadPlatformConfig(f.platformFile),a=captureCoreRuntimePolicy({...TEST_CORE_POLICY,stageMemoryBytes:33554432,observerMemoryBytes:16777216,runMutationTtlMs:600,runMutationRenewalMs:100});f.publish(a);
 const first=await runPipelineV2(platform,f.definition,'run:A');assert.equal(first.status,'waiting',JSON.stringify([...first.stages]));
 const b=captureCoreRuntimePolicy({...a,stageMemoryBytes:67108864,observerMemoryBytes:50331648,runMutationTtlMs:900,runMutationRenewalMs:150,maximumAuditResultBytes:32,journalAppendLockTimeoutMs:50});f.publish(b);
 assert.equal((await runPipelineV2(platform,f.definition,'run:B')).status,'waiting');
 const aRoot=runRoot(platform.storageRoot,'run:A');assert.deepEqual(retainedCoreRuntimePolicy(aRoot),a);
 assert.deepEqual(readRunSnapshot(aRoot).registry.configuration.corePolicy,a);
 fs.rmSync(f.policyFile);
 // The real CLI loader remains usable with missing current policy: selection syntax/path is pure.
 const reloaded=loadPlatformConfig(f.platformFile);
 await assert.rejects(recoverPipelineV2(reloaded,f.definition,'run:A'),/RECOVERY_SIGNAL_REQUIRED/);
 const wait=first.stages.get('probe').wait;
 assert.equal((await resumePipelineV2(reloaded,f.definition,'run:A',{schemaVersion:'resume-signal.v2',signalId:'signal:A',idempotencyKey:'signal-key:A',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{approved:true}})).status,'succeeded');
 await assert.rejects(runPipelineV2(reloaded,f.definition,'run:C'),/ENOENT/);assert(!fs.existsSync(runRoot(platform.storageRoot,'run:C')));
 const rows=fs.readFileSync(f.output,'utf8').trim().split('\n').map(JSON.parse);
 for(const row of rows)assert.equal(row.memory,(row.run==='run:A'?a:b)[row.kind==='stage'?'stageMemoryBytes':'observerMemoryBytes']);
 assert.equal(rows.filter(row=>row.kind==='stage'&&row.run==='run:A').length,2);assert(rows.some(row=>row.kind==='observer'&&row.run==='run:B'));
});

test('selected real mutation TTL/renewal and required journal deadline replace literals',async t=>{
 const f=fixture(t),policy=captureCoreRuntimePolicy({...TEST_CORE_POLICY,runMutationTtlMs:350,runMutationRenewalMs:35,journalAppendLockTimeoutMs:30});
 await withRunMutationLock(path.join(f.root,'run'),policy,async()=>{await new Promise(resolve=>setTimeout(resolve,150));});
 const records=new FileJournal(path.join(f.root,'.run-mutation-locks/locks.jsonl'),policy.journalAppendLockTimeoutMs).records().map(row=>row.entry);
 assert(records.filter(row=>row.status==='active').length>=2,'actual renewal reaches durable lock journal');
 const acquired=records.find(row=>row.status==='active');assert.equal(Date.parse(acquired.expiresAt)-Date.parse(acquired.acquiredAt),350);
 assert.throws(()=>new FileJournal(path.join(f.root,'no-default.jsonl')),/JOURNAL_APPEND_LOCK_TIMEOUT_INVALID/);
 const file=path.join(f.root,'blocked.jsonl');new FileJournal(file,30);
 const holder=spawn('flock',['--exclusive',`${file}.append-lock`,'sh','-c','echo locked; read release'],{stdio:['pipe','pipe','pipe']});
 t.after(()=>holder.kill());await once(holder.stdout,'data');
 const started=Date.now();assert.throws(()=>new FileJournal(file,policy.journalAppendLockTimeoutMs),/JOURNAL_APPEND_LOCK_TIMEOUT/);assert(Date.now()-started<1000);
 holder.stdin.end('release\n');await once(holder,'exit');new FileJournal(file,30).append({restored:true});
});

test('selected audit UTF8 exact/over boundary and effect journal inline limit remain separate',async t=>{
 for(const maximum of [12,24]){
  const exact={text:'x'.repeat(maximum-11)};assert.equal(Buffer.byteLength(JSON.stringify(exact)),maximum);
  assert.deepEqual(auditResult(exact,maximum),exact);
  const over={text:exact.text+'ü'};const summarized=auditResult(over,maximum);assert.equal(summarized.externalized,true);assert.equal(summarized.bytes,maximum+2);
 }
 const f=fixture(t),policy=captureCoreRuntimePolicy({...TEST_CORE_POLICY,effectJournalInlineResultBytes:24,maximumAuditResultBytes:12});
 const file=path.join(f.root,'effects.jsonl'),journal=new FileEffectJournal(file,policy);
 const receipt={schemaVersion:'effect-receipt.v2',effectId:'effect:policy',idempotencyKey:'policy',adapter:{pluginId:'test.adapter',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',registrationId:'main',contentDigest:`sha256:${'a'.repeat(64)}`},status:'completed',result:{text:'x'.repeat(14)},recordedAt:new Date().toISOString()};
 await journal.completed(receipt);assert(fs.readFileSync(file,'utf8').includes('completed-reference'));assert.deepEqual((await new FileEffectJournal(file,policy).receipt('policy')).result,receipt.result);
});


test('actual resource provisional-lock lifetime is selected independently of mutation TTL',async t=>{
 const f=fixture(t),resource={type:'test.resource',canonicalId:'provisional'};
 const {createHash}=await import('node:crypto');const key=createHash('sha256').update(resource.type+'\0'+resource.canonicalId).digest('hex');
 const root=path.join(f.root,'locks');
 const a=captureCoreRuntimePolicy({...TEST_CORE_POLICY,resourceLockProvisionalTtlMs:1000});
 const locksA=new FileResourceLockManager(root,a);const provisional=path.join(root,key+'.active');fs.mkdirSync(provisional);const aged=new Date(Date.now()-500);fs.utimesSync(provisional,aged,aged);
 assert.throws(()=>locksA.acquire(resource,'lease:A',10000),/RESOURCE_LOCK_PROVISIONING/);
 const b=captureCoreRuntimePolicy({...a,resourceLockProvisionalTtlMs:100});const locksB=new FileResourceLockManager(root,b);const lock=locksB.acquire(resource,'lease:B',10000);locksB.release(lock.lockId,'lease:B');
});

test('active recovery receiver uses selected metadata capacity and restores positive behavior',async t=>{
 const {persistNovaObservabilityPlan,reconcileNovaObservabilityOnRecovery}=await import('../../../skills/nova/core/observability/reconciler.ts');
 const f=fixture(t),root=path.join(f.root,'recovery');await persistNovaObservabilityPlan(root,'run:capacity',[]);
 const store=path.join(root,'observability/attempts');fs.mkdirSync(store,{recursive:true});
 const empty=JSON.stringify({schemaVersion:'durable-attempt-store.v1',evidence:[],results:[],closures:[]});fs.writeFileSync(path.join(store,'attempt-store.json'),empty);
 const a=captureCoreRuntimePolicy({...TEST_CORE_POLICY,recovery:{...TEST_CORE_POLICY.recovery,attempts:{...TEST_CORE_POLICY.recovery.attempts,maximumMetadataBytes:Buffer.byteLength(empty)}}});
 assert.deepEqual(await reconcileNovaObservabilityOnRecovery(root,'run:capacity',a),[]);
 const b=captureCoreRuntimePolicy({...a,recovery:{...a.recovery,attempts:{...a.recovery.attempts,maximumMetadataBytes:Buffer.byteLength(empty)-1}}});
 await assert.rejects(reconcileNovaObservabilityOnRecovery(root,'run:capacity',b),/too large|LIMIT|limit|BYTES|bytes|SIZE|size/);
 assert.deepEqual(await reconcileNovaObservabilityOnRecovery(root,'run:capacity',a),[]);
});
