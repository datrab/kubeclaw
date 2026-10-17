import { FileWorkerOwnershipStore } from '../../../skills/worker/core/worker/ownership-store.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readWorkerCorePolicyCapture, captureWorkerCorePolicy, workerCoreExecutionOptions } from '../../../skills/common/plugin-runtime/foundation/config/worker-core-policy.ts';
import { readSwarmBundle } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { WorkerAttemptExecutor } from '../../../skills/worker/core/worker/attempt-executor.ts';
import { workerAttemptSpecDigest, sha256Text } from '../../../skills/worker/core/worker/digest.ts';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { envelope as nativeEnvelope, limits } from '../reliability/native-journal-capacity-fixture.mts';
import { envelope, Operation, successResult } from './worker-core-policy-fixture.mts';

const definitions=JSON.parse(await fs.readFile(new URL('../../../docs/review/evidence/config-acceptance/components/core-adjustable-profiles.json',import.meta.url),'utf8'));
function policy(variant: 'A'|'B'='A') {
  const settings=structuredClone(definitions['CMP-WCORE-INPUT-BYTES'][variant]['worker-core'].settings);
  settings.scaffoldPublication={maximumMemberBytes:67108864,maximumPointerBytes:4096};
  if(variant==='B')Object.assign(settings.runtime,{input_bytes:12582912,json_nodes:75000,json_depth:48,log_parts:7500,journal_diagnostic_units:2048,journal_record_bytes:32768,retain_logs:{...settings.runtime.retain_logs,'prism-native':false,'prism-agent':false}});
  return captureWorkerCorePolicy(settings);
}
const operation=()=>new Operation(async()=>successResult());
const now=()=>new Date('2026-08-05T12:00:01Z');
function input(values: object) {const e=envelope();const changed={...e,operation:{...e.operation,values}};return {...changed,attemptSpecDigest:workerAttemptSpecDigest(changed)};}

test('complete capture is detached/frozen; missing role and duplicate retention author reject',()=>{
  const invalid=structuredClone(policy());(invalid.settings.runtime.retain_logs as any)['buster-provider']=true;
  assert.throws(()=>readWorkerCorePolicyCapture(invalid),/WORKER_CORE_RETENTION_WRITER_UNAVAILABLE/);
  const a=policy();const changed=structuredClone(a);changed.settings.runtime.retain_logs['prism-native']=false;
  assert.equal(a.settings.runtime.retain_logs['prism-native'],true);
  assert(Object.isFrozen(a.settings.runtime.retain_logs));
  delete (changed.settings.runtime.retain_logs as any)['buster-preparation'];
  assert.throws(()=>readWorkerCorePolicyCapture(changed),/WORKER_CORE_POLICY_INVALID/);
  assert.throws(()=>new WorkerAttemptExecutor({envelope:envelope(),operation:operation(),retainLogs:false,...workerCoreExecutionOptions(a,'prism-native')}),/DUPLICATE_RETENTION_AUTHOR/);
});

for(const witness of ['bytes','nodes','depth'] as const)test(`actual constructor A/B ${witness} boundary`,()=>{
  let values:any;
  if(witness==='bytes')values={payload:'x'.repeat(14*1024*1024)};
  if(witness==='nodes')values={payload:Array.from({length:88},()=>Array.from({length:990},()=>0))};
  if(witness==='depth'){values={leaf:true};for(let i=0;i<53;i++)values={nested:values};}
  const e=input(values);
  assert.doesNotThrow(()=>new WorkerAttemptExecutor({envelope:e,operation:operation(),...workerCoreExecutionOptions(policy(),'prism-native')}));
  assert.throws(()=>new WorkerAttemptExecutor({envelope:e,operation:operation(),...workerCoreExecutionOptions(policy('B'),'prism-native')}),new RegExp(`WORKER_ATTEMPT_INPUT_${witness==='bytes'?'BYTE':witness==='nodes'?'NODE':'DEPTH'}_LIMIT`));
});

