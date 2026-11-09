import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runtimeDispatchProfileFields,CURRENT_RUNTIME_DISPATCH_PROFILE as profile,portableJson,canonicalJson} from '@kubeclaw/plugin-sdk';

test('independent pre-fix original registered transport/context HTTP oracle now rejects before trap or admission',()=>{
  // Retain authenticated historical bytes, but do not make real adapter startup
  // (including artifact-store filesystem readiness) a 100ms timing assertion.
  // AdapterRuntime also uses shutdownTimeoutMs for activate/ready deadlines.
  const source=fs.readFileSync(new URL('../../fixtures/runtime-regressions/run9-sdk-transport-proxy-audit.mjs',import.meta.url),'utf8');
  assert.equal(source.split('shutdownTimeoutMs:100').length-1,2);
  const input=source.replaceAll('shutdownTimeoutMs:100','shutdownTimeoutMs:5000');
  const raw=execFileSync(process.execPath,['--input-type=module','-',path.resolve('.')],{input,encoding:'utf8',timeout:30000});
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
