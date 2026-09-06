// Real original FileMutex, real child processes, real exclusive sentinel file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FileMutex } from '../../../skills/nova/core/state/file-mutex.ts';
if (process.argv[2] === 'child') {
  const root = process.argv[3];
  process.send('ready');
  process.once('message', () => {
    const mutex = new FileMutex(path.join(root,'mutex'), 5000, 'TIMEOUT');
    let overlaps = 0;
    for (let i=0;i<100;i++) mutex.withLock(() => {
      let handle;
      try {handle=fs.openSync(path.join(root,'critical'), 'wx');}
      catch(e) {if(e.code!=='EEXIST') throw e; overlaps++; return;}
      try {Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1);}
      finally {fs.closeSync(handle);fs.unlinkSync(path.join(root,'critical'));}
    });
    process.send({overlaps});process.disconnect();
  });
} else {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pcr-mutex-'));
  try {
    fs.writeFileSync(path.join(root,'mutex'), JSON.stringify({pid:2147483647,token:'dead-owner'}));
    const children=Array.from({length:12},()=>fork(fileURLToPath(import.meta.url),['child',root],{stdio:['ignore','ignore','pipe','ipc']}));
    const done=children.map(child=>new Promise((resolve,reject)=>{let count;child.on('message',m=>{if(typeof m==='object')count=m.overlaps;});child.on('error',reject);child.on('exit',code=>code===0?resolve(count):reject(new Error('child exit '+code)));}));
    await Promise.all(children.map(child=>new Promise(resolve=>child.once('message',resolve))));
    for(const c of children)c.send('start');
    const counts=await Promise.all(done);const overlaps=counts.reduce((a,b)=>a+b,0);
    console.log(JSON.stringify({finding:'PCR-STATE-002',processes:12,attempts:1200,overlaps,reproduced:overlaps>0}));
    // Observation, not a passing regression: repaired behavior must yield zero overlaps.
    assert.ok(counts.every(Number.isInteger));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
