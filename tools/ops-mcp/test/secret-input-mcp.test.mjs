import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {parsePolicy} from '../src/access-policy.mjs';

test('real agent MCP advertises only granted secret tools; status is owner-scoped and never takes a plaintext value',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'secret-mcp-'));let child,log='';
 try{
  const token='synthetic-owner-credential-'.repeat(3);writeFileSync(join(dir,'token'),token);
  // TLS material is not used by this request/status-only test. Delivery has a
  // separate real mTLS test; a stored acknowledgement is never fabricated here.
  for(const file of ['ca','cert','key'])writeFileSync(join(dir,file),'unused synthetic TLS material');
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:3072});
  const config={storeFile:join(dir,'requests.sqlite'),publicOrigin:'https://secrets.example.ts.net',tls:{caFile:join(dir,'ca'),certFile:join(dir,'cert'),keyFile:join(dir,'key')},targets:[{id:'hetzner-storage',tenant:'family',namespace:'familyclaw',clients:['nova'],names:['HETZNER_STORAGE_TOKEN'],publicKey:publicKey.export({type:'spki',format:'pem'}),endpoint:'https://receiver.familyclaw.svc:8443/v1/secret-input'}]};writeFileSync(join(dir,'config'),JSON.stringify(config));
  const tools=['secure_secret_targets','secure_secret_request','secure_secret_status','secure_secret_cancel'];
  const clients=[{id:'nova',tokenFile:join(dir,'token'),namespaces:['familyclaw'],tools,exec:[]}];
  writeFileSync(join(dir,'policy'),JSON.stringify({clients}));
  assert.throws(()=>parsePolicy(JSON.stringify({clients:[{...clients[0],readOnly:true}]}),['familyclaw']),/Read-only/);
  child=spawn(process.execPath,[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],{env:{...process.env,OPS_SECRET_INPUT_CONFIG:join(dir,'config'),OPS_MCP_POLICY_FILE:join(dir,'policy'),OPS_MCP_BEARER_TOKEN:'',OPS_MCP_BEARER_TOKEN_FILE:'',OPS_LOCAL_ONLY:'1',OPS_ALLOWED_NAMESPACES:'kubeclaw,familyclaw',PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',b=>{log+=b;});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MCP startup failed')),10000);child.once('exit',()=>{clearTimeout(timer);reject(Error('MCP exited'));});child.stderr.on('data',b=>{const m=String(b).match(/127\.0\.0\.1:(\d+)\/mcp/);if(m){clearTimeout(timer);resolve(m[1]);}});});
  const call=async(method,params={})=>{const r=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});assert.equal(r.status,200);const text=await r.text();return r.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5))).find(message=>message.id===1):JSON.parse(text);};
  const list=await call('tools/list');assert.deepEqual(list.result.tools.map(t=>t.name).sort(),tools.sort());
  const requestTool=list.result.tools.find(t=>t.name==='secure_secret_request');assert(!JSON.stringify(requestTool.inputSchema).includes('password'));assert(!JSON.stringify(requestTool.inputSchema).includes('value'));
  const requested=await call('tools/call',{name:'secure_secret_request',arguments:{target:'hetzner-storage',name:'HETZNER_STORAGE_TOKEN'}});assert(!requested.result.isError);const request=JSON.parse(requested.result.content[0].text);assert(request.url.includes('#'));assert.equal(request.state,'pending');
  const status=await call('tools/call',{name:'secure_secret_status',arguments:{requestId:request.requestId}});assert(!JSON.stringify(status).includes(new URL(request.url).hash));
  const wrong=await call('tools/call',{name:'secure_secret_request',arguments:{target:'other',name:'HETZNER_STORAGE_TOKEN'}});assert.equal(wrong.result.isError,true);
  assert(!log.includes(token));assert(!log.includes(new URL(request.url).hash));
 }finally{if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}rmSync(dir,{recursive:true,force:true});}
});
