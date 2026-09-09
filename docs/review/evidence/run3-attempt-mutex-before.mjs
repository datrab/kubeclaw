import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {FileMutex} from '../../../skills/nova/core/state/file-mutex.ts';
import {FileJournal} from '../../../skills/nova/core/state/journal.ts';

test('independent review: two asynchronous kernel lock users do not starve the first owner event loop',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'attempt-review-mutex-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'append-lock');
  let notify;const entered=new Promise(resolve=>{notify=resolve;});
  const first=new FileMutex(file,250,'REVIEW_ASYNC_LOCK_TIMEOUT').withAsyncLock(async()=>{
    notify();await delay(20);return 'first';
  });
  await entered;
  const second=new FileMutex(file,250,'REVIEW_ASYNC_LOCK_TIMEOUT').withAsyncLock(async()=> 'second');
  assert.deepEqual(await Promise.all([first,second]),['first','second']);
});

test('independent review: original synchronous journal append progresses while an asynchronous user releases its lock',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'attempt-review-journal-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'journal.jsonl'),journal=new FileJournal(file,250);
  journal.append({message:'original'});
  let notify;const entered=new Promise(resolve=>{notify=resolve;});
  const first=new FileMutex(`${file}.append-lock`,250,'REVIEW_ASYNC_LOCK_TIMEOUT').withAsyncLock(async()=>{
    notify();await delay(20);
  });
  await entered;
  try {assert.equal(journal.append({message:'concurrent'}).sequence,2);}
  finally {await first;}
});
