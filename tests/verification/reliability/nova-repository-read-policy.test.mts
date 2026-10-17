import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {activate} from '../../../skills/nova/plugins/repository-adapter/src/adapter.ts';
test('selected original repository byte budget reaches real file read, newer selection is isolated and duplicate authors reject',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'repo-policy-'));
 const id='kubeclaw.repository-adapter:repository';
 const raw=structuredClone(TEST_CORE_POLICY);raw.repositoryRead.maxFileBytes=3;
 const original=captureCoreRuntimePolicy(raw);raw.repositoryRead.maxFileBytes=8;
 const newer=captureCoreRuntimePolicy(raw);
 const selected=(policy:any)=>selectedAdapterConfigurations({[id]:{repositoryRoot:root}},policy)[id]!;
 const oldAdapter=activate({config:selected(original)} as any),newAdapter=activate({config:selected(newer)} as any);
 const read=(adapter:any)=>adapter.invoke({confidential:true,signal:new AbortController().signal,request:{capability:'git.repository.read',operation:'read_text',resource:{canonicalId:'file.txt'},attempt:{attemptId:'test'},payload:{}}});
 try {
  fs.writeFileSync(path.join(root,'file.txt'),'12345');
  await assert.rejects(read(oldAdapter),/REPOSITORY_FILE_TOO_LARGE/);
  assert.equal((await read(newAdapter)).content,'12345');
  await assert.rejects(read(oldAdapter),/REPOSITORY_FILE_TOO_LARGE/);
  assert.equal(selected(original).maxChangedPaths,2048);
  assert(Object.isFrozen(selected(original)));
  assert.throws(()=>selectedAdapterConfigurations({[id]:{repositoryRoot:root,maxFileBytes:3}},original),/REPOSITORY_READ_POLICY_COMPETING_AUTHOR/);
  assert.throws(()=>activate({config:{repositoryRoot:root}} as any),/maxFileBytes is invalid/);
 }finally{await oldAdapter.shutdown();await newAdapter.shutdown();fs.rmSync(root,{recursive:true,force:true});}
});
