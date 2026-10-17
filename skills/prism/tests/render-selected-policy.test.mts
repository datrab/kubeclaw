import {engineRequestSchema, engineResultSchema} from '@kubeclaw/prism-contracts-v1/digest';
import {executePrismOperation} from '../engine/worker-binding.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureSwarmSettings, type PrismEngineSettings} from '../../common/plugin-runtime/foundation/config/swarm.ts';
import {readPrismEnginePolicy} from '../config/engine-policy.ts';
import {baselinePreviews} from '../server/baseline-archive.ts';
import {PrismEngine, DeterministicDesignProvider} from '../engine/index.ts';
import {nativePrismHostConfig} from '../config/native-worker.ts';
import {validateEngineResult} from '@kubeclaw/prism-contracts-v1';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
function setup(t:{after(fn:()=>void):void}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'render-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(new URL('../../../config/',import.meta.url),root,{recursive:true});
 const file=path.join(root,'components/prism-execution.config.json'),entryFile=path.join(root,'pipeline.config.json');
 const author=JSON.parse(fs.readFileSync(file,'utf8')),entry=JSON.parse(fs.readFileSync(entryFile,'utf8')),id='kubeclaw/prism/prism-worker';
 const selection={role:'prism' as const,callerId:'prism-worker' as const,serviceInstanceId:id,bindings:entry.bindings.filter((b:any)=>b.instanceId===id).map(({role:_,...b}:any)=>b)};
 return {author,write:()=>fs.writeFileSync(file,JSON.stringify(author)),load:()=>captureSwarmSettings(entryFile,selection).components['prism-execution']!.settings.enginePolicy as unknown as PrismEngineSettings};
}
const request=(viewport='wide',capture=false)=>({contract:'kubeclaw.prism-design-engine@1' as const,operation:'render' as const,input:{document:fixture,view:'home',state:'default',viewport,capture},idempotencyKey:`${viewport}-${capture}`});
test('whole selected/unselected render profiles are required and width relations checked before receiving',t=>{
 const f=setup(t),original=structuredClone(f.author);f.author.profiles.unselected=structuredClone(f.author.profiles.standard);
 for(const mutate of [(r:any)=>{delete r.locale},(r:any)=>{r.widths.compact=391},(r:any)=>{r.widths.regular=r.widths.compact},(r:any)=>{r.height=1001},(r:any)=>{r.locale='xx'},(r:any)=>{r.timezoneId='local'},(r:any)=>{r.reducedMotion='no-preference'},(r:any)=>{r.extra=true}]) {
  mutate(f.author.profiles.unselected.settings.enginePolicy.render);f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID|PRISM_RENDER_WIDTH_ORDER_INVALID/);f.author.profiles.unselected=structuredClone(original.profiles.standard);
 }
 f.write();assert.ok(Object.isFrozen(f.load().render!.widths));
 const p=structuredClone(f.load()) as any;const missing=structuredClone(p);delete missing.render;assert.throws(()=>readPrismEnginePolicy(missing),/PRISM_ENGINE_POLICY_REQUIRED/);for(const invalid of [undefined,null,{}, {...p.render,locale:'xx'}])assert.throws(()=>readPrismEnginePolicy({...p,render:invalid}),/PRISM_RENDER/);
});
test('selected A survives author B and JSON-restored original assigned child without current-owner refill',async t=>{
 const f=setup(t),a=f.load(),engineA=new PrismEngine(new DeterministicDesignProvider(),a);
 Object.assign(f.author.profiles.standard.settings.enginePolicy.render,{widths:{compact:320,regular:640,wide:1200},height:900,locale:'de-DE',timezoneId:'Europe/Berlin'});f.write();
 const b=f.load(),engineB=new PrismEngine(new DeterministicDesignProvider(),b);
 for(const [engine,locale,timezone,width,height] of [[engineA,'en-US','UTC',1440,1000],[engineB,'de-DE','Europe/Berlin',1200,900]] as const) {
  const r=await engine.execute(request());validateEngineResult('render',r.output);assert.deepEqual(r.output.renderer,{name:'prism-html',version:'v1',locale,timezone,motion:'reduced',policyVersion:'prism-render-policy.v1',viewport:{width,height}});
  await assert.rejects(engine.execute(request('unknown')),/PRISM_RENDER_VIEWPORT_INVALID/);
 }
 const assigned=JSON.stringify(a);f.author.profiles.standard.settings.enginePolicy.render={};f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID/);
 const original=nativePrismHostConfig({KUBECLAW_NATIVE_SCOPE:'/parser-only',PRISM_NATIVE_ASSIGNED_INPUT_BYTES:'64',PRISM_NATIVE_ASSIGNED_ARTIFACT_ACKNOWLEDGMENT_BYTES:'64',PRISM_NATIVE_ASSIGNED_ENGINE_POLICY:assigned,PRISM_CONTROL_INTERNAL_URL:'http://control.test',WORKER_TRUST_SPIFFE_ENABLED:'true'}).enginePolicy;
 const restored=await new PrismEngine(new DeterministicDesignProvider(),original).execute(request());assert.deepEqual(restored,await engineA.execute(request()));
});
test('actual browser-call receiving and full-page dimensions use selected values (modeled browser, NOT native proof)',async t=>{
 const f=setup(t);Object.assign(f.author.profiles.standard.settings.enginePolicy.render,{widths:{compact:320,regular:640,wide:1200},height:900,locale:'de-DE',timezoneId:'Europe/Berlin'});f.write();
 const contexts:any[]=[];let closes=0;
 // Header-only modeled screenshot: validates dimension receiving, not PNG decode/browser rendering.
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(320,16);png.writeUInt32BE(1500,20);
 t.mock.method(chromium,'launch',async()=>({version:()=> 'modeled',close:async()=>{closes++},newContext:async(options:any)=>{contexts.push(options);return {close:async()=>{},newPage:async()=>({setContent:async()=>{},addStyleTag:async()=>{},screenshot:async()=>png,locator:()=>({ariaSnapshot:async()=> 'body',evaluateAll:async()=>[],evaluate:async()=>[]})})}}}) as any);
 const engine=new PrismEngine(new DeterministicDesignProvider(),f.load());
 const r=await engine.execute(request('compact',true));validateEngineResult('render',r.output);
 assert.deepEqual(contexts,[{viewport:{width:320,height:900},locale:'de-DE',timezoneId:'Europe/Berlin',reducedMotion:'reduce'}]);assert.equal(closes,1);
 assert.deepEqual((r.output.renderer as any).image,{width:320,height:1500});assert.deepEqual((r.output.renderer as any).viewport,{width:320,height:900});
 await assert.rejects(engine.execute(request('__proto__',true)),/PRISM_RENDER_VIEWPORT_INVALID/);assert.equal(contexts.length,1);
});
test('closed original v2 engine reader retains original metadata with no selected current values',async t=>{
 const f=setup(t);f.author.schemaVersion='pipeline-component.v2';delete f.author.profiles.standard.settings.enginePolicy.render;delete f.author.profiles.standard.settings.enginePolicy.schemaVersion;f.write();const old=f.load();
 assert.equal(old.render,undefined);assert.deepEqual(readPrismEnginePolicy(JSON.parse(JSON.stringify(old))),old);
 const r=await new PrismEngine(new DeterministicDesignProvider(),old).execute(request());validateEngineResult('render',r.output);
 assert.deepEqual(r.output.renderer,{name:'prism-html',version:'v1',locale:'en-US',timezone:'UTC',motion:'reduced'});
 f.author.profiles.standard.settings.enginePolicy.render={};f.write();assert.throws(f.load,/SWARM_CONFIG_INVALID/);
});

