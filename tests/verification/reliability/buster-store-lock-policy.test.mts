import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { FileDurableAttemptStore } from '@kubeclaw/plugin-foundation/observability/durable-attempts';
import { FileObservabilityAdmissionStore } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';

for (const kind of ['attempts','admission'] as const) test(`${kind}: actual store waits use selected A/B; legacy retains five seconds`, async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buster-real-lock-'));
 const store=(wait?:number)=>kind==='attempts'
  ?new FileDurableAttemptStore(root,runnerExecutionPolicy.stores.attempts,wait)
  :new FileObservabilityAdmissionStore(root,runnerExecutionPolicy.stores.admission,wait);
 try {
  for(const invalid of [0,6,1.5,NaN])assert.throws(()=>store(invalid),/STORE_LOCK_WAIT_INVALID/);
  // READY is emitted only after the external process owns the very same kernel lock.
  const owner=spawn('flock',['-x',path.join(root,'.write-lock'),'sh','-c','printf READY; cat'],{stdio:['pipe','pipe','pipe']});
  const exited=once(owner,'exit');await once(owner.stdout,'data');
  try {
   const a=store(5),b=store(1),legacy=store();
   let release!:()=>void;const released=new Promise<void>(resolve=>{release=resolve;});
   const pendingA=a.snapshot(),pendingLegacy=legacy.snapshot();
   const start=performance.now();await assert.rejects(b.snapshot(),/STORE_LOCK_FAILED/);
   assert.ok(performance.now()-start>=800,'B must actually wait for the contended kernel lock');
   owner.stdin.end();await exited;release();await released;
   await Promise.all([pendingA,pendingLegacy]);
  }finally{if(owner.exitCode===null){owner.stdin.end();await exited;}}
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
