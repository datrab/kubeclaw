import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runtimeDispatchProfileFields,CURRENT_RUNTIME_DISPATCH_PROFILE as profile,portableJson,canonicalJson} from '@kubeclaw/plugin-sdk';

test('independent pre-fix original registered transport/context HTTP oracle now rejects before trap or admission',()=>{
  const raw=execFileSync(process.execPath,['docs/review/evidence/run9-sdk-transport-proxy-audit.mjs',path.resolve('.')],{encoding:'utf8'});
  const result=JSON.parse(raw);assert.equal(result.originalRegisteredAdapters,true);assert.equal(result.originalContext,true);
  assert.deepEqual(result.results.map(row=>row.mode),['adapter','context']);
  for(const row of result.results){
    assert.equal(row.traps,0);assert.equal(row.httpPosts,0);assert.equal(row.requestAdmitted,false);
    assert.equal(row.error,'CANONICAL_JSON_PROXY_UNSUPPORTED');assert.equal(row.result,null);
  }
});

test('independent selector preserves original legacy request bytes and nested owning dependency metadata',()=>{
  const original=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-effects/dispatch.jsonl',import.meta.url),'utf8').trim().split('\n')[0]).entry.request;
  for(const confidential of [false,true])for(const present of [false,true]){
    const request={...original,deliveryId:'bounded-delivery',dependencyIdentity:{prefix:'adapter:original:',suffix:':parent:bound',
      currentKey:'adapter:original:key',scope:'original-scope',parent:{request:original,confidential}},...(present?{runtimeDispatchProfile:profile}:{})};
    const before=[canonicalJson(request),portableJson(request)];
    assert.deepEqual(runtimeDispatchProfileFields(request,'runtime.dispatch'),present?{runtimeDispatchProfile:profile}:{});
    assert.deepEqual([canonicalJson(request),portableJson(request)],before);
  }
  let traps=0;
  const trap=()=>{traps++;throw Error('UNSUPPORTED_TRAP_EXECUTED');};
  const cyclic={};cyclic.self=cyclic;
  for(const value of [new Proxy({}, {get:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap}),
    {...original,payload:new Proxy({}, {get:trap,ownKeys:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap})},
    Object.defineProperty({...original},'payload',{enumerable:true,get:trap}),{...original,payload:{x:undefined}},
    {...original,payload:{x:NaN}},{...original,payload:{x:Array(2)}},{...original,payload:{x:cyclic}}]){
    assert.throws(()=>runtimeDispatchProfileFields(value),/CANONICAL_JSON_/);assert.equal(traps,0);
  }
});