test('actual retained log writer and completion phases use captured instance, Buster never defaults true',async()=>{
  for(const instance of ['prism-native','prism-agent','buster-provider','buster-preparation','buster-historical-import','buster-source-cleanup'] as const){
    for(const variant of ['A','B'] as const){
      let writes=0;
      const result=await new WorkerAttemptExecutor({envelope:envelope(),operation:new Operation(async ctx=>{ctx.log('stdout','real log');return successResult();}),now,
        ...workerCoreExecutionOptions(policy(variant),instance),...(instance.startsWith('prism-') ? {storeFullLog:async(_id,content)=>{writes++;return {evidenceId:'logs',type:'log',artifact:{artifactId:'log',type:'log',mediaType:'text/plain',contentDigest:sha256Text(content),sizeBytes:Buffer.byteLength(content),storageUrl:'artifact://log'}};}} : {})}).execute();
      assert.equal(result.state,'completed',JSON.stringify(result));assert.equal(writes,variant==='A'&&instance.startsWith('prism-')?1:0);
    }
  }
});

test('actual 7501 wire log parts distinguish A/B',async()=>{
  for(const variant of ['A','B'] as const){const e=envelope({limits:{...envelope().limits,logBytes:160000}});
    const result=await new WorkerAttemptExecutor({envelope:e,now,...workerCoreExecutionOptions(policy(variant),'buster-provider'),operation:new Operation(async ctx=>{for(let i=0;i<7501;i++)ctx.log('stdout','x');return successResult();})}).execute();
    assert.equal(result.state,variant==='A'?'completed':'errored');
  }
});

test('durable A policy survives B reopen; legacy replay never receives B',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-original-'));
  try{for(const selected of [policy(),undefined]){
    const root=path.join(parent,selected?'selected':'legacy'),e=nativeEnvelope(selected?'selected':'legacy');
    const store=new FileWorkerOwnershipStore(parent,{maximumRecords:32,maximumBytes:262144});
    await store.withSupervisor(async authority=>{
      const a=new NativeAttemptJournal(root,limits,undefined,selected);
      await a.configureRouting(authority,`sha256:${'a'.repeat(64)}`);
      await a.withAttempt(e,async ctx=>assert.deepEqual(ctx.workerCore,selected));
      const b=new NativeAttemptJournal(root,limits,undefined,policy('B'));
      await b.configureRouting(authority,`sha256:${'b'.repeat(64)}`);
      await b.withAttempt(e,async ctx=>{assert.equal(ctx.newlyAccepted,false);assert.deepEqual(ctx.workerCore,selected);});
    });
  }}finally{await fs.rm(parent,{recursive:true,force:true});}
});