test('actual baseline publication records full-page PNG dimensions separately from selected viewport',async()=>{
 const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(320,16);bytes.writeUInt32BE(1500,20);
 const text:Record<string,string>={},binary:Record<string,string>={};
 const runWorker=async()=>({screenshotBase64:bytes.toString('base64'),ariaSnapshot:'body',accessibilityFindings:[],renderer:{name:'modeled',version:'test',locale:'de-DE',timezone:'Europe/Berlin',motion:'reduced',policyVersion:'prism-render-policy.v1',viewport:{width:320,height:900},image:{width:320,height:1500}}});
 await baselinePreviews(runWorker as any,fixture as any,'approval',{},binary,text);
 const previews=JSON.parse(text['previews/index.json']).previews;assert.ok(previews.length>=3);
 for(const p of previews){assert.equal(p.width,320);assert.equal(p.height,1500);assert.equal(p.renderer.viewport.height,900);assert.equal(p.renderer.locale,'de-DE');}
 bytes.writeUInt32BE(0,20);await assert.rejects(baselinePreviews(runWorker as any,fixture as any,'approval',{},binary,{}),/PRISM_RENDER_PNG_DIMENSIONS_INVALID/);
});

test('actual neutral worker keeps original result identity and uses explicit selected result arm',async t=>{
 const f=setup(t),selected=f.load();
 const legacy=structuredClone(selected) as any;delete legacy.render;delete legacy.schemaVersion;
 const inputSchema=engineRequestSchema('render');
 const operation={contractId:'kubeclaw.prism-design-engine@1',inputSchemaId:inputSchema.schemaId,inputSchemaDigest:inputSchema.schemaDigest,values:{operation:'render',input:request().input}};
 for(const [policy,version] of [[selected,'prism-render-policy.v1'],[legacy,undefined]] as const) {
  const result=await executePrismOperation(new PrismEngine(new DeterministicDesignProvider(),policy),operation as any,'schema-test');
  assert.equal(result.schemaId,engineResultSchema('render',version).schemaId);assert.equal(result.schemaDigest,engineResultSchema('render',version).schemaDigest);validateEngineResult('render',result.values);
 }
 assert.equal(engineResultSchema('render').schemaDigest,'sha256:dfd2beb6acf288381e44afbd56241572f6e09549993e14b71dbbab2e643ff2ac');
 const valid=(await new PrismEngine(new DeterministicDesignProvider(),selected).execute(request())).output;
 assert.throws(()=>validateEngineResult('render',{...valid,renderer:{...(valid.renderer as object),policyVersion:'unknown'}}),/PRISM_ENGINE_RESULT_INVALID/);
});
