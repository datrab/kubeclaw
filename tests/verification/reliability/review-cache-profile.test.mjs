import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CURRENT_REVIEW_CACHE_PROFILE as profile, CURRENT_RUNTIME_DISPATCH_PROFILE as transport,
  parseReviewCacheProfile, reviewCacheProfileFromContext, portableJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {validateContractValue} from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import {assertRunSnapshot, graphSnapshot, readRunSnapshot, writeRunSnapshots} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {buildReviewCacheRecord, parseReviewCacheRecord, runWithReviewCache} from '../../../skills/nova/plugins/review/src/review-content-cache.ts';

test('separate finite cache profile has canonical SDK/Foundation parity and never invokes getters',()=>{
  assert.equal(Object.isFrozen(profile),true);
  for(const valid of [profile,{encoding:profile.encoding,recordVersion:profile.recordVersion,schemaVersion:profile.schemaVersion}]){
    assert.equal(parseReviewCacheProfile(valid),profile);validateContractValue('reviewCacheProfile',valid);
  }
  let getters=0;const getter={...profile};Object.defineProperty(getter,'encoding',{enumerable:true,get(){getters++;return profile.encoding;}});
  for(const invalid of [undefined,null,[],Array(2),NaN,Infinity,getter,Object.assign(new(class {})(),profile),
    {...profile,extra:true},{...profile,encoding:'future'},{...profile,recordVersion:'review-content-cache.v3'},
    {...profile,schemaVersion:'review-cache-profile.v2'},{...profile,encoding:undefined}]){
    assert.throws(()=>parseReviewCacheProfile(invalid));assert.throws(()=>validateContractValue('reviewCacheProfile',invalid));
    assert.throws(()=>reviewCacheProfileFromContext({reviewCacheProfile:invalid}));
  }
  assert.equal(getters,0);assert.equal(reviewCacheProfileFromContext({runtimeDispatchProfile:transport}),undefined);
});

test('context profile selection rejects absent/present Proxy and getters before any trap or field access',()=>{
  const legacy={lease:{attempt:{runId:'run:cache',stageId:'review',attemptId:'attempt:cache',attemptNumber:1}},artifacts:[]};
  assert.equal(reviewCacheProfileFromContext(legacy),undefined);
  assert.equal(reviewCacheProfileFromContext({...legacy,reviewCacheProfile:profile}),profile);
  for(const target of [{},{...legacy},{...legacy,reviewCacheProfile:profile}]){
    let traps=0;const proxy=new Proxy(target,{get(){traps++;},ownKeys(){traps++;return [];},
      getOwnPropertyDescriptor(){traps++;return undefined;},getPrototypeOf(){traps++;return null;}});
    assert.throws(()=>reviewCacheProfileFromContext(proxy));assert.equal(traps,0);
  }
  for(const field of ['reviewCacheProfile','legacyModelData']){
    let getters=0;const value={...legacy};Object.defineProperty(value,field,{enumerable:true,get(){getters++;return profile;}});
    assert.throws(()=>reviewCacheProfileFromContext(value));assert.equal(getters,0);
  }
  assert.throws(()=>reviewCacheProfileFromContext({...legacy,reviewCacheProfile:undefined}));
});

test('genuine v4 writer requires both profiles; legacy version/profile combinations reject after rehash',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cache-profile-snapshot-'));
  try{
    const definition=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-source-snapshots/ascii/definition.json',import.meta.url),'utf8'));
    writeRunSnapshots(root,graphSnapshot(definition),{});
    const snapshot=readRunSnapshot(root);assert.equal(snapshot.schemaVersion,'run-snapshot.v4');
    assert.deepEqual(snapshot.reviewCacheProfile,profile);assert.deepEqual(snapshot.runtimeDispatchProfile,transport);
    const rehash=value=>{const {digest,...unsigned}=value;return {...unsigned,digest:sha256Text(portableJson(unsigned))};};
    const {reviewCacheProfile:cacheRemoved,...withoutCache}=snapshot;
    const {runtimeDispatchProfile:transportRemoved,...withoutTransport}=snapshot;
    for(const value of [withoutCache,withoutTransport,{...snapshot,reviewCacheProfile:{...profile,encoding:'future'}},
      ...['v1','v2','v3'].map(v=>({...snapshot,schemaVersion:`run-snapshot.${v}`}))]) assert.throws(()=>assertRunSnapshot(rehash(value)));
    // v3 is explicitly portable transport AND legacy cache. No inferred cache profile.
    const legacy=rehash({...withoutCache,schemaVersion:'run-snapshot.v3'});assertRunSnapshot(legacy);
    assert.equal(reviewCacheProfileFromContext(legacy),undefined);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('v2 owns strict JSON and both inner digests; profile mismatch is an error, never a miss',async()=>{
  const digest=c=>`sha256:${c.repeat(64)}`,unit={id:'unit',digest:digest('a')};
  const identity={policyDigest:digest('b'),reviewerProtocol:'review.v1',reviewerModel:'model',reviewerRuntimeIdentityDigest:digest('c'),evidenceVersion:'repository-review-evidence.v2'};
  const value={I:1,i:2},record=buildReviewCacheRecord(unit,identity,value,profile);
  assert.equal(record.schemaVersion,'review-content-cache.v2');assert.equal(record.valueDigest,sha256Text(portableJson(value)));
  assert.deepEqual(parseReviewCacheRecord(record,unit,identity),record);
  let selectorReads=0;const selector={...record};
  Object.defineProperty(selector,'schemaVersion',{enumerable:true,get(){selectorReads++;return record.schemaVersion;}});
  assert.throws(()=>parseReviewCacheRecord(selector,unit,identity));assert.equal(selectorReads,0);
  let proxyTraps=0;const proxy=new Proxy(record,{get(){proxyTraps++;},ownKeys(){proxyTraps++;return [];},getOwnPropertyDescriptor(){proxyTraps++;},getPrototypeOf(){proxyTraps++;return null;}});
  assert.throws(()=>parseReviewCacheRecord(proxy,unit,identity));assert.equal(proxyTraps,0);
  assert.throws(()=>parseReviewCacheRecord({...record,value:{I:2,i:1}},unit,identity),/value digest/);
  assert.throws(()=>parseReviewCacheRecord({...record,digest:digest('f')},unit,identity),/record digest/);
  let getters=0;const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){getters++;return 1;}});
  for(const invalid of [Array(2),NaN,Infinity,getter,{x:undefined},new Date(),{x:1n}]) assert.throws(()=>buildReviewCacheRecord(unit,identity,invalid,profile));
  assert.equal(getters,0);
  for(const [cached,selected] of [[record,undefined],[buildReviewCacheRecord(unit,identity,value),profile]]){
    let executes=0,writes=0;
    await assert.rejects(runWithReviewCache([unit],identity,{read:async()=>cached,write:async()=>{writes++;}},async()=>{executes++;return new Map();},()=>true,selected),/profile/);
    assert.equal(executes,0);assert.equal(writes,0);
  }
});
