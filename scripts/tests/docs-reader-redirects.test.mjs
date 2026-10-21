import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publicationPages,publicationManifest,publicationAssets,copyPublicationAssets} from '../lib/docs-publication-assets.mjs';
import {appendReaderRedirects,compileReaderRedirects} from '../docs-reader/redirects.mjs';
import {createReaderServer} from '../docs-reader/serve.mjs';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {buildReader} from '../docs-reader/renderer.mjs';
const pages=[{relative:'README.md',owner:'documentation',text:'# Home\n'},{relative:'new.md',owner:'new owner',text:'# New\n\n## Kept\n'}];
const baseline={schemaVersion:'kubeclaw-published-route-baseline.v1',pages:[{page:'docs/site/old.md',route:'/old/',owner:'old owner'}]};
const entry={from:'/old/',to:'/new/',reason:'Synthetic rename fixture only.',preservedFragments:['kept']};
const registry=redirects=>({schemaVersion:'kubeclaw-documentation-routes.v1',redirects});
function fixture(t){const outputRoot=fs.mkdtempSync(path.join(os.tmpdir(),'reader-redirect-owned-'));t.after(()=>fs.rmSync(outputRoot,{recursive:true,force:true}));const manifest=buildReader({outputRoot,pages,assets:[],revision:'a'.repeat(40)});return{outputRoot,manifest,pages,baseline,registry:registry([entry])};}
test('exact registered redirect emits hashed fallback and canonical metadata without search/navigation promotion',t=>{const f=fixture(t);const m=appendReaderRedirects(f);const plan=JSON.parse(fs.readFileSync(path.join(f.outputRoot,'redirect-manifest.json')));assert.equal(m.pageCount,2);assert.deepEqual(plan.redirects.map(x=>[x.from,x.to,x.output]),[['/old/','/new.html','old/index.html']]);const html=fs.readFileSync(path.join(f.outputRoot,'old/index.html'),'utf8');assert(html.includes('rel="canonical" href="../new.html"'));assert(html.includes('<noscript>'));assert(!html.includes('http-equiv="refresh"'));assert(!fs.readFileSync(path.join(f.outputRoot,'search-index.js'),'utf8').includes('old/'));assert.equal(m.redirectManifest,'redirect-manifest.json');assert.equal(spawnSync(process.execPath,[fileURLToPath(new URL('../docs-reader/check-artifact.mjs',import.meta.url)),f.outputRoot],{encoding:'utf8'}).status,0);});
for(const [name,changes]of[
 ['unregistered removed page',{registry:registry([])}],['dead target',{registry:registry([{...entry,to:'/missing/'}])}],['chain',{registry:registry([entry,{from:'/older/',to:'/old/',reason:'chain',preservedFragments:[]}])}],['loop',{registry:registry([entry,{from:'/new/',to:'/old/',reason:'loop',preservedFragments:[]}])}],['lost original fragment',{registry:registry([{...entry,preservedFragments:['removed-heading']}])}],['undeclared fragment review',{registry:registry([{from:entry.from,to:entry.to,reason:entry.reason}])}],['external target',{registry:registry([{...entry,to:'https://example.test/new/'}])}],['encoded traversal source',{registry:registry([{...entry,from:'/%2e%2e/old/'}])}],['canonical source collision',{registry:registry([{...entry,from:'/new/'}])}],['duplicate source',{registry:registry([entry,entry])}],['two source routes collide on one static output',{registry:registry([entry,{...entry,from:'/old/index.html'}])}],
])test('refuses '+name+' before redirect output',t=>{const f=fixture(t);assert.throws(()=>compileReaderRedirects({...f,...changes}));assert(!fs.existsSync(path.join(f.outputRoot,'old/index.html')));});
test('actual loopback GET/HEAD redirects once, preserves query, serves only registered hashed members',async t=>{const f=fixture(t);appendReaderRedirects(f);const server=createReaderServer(f.outputRoot);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;for(const method of ['GET','HEAD']){const response=await fetch(base+'/old/?q=kept',{method,redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('location'),'/new.html?q=kept');if(method==='HEAD')assert.equal(await response.text(),'');}assert.equal((await fetch(base+'/old/')).url,base+'/new.html');assert.equal((await fetch(base+'/missing.html')).status,404);fs.writeFileSync(path.join(f.outputRoot,'private-review.md'),'not public');assert.equal((await fetch(base+'/private-review.md')).status,404);assert.equal((await fetch(base+'/old/',{method:'POST'})).status,405);fs.appendFileSync(path.join(f.outputRoot,'new.html'),'changed');assert.equal((await fetch(base+'/new.html')).status,409);});
test('current empty registry requires no fictional migrations',t=>{const f=fixture(t);const b={...baseline,pages:[]};const m=appendReaderRedirects({...f,baseline:b,registry:registry([])});assert.equal(JSON.parse(fs.readFileSync(path.join(f.outputRoot,'redirect-manifest.json'))).redirects.length,0);assert(m.outputs.some(x=>x.path==='reader-redirect.js'));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.outputRoot,'redirect-manifest.json'))).entryPoint,{from:'/',to:'/README.html',output:'index.html'});});

test('actual renderer integration emits redirect manifest from explicit inputs',t=>{const f=fixture(t);const m=buildReader({outputRoot:f.outputRoot,pages,assets:[],revision:'b'.repeat(40),redirectRegistry:f.registry,routeBaseline:baseline});assert.equal(m.redirectManifest,'redirect-manifest.json');assert.equal(JSON.parse(fs.readFileSync(path.join(f.outputRoot,'redirect-manifest.json'))).revision,'b'.repeat(40));});

