// Registered test stage invokes original cache producers and original Core/ArtifactStore.
// Seeded valid model output exercises cache admission only; no model is executed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewCacheProfileFromContext} from '@kubeclaw/plugin-sdk';
import {admittedCacheValue} from '../value.mjs';
import {RepositoryAuditArtifactCache} from '../../../../skills/nova/plugins/review/src/repository-audit-cache.ts';
import {buildReviewCacheRecord,runWithReviewCache} from '../../../../skills/nova/plugins/review/src/review-content-cache.ts';
import {reusableReviewResult} from '../../../../skills/nova/plugins/review/src/review-completion.ts';

export async function execute(_input,context){
  const {job,identity,value}=admittedCacheValue(),attempt=context.contract.lease.attempt;
  const cache=new RepositoryAuditArtifactCache(context);
  assert.equal(reviewCacheProfileFromContext(context.contract),context.contract.reviewCacheProfile);
  assert.equal(cache.profile,context.contract.reviewCacheProfile);
  if(cache.profile)assert.equal(Object.isFrozen(context.contract.reviewCacheProfile),true);
  let executions=0;
  const run=await runWithReviewCache([job],identity,cache,async(misses,checkpoint)=>{
    executions++;assert.equal(misses.length,1);await checkpoint(job.id,value);return new Map([[job.id,value]]);
  },(unit,result)=>reusableReviewResult(job,result,true),cache.profile);
  assert.equal(executions,attempt.attemptNumber===1?1:0);
  assert.equal(run.hits,attempt.attemptNumber===1?0:1);
  assert.equal(context.contract.artifacts.length,attempt.attemptNumber-1);
  if(context.contract.config.rewriteAttempts.includes(attempt.attemptNumber)){
    await cache.write(buildReviewCacheRecord(job,identity,value,cache.profile));
  }
  fs.writeSync(1,JSON.stringify({attempt:attempt.attemptNumber,hits:run.hits,executions,
    profile:cache.profile??'legacy',prior:context.contract.artifacts,artifacts:cache.artifacts()})+'\n');
  if(context.contract.config.crashAttempts.includes(attempt.attemptNumber)){
    fs.writeSync(1,`CACHE_CHECKPOINT:${attempt.attemptNumber}\n`);process.kill(process.pid,'SIGKILL');
  }
  return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};
}
