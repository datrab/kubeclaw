import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

test('original bridge process refuses volatile payload admission when durable Control is unavailable',async()=>{
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,['skills/prism/server/agent-bridge.mjs'],{env:{...process.env,PORT:String(port),PRISM_CONTROL_URL:'http://127.0.0.1:1'},stdio:'pipe'});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/ready`)).ok;}catch{}if(ready)break;await delay(20);}assert.ok(ready,errors);
  const request=await fetch(`http://127.0.0.1:${port}/v1/design-set`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'project',preferences:{generationId:'forged',snapshotDigest:'sha256:forged',snapshot:{},request:{}}})});
  assert.equal(request.status,422);assert.match(await request.text(),/durable Control jobId is required/);
  const persisted=await fetch(`http://127.0.0.1:${port}/v1/revise`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:'01234567-1234-1234-1234-123456789abc'})});
  assert.equal(persisted.status,422,'there is no accepted ACK when persistence cannot be verified');
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}
});
