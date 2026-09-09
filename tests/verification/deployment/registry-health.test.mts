import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NetworkHttpCapabilityInvoker} from '../../../skills/buster/engine/test-gates/network-http-runtime.ts';
import {provider as httpProvider} from '../../../skills/buster/plugins/http/src/provider.js';
import {provider as apiProvider} from '../../../skills/buster/plugins/api-flow/src/provider.js';
import {buildProgress,writeRealE2ESwarmFiles} from '../e2e/real-run-workspace.mjs';

const password='registry-health-private-canary';
const credentials={username:'health-reader',password};
const contract={schemaVersion:'registry-clients.v1',registry:{endpoint:'https://registry.example.test:5443',transport:'https',auth:{usernameEnvironmentVariable:'KUBECLAW_REGISTRY_USERNAME',passwordEnvironmentVariable:'KUBECLAW_REGISTRY_PASSWORD'}}};
function capability(origin:string,override:Record<string,unknown>={}) {
 return new NetworkHttpCapabilityInvoker({allowedOrigins:[origin],allowedHostSuffixes:[],allowedPorts:[443],allowedMethods:['GET','HEAD','POST'],allowedRequestHeaders:['accept','authorization','content-type'],maximumResponseBytes:1024*1024,maximumExecutionMs:5000,registryHealth:{origin,...credentials},...override});
}
function request(origin:string,payload:Record<string,unknown>={},suffix='/v2/'){
 return {operation:'request',resource:{type:'network.url',canonicalId:origin+suffix},payload};
}
async function consumer(mode:string,origin:string,root:string){
 const runtime=capability(origin,mode==='wrong-password'?{registryHealth:{origin,...credentials,password:'incorrect'}}:{});
 const signal=new AbortController().signal;const logs:string[]=[];
 const context={workspaceRoot:root,signal,log(_stream:string,value:string){logs.push(value);},invoke:(name:string,req:unknown)=>runtime.invoke(name,req,signal)};
 const invocation={inputs:[],configuration:{values:{url:origin,path:'/v2/',expectedStatuses:[200]}},timeoutMs:5000,testIdentity:'registry-health',workspace:{repository:'repository',scratch:'scratch',evidence:'evidence'}};
 if(mode==='redirect'||mode==='echo'||mode==='echo-header'){
  await assert.rejects(runtime.invoke('network.http',request(origin),signal),mode==='redirect'?/HTTP_RESPONSE_REDIRECT_DENIED/u:/HTTP_REGISTRY_HEALTH_RESPONSE_SECRET_DENIED/u);return;
 }
 const result=await httpProvider().execute(invocation,context);
 if(mode==='untrusted'||mode==='wrong-password'){assert.equal(result.outcome,'failed');return;}
 assert.equal(result.outcome,'passed');assert.equal(result.providerDetails.values.status,200);
 const head=await runtime.invoke('network.http',request(origin,{method:'HEAD'}),signal);assert.equal(head.status,200);
 for(const [suffix,payload] of [['/v2/?',{}],['/v2/?x=1',{}],['/v2/_catalog',{}],['/v2/',{method:'POST'}],['/v2/',{body:''}],['/v2/',{headers:{Authorization:'caller'}}],['/v2/',{responseHeaders:['authorization']}]] as const){
  await assert.rejects(runtime.invoke('network.http',request(origin,payload,suffix),signal),/HTTP_REGISTRY_HEALTH_SCOPE_DENIED/u);
 }
 await assert.rejects(runtime.invoke('network.http',{...request(origin),operation:'websocket'},signal),/HTTP_REGISTRY_HEALTH_SCOPE_DENIED/u);
 await assert.rejects(runtime.invoke('network.http',request('https://wrong.example.test'),signal),/HTTP_REQUEST_ORIGIN_DENIED/u);
 fs.writeFileSync(path.join(root,'repository/flow.json'),JSON.stringify({schemaVersion:'kubeclaw.api-flow.v1',steps:[{id:'intentional-failure',path:'/v2/',expect:{status:599}}]}));
 const failed=await apiProvider().execute({...invocation,configuration:{values:{url:origin,flowFile:'flow.json'}}},context);
 assert.equal(failed.outcome,'failed');assert.equal(failed.counts.failed,1);assert.equal(failed.providerDetails.values.steps[0].status,200);
 const serialized=JSON.stringify({result,failed,logs})+fs.readFileSync(path.join(root,'evidence/api-flow-result.json'),'utf8');
 assert.ok(!serialized.includes(password));assert.ok(!serialized.includes(Buffer.from(`${credentials.username}:${password}`).toString('base64')));
}
if(process.env.REGISTRY_HEALTH_TEST_CHILD){
 await consumer(process.env.REGISTRY_HEALTH_TEST_CHILD,process.env.REGISTRY_HEALTH_TEST_ORIGIN!,process.env.REGISTRY_HEALTH_TEST_ROOT!);
}else{
 test('original HTTP and API-flow providers use genuine registry TLS/auth and preserve success/failure assertions',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-health-'));let server:https.Server|undefined;
  try{
   for(const name of ['repository','scratch','evidence'])fs.mkdirSync(path.join(root,name));
   const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem');
   const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
   let mode='good';const seen:Array<{url:string;authorized:boolean}>=[];
   server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
    const authorized=req.headers.authorization==='Basic '+Buffer.from(`${credentials.username}:${password}`).toString('base64');
    seen.push({url:req.url!,authorized});res.setHeader('content-type','application/json');
    if(!authorized){res.writeHead(401);res.end('{}');return;}
    if(mode==='redirect'){res.writeHead(302,{location:'https://wrong.example.test/stolen'});res.end('{}');return;}
    if(mode==='echo-header')res.setHeader('content-type',req.headers.authorization!);
    res.end(mode==='echo'?JSON.stringify({echo:req.headers.authorization}):'{}');
   });
   await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
   const origin=`https://127.0.0.1:${(server.address() as {port:number}).port}`;
   for(mode of ['untrusted','wrong-password','good','redirect','echo','echo-header']){
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,NODE_EXTRA_CA_CERTS:mode==='untrusted'?'':cert,REGISTRY_HEALTH_TEST_CHILD:mode,REGISTRY_HEALTH_TEST_ORIGIN:origin,REGISTRY_HEALTH_TEST_ROOT:root},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
    const status=await new Promise(resolve=>child.on('close',resolve));assert.equal(status,0,`${mode}: ${output}`);
   }
   assert.equal(seen.filter(item=>!item.authorized).length,1);
   assert.ok(seen.every(item=>item.url==='/v2/'));
   assert.equal(seen.length,7,'denied scope/method/path/header/redirect requests do not reach additional targets');
  }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}fs.rmSync(root,{recursive:true,force:true});}
 });
 test('foreign allowed origin receives no registry credential; explicit HTTP lab is anonymous',async()=>{
  const requests:Array<string|undefined>=[];const server=http.createServer((req,res)=>{requests.push(req.headers.authorization);res.end('{}');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
   const options={allowedOrigins:[origin],allowedPorts:[(server.address() as {port:number}).port]};
   await capability('https://registry.example.test',options).invoke('network.http',request(origin),new AbortController().signal);
   await capability(origin,{...options,registryHealth:{origin}}).invoke('network.http',request(origin),new AbortController().signal);
   assert.deepEqual(requests,[undefined,undefined]);
   assert.throws(()=>capability(origin),/HTTP_REGISTRY_HEALTH_AUTH_INVALID/u);
   assert.throws(()=>capability('https://registry.example.test',{registryHealth:{origin:'https://registry.example.test'}}),/HTTP_REGISTRY_HEALTH_AUTH_INVALID/u);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 test('actual E2E generator consumes only the operator contract origin and fails when it is absent',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-health-workspace-'));
  const previous={contract:process.env.KUBECLAW_REGISTRY_CONFIG,image:process.env.REAL_E2E_DEPLOYMENT_IMAGE};
  try{
   process.env.REAL_E2E_DEPLOYMENT_IMAGE='registry.example.svc.cluster.local:5443/nginx@sha256:'+'a'.repeat(64);
   fs.cpSync(new URL('../e2e/fixtures/nginx-project',import.meta.url),root,{recursive:true});
   execFileSync('git',['init','-q',root]);
   execFileSync('git',['-C',root,'add','.']);
   execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','original fixture']);
   const progress=buildProgress({projectName:'registry-health-test'});
   progress.real_e2e.coverage_base_revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
   progress.modules['01-nginx'].test_config={api:{spec_file:'.swarm/intentional-api-failure.json'}};
   delete process.env.KUBECLAW_REGISTRY_CONFIG;
   assert.throws(()=>writeRealE2ESwarmFiles(root,progress),/REAL_E2E_REGISTRY_CONFIG_REQUIRED/u);
   process.env.KUBECLAW_REGISTRY_CONFIG=JSON.stringify(contract);
   writeRealE2ESwarmFiles(root,progress);
   const pipeline=JSON.parse(fs.readFileSync(path.join(root,'pipeline.json'),'utf8'));
   assert.equal(pipeline.modules['01-nginx'].tests.health.config.url,contract.registry.endpoint);
   assert.deepEqual(pipeline.modules['01-nginx'].tests.health.config.expectedStatuses,[200]);
   assert.equal(pipeline.modules['01-nginx'].tests['intentional-api-failure'].config.url,contract.registry.endpoint);
   assert.equal(JSON.parse(fs.readFileSync(path.join(root,'intentional-api-failure.json'),'utf8')).steps[0].expect.status,599);
   const files=fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(item=>item.isFile()).map(item=>fs.readFileSync(path.join(item.parentPath,item.name),'utf8')).join('\n');
   for(const forbidden of [password,'KUBECLAW_REGISTRY_PASSWORD','KUBECLAW_REGISTRY_USERNAME','usernameEnvironmentVariable','registry-local.kubeclaw.svc.cluster.local:5001'])assert.ok(!files.includes(forbidden));
  }finally{
   if(previous.contract===undefined)delete process.env.KUBECLAW_REGISTRY_CONFIG;else process.env.KUBECLAW_REGISTRY_CONFIG=previous.contract;
   if(previous.image===undefined)delete process.env.REAL_E2E_DEPLOYMENT_IMAGE;else process.env.REAL_E2E_DEPLOYMENT_IMAGE=previous.image;
   fs.rmSync(root,{recursive:true,force:true});
  }
 });
}
