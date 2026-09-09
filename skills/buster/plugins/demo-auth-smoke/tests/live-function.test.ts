import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePipelineTestGateContract } from '@kubeclaw/pipeline-test-gate-contract';
import { canonicalJson,sha256Text } from '@kubeclaw/plugin-sdk';
import { buildRegistry,discoverPackages } from '@kubeclaw/nova-core';
import { NetworkHttpCapabilityInvoker } from '../../../engine/test-gates/network-http-runtime.ts';
import { generatedDemoCredentials } from '../../../engine/test-gates/generated-demo-credentials.ts';
import { pendingExposureHandoff } from '../../../engine/test-gates/exposure-handoff.ts';
import { provider } from '../src/provider.js';
import { protocol,sessionCookie } from '../src/protocol.js';

const repository=fileURLToPath(new URL('../../../../../',import.meta.url));
const config={protocol:'json-session.v1',loginPath:'/api/login',usernameKey:'username',passwordKey:'password',cookieName:'demo_session',protectedPath:'/api/account',usernamePointer:'/username',assertions:[{pointer:'/projects/0/name',equals:'Demo workspace'}]};

test('original controller credentials authenticate against a real local session application through original network runtime',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'demo-auth-app-'));
 const file=path.join(root,'generated.json');
 // Native Go helper performs random generation and persists status intent before its actual HTTP Secret POST.
 execFileSync(process.env.KUBECLAW_DEMO_AUTH_TEST_GO ?? 'go',['test','-count=1','-run','^TestDemoAuthenticationCredentialProducer$','./cmd/buster-namespace-controller'],{cwd:repository,env:{...process.env,KUBECLAW_DEMO_AUTH_TEST_OUTPUT:file}});
 const produced=JSON.parse(fs.readFileSync(file,'utf8'));
 const username=Buffer.from(produced.secret.data.username,'base64').toString(),password=Buffer.from(produced.secret.data.password,'base64').toString();
 const sessions=new Map<string,string>();let bypass=false,wrongBusiness=false,redirect=false,malformed=false;const requests:string[]=[];
 const app=http.createServer((request,response)=>{
  requests.push(`${request.method} ${request.url}`);
  response.setHeader('content-type','application/json');
  if(request.method==='POST'&&request.url==='/api/login'){
   const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString());
    if(body.username!==username||body.password!==password){response.writeHead(401).end('{}');return;}
    const session=crypto.randomBytes(24).toString('hex');sessions.set(session,username);
    response.setHeader('set-cookie',`demo_session=${session}; Path=/api; HttpOnly; SameSite=Strict`);response.end('{}');
   });return;
  }
  if(redirect){response.writeHead(302,{location:'http://localhost.invalid/steal'}).end();return;}
  const session=request.headers.cookie?.split('=')[1];const user=session?sessions.get(session):undefined;
  if(!user&&!bypass){response.writeHead(401).end('{}');return;}
  if(malformed){response.end(`invalid json ${session}`);return;}
  response.end(JSON.stringify({username:user??username,projects:[{name:wrongBusiness?'Different workspace':'Demo workspace'}]}));
 });
 await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));const address=app.address();assert(address&&typeof address!=='string');
 const origin=`http://127.0.0.1:${address.port}`;
 // Deployment/lease metadata below are explicit wire-contract vectors, not a deployed image/cluster capture.
 const immutableImage=`example.invalid/demo@${sha256Text('local application source identity contract vector')}`;
 const manifestDigest=sha256Text('local application manifest contract vector');const expiresAt=new Date(Date.now()+60000).toISOString();
 const expected={leaseName:'demo-auth-lease',namespace:'test-demo-auth',secretName:'demo-login',immutableImage,manifestDigest};
 const lease={metadata:{name:expected.leaseName,uid:produced.source.leaseUID,generation:7},spec:{verifiedImage:immutableImage,manifestDigest,cleanupPolicy:'retain',testCredentials:{mode:'generate',secretName:expected.secretName}},status:{exposureGeneration:7,exposurePhase:'Ready',namespaceName:expected.namespace,credentialsAvailable:true,generatedCredentials:produced.source,expiresAt}};
 const credentials=generatedDemoCredentials(lease,produced.secret,expected);
 const deployment={schemaVersion:'kubernetes-deployment-fixture.v1',...expected,expiresAt};
 const handoff={...pendingExposureHandoff(lease,{owner:sha256Text('owner contract vector'),request:sha256Text('request contract vector')}),exposureGeneration:7};
 const exposure={schemaVersion:'public-endpoint-fixture.v1',provider:'tailscale-ingress',leaseName:expected.leaseName,namespace:expected.namespace,url:`${origin}/`,expiresAt,handoff};
 const invocation:any={runId:'run:local-contract',planId:'plan:local-contract',nodeId:'auth',attemptId:'attempt:local-contract',attemptNumber:1,timeoutMs:3000,configuration:{values:config},inputs:[
  {name:'deployment',kind:'value',schemaId:'kubeclaw.kubernetes-deployment-fixture@1',value:deployment},
  {name:'credentials',kind:'value',schemaId:'kubeclaw.generated-demo-credentials@1',value:credentials},
  {name:'exposure',kind:'value',schemaId:'kubeclaw.public-endpoint-fixture@1',value:exposure}]};
 const productionConfig=fs.readFileSync(path.join(repository,'docker/buster-runtime-entrypoint.sh'),'utf8');
 const headerMatch=productionConfig.match(/allowedRequestHeaders: (\[[^\n]+\])/u);assert(headerMatch);
 const productionHeaders=JSON.parse(headerMatch[1].replaceAll("'",'"'));
 const runtime=new NetworkHttpCapabilityInvoker({allowedOrigins:[origin],allowedHostSuffixes:[],allowedPorts:[address.port],allowedMethods:['GET','POST'],allowedRequestHeaders:productionHeaders,maximumResponseBytes:65536,maximumExecutionMs:3000});
 const signal=new AbortController().signal;const logs:string[]=[];
 const context={signal,log:(_stream:string,value:string)=>logs.push(value),invoke:(capability:string,request:unknown)=>runtime.invoke(capability,request,signal,invocation.inputs)};
 try{
  const result=await provider().execute(invocation,context);const evidence=result.outputs[0].value;validatePipelineTestGateContract('providerResult',result);
  assert.equal(result.outcome,'passed');assert.deepEqual(requests,['GET /api/account','POST /api/login','GET /api/account']);
  assert.equal(evidence.credentialDigest,produced.source.credentialDigest);assert.equal(evidence.secretUID,produced.source.secretUID);
  assert.equal(evidence.exposureGeneration,7);
  const unbound=structuredClone(invocation);delete unbound.inputs[2].value.handoff.exposureGeneration;const requestCount=requests.length;
  await assert.rejects(provider().execute(unbound,context),/EXPOSURE_GENERATION_REQUIRED/);assert.equal(requests.length,requestCount);
  assert.equal(evidence.protocolDigest,sha256Text(canonicalJson(config)));assert.equal(evidence.url,exposure.url);
  for(const session of sessions.keys()) assert(!JSON.stringify({result,logs}).includes(session));
  assert(!JSON.stringify({result,logs}).includes(password));
  bypass=true;await assert.rejects(provider().execute(invocation,context),/NEGATIVE_CONTROL_FAILED/);bypass=false;
  wrongBusiness=true;await assert.rejects(provider().execute(invocation,context),/BUSINESS_ASSERTION_FAILED/);wrongBusiness=false;
  malformed=true;await assert.rejects(provider().execute(invocation,context),{message:'DEMO_AUTH_PROTECTED_JSON_INVALID'});malformed=false;
  redirect=true;await assert.rejects(provider().execute(invocation,context),/REDIRECT_DENIED/);redirect=false;
  const deniedRuntime=new NetworkHttpCapabilityInvoker({allowedOrigins:[origin],allowedHostSuffixes:[],allowedPorts:[address.port],maximumResponseBytes:65536,maximumExecutionMs:3000});
  await assert.rejects(provider().execute(invocation,{...context,invoke:(capability:string,request:unknown)=>deniedRuntime.invoke(capability,request,signal,invocation.inputs)}),/METHOD_DENIED/);
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(provider().execute(invocation,{...context,signal:cancelled.signal}),/CANCELLED/);
  const changed=structuredClone(invocation);changed.inputs[1].value.source.leaseUID='foreign';
  await assert.rejects(provider().execute(changed,context),/SOURCE_MISMATCH/);
  const roots=['common','nova','buster'].map(role=>path.join(repository,'skills',role,'plugins'));
  const registry=buildRegistry(discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:demo-auth'}}));
  assert(registry);
  if(process.env.KUBECLAW_DEMO_AUTH_TEST_RESULT)fs.writeFileSync(process.env.KUBECLAW_DEMO_AUTH_TEST_RESULT,JSON.stringify({invocation,result}),{mode:0o600});
 }finally{await new Promise<void>(resolve=>app.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});

test('missing or unsupported protocol and missing business assertion fail explicitly',()=>{
 assert.throws(()=>protocol({}),/CONTRACT_INVALID/);
 assert.throws(()=>protocol({...config,protocol:'legacy-http-200'}),/PROTOCOL_UNSUPPORTED/);
 assert.throws(()=>protocol({...config,assertions:[]}),/BUSINESS_ASSERTION_REQUIRED/);
 assert.throws(()=>protocol({...config,loginPath:'//foreign/login'}),/PATH_INVALID/);
});

test('session cookie contract rejects foreign domain, wrong path, expired and insecure sessions',()=>{
 const url=new URL('https://demo.example/');
 for(const header of ['demo_session=value; Domain=foreign.example; Path=/api; HttpOnly; Secure','demo_session=value; Path=/other; HttpOnly; Secure','demo_session=value; Path=/api; HttpOnly; Secure; Max-Age=0','demo_session=value; Path=/api; HttpOnly','demo_session=value; Path=/api; HttpOnly; Secure, other=value'])assert.throws(()=>sessionCookie(header,config,url),/COOKIE_/);
});