test('actual positive selector to renderer path refuses injected docs/site Markdown with no rogue route or output',t=>{
 const f=fixture(t),site=path.join(f.outputRoot,'fixture/docs/site'),output=path.join(f.outputRoot,'published');fs.mkdirSync(site,{recursive:true});fs.writeFileSync(path.join(site,'README.md'),'# Home\n');
 const classification={schemaVersion:'kubeclaw-documentation-tree-classification.v1',files:[{path:'docs/site/README.md',expectedPath:'docs/site/README.md',class:'canonical-reader-documentation'}]};
 function publish(){const positive=publicationManifest(site,classification);const selected=publicationPages(site,classification).map(file=>({relative:path.relative(site,file),text:fs.readFileSync(file,'utf8')}));return {positive,reader:buildReader({outputRoot:output,pages:selected,assets:[],revision:'d'.repeat(40)})};}
 const first=publish();assert.equal(first.positive.pages.length,1);assert(fs.existsSync(path.join(output,'README.html')));
 fs.writeFileSync(path.join(site,'private-review.md'),'# Private review\n');assert.throws(publish,/no publication allowance/);assert(!first.positive.pages.some(page=>page.route.includes('private-review')));assert(!fs.existsSync(path.join(output,'private-review.html')));assert(!JSON.parse(fs.readFileSync(path.join(output,'reader-manifest.json'))).outputs.some(entry=>entry.path.includes('private-review')));
});

test('dotted canonical package page names retain exact normalized routes',t=>{const f=fixture(t);const selected=[pages[0],{relative:'extend/plugin-catalogue/kubeclaw.example.md',owner:'package owner',text:'# Package\n'}];const m=buildReader({outputRoot:f.outputRoot,pages:selected,assets:[],revision:'e'.repeat(40),redirectRegistry:registry([]),routeBaseline:{...baseline,pages:[]}});assert.equal(m.pageCount,2);assert(fs.existsSync(path.join(f.outputRoot,'extend/plugin-catalogue/kubeclaw.example.html')));});

test('actual optional Node preview CLI listens only on loopback and serves the registered redirect',async t=>{const f=fixture(t);appendReaderRedirects(f);const child=spawn(process.execPath,[fileURLToPath(new URL('../docs-reader/serve.mjs',import.meta.url)),f.outputRoot,'0'],{stdio:['ignore','pipe','pipe']});const exited=once(child,'exit');t.after(async()=>{child.kill('SIGTERM');await exited;});const output=await Promise.race([once(child.stdout,'data').then(([bytes])=>String(bytes)),exited.then(()=>{throw new Error('Preview exited before readiness');})]);assert.match(output,/Reader preview: http:\/\/127\.0\.0\.1:[0-9]+/);const base=output.trim().split(' ').at(-1);assert.equal((await fetch(base+'/old/',{redirect:'manual'})).status,308);});

test('positive selected module/JSON copies are hash-bound and served; unlisted, changed and nonphysical assets fail',async t=>{
 const f=fixture(t),site=path.join(f.outputRoot,'fixture/docs/site'),out=path.join(f.outputRoot,'published');
 const entries=[['use/workflows/examples/repair-retry.mjs','// Selected module bytes, not executed.\n'],['use/workflows/wait-resume/platform.template.json','{"selected":true}\n']];
 for(const [name,bytes]of entries){fs.mkdirSync(path.dirname(path.join(site,name)),{recursive:true});fs.writeFileSync(path.join(site,name),bytes);}
 const assets=publicationAssets(site);assert.deepEqual([...assets].sort(),entries.map(([name])=>name).sort());copyPublicationAssets(site,out,assets);
 const options={outputRoot:out,pages,assets,revision:'f'.repeat(40),redirectRegistry:registry([]),routeBaseline:{...baseline,pages:[]}};
 const manifest=buildReader(options);for(const [name,bytes]of entries){const record=manifest.outputs.find(r=>r.path===name);assert(record);assert.equal(record.bytes,Buffer.byteLength(bytes));}
 assert.equal(spawnSync(process.execPath,[fileURLToPath(new URL('../docs-reader/check-artifact.mjs',import.meta.url)),out],{encoding:'utf8'}).status,0);
 const server=createReaderServer(out);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 for(const [name,bytes]of entries)for(const method of ['GET','HEAD']){const response=await fetch(base+'/'+name,{method});assert.equal(response.status,200);assert.equal(await response.text(),method==='HEAD'?'':bytes);}
 const unlisted='use/workflows/examples/unlisted.mjs';fs.writeFileSync(path.join(out,unlisted),'not selected');assert.equal((await fetch(base+'/'+unlisted)).status,404);
 fs.appendFileSync(path.join(out,entries[0][0]),'changed');assert.equal((await fetch(base+'/'+entries[0][0])).status,409);
 fs.unlinkSync(path.join(out,entries[0][0]));assert.throws(()=>buildReader(options),/ENOENT/);
 fs.symlinkSync(path.join(site,entries[0][0]),path.join(out,entries[0][0]));assert.throws(()=>buildReader(options),/must be physical/);
 fs.unlinkSync(path.join(out,entries[0][0]));fs.writeFileSync(path.join(out,entries[0][0]),entries[0][1]);assert.throws(()=>buildReader({...options,assets:[...assets,assets[0]]}),/Generated diagram asset collides with a selected asset/);
});
