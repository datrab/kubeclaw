import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CURRENT_REVIEW_CACHE_PROFILE as profile, PORTABLE_JSON_ENCODING, portableJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {admittedCacheValue} from '../../fixtures/review-cache-stage/value.mjs';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {EffectCoordinator,FileEffectJournal,FileResourceLockManager} from '../../../skills/nova/core/src/index.ts';
import {RepositoryAuditArtifactCache} from '../../../skills/nova/plugins/review/src/repository-audit-cache.ts';
import {buildReviewCacheRecord,runWithReviewCache} from '../../../skills/nova/plugins/review/src/review-content-cache.ts';

test('actual Core/FileJournal/ArtifactStore retains exact same-byte owners and rejects all corrupt/mixed cache candidates',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cache-storage-negative-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const adapter=activate({config:{artifactRoot:path.join(root,'artifacts')}});await adapter.ready();t.after(()=>adapter.shutdown());
  const coordinator=new EffectCoordinator(new FileEffectJournal(path.join(root,'effects.jsonl')),undefined,undefined,new FileResourceLockManager(path.join(root,'locks')));
  const owner={pluginId:'kubeclaw.artifact-store',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',contentDigest:`sha256:${'c'.repeat(64)}`};
  const {job,identity,value}=admittedCacheValue(),record=buildReviewCacheRecord(job,identity,value,profile);
  const artifactId=`repository-review-cache:${record.cacheKey.slice(7)}`;
  let sequence=0,readCalls=0,executes=0;
  const attempt=(number,runId='run:negative')=>({runId,stageId:'review',attemptId:`attempt:${runId.split(':')[1]}-${number}`,attemptNumber:number});
  async function invoke(producer,capability,request){
    const receipt=await coordinator.invoke(adapter,owner,{...request,capability,attempt:producer,idempotencyKey:`negative:${++sequence}`},new AbortController().signal);
    if(receipt.status!=='completed')throw Error(receipt.error.message);return receipt.result;
  }
  async function put(producer,stored=record,encoding=PORTABLE_JSON_ENCODING){
    return (await invoke(producer,'artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:artifactId},
      payload:{namespace:'kubeclaw.review',mediaType:'application/json',value:stored,...(encoding?{encoding}:{})}})).artifact;
  }
  function cache(refs,selected=profile){return new RepositoryAuditArtifactCache({contract:{lease:{attempt:attempt(9)},artifacts:refs,
    ...(selected?{reviewCacheProfile:selected}:{})},invoke:(capability,request)=>{readCalls++;return invoke(attempt(9),capability,request);}});}
  async function read(refs,selected=profile){return runWithReviewCache([job],identity,cache(refs,selected),async()=>{executes++;return new Map();},()=>true,selected??undefined);}
  // Two real concurrent same-value writes, then a foreign run writes identical bytes.
  const [first,second]=await Promise.all([put(attempt(1)),put(attempt(2))]);
  const foreign=await put(attempt(1,'run:foreign'));
  assert.equal(first.digest,second.digest);assert.equal(first.digest,foreign.digest);
  const selected=cache([second,foreign,first]);
  const hit=await selected.read(record.cacheKey);assert.deepEqual(hit,record);
  assert.equal(selected.artifacts()[0].producer.attemptNumber,1);assert.equal(selected.artifacts()[0].producer.runId,'run:negative');
  assert.equal((await read([first,second,foreign])).hits,1);assert.equal(executes,0);
  assert.throws(()=>{selected.profile=undefined;},TypeError);
  // Explicitly request no encoding: the helper default is otherwise portable.
  const actualLegacy=await put(attempt(4),buildReviewCacheRecord(job,identity,value),null);
  for(const refs of [[first,actualLegacy],[first,{...second,encoding:'future'}],[first,{...second,sizeBytes:second.sizeBytes+1}],
    [first,{...second,digest:`sha256:${'f'.repeat(64)}`}],[first,{...second,encoding:undefined}]]){
    const calls=readCalls;await assert.rejects(()=>read(refs));assert.equal(readCalls,calls,'all trusted metadata is checked before selecting any candidate');
  }
  await assert.rejects(()=>read([first],null));
  // Honesty of the outer blob digest cannot authorize corrupt inner proofs/versions.
  const {digest,...unsigned}=record;
  const corruptions=[{...record,value:{changed:true}}, {...record,digest:`sha256:${'f'.repeat(64)}`},
    {...unsigned,schemaVersion:'review-content-cache.v9',digest:sha256Text(portableJson({...unsigned,schemaVersion:'review-content-cache.v9'}))},
    {...record,extra:'undeclared'},buildReviewCacheRecord(job,identity,value)];
  for(const [index,corrupt] of corruptions.entries()){
    const ref=await put(attempt(index+1),corrupt);assert.equal(ref.digest,sha256Text(portableJson(corrupt)));
    await assert.rejects(()=>read([ref]));assert.equal(executes,0);
  }
  // Full-ref reads cannot select a nonexistent same-byte producer by digest alone.
  await assert.rejects(()=>read([{...first,producer:{...first.producer,attemptId:'attempt:never-produced'}}]));
  await assert.rejects(()=>read([{...first,sizeBytes:first.sizeBytes+1}]));
  assert.equal(executes,0);
  t.diagnostic(JSON.stringify({nativeArtifactStore:true,mocks:false,racingWrites:2,foreignSameBytes:true,executedMisses:executes}));
});
