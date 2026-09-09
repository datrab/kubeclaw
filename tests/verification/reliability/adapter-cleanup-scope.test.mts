import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import * as core from '../../../skills/nova/core/src/index.ts';

// A minimal real plugin consumes the new Core API. It does not replace the
// production OpenClaw adapter tested separately in runtime-session-cleanup.test.mts.
const consumer = `export function activate(context) {
  return {async ready(){}, async shutdown(){}, async invoke({request,signal,fence}){
    fence.assertCurrent();
    const call=(ctx,url,method='POST',options)=>ctx.invokeConfidential('network.http',{
      operation:'request',resource:{type:'network.url',canonicalId:url},payload:{method}},options);
    try {await call(context,context.config.origin+'/start');} catch {}
    // A supplied signal cannot replace the cancelled parent.
    try {await call(context,context.config.origin+'/illegal','POST',{signal:new AbortController().signal});throw new Error('parent signal replaced');}
    catch(error){if(error.message!=='ADAPTER_CANCELLED')throw error;}
    const mode=request.payload.mode;let captured;
    const result=await context.withCleanup(async cleanup=>{
      captured=cleanup;
      if(mode==='origin')return call(cleanup,'http://127.0.0.1:1/denied');
      if(mode==='capability')return cleanup.invokeConfidential('secrets.read',{operation:'resolve',resource:{type:'secret.name',canonicalId:'not-granted'},payload:{}});
      if(mode==='method')return call(cleanup,context.config.origin+'/cancel','GET');
      await call(cleanup,context.config.origin+'/cancel');
      if(mode==='blocking')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1100);
      return {cleaned:true};
    });
    let repeated=false,closed=false;
    try{await context.withCleanup(()=>Promise.resolve({}));}catch(error){repeated=error.message==='ADAPTER_CLEANUP_ALREADY_STARTED';}
    try{await call(captured,context.config.origin+'/illegal');}catch(error){closed=error.message==='ADAPTER_CANCELLED';}
    if(!repeated||!closed)throw new Error('cleanup scope reused');
    return result;
  }};
}`;

for(const mode of ['success','origin','capability','method','timeout','lifecycle','blocking'] as const){
  test(`real registry/Core cleanup scope preserves authorization: ${mode}`,async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-cleanup-scope-'));
    const owner=new AbortController();const hits:string[]=[];let runtime: core.AdapterRuntime | undefined;
    let shutdown:Promise<void>|undefined;
    const server=http.createServer((request,response)=>{
      hits.push(request.url!);
      if(request.url==='/start'){owner.abort(new Error('parent cancelled'));return;}
      if(mode==='timeout')return;
      if(mode==='lifecycle'){shutdown=runtime!.shutdown();return;}
      response.writeHead(200,{'content-type':'application/json'});response.end('{"ok":true}');
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');server.unref();
    try{
      const address=server.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
      const pluginRoot=path.join(root,'plugins'),plugin=path.join(pluginRoot,'cleanup-consumer');fs.mkdirSync(plugin,{recursive:true});
      fs.writeFileSync(path.join(plugin,'plugin.json'),JSON.stringify({id:'test.cleanup-consumer',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',stages:[],observers:[],adapters:[{
        id:'consumer',module:'adapter.mjs',export:'activate',providesCapabilities:['runtime.dispatch'],requiredCapabilities:['network.http'],configSchema:'config.json'}]}));
      fs.writeFileSync(path.join(plugin,'adapter.mjs'),consumer);
      fs.writeFileSync(path.join(plugin,'config.json'),JSON.stringify({type:'object',properties:{origin:{type:'string'}},required:['origin'],additionalProperties:false}));
      const roots=[...['common','nova'].map(role=>path.resolve('skills',role,'plugins')),pluginRoot];
      const snapshot=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,
        allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:cleanup-api'}}));
      const id='test.cleanup-consumer:consumer';
      const granted=core.resolveCapabilityGrants(snapshot,{enabledRegistrations:new Set(['kubeclaw.case-study:case-study']),
        providers:new Map([['runtime.dispatch',id],['network.http','kubeclaw.network-http:http'],['artifacts.write','kubeclaw.artifact-store:artifact-store']]),
        grants:new Map([['kubeclaw.case-study:case-study',new Map([['runtime.dispatch',{allowedAgents:['probe']}],['artifacts.write',{allowedNamespaces:['kubeclaw.case-study']}]])],
          [id,new Map([['network.http',{allowedOrigins:[origin]}]])]])});
      const activated=await core.activateRegistry(granted.snapshot,new Set(granted.grants.keys()));
      const configs=new Map<string,Record<string,unknown>>([[id,{origin}],['kubeclaw.network-http:http',{allowedOrigins:[origin],allowedMethods:['POST'],timeoutMs:1000}],
        ['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(root,'artifacts')}] ]);
      const observed: Array<Record<string,unknown>>=[];
      runtime=new core.AdapterRuntime({granted,activated,configs,shutdownTimeoutMs:1000,async emitDomainEvent(){},
        effects:new core.EffectCoordinator(new core.FileEffectJournal(path.join(root,'effects.jsonl')),undefined,
          {requested(request){observed.push(request as unknown as Record<string,unknown>);},accepted(){},completed(){}},
          new core.FileResourceLockManager(path.join(root,'locks')))});
      await runtime.start();
      const attempt={runId:'run:scope',stageId:'stage:scope',attemptId:'attempt:scope',attemptNumber:1};
      const start=Date.now();
      const result=runtime.invoke('runtime.dispatch',attempt,'scope:invocation',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:{mode}},owner.signal);
      if(mode==='success')assert.deepEqual(await result,{cleaned:true});
      else await assert.rejects(result,['timeout','blocking'].includes(mode)?/ADAPTER_CLEANUP_TIMEOUT/u:mode==='lifecycle'?/ADAPTER_RUNTIME_SHUTDOWN|ADAPTER_CONTEXT_REVOKED/u:mode==='method'?/NETWORK_METHOD_DENIED/u:/CAPABILITY.*DENIED/u);
      assert(Date.now()-start<2000,'cleanup remains bounded by Core');
      assert.deepEqual(hits,['start','cancel'].slice(0,['origin','capability','method'].includes(mode)?1:2).map(value=>'/'+value));
      for(const event of observed)assert.deepEqual(event.attempt,attempt,'cleanup keeps original attempt identity');
      await shutdown;
    }finally{await runtime?.shutdown();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
  });
}
