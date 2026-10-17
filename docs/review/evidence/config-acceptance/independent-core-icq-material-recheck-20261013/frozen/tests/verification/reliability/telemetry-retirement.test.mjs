import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';
import {FileDurableRecordStore} from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import {activate} from '../../../skills/common/plugins/telemetry-store/src/adapter.ts';
import {retireTelemetry} from '../../../scripts/retire-telemetry.mjs';
import {planRetirement} from '../../../scripts/observability-retirement-plan.mjs';
import {runPipelineV2} from '../../../skills/nova/core/execution/engine.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {withRunMutationLock} from '../../../skills/nova/core/execution/run-mutation.ts';
import {budgetFixture} from './repair-budget-fixture.mjs';

const limits={maximumRecords:3,maximumBytes:100000,maximumRecordBytes:20000};
const stream='telemetry/plugin-events';
const blob={message:'retained canonical diagnostic; projection copy only '.repeat(250)};
test('exact retirement byte accounting crosses decimal digit boundaries without a fixed point',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'record-retirement-accounting-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const length of [1300,1339,1340,1341,1400,10000]) {
    const dir=path.join(root,String(length)),store=new FileDurableRecordStore(dir,limits);
    const {record}=await store.append('stream','key',{text:'x'.repeat(length)},'run:a');
    const file=path.join(dir,'records/store.json'),before=fs.statSync(file).size;
    const intent={operationId:'retire',actor:'operator',owner:'run:a',stream:'stream',records:[{idempotencyKey:'key',payloadDigest:record.payloadDigest}],evidence:{}};
    const receipt=await store.retire(intent,async()=>{});
    assert.equal(receipt.releasedBytes,before-fs.statSync(file).size);
    assert.match(receipt.releasedBytesHex,/^[a-f0-9]{16}$/);
    assert.equal(Number.parseInt(receipt.releasedBytesHex,16),receipt.releasedBytes);
    assert.equal((await new FileDurableRecordStore(dir,limits).retire(intent,async()=>{})).releasedBytes,receipt.releasedBytes);
  }
});
test('original v1 stores reopen without rewriting and retain ordinary append/read/transition contracts',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'record-v1-retirement-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const first=new FileDurableRecordStore(root,limits);const original=await first.append('legacy','one',{value:1});
  const file=path.join(root,'records/store.json'),bytes=fs.readFileSync(file);assert.equal(JSON.parse(bytes).schemaVersion,'pipeline-durable-record-store.v1');
  const reopened=new FileDurableRecordStore(root,limits);assert.deepEqual(await reopened.read('legacy'),[original.record]);
  assert.deepEqual(await reopened.append('legacy','one',{value:1},'run:new'),{appended:false,record:original.record});
  assert.deepEqual(fs.readFileSync(file),bytes,'legacy duplicate is not silently assigned a run owner');
  const changed=await reopened.transition('legacy','one',original.record.payloadDigest,{value:2});
  assert.equal(changed.sequence,1);assert.equal(changed.schemaVersion,'pipeline-durable-record.v1');
  await reopened.append('new','owned',blob,'run:new');assert.equal(JSON.parse(fs.readFileSync(file)).schemaVersion,'pipeline-durable-record-store.v2');
  assert.deepEqual((await new FileDurableRecordStore(root,limits).read('legacy'))[0].payload,{value:2});
  await assert.rejects(reopened.transition('legacy','one',original.record.payloadDigest,{}),/TRANSITION_CONFLICT/);
});
async function fixture(t,failures={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'telemetry-retirement-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const f=budgetFixture(root,failures),runId='run:retirement';
  const result=await runPipelineV2(f.platform,f.definition,runId);
  const run=runRoot(f.platform.storageRoot,runId),telemetryRoot=path.join(root,'telemetry');
  const store=new FileDurableRecordStore(telemetryRoot,limits);
  const adapter=activate({config:{root:telemetryRoot,maxRecordBytes:limits.maximumRecordBytes,maximumRecords:limits.maximumRecords,maximumStoreBytes:limits.maximumBytes}});
  const locks=new FileResourceLockManager(path.join(root,'telemetry-locks'));
  const invoke=async(key,payload=blob,owner=runId)=>{
    const resource={type:'telemetry.event',canonicalId:'run.succeeded'},lock=locks.acquire(resource,key,60000);
    try{return await adapter.invoke({request:{idempotencyKey:key,attempt:{runId:owner,stageId:'observer',attemptId:key,attemptNumber:1},capability:'telemetry.emit',operation:'append',resource,payload},signal:new AbortController().signal,fence:{assertCurrent(){return locks.assertCurrent(lock.lockId,key);}}});}
    finally{locks.release(lock.lockId,key);}
  };
  await invoke('one');await invoke('other',blob,'run:waiting');await store.append('legacy','old',blob);
  const records=(await store.read(stream)).filter(record=>record.owner===runId).map(({idempotencyKey,payloadDigest})=>({idempotencyKey,payloadDigest}));
  const events=fs.readFileSync(path.join(run,'events.jsonl'),'utf8');
  const scope={schemaVersion:'telemetry-retirement-scope.v1',action:'delete-telemetry-projections',actor:'operator:local',operationId:'retire:one',runId,novaStorageRoot:f.platform.storageRoot,telemetryRoot,
    records,expectedJournalHead:JSON.parse(events.trim().split('\n').at(-1)).hash,expectedSnapshotDigest:JSON.parse(fs.readFileSync(path.join(run,'run-snapshot.json'),'utf8')).digest,
    storeLimits:limits,inventoryLimits:{maximumFiles:10000,maximumTotalBytes:256*1024**2,maximumSnapshotBytes:32*1024**2}};
  return {root,run,runId,scope,store,invoke,result,events};
}

test('manual terminal-run cleanup releases actual bytes and record quota; duplicate replay never resurrects',async t=>{
  const f=await fixture(t);assert.equal(f.result.status,'succeeded');
  await assert.rejects(f.invoke('new'),/DURABLE_RECORD_STORE_FULL/);
  const file=path.join(f.scope.telemetryRoot,'records/store.json'),before=fs.statSync(file).size;
  const receipt=await retireTelemetry(f.scope);
  assert.equal(receipt.newlyRetired,true);assert.equal(receipt.releasedBytes,before-fs.statSync(file).size);
  assert.deepEqual(await f.invoke('one'),{accepted:false,sequence:1});
  assert.deepEqual(await f.invoke('new'),{accepted:true,sequence:3});
  await assert.rejects(f.invoke('one',{message:'different'}),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(f.invoke('one',blob,'foreign'),/IDEMPOTENCY_CONFLICT/);
  const reopened=new FileDurableRecordStore(f.scope.telemetryRoot,limits);
  assert.equal((await reopened.read(stream)).length,2);
  assert.equal((await reopened.retirements(stream)).length,1);
  const plan=planRetirement({schemaVersion:'observability-retirement-scope.v1',runId:f.runId,novaStorageRoot:f.scope.novaStorageRoot,
    artifactRoots:[],telemetryRoots:[f.scope.telemetryRoot],busterStores:[]});
  assert.equal(plan.telemetry[0].retirements[0].records,1);
  assert.equal(plan.telemetry[0].retirements[0].ownerRunId,f.runId);
  await assert.rejects(reopened.transition(stream,'one',f.scope.records[0].payloadDigest,blob),/DURABLE_RECORD_RETIRED/);
  assert.equal((await retireTelemetry(f.scope)).newlyRetired,false);
  const currentBytes=fs.statSync(file).size;
  const byteLimited=new FileDurableRecordStore(f.scope.telemetryRoot,{...limits,maximumRecords:100,maximumBytes:currentBytes});
  await assert.rejects(byteLimited.append('other','over-budget',{value:1}),/DURABLE_RECORD_STORE_FULL/);
  assert.equal((await byteLimited.append(stream,'one',blob,f.runId)).appended,false,'tombstone replay consumes no new quota');
  assert.equal(fs.readFileSync(path.join(f.run,'events.jsonl'),'utf8'),f.events);
  assert.deepEqual((await reopened.read('legacy'))[0].payload,blob);
  const originalBytes=fs.readFileSync(file),state=JSON.parse(originalBytes);
  for (const changed of [
    {...state,tombstones:[]},
    {...state,retirements:[]},
    {...state,tombstones:state.tombstones.map(item=>({...item,owner:'foreign'}))},
    {...state,records:[...state.records].reverse()},
  ]) {
    fs.writeFileSync(file,JSON.stringify(changed));
    await assert.rejects(new FileDurableRecordStore(f.scope.telemetryRoot,limits).read(stream),/DURABLE_/);
    fs.writeFileSync(file,originalBytes);
  }
});

test('waiting run, foreign owner, stale source, reused operation and legacy records reject without release',async t=>{
  const f=await fixture(t,{lint:[1,2,3]});assert.equal(f.result.status,'waiting');
  const file=path.join(f.scope.telemetryRoot,'records/store.json'),before=fs.readFileSync(file);
  await assert.rejects(retireTelemetry(f.scope),/RUN_BLOCKED:RUN_ACTIVE_OR_WAITING/);
  assert.deepEqual(fs.readFileSync(file),before);
  const complete=await fixture(t);
  const other=(await complete.store.read(stream)).find(record=>record.owner==='run:waiting');
  await assert.rejects(retireTelemetry({...complete.scope,records:[{idempotencyKey:other.idempotencyKey,payloadDigest:other.payloadDigest}]}),/RECORD_CHANGED/);
  await assert.rejects(retireTelemetry({...complete.scope,expectedJournalHead:'sha256:'+'0'.repeat(64)}),/RUN_CHANGED/);
  const legacy=(await complete.store.read('legacy'))[0];
  await assert.rejects(complete.store.retire({operationId:'legacy',actor:'operator',owner:complete.runId,stream:'legacy',records:[{idempotencyKey:legacy.idempotencyKey,payloadDigest:legacy.payloadDigest}],evidence:{}},async()=>{}),/RECORD_CHANGED/);
  await retireTelemetry(complete.scope);
  await assert.rejects(retireTelemetry({...complete.scope,actor:'other'}),/RETIREMENT_CONFLICT/);
});

test('real run mutation fence rejects concurrent cleanup; immutable intent survives caller mutation',async t=>{
  const f=await fixture(t);
  await withRunMutationLock(f.run,async()=>assert.rejects(retireTelemetry(f.scope),/PIPELINE_RUN_MUTATION_LOCKED/));
  const mutable=structuredClone(f.scope),operation=retireTelemetry(mutable);
  mutable.runId='foreign';mutable.records[0].payloadDigest='sha256:'+'0'.repeat(64);
  assert.equal((await operation).intent.owner,f.runId);
});

test('SIGKILL after actual atomic store commit retains tombstones and one CLI release',async t=>{
  const f=await fixture(t),scopeFile=path.join(f.root,'scope.json');fs.writeFileSync(scopeFile,JSON.stringify(f.scope));
  const module=pathToFileURL(path.resolve('scripts/retire-telemetry.mjs')).href;
  const code=`import {retireTelemetry} from ${JSON.stringify(module)};await retireTelemetry(${JSON.stringify(f.scope)});process.stdout.write('committed\\n');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  let diagnostics='';child.stderr.on('data',chunk=>diagnostics+=chunk);
  const done=once(child,'exit');const marker=await once(child.stdout,'data');assert.equal(marker[0].toString(),'committed\n',diagnostics);child.kill('SIGKILL');assert.equal((await done)[1],'SIGKILL');
  const output=JSON.parse(execFileSync(process.execPath,['scripts/retire-telemetry.mjs','--apply',scopeFile],{encoding:'utf8'}));
  assert.equal(output.newlyRetired,false);assert.equal(output.releasedBytes,0);assert.equal(output.releasedRecords,0);
  assert.deepEqual(await f.invoke('one'),{accepted:false,sequence:1});
  assert.deepEqual(await f.invoke('new'),{accepted:true,sequence:3});
});


test('native competing store writer blocks retirement; SIGKILL before mutation leaves original bytes',async t=>{
  const f=await fixture(t),file=path.join(f.scope.telemetryRoot,'records/store.json'),before=fs.readFileSync(file);
  const module=pathToFileURL(path.resolve('skills/common/plugin-runtime/foundation/observability/durable-delivery.ts')).href;
  const code=`import {withDurableStoreLock} from ${JSON.stringify(module)};await withDurableStoreLock(${JSON.stringify(file)},async()=>{process.stdout.write('locked\\n');await new Promise(()=>{});});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const done=once(child,'exit');assert.equal((await once(child.stdout,'data'))[0].toString(),'locked\n');
  let settled=false;const retirement=retireTelemetry(f.scope).finally(()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false);
  assert.deepEqual(fs.readFileSync(file),before);
  child.kill('SIGKILL');assert.equal((await done)[1],'SIGKILL');
  assert.equal((await retirement).newlyRetired,true);
  assert.deepEqual(await f.invoke('one'),{accepted:false,sequence:1});
});
