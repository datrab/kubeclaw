import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EffectCoordinator} from '../../../skills/nova/core/effects/coordinator.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';
import {stableEffectId,validEffectIdentity} from '../../../skills/nova/core/effects/identity.ts';
import {activate as artifacts} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {activate as dispatch} from '../../../skills/common/plugins/runtime-dispatch/src/adapter.ts';
import {activate as network} from '../../../skills/common/plugins/network-http/src/adapter.ts';
import type {AdapterActivationContext,AdapterInvocation,EffectRequest,EffectReceipt} from '@kubeclaw/plugin-sdk';

const filename=fileURLToPath(import.meta.url);
const fixtureRoot=fileURLToPath(new URL('./fixtures/legacy-effects/',import.meta.url));
async function worker(mode:string,kind:string,root:string) {
  const captured=fs.readFileSync(path.join(fixtureRoot,`${kind}.jsonl`),'utf8');
  const originalRecords=captured.trimEnd().split('\n');
  const legacy=JSON.parse(originalRecords[0]!).entry.request as EffectRequest;
  const originalReceipt=JSON.parse(originalRecords[2]!).entry.receipt as EffectReceipt;
  const signal=new AbortController().signal;let calls=0;
  const server=http.createServer(async(request,response)=>{calls++;for await(const _chunk of request){}response.setHeader('content-type','application/json');response.end('{"observed":"original-local-dispatch"}');});
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  const artifactRoot=path.join(root,'artifacts'),lockRoot=path.join(root,'locks'),journalFile=path.join(root,'effects.jsonl');
  const artifact=artifacts({config:{artifactRoot}} as AdapterActivationContext);
  const httpAdapter=network({config:{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key']}} as AdapterActivationContext);
  const runtime=dispatch({config:{targets:{forge:{endpoint:origin+'/dispatch',authentication:'spiffe-proxy'}}},
    invokeConfidential:async(capability:string,request:Record<string,unknown>)=>httpAdapter.invoke({confidential:true,signal,
      request:{...request,capability,attempt:legacy.attempt,idempotencyKey:'inner:http'}} as AdapterInvocation)} as unknown as AdapterActivationContext);
  const adapter=kind==='dispatch'?runtime:artifact;
  const coordinator=()=>new EffectCoordinator(new FileEffectJournal(journalFile),undefined,undefined,new FileResourceLockManager(lockRoot));
  const invoke=()=>coordinator().invoke(adapter,originalReceipt.adapter,legacy,signal);
  const locks=()=>fs.existsSync(path.join(lockRoot,'locks.jsonl'))?fs.readFileSync(path.join(lockRoot,'locks.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).entry):[];
  try {
    if(mode==='new-write') {
      const receipt=await invoke();assert.equal(receipt.status,'completed');assert.match(receipt.effectId,/^effect:json-utf16-v1:[a-f0-9]{64}$/);
      assert(validEffectIdentity((await new FileEffectJournal(journalFile).request(legacy.idempotencyKey))!));
      assert.equal(calls,kind==='dispatch'?1:0);return {id:receipt.effectId,locale:Intl.DateTimeFormat().resolvedOptions().locale};
    }
    if(mode==='new-replay') {
      const before=fs.readFileSync(journalFile,'utf8');const journal=new FileEffectJournal(journalFile),prior=await journal.request(legacy.idempotencyKey);assert(prior);
      const receipt=await coordinator().invoke(adapter,originalReceipt.adapter,prior,signal);
      assert.deepEqual(receipt,await journal.receipt(legacy.idempotencyKey));assert.equal(fs.readFileSync(journalFile,'utf8'),before);assert.equal(calls,0);
      return {id:receipt.effectId,locale:Intl.DateTimeFormat().resolvedOptions().locale};
    }
    if(mode==='unknown'||mode==='changed-prior') {
      const invalid={...legacy,...(mode==='unknown'?{effectId:`effect:json-utf16-v2:${'a'.repeat(64)}`}:{operation:'foreign-operation'})};
      const journal=new FileEffectJournal(journalFile);await journal.requested(invalid);
      const before=fs.readFileSync(journalFile,'utf8');assert.equal(validEffectIdentity(invalid),false);
      await assert.rejects(invoke(),/EFFECT_IDEMPOTENCY_CONFLICT/);assert.equal(fs.readFileSync(journalFile,'utf8'),before);assert.equal(calls,0);assert.deepEqual(locks(),[]);return;
    }
    if(mode==='admission-race') {
      assert.equal(kind,'dispatch');const pending=invoke();
      await new FileEffectJournal(journalFile).requested(legacy);
      await assert.rejects(pending,/EFFECT_IDENTITY_CHANGED_DURING_ADMISSION/);
      assert.equal(calls,0);const firstLocks=locks();assert.equal(firstLocks[0].resource.canonicalId,stableEffectId(legacy));assert.equal(firstLocks.at(-1).status,'released');
      const receipt=await invoke();assert.equal(receipt.effectId,legacy.effectId);assert.equal(calls,1);
      assert.equal(locks().filter(entry=>entry.status==='active').at(-1).resource.canonicalId,legacy.effectId);return;
    }
    const count=mode==='completed'||mode==='unverifiable'?3:mode==='accepted'?2:1;
    const prefix=originalRecords.slice(0,count).join('\n')+'\n';fs.writeFileSync(journalFile,prefix);
    if(mode==='unverifiable') {
      assert.equal(validEffectIdentity(legacy),false,'an original locale-dependent identity is not guessed or recollated');
      await assert.rejects(invoke(),/EFFECT_IDEMPOTENCY_CONFLICT/);assert.equal(fs.readFileSync(journalFile,'utf8'),prefix);assert.deepEqual(locks(),[]);
    }else if(mode==='completed') {
      assert.deepEqual(await invoke(),originalReceipt);assert.equal(fs.readFileSync(journalFile,'utf8'),prefix);assert.deepEqual(locks(),[]);
    }else if(mode==='accepted') {
      await assert.rejects(invoke(),/EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);assert.equal(fs.readFileSync(journalFile,'utf8'),prefix);
    }else {
      const receipt=await invoke();assert.equal(receipt.status,'completed');assert.equal(receipt.effectId,legacy.effectId);
      assert(fs.readFileSync(journalFile,'utf8').startsWith(prefix),'original requested bytes are retained');
      assert.equal(calls,kind==='dispatch'?1:0);
      await assert.rejects(coordinator().invoke(adapter,originalReceipt.adapter,{...legacy,payload:{changed:true}},signal),/EFFECT_IDEMPOTENCY_CONFLICT/);
    }
    if(mode==='accepted'||mode==='requested') {
      assert.equal(locks()[0].resource.canonicalId,kind==='dispatch'?legacy.effectId:legacy.resource.canonicalId);
      assert.equal(locks().at(-1).status,'released');
    }
    if(mode!=='requested')assert.equal(calls,0);
    return {locale:Intl.DateTimeFormat().resolvedOptions().locale};
  }finally{await artifact.shutdown(signal);await runtime.shutdown(signal);await httpAdapter.shutdown(signal);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
if(process.argv[2]==='--worker') {
  process.stdout.write(JSON.stringify(await worker(process.argv[3]!,process.argv[4]!,process.argv[5]!)??{ok:true}));
}else {
  test('original recorded legacy journal prefixes recover without identity migration across native locales',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'effect-identity-legacy-'));
    try {
      for(const locale of ['en_US.UTF-8','sv_SE.UTF-8','tr_TR.UTF-8'])for(const kind of ['artifact','dispatch'])for(const mode of ['completed','accepted','requested','unknown','changed-prior']) {
        const directory=path.join(root,`${locale}-${kind}-${mode}`);fs.mkdirSync(directory);
        execFileSync(process.execPath,[filename,'--worker',mode,kind,directory],{env:{...process.env,LANG:locale,LC_ALL:locale}});
      }
      for(const [mode,kind] of [['unverifiable','locale-dependent'],['admission-race','dispatch']]) {
        const directory=path.join(root,mode!);fs.mkdirSync(directory);
        execFileSync(process.execPath,[filename,'--worker',mode!,kind!,directory],{env:{...process.env,LANG:'sv_SE.UTF-8',LC_ALL:'sv_SE.UTF-8'}});
      }
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  test('new original durable producers and completed replay use the same explicit portable identity in both locale directions',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'effect-identity-portable-'));
    try {
      for(const kind of ['artifact','dispatch']) {
        let identity:string|undefined;
        for(const [writer,reader] of [['en_US.UTF-8','sv_SE.UTF-8'],['sv_SE.UTF-8','en_US.UTF-8']]) {
          const directory=path.join(root,kind+writer);fs.mkdirSync(directory);
          const run=(mode:string,locale:string)=>JSON.parse(execFileSync(process.execPath,[filename,'--worker',mode,kind,directory],{encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale}}));
          const first=run('new-write',writer!),replay=run('new-replay',reader!);assert.notEqual(first.locale,replay.locale);
          identity??=first.id;assert.equal(first.id,identity);assert.equal(replay.id,identity);
        }
      }
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
}
