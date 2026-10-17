import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { publishedServiceConfig } from './fixtures/published-config.mjs';
test('published bridge A/B selects real listener, UTF8 body, HTTP deadlines and polling without ENV authors',async t=>{
 let original:any;
 try {
 for(const n of [1,2]){
  const claims:number[]=[];const claimDurations:number[]=[];let mode='normal';
  const upstream=createServer((request,response)=>{
   if(request.url==='/v1/agent/jobs/claim'){
    claims.push(Date.now());
    if(mode==='claim-stall'){const start=Date.now();response.on('close',()=>claimDurations.push(Date.now()-start));return;}
    response.end('{"job":null}');return;
   }
   if(mode==='dispatch-stall'||mode==='lookup-stall')return;
   if(request.url?.startsWith('/v1/agent/jobs/')){response.end('{"job":{"id":"j","state":"pending"}}');return;}
   response.end('{"persisted":true}');
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');const address=upstream.address();assert(address&&typeof address!=='string');
  t.after(async()=>{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));});
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const portAddress=reserve.address();assert(portAddress&&typeof portAddress!=='string');await new Promise<void>(resolve=>reserve.close(()=>resolve()));
  const settings={port:portAddress.port,controlUrl:`http://127.0.0.1:${address.port}`,maximumRequestBytes:64*n,dispatchTimeoutMs:30*n,controlRequestTimeoutMs:25*n,pollIntervalMs:45*n};
  const f=await publishedServiceConfig(t,'prism-agent-bridge',{agentBridge:settings});
  const engine=join(f.code,'skills/packages/prism-engine/server');
  const {loadAgentBridgeConfig}=await import(pathToFileURL(join(engine,'agent-bridge-config.ts')).href);
  const {startAgentBridge}=await import(pathToFileURL(join(engine,'agent-bridge.mjs')).href);
  const config=loadAgentBridgeConfig(f.capture,{});assert.deepEqual(config,settings);assert(Object.isFrozen(config));
  for(const key of ['PORT','PRISM_CONTROL_URL','PRISM_STUDIO_PUBLIC_URL'])assert.throws(()=>loadAgentBridgeConfig(f.capture,{[key]:'forbidden'}),/LEGACY_OVERRIDE/);
  if(n===1)original=config;else assert.equal(original.maximumRequestBytes,64);
  const bridge=await startAgentBridge(config);t.after(()=>bridge.close());const base=`http://127.0.0.1:${config.port}`;
  const post=(path:string,body:string)=>fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json'},body});
  assert.equal((await fetch(`${base}/ready`)).status,200);
  const body=JSON.stringify('ü'.repeat((settings.maximumRequestBytes-2)/2));assert.equal(Buffer.byteLength(body),settings.maximumRequestBytes);
  assert.equal((await post('/v1/dispatch',body)).status,200);
  const excess=await post('/v1/dispatch',body+' ');assert.equal(excess.status,422);assert.match(await excess.text(),/too large/);
  assert.equal((await post('/v1/dispatch',body)).status,200);
  let start=Date.now();mode='dispatch-stall';const dispatch=await post('/v1/dispatch','{}');assert.equal(dispatch.status,422);assert(Date.now()-start>=settings.dispatchTimeoutMs);assert(Date.now()-start<1000);
  start=Date.now();mode='lookup-stall';const lookup=await post('/v1/revise','{"jobId":"j"}');assert.equal(lookup.status,422);assert(Date.now()-start>=settings.controlRequestTimeoutMs);assert(Date.now()-start<1000);
  mode='normal';const until=Date.now()+1000;while(claims.length<3&&Date.now()<until)await delay(5);assert(claims.length>=3);
  assert(claims[2]!-claims[1]!>=settings.pollIntervalMs-4);
  mode='claim-stall';const end=Date.now()+1000;while(!claimDurations.length&&Date.now()<end)await delay(5);assert(claimDurations.length);assert(claimDurations[0]!>=settings.controlRequestTimeoutMs-4);assert(claimDurations[0]!<500);
  mode='normal';await bridge.close();
 }
 }catch(error){console.error(error);throw error;}
});