test('v3 receiving validates full author and exact new caller binding; duplicate JSON keys reject',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-owner-'));
  try{await fs.cp(new URL('../../../config/',import.meta.url),root,{recursive:true});
    const entryFile=path.join(root,'pipeline.config.json'),entry=JSON.parse(await fs.readFile(entryFile,'utf8'));
    const ownerFile=path.join(root,'components/worker-core.config.json');
    const author={schemaVersion:'pipeline-component.v3',owner:'worker-core',profiles:{standard:{settings:policy().settings,activation:{core:'enabled',scaffoldPublication:'enabled'}}}};
    await fs.writeFile(ownerFile,JSON.stringify(author));
    const serviceInstanceId='kubeclaw/prism/prism-worker';
    const selection:any={role:'prism',callerId:'prism-worker',serviceInstanceId,bindings:entry.bindings.filter((b:any)=>b.instanceId===serviceInstanceId&&b.owner!=='worker-core').map(({role,...b}:any)=>b)};
    assert.throws(()=>readSwarmBundle(entryFile,selection),/WORKER_CORE_VERSIONED_SELECTION_REQUIRED/);
    const binding={owner:'worker-core',instanceId:serviceInstanceId,profileId:'standard'};if(!entry.bindings.some((b:any)=>b.owner==='worker-core'&&b.instanceId===serviceInstanceId))entry.bindings.push({role:'prism',...binding});selection.bindings.push(binding);
    await fs.writeFile(entryFile,JSON.stringify(entry));
    const result=readSwarmBundle(entryFile,selection);assert.deepEqual(result.components['worker-core']!.settings,policy().settings);
    await fs.writeFile(ownerFile,JSON.stringify(author).replace('"input_bytes":16777216','"input_bytes":16777216,"input_bytes":16777216'));
    assert.throws(()=>readSwarmBundle(entryFile,selection),/WORKER_CORE_DUPLICATE_AUTHOR/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('original ownership diagnostic closure survives lower current profile',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-ownership-'));
  const a=policy(),b=structuredClone(policy('B'));(b.settings.runtime as any).ownership_diagnostic_units=2048;
  const identity={workerId:'worker:policy',attemptId:'attempt:one',claimId:'claim:one',generation:1,profileDigest:`sha256:${'1'.repeat(64)}`,attemptSpecDigest:`sha256:${'2'.repeat(64)}`};
  const budget={maximumRecords:32,maximumBytes:262144};
  try{
    const original=new FileWorkerOwnershipStore(root,budget,undefined,a);
    let record=await original.reserve(identity);record=await original.transition(record,'unresolved',{diagnosis:'x'.repeat(3072)});
    const reopened=new FileWorkerOwnershipStore(root,budget,undefined,b);
    assert.deepEqual((await reopened.records())[0],record);
    const next=await reopened.reserve({...identity,attemptId:'attempt:two',claimId:'claim:two'});
    await assert.rejects(reopened.transition(next,'unresolved',{diagnosis:'x'.repeat(3072)}),/WORKER_OWNERSHIP_DIAGNOSIS_INVALID/);
    assert.equal((await reopened.records())[1]!.phase,'reserved');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('coupled journal diagnostics and record quota affect real terminal reservation',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-reservation-'));
  try{for(const variant of ['A','B'] as const){
    const root=path.join(parent,variant),store=new FileWorkerOwnershipStore(parent,{maximumRecords:32,maximumBytes:262144});
    await store.withSupervisor(async authority=>{
      const journal=new NativeAttemptJournal(root,{...limits,maximumStateBytes:80000},undefined,policy(variant));
      await journal.configureRouting(authority,`sha256:${'c'.repeat(64)}`);
      await journal.withAttempt(nativeEnvelope(`first-${variant}`),async()=>{});
      const second=()=>journal.withAttempt(nativeEnvelope(`second-${variant}`),async()=>{});
      if(variant==='A')await assert.rejects(second(),/METADATA_CAPACITY_EXCEEDED/);else await second();
    });
  }}finally{await fs.rm(parent,{recursive:true,force:true});}
});

test('routing epoch transition requires real supervisor authority and terminal journal; stale participants reject',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-routing-'));
  try{
    const root=path.join(parent,'journal'),store=new FileWorkerOwnershipStore(parent,{maximumRecords:32,maximumBytes:262144});
    const a=new NativeAttemptJournal(root,limits,undefined,policy());
    await assert.rejects(a.configureRouting({kind:'native-journal-supervisor'},`sha256:${'d'.repeat(64)}`),/ROUTING_CONFLICT/);
    const lower=structuredClone(policy('B'));(lower.settings.runtime as any).journalLockHexDigits=1;
    await store.withSupervisor(async authority=>{
      await a.configureRouting(authority,`sha256:${'a'.repeat(64)}`);
      const e=nativeEnvelope('routing-original');
      await a.withAttempt(e,async()=>{});
      const b=new NativeAttemptJournal(root,limits,undefined,lower);
      await b.configureRouting(authority,`sha256:${'b'.repeat(64)}`);
      await assert.rejects(b.configureRouting(authority,`sha256:${'b'.repeat(64)}`,true),/ROUTING_CONFLICT/);
      const {interruptedNativeWorkerResult}=await import('../../../skills/worker/core/worker/native-result.ts');
      await a.withAttempt(e,async ctx=>a.seal(e,interruptedNativeWorkerResult(e,new Date(ctx.acceptedAt),'TEST_NOT_LAUNCHED',null,true)));
      await b.configureRouting(authority,`sha256:${'b'.repeat(64)}`,true);
      await assert.rejects(a.withAttempt(e,async()=>{}),/ROUTING_CONFLICT/);
      await b.withAttempt(e,async ctx=>assert.deepEqual(ctx.workerCore,policy()));
      const current=JSON.parse(await fs.readFile(path.join(root,'routing/current.json'),'utf8'));
      assert.equal(current.epoch,2);assert.equal(current.journalLockHexDigits,1);
      assert.equal((await fs.readdir(path.join(root,'routing/epochs'))).length,2);
    });
  }finally{await fs.rm(parent,{recursive:true,force:true});}
});

test('real trusted file readers apply selected caps before parsing and compare actual host identity',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-readers-'));
  const a=policy(),b=structuredClone(policy('B'));Object.assign(b.settings.runtime,{pool_file_bytes:32768,runtime_identity_file_bytes:2048,node_identity_file_bytes:64});
  const {readNativeWorkerNodeIdentity}=await import('../../../skills/worker/core/worker/native-node-identity.ts');
  const {readNativeWorkerPoolPolicy}=await import('../../../skills/worker/core/worker/native-pool-policy.ts');
  const {requireNativeWorkerRuntimeIdentity}=await import('../../../skills/worker/core/worker/native-runtime-identity.ts');
  try{
    const node=path.join(root,'node'),runtime=path.join(root,'runtime'),pool=path.join(root,'pool');
    const bootId=(await fs.readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();
    const ns=await fs.stat('/proc/self/ns/cgroup',{bigint:true});
    const identity={schemaVersion:1,bootId,cgroupNamespace:{device:String(ns.dev),inode:String(ns.ino)}};
    const descriptor={schemaVersion:1,role:'prism',nodeName:'local-reader-test',policyDigest:'a'.repeat(64),cgroupRoot:'/test/cgroups',ownershipRoot:'/test/owners',nodeIdentityFile:node,runtimeIdentityFile:runtime,maximumActiveScopes:2,limits:{memoryBytes:1073741824,tasks:64,cpuQuotaMicroseconds:100000,cpuPeriodMicroseconds:100000}};
    for(const [file,value,size] of [[node,bootId,96],[runtime,JSON.stringify(identity),3072],[pool,JSON.stringify(descriptor),49152]] as const){await fs.writeFile(file,value.padEnd(size));await fs.chmod(file,0o444);}
    assert.equal(readNativeWorkerNodeIdentity(node,a),`native-node:${bootId}`);
    assert.equal(readNativeWorkerPoolPolicy(pool,'prism',a).role,'prism');
    assert.doesNotThrow(()=>requireNativeWorkerRuntimeIdentity(runtime,a));
    assert.throws(()=>readNativeWorkerNodeIdentity(node,b),/NOT_TRUSTED/);
    assert.throws(()=>readNativeWorkerPoolPolicy(pool,'prism',b),/NOT_TRUSTED/);
    assert.throws(()=>requireNativeWorkerRuntimeIdentity(runtime,b),/NOT_TRUSTED/);
    for(const [file,value] of [[node,bootId],[runtime,JSON.stringify(identity)],[pool,JSON.stringify(descriptor)]] as const){await fs.chmod(file,0o644);await fs.writeFile(file,value);await fs.chmod(file,0o444);}
    assert.equal(readNativeWorkerNodeIdentity(node,b),`native-node:${bootId}`);
    assert.equal(readNativeWorkerPoolPolicy(pool,'prism',b).role,'prism');
    assert.doesNotThrow(()=>requireNativeWorkerRuntimeIdentity(runtime,b));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('epoch change after outer stripe check cannot admit a stale participant',{timeout:10000},async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'worker-core-routing-race-'));
  const originalOpen=fs.open;
  let release!:()=>void, reached!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),paused=new Promise<void>(resolve=>{reached=resolve;});
  try{
    const root=path.join(parent,'journal'),store=new FileWorkerOwnershipStore(parent,{maximumRecords:32,maximumBytes:262144});
    await store.withSupervisor(async authority=>{
      const a=new NativeAttemptJournal(root,limits,undefined,policy());
      await a.configureRouting(authority,`sha256:${'a'.repeat(64)}`);
      const routing=JSON.parse(await fs.readFile(path.join(root,'routing/current.json'),'utf8'));
      const epoch=path.join(root,'routing/epochs',`${routing.routingDigest.slice(7)}.json`);
      let reads=0;
      // Pause the second real immutable-epoch read after it captured A bytes.
      // Trust checks, actual flock acquisition and epoch publication remain real.
      fs.open=(async(...args:Parameters<typeof fs.open>)=>{
        const handle=await originalOpen(...args);
        if(String(args[0])===epoch){const close=handle.close.bind(handle);handle.close=async()=>{
          await close();if(++reads===2){reached();await gate;}
        };}
        return handle;
      }) as typeof fs.open;
      const e=nativeEnvelope('routing-race');
      const pending=a.withAttempt(e,async()=>assert.fail('stale participant entered admission'));
      const settled=pending.then(value=>({value}),error=>({error}));
      await Promise.race([paused,settled.then(()=>assert.fail('expected pause before admission'))]);
      const lower=structuredClone(policy('B'));(lower.settings.runtime as any).journalLockHexDigits=1;
      const b=new NativeAttemptJournal(root,limits,undefined,lower);
      await b.configureRouting(authority,`sha256:${'b'.repeat(64)}`,true);
      release();const result=await settled;assert('error' in result);assert.match(String(result.error),/ROUTING_CONFLICT/);
      assert.equal(await b.hasAttempt(e),false);
    });
  }finally{release?.();fs.open=originalOpen;await fs.rm(parent,{recursive:true,force:true});}
});
