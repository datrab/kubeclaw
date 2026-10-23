import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setImmediate} from 'node:timers/promises';
import {captureReviewPolicy} from '../../../skills/common/plugin-runtime/foundation/config/review-owned-policy.ts';
import {selectedReviewCacheReadConcurrency,getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {runWithReviewCache} from '../../../skills/nova/plugins/review/src/review-content-cache.ts';
const settings=JSON.parse(fs.readFileSync('config/plugins/kubeclaw.review/profiles/standard.config.json','utf8')).profiles.standard.settings;
const capture=settings=>captureReviewPolicy({schemaVersion:'review-policy-capture.v1',source:{file:'/original/review.json',profile:'standard'},settings});
const selected=settings=>selectedReviewCacheReadConcurrency({ownedPolicyProfiles:settings});
const digest='sha256:'+ 'a'.repeat(64), identity={policyDigest:digest,reviewerProtocol:'review.v1',reviewerModel:'model',reviewerRuntimeIdentityDigest:digest,evidenceVersion:'evidence.v1'};
const units=Array.from({length:40},(_,i)=>({id:String(i).padStart(2,'0'),digest}));
test('v4 operational author is required and invalid values cannot become fallback or legacy additions',()=>{
 for(const bad of [undefined,null,0,-1,1.2,'16',1025]){
  const value={...settings,cacheReadConcurrency:bad};if(bad===undefined)delete value.cacheReadConcurrency;
  assert.throws(()=>capture(value),/CAPTURE_INVALID/);assert.throws(()=>selected(value),/OWNED_POLICY_INVALID/);
 }
 for(const version of ['v1','v2','v3']){
  const old={...settings,schemaVersion:'review-owned-decision-profiles.'+version};delete old.revalidation;delete old.cacheReadConcurrency;
  if(version!=='v3')delete old.promptTokenBoundaryReserve;if(version==='v1')delete old.repositoryGrades;
  assert.deepEqual(capture(old).settings,old);assert.equal(selected(capture(old).settings),16);
  assert.throws(()=>capture({...old,cacheReadConcurrency:16}),/CAPTURE_INVALID/);
  assert.throws(()=>getReviewPolicyProfile('gate',{...old,cacheReadConcurrency:16}),/OWNED_POLICY_INVALID/);
 }
 assert.equal(selected({ ...settings,cacheReadConcurrency:1024}),1024);
});
test('real cache workers obey selected A/B bounds and historical16 without changing results',async()=>{
 const a=capture({...settings,cacheReadConcurrency:2}),b=capture({...settings,cacheReadConcurrency:5});
 for(const [limit,expected] of [[selected(a.settings),2],[selected(b.settings),5],[undefined,16],[selected(a.settings),2]]){
  let active=0,peak=0,reads=0;
  const store={async read(){reads++;active++;peak=Math.max(peak,active);await setImmediate();active--;return undefined;},async write(){}};
  const result=await runWithReviewCache(units,identity,store,async misses=>new Map(misses.map(x=>[x.id,x.id])),undefined,undefined,limit);
  assert.equal(peak,expected);assert.equal(active,0);assert.equal(reads,40);assert.equal(result.misses,40);assert.equal(result.values.size,40);
 }
});
test('invalid concurrency rejects before I/O; first read failure drains active workers',async()=>{
 let reads=0;
 for(const bad of [0,-1,1.5,'2',NaN,Infinity,1025])await assert.rejects(runWithReviewCache(units,identity,{async read(){reads++;},async write(){}},async()=>new Map(),undefined,undefined,bad),/concurrency is invalid/);
 assert.equal(reads,0);
 let active=0,done=0;const failure=new Error('original read failure');
 await assert.rejects(runWithReviewCache(units,identity,{async read(){active++;const index=reads++;try{await setImmediate();if(index===0)throw failure;return undefined;}finally{active--;done++;}},async write(){}},async()=>{throw new Error('must not dispatch');},undefined,undefined,2),e=>e===failure);
 assert.equal(reads,2);assert.equal(done,2);assert.equal(active,0);
});
