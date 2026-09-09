import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {post} from '../src/controller-client.ts';

test('original TLS client bounds body lifetime, file admission and response bytes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demo-ready-client-'));let server:https.Server|undefined;let calls=0;
 try {
  const key=path.join(root,'key.pem'),ca=path.join(root,'ca.pem'),token=path.join(root,'token');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',ca,'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-days','1'],{stdio:'ignore'});
  fs.writeFileSync(token,'local-protocol-test-token');
  server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(ca)},(request,response)=>{
   calls++;assert.equal(request.headers.authorization,'Bearer local-protocol-test-token');
   if(request.url==='/slow'){response.writeHead(200);response.write('{');return;}
   if(request.url==='/large'){response.end(JSON.stringify({value:'x'.repeat(17000)}));return;}
   response.end('{"localProtocol":"received"}');
  });server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
  const config={endpoint:`https://127.0.0.1:${address.port}/ok`,tokenPath:token,caPath:ca};
  assert.deepEqual(await post(config,'{}',false,AbortSignal.timeout(2000)),{localProtocol:'received'});
  const started=performance.now();await assert.rejects(post({...config,endpoint:config.endpoint.replace('/ok','/slow')},'{}',false,AbortSignal.timeout(100)),/UNRESOLVED|CANCELLED/);
  assert(performance.now()-started<1500,'deadline covers incomplete response body');
  await assert.rejects(post({...config,endpoint:config.endpoint.replace('/ok','/large')},'{}',false,AbortSignal.timeout(2000)),/UNRESOLVED/);
  const before=calls;
  await assert.rejects(post(config,'x'.repeat(16385),false,AbortSignal.timeout(2000)),/REQUEST_TOO_LARGE/);
  fs.writeFileSync(token,'x'.repeat(16385));await assert.rejects(post(config,'{}',false,AbortSignal.timeout(2000)),/CREDENTIAL_FILE_INVALID/);
  fs.unlinkSync(token);execFileSync('mkfifo',[token]);
  const fifoStart=performance.now();await assert.rejects(post(config,'{}',false,AbortSignal.timeout(100)),/CREDENTIAL_FILE_INVALID/);assert(performance.now()-fifoStart<1500);
  assert.equal(calls,before,'invalid local input never starts HTTP');
 }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}fs.rmSync(root,{recursive:true,force:true});}
});
