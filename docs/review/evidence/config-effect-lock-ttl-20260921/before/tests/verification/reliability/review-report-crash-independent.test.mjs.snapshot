import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fork,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {FileDurableRecordStore} from '@kubeclaw/plugin-foundation/observability/durable-records';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {EffectCoordinator} from '../../../skills/nova/core/effects/coordinator.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';
import {storeReviewReport} from '../../../skills/nova/plugins/review/src/review-report-storage.ts';
import {report} from './review-report-locale-fixture.mjs';

const self=fileURLToPath(import.meta.url);
async function child(root,mode,replay){
 const adapter=activate({config:{artifactRoot:path.join(root,'artifacts')}});
 const coordinator=new EffectCoordinator(new FileEffectJournal(path.join(root,'effects.jsonl')),undefined,undefined,new FileResourceLockManager(path.join(root,'locks')));
 const attempt={runId:'run:report-hex',stageId:'review',attemptId:'attempt-hex',attemptNumber:1};
 const owner={pluginId:'kubeclaw.artifact-store',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',contentDigest:`sha256:${'a'.repeat(64)}`};
 await adapter.ready();
 if(!replay){process.send('ready');await once(process,'message');}
 try{
  const context={contract:{lease:{attempt}},invoke:async(capability,request)=>{
   const receipt=await coordinator.invoke(adapter,owner,{...request,capability,attempt,idempotencyKey:'report:kill:1'},new AbortController().signal);
   assert.equal(receipt.status,'completed');return receipt.result;
  }};
  await storeReviewReport(report(),context,mode==='portable'?PORTABLE_JSON_ENCODING:undefined);
  process.stdout.write(JSON.stringify({unexpectedCompletion:true})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({error:error.message})+'\n');}
 finally{await adapter.shutdown();process.disconnect?.();}
}
if(process.argv[2]==='--child')await child(process.argv[3],process.argv[4],process.argv[5]==='replay');
else for(const mode of ['legacy','portable'])test(`actual ${mode} report writer SIGKILL after original accepted event preserves uncertainty`,async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-kill-'));let worker,release,fenced;
 try{
  worker=fork(self,['--child',root,mode],{stdio:['ignore','pipe','pipe','ipc']});
  const ready=await once(worker,'message');assert.equal(ready[0],'ready');
  const records=new FileDurableRecordStore(path.join(root,'artifacts'),{maximumRecords:100000,maximumBytes:268435456,maximumRecordBytes:65536});
  let entered;const held=new Promise(resolve=>{entered=resolve;});
  fenced=records.withRecords('artifacts/kubeclaw.review',async()=>{entered();await new Promise(resolve=>{release=resolve;});});
  await held;worker.send('write');
  const file=path.join(root,'effects.jsonl');let before;
  for(let i=0;i<200;i++){
   if(fs.existsSync(file)){
    const bytes=fs.readFileSync(file),entries=bytes.toString().trimEnd().split('\n').filter(Boolean).map(line=>JSON.parse(line).entry);
    if(entries.some(entry=>entry.type==='accepted')){before=bytes;break;}
   }
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert(before,'Original coordinator must persist accepted while actual metadata writer is fenced');
  assert.deepEqual(before.toString().trimEnd().split('\n').map(line=>JSON.parse(line).entry.type),['requested','accepted']);
  assert.equal(fs.existsSync(path.join(root,'artifacts','records','store.json')),false);
  const exited=once(worker,'exit');worker.kill('SIGKILL');const [code,signal]=await exited;
  assert.equal(code,null);assert.equal(signal,'SIGKILL');release();await fenced;release=undefined;
  const raw=execFileSync(process.execPath,[self,'--child',root,mode,'replay'],{encoding:'utf8',timeout:15000});
  const result=JSON.parse(raw);assert.match(result.error,/^EFFECT_RECOVERY_RECEIPT_UNAVAILABLE:/);
  assert.deepEqual(fs.readFileSync(file),before,'Restart must not rewrite original accepted history');
  assert.equal(fs.existsSync(path.join(root,'artifacts','records','store.json')),false,'No replacement artifact metadata');
  assert.equal(fs.existsSync(path.join(root,'artifacts','blobs')),false,'No replacement artifact blob');
  process.stdout.write(JSON.stringify({mode,actualSigkill:true,journalUnchanged:true,noArtifactWritten:true,uncertaintyPreserved:true})+'\n');
 }finally{if(worker?.exitCode===null&&worker?.signalCode===null)worker.kill('SIGKILL');release?.();await fenced;fs.rmSync(root,{recursive:true,force:true});}
});

