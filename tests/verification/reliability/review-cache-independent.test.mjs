import test from 'node:test';
import assert from 'node:assert/strict';
import {CURRENT_REVIEW_CACHE_PROFILE as profile,reviewCacheProfileFromContext} from '@kubeclaw/plugin-sdk';
import {buildReviewCacheRecord,parseReviewCacheRecord} from '../../../skills/nova/plugins/review/src/review-content-cache.ts';
import {RepositoryAuditArtifactCache} from '../../../skills/nova/plugins/review/src/repository-audit-cache.ts';

const digest=`sha256:${'a'.repeat(64)}`;
const unit={id:'unit',digest};
const identity={policyDigest:digest,reviewerProtocol:'v1',reviewerModel:'model',
  reviewerRuntimeIdentityDigest:digest,evidenceVersion:'v1'};

test('independent v2 record version selection does not execute getter or proxy traps',()=>{
  const record=buildReviewCacheRecord(unit,identity,{valid:true},profile);
  let getterReads=0;
  const getter={...record};
  Object.defineProperty(getter,'schemaVersion',{enumerable:true,get(){getterReads++;return 'review-content-cache.v2';}});
  assert.throws(()=>parseReviewCacheRecord(getter,unit,identity));
  assert.equal(getterReads,0,'version selection must not execute the untrusted getter before strict JSON validation');
  let proxyReads=0;
  const proxy=new Proxy(record,{
    get(target,key,receiver){proxyReads++;return Reflect.get(target,key,receiver);},
    getOwnPropertyDescriptor(target,key){proxyReads++;return Reflect.getOwnPropertyDescriptor(target,key);},
    ownKeys(target){proxyReads++;return Reflect.ownKeys(target);},
    getPrototypeOf(target){proxyReads++;return Reflect.getPrototypeOf(target);},
  });
  assert.throws(()=>parseReviewCacheRecord(proxy,unit,identity));
  assert.equal(proxyReads,0,'version selection must not execute an exotic proxy before strict JSON validation');
});

test('independent context selector rejects absent/present Proxy and getter contexts before legacy inference',()=>{
  assert.equal(reviewCacheProfileFromContext({input:{valid:true}}),undefined);
  assert.equal(reviewCacheProfileFromContext({reviewCacheProfile:profile,input:{valid:true}}),profile);
  for(const current of [false,true]){
    let traps=0;
    const target={input:{valid:true},...(current?{reviewCacheProfile:profile}:{})};
    const proxy=new Proxy(target,{
      get(target,key,receiver){traps++;return Reflect.get(target,key,receiver);},
      getOwnPropertyDescriptor(target,key){traps++;return Reflect.getOwnPropertyDescriptor(target,key);},
      ownKeys(target){traps++;return Reflect.ownKeys(target);},
      getPrototypeOf(target){traps++;return Reflect.getPrototypeOf(target);},
    });
    assert.throws(()=>reviewCacheProfileFromContext(proxy),'a Proxy is invalid even when the profile is absent');
    assert.equal(traps,0,'no reflective trap may run before rejecting the context');
    let reads=0;
    const getter={...(current?{reviewCacheProfile:profile}:{})};
    Object.defineProperty(getter,'input',{enumerable:true,get(){reads++;return {valid:true};}});
    assert.throws(()=>reviewCacheProfileFromContext(getter),'legacy absence does not admit getter-valued context');
    assert.equal(reads,0);
  }
  for(const invalid of [undefined,null,{...profile,encoding:'future'},{...profile,extra:true}]){
    assert.throws(()=>reviewCacheProfileFromContext({reviewCacheProfile:invalid}));
  }
});

test('independent writer rejects getter/proxy record before version inspection or provider admission',async()=>{
  const record=buildReviewCacheRecord(unit,identity,{valid:true},profile);
  let providerCalls=0;
  const cache=new RepositoryAuditArtifactCache({
    contract:{reviewCacheProfile:profile,lease:{attempt:{runId:'run:writer',stageId:'review',attemptId:'attempt:writer',attemptNumber:1}},artifacts:[]},
    invoke(){providerCalls++;throw Error('Unexpected provider admission for invalid preflight input');},
  });
  let getterReads=0;
  const getter={...record};
  Object.defineProperty(getter,'schemaVersion',{enumerable:true,get(){getterReads++;return 'review-content-cache.v2';}});
  await assert.rejects(cache.write(getter));
  assert.equal(getterReads,0);
  let proxyReads=0;
  const proxy=new Proxy(record,{
    get(target,key,receiver){proxyReads++;return Reflect.get(target,key,receiver);},
    getOwnPropertyDescriptor(target,key){proxyReads++;return Reflect.getOwnPropertyDescriptor(target,key);},
    ownKeys(target){proxyReads++;return Reflect.ownKeys(target);},
    getPrototypeOf(target){proxyReads++;return Reflect.getPrototypeOf(target);},
  });
  await assert.rejects(cache.write(proxy));
  assert.equal(proxyReads,0);assert.equal(providerCalls,0);
});
