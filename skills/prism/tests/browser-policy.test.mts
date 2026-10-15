import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { publishedControlConfig } from './fixtures/published-config.mjs';
import { studioBrowserPolicy } from '../studio/browser-policy.ts';
import { waitForRound, waitForInitialDirections } from '../studio/design-round-client.ts';
import { waitForRevision } from '../studio/agent-revision-client.ts';
import { loadPreviewAssets } from '../studio/preview-assets.ts';
import type { PrismDocument } from '@kubeclaw/prism-contracts-v1';
async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address=server.address(); assert(address && typeof address!=='string'); return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
test('published Studio A/B sends only public policy and real HTTP consumers obey selected bounds', async t => {
  let original: any;
  for (const n of [1,2]) {
    const policy={maximumPreviewAssetBytes:n+2,previewAssetTimeoutMs:20*n,
      roundPolling:{maximumAttempts:n,intervalMs:3*n},revisionPolling:{maximumAttempts:n,intervalMs:3*n},initialDirectionPolling:{maximumAttempts:n,intervalMs:3*n}};
    const f=await publishedControlConfig(t,{},undefined,{browserPolicy:policy});
    const options=f.loadStudioConfig(f.studioCapture,{PRISM_INGRESS_SECRET:'never-public'});
    const {handleStudioRequest,studioRequestFailed}=await import(pathToFileURL(join(f.root,'role/skills/packages/prism-engine/server/studio-request.ts')).href);
    const app=createServer((request,response)=>{void handleStudioRequest(request,response,options).catch((e:unknown)=>studioRequestFailed(e,response));});
    const origin=await listen(app);t.after(()=>close(app));
    const response=await fetch(`${origin}/studio-config`);assert.equal(response.headers.get('cache-control'),'no-store');
    const raw=await response.text();assert(!raw.includes('never-public'));assert(!raw.includes('controlUrl'));
    const received=studioBrowserPolicy(JSON.parse(raw));assert.deepEqual(received,policy);assert(Object.isFrozen(received.roundPolling));
    if(n===1)original=options;else assert.equal(original.browserPolicy.maximumPreviewAssetBytes,3);
    let requests=0;let assetMode='normal';
    const bytes=Buffer.from('abc');const digest=createHash('sha256').update(bytes).digest('hex');
    const upstream=createServer((request,response)=>{
      if(request.url?.startsWith('/v1/artifacts/')){
        if(assetMode==='stall'){response.writeHead(200);response.flushHeaders();return;}
        response.end(bytes);return;
      }
      requests++;response.setHeader('content-type','application/json');
      response.end(JSON.stringify(request.url?.includes('/agent-jobs/')?{status:'pending',result:null}:{items:[]}));
    });
    const control=await listen(upstream);t.after(()=>close(upstream));
    const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
    const client={origin:control,projectId:'p',documentId:'d',userId:'u',csrf:'c',storage,policy:received};
    let start=Date.now();assert.equal(await waitForRound(client,{documentId:'d',expectedRevision:1,idempotencyKey:'k',generationId:'g'}),null);
    assert.equal(requests,n);assert(Date.now()-start >= (n-1)*received.roundPolling.intervalMs);
    requests=0;start=Date.now();assert.equal(await waitForInitialDirections(client),null);assert.equal(requests,n);assert(Date.now()-start>=n*received.initialDirectionPolling.intervalMs);
    requests=0;start=Date.now();await assert.rejects(waitForRevision(client,{operation:'generate',baseRevision:1,input:{instruction:'x',mode:'refine'},idempotencyKey:'k',jobId:'j'}),/still pending/);
    assert.equal(requests,n);assert(Date.now()-start>=n*received.revisionPolling.intervalMs);
    Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:control}});
    try {
      const document=structuredClone(fixture) as PrismDocument;
      document.assets={one:{kind:'image',mediaType:'image/png',artifact:`artifact:sha256:${digest}`,role:'hero'}};
      const assets=await loadPreviewAssets(document,new AbortController().signal,received);assert(assets.one);
      // Aggregate cap includes the second valid asset, not merely each response.
      document.assets.two=structuredClone(document.assets.one)!;
      await assert.rejects(loadPreviewAssets(document,new AbortController().signal,received),/SIZE_EXCEEDED/);
      delete document.assets.two;assetMode='stall';
      start=Date.now();await assert.rejects(loadPreviewAssets(document,new AbortController().signal,received),/timeout/i);assert(Date.now()-start<500);
    } finally { Reflect.deleteProperty(globalThis,'location'); }
  }
});
test('browser policy fails closed without a complete closed positive policy',()=>{
  for(const value of [undefined,null,{}, {secret:'x'}, {maximumPreviewAssetBytes:0}])assert.throws(()=>studioBrowserPolicy(value),/POLICY_INVALID/);
});
