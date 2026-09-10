// Read-only source audit: original registered adapters and original invocation context.
// Real loopback HTTP is not Gateway/model acceptance; no production source edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {pathToFileURL} from 'node:url';
const source=path.resolve(process.argv[2]);
const load=file=>import(pathToFileURL(path.join(source,file)));
const {prepareRuntime}=await load('skills/nova/core/execution/engine-runtime.ts');
const {AdapterRuntime,EffectCoordinator,FileEffectJournal,FileResourceLockManager}=await load('skills/nova/core/src/index.ts');
const {createPluginInvocationContext}=await load('skills/nova/core/execution/context.ts');
const {RevocableLease}=await load('skills/nova/core/execution/lease.ts');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'transport-proxy-audit-')),posts=[];
const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);posts.push(Buffer.concat(chunks).toString());res.writeHead(200,{'content-type':'application/json'});res.end('{"actualHttp":true}');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,roots=['common','nova'].map(role=>path.join(source,'skills',role,'plugins'));
process.env.KUBECLAW_TRANSPORT_PROXY_AUDIT='deliberate-local-test-token';
const definition={schemaVersion:'pipeline-definition.v2',id:'test:proxy',maxConcurrency:1,stages:[{id:'architecture',type:'kubeclaw.validate.architecture',dependsOn:[],config:{agent:'agent'},input:{task:'Inspect.',architecture:{}},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:5000}}]};
const platform={schemaVersion:'pipeline-platform.v2',installationRoots:roots,trustedBuiltinRoots:roots,externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},
  providers:{'runtime.dispatch':'kubeclaw.runtime-dispatch:runtime','network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets','git.repository.read':'kubeclaw.repository-adapter:repository','artifacts.read':'kubeclaw.artifact-store:artifact-store','artifacts.write':'kubeclaw.artifact-store:artifact-store'},
  grants:{'kubeclaw.architecture-validator:architecture':{'runtime.dispatch':{allowedAgents:['agent']},'git.repository.read':{allowedPrefixes:['.']},'artifacts.read':{allowedNamespaces:['kubeclaw.architecture-validator']},'artifacts.write':{allowedNamespaces:['kubeclaw.architecture-validator']}},
    'kubeclaw.runtime-dispatch:runtime':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}}},
  adapters:{'kubeclaw.runtime-dispatch:runtime':{targets:{agent:{endpoint:origin+'/dispatch',tokenSecret:'token'}}},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['authorization','content-type','idempotency-key','x-kubeclaw-signature'],timeoutMs:1000},
    'kubeclaw.secret-resolver:secrets':{environment:{token:'KUBECLAW_TRANSPORT_PROXY_AUDIT'}},'kubeclaw.repository-adapter:repository':{repositoryRoot:root},'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(root,'artifacts')}},
  activeAdapters:[],observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:100,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[]};
const prepared=await prepareRuntime(platform,definition),journal=new FileEffectJournal(path.join(root,'effects.jsonl'));
const runtime=new AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(platform.adapters)),effects:new EffectCoordinator(journal,undefined,undefined,new FileResourceLockManager(path.join(root,'locks'))),shutdownTimeoutMs:100,async emitDomainEvent(){throw Error('unexpected event');}});
await runtime.start();const results=[];
try{
 for(const mode of ['adapter','context']){
  const attempt={runId:'run:proxy-audit',stageId:'architecture',attemptId:`attempt:${mode}`,attemptNumber:1},key=`proxy:${mode}`;
  let traps=0;const request=new Proxy({operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'agent'},payload:{task:'original valid model JSON'}},
   {getOwnPropertyDescriptor(target,key){traps++;return Reflect.getOwnPropertyDescriptor(target,key);}});
  let invoke=()=>runtime.invoke('runtime.dispatch',attempt,key,request,new AbortController().signal);
  if(mode==='context'){
   const owner=prepared.granted.snapshot.stages.get('kubeclaw.validate.architecture'),now=new Date();
   const lease={schemaVersion:'invocation-lease.v2',leaseId:'lease:proxy-context',attempt,registration:owner.provenance,status:'active',grants:[...prepared.granted.grants.get('kubeclaw.architecture-validator:architecture')],limits:{wallTimeMs:5000,memoryBytes:1024*1024,cpuMillis:5000},issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+5000).toISOString()};
   const context=createPluginInvocationContext({schemaVersion:'plugin-context.v2',lease,config:{},input:{},artifacts:[]},new RevocableLease(lease),{invoke:(_lease,capability,operation,resource,payload,profile)=>runtime.invoke(capability,attempt,key,{operation,resource,payload,...(profile?{runtimeDispatchProfile:profile}:{})},new AbortController().signal)}, {async append(){throw Error('unexpected event');}});
   invoke=()=>context.invoke('runtime.dispatch',request);
  }
  const before=posts.length;let result,error;try{result=await invoke();}catch(e){error=e.message;}
  results.push({mode,traps,httpPosts:posts.length-before,error:error??null,result:result??null,requestAdmitted:Boolean(await journal.request(key))});
 }
 console.log(JSON.stringify({nativeGateway:false,originalRegisteredAdapters:true,originalContext:true,results}));
}finally{await runtime.shutdown();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});delete process.env.KUBECLAW_TRANSPORT_PROXY_AUDIT;}
