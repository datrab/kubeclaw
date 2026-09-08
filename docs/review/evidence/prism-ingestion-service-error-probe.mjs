import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=await mkdtemp(join(tmpdir(),'prism-quarantine-review-'));
const holder=createServer();holder.listen(0,'127.0.0.1');await once(holder,'listening');const port=holder.address().port;await new Promise(r=>holder.close(r));
const child=spawn(process.execPath,['skills/prism/server/ingestion.ts'],{env:{...process.env,PORT:String(port),PRISM_QUARANTINE_ROOT:root,PRISM_INGESTION_SECRET:'local-review-fixture-secret'},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>stderr+=b.toString());const exited=once(child,'exit');
try {
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/health`)).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 if(!ready)throw Error('original ingestion service did not become healthy');
 const digest='a'.repeat(64);await mkdir(join(root,digest));
 console.log('Original ingestion health succeeded; real quarantine filesystem now contains directory at requested digest path.');
 try {const r=await fetch(`http://127.0.0.1:${port}/v1/acquisitions/${digest}`,{method:'DELETE',headers:{authorization:'Bearer local-review-fixture-secret'}});console.log('HTTP status:',r.status);}catch(e){console.log('Client failure:',e.message);}
 console.log('Original process outcome:',await Promise.race([exited,new Promise(r=>setTimeout(()=>r('still-running-after-2s'),2000))]));console.log(stderr.replaceAll(root,'<temporary-quarantine-root>'));
} finally {if(child.exitCode===null)child.kill('SIGTERM');await rm(root,{recursive:true,force:true});}
