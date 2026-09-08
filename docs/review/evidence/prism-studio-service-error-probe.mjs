import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
const holder=createServer(); holder.listen(0,'127.0.0.1');await once(holder,'listening');const port=holder.address().port;await new Promise(r=>holder.close(r));
const upstreamHolder=createServer();upstreamHolder.listen(0,'127.0.0.1');await once(upstreamHolder,'listening');const upstreamPort=upstreamHolder.address().port;await new Promise(r=>upstreamHolder.close(r));
const child=spawn(process.execPath,['skills/prism/server/studio.ts'],{env:{...process.env,PORT:String(port),PRISM_CONTROL_URL:`http://127.0.0.1:${upstreamPort}`,PRISM_INGRESS_SECRET:'local-review-fixture-secret'},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>stderr+=b.toString());
const exited=once(child,'exit');
try {
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/health`)).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 if(!ready)throw Error('original studio service did not become healthy');
 console.log('Original studio health succeeded. Calling /v1/projects against intentionally unreachable Control.');
 try {const result=await fetch(`http://127.0.0.1:${port}/v1/projects`); console.log('HTTP response',result.status);}catch(e){console.log('Client failure:',e.message);}
 const outcome=await Promise.race([exited,new Promise(r=>setTimeout(()=>r('still-running-after-2s'),2000))]);
 console.log('Original process outcome:',outcome);console.log(stderr);
} finally {if(child.exitCode===null)child.kill('SIGTERM');}
