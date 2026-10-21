import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicationPages, publicationManifest, publicationAssets, copyPublicationAssets} from '../lib/docs-publication-assets.mjs';
import {buildReader, readerOutputLayout} from '../docs-reader/renderer.mjs';
import {compileReaderRedirects, verifyReaderRedirects, legacyReaderRoute} from '../docs-reader/redirects.mjs';
import {appendReaderPageRecords, verifyReaderPageRecords} from '../docs-reader/page-records.mjs';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ownerPath = 'docs/site/reference/generated-documentation-map.json';
const positivePath = 'docs/config/documentation-publication-manifest.json';
function fixture(t, change = () => {}) {
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'reader-page-records-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const repositoryRoot=path.join(temporary,'repository'),outputRoot=path.join(temporary,'output');fs.mkdirSync(repositoryRoot);
 const write=(name,value)=>{const file=path.join(repositoryRoot,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
 const git=(...args)=>execFileSync('git',['-C',repositoryRoot,...args],{encoding:'utf8'}).trim();
 write('docs/site/README.md','# Home\n\nOwner: docs\n\n[Page](use/page.md)\n');write('docs/site/use/page.md','# Page\n\nOwner: docs\n\n## Kept\n\n[Home](../README.md)\n');
 write('src/declared.txt','Declared exact source bytes.\n');write('src/tree/item.txt','Declared tree member.\n');
 const classification={schemaVersion:'kubeclaw-documentation-tree-classification.v1',files:['README.md','use/page.md'].map(name=>({path:'docs/site/'+name,expectedPath:'docs/site/'+name,class:'canonical-reader-documentation'}))};
 const siteRoot=path.join(repositoryRoot,'docs/site'),positive=publicationManifest(siteRoot,classification);
 const ownership={schemaVersion:'kubeclaw-documentation-map.v1',pageCount:2,pages:positive.pages.map(row=>({page:row.sourcePath,route:legacyReaderRoute(row.sourcePath.slice(10)),owner:'docs',sourceDependencies:row.sourcePath.endsWith('page.md')?['src/declared.txt','src/tree']:[]}))};
 const registry={schemaVersion:'kubeclaw-documentation-routes.v1',redirects:[{from:'/old/',to:'/use/page/',reason:'Synthetic fixture history only.',preservedFragments:['kept']}]};
 const baseline={schemaVersion:'kubeclaw-published-route-baseline.v1',pages:[{page:'docs/site/old.md',route:'/old/',owner:'old'}]};
 change({positive,ownership,registry,write});write(positivePath,positive);write(ownerPath,ownership);write('docs/site/reference/documentation-route-registry.json',registry);write('scripts/docs-published-route-baseline.json',baseline);
 git('init','-q');git('add','.');git('-c','user.name=Reader fixture','-c','user.email=reader@example.invalid','commit','-qm','fixed reader inputs');const revision=git('rev-parse','HEAD');
 function build(destination=outputRoot){const pages=publicationPages(siteRoot,classification).map(file=>({relative:path.relative(siteRoot,file).split(path.sep).join('/'),text:fs.readFileSync(file,'utf8')}));const assets=publicationAssets(siteRoot);copyPublicationAssets(siteRoot,destination,assets);const manifest=buildReader({outputRoot:destination,pages,assets,revision,redirectRegistry:registry,routeBaseline:baseline});return{repositoryRoot,outputRoot:destination,manifest};}
 return{repositoryRoot,outputRoot,temporary,write,git,revision,build,registry,baseline};
}
test('real selector/renderer emits deterministic source, dependency, HTML and redirect records',t=>{
 const f=fixture(t),first=appendReaderPageRecords(f.build()),secondRoot=path.join(f.temporary,'second'),second=appendReaderPageRecords(f.build(secondRoot));assert.deepEqual(first,second);
 assert(fs.readFileSync(path.join(f.outputRoot,'reader-manifest.json')).equals(fs.readFileSync(path.join(secondRoot,'reader-manifest.json'))));for(const output of first.outputs)assert(fs.readFileSync(path.join(f.outputRoot,output.path)).equals(fs.readFileSync(path.join(secondRoot,output.path))));
 const page=first.pageRecords.pages.find(p=>p.sourcePath.endsWith('/page.md'));assert.equal(page.route,'/use/page.html');assert.equal(page.canonicalUrl,page.route);assert.equal(page.source.contentHash.value,hash(fs.readFileSync(path.join(f.repositoryRoot,page.sourcePath))));assert.equal(page.html.contentHash.value,hash(fs.readFileSync(path.join(f.outputRoot,page.html.path))));assert.deepEqual(page.sourceDependencies.map(d=>d.path),['src/declared.txt','src/tree']);assert.equal(page.sourceDependencies[1].hashRepresentation,'git-tree-object-bytes');assert.deepEqual(page.redirects.map(r=>[r.from,r.to,r.artifact.path]),[['/old/','/use/page.html','old/index.html']]);assert.equal(first.pageRecords.pages[0].redirects[0].kind,'entry-point');assert.equal(verifyReaderPageRecords({...f,manifest:first}).pages,2);
 const checker=fileURLToPath(new URL('../docs-reader/check-artifact.mjs',import.meta.url));fs.writeFileSync(path.join(f.outputRoot,'build-report.json'),'{"schemaVersion":"kubeclaw-docs-publication.v1"}');const checked=spawnSync(process.execPath,[checker,f.outputRoot,f.repositoryRoot],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);
});
for(const[name,change,pattern]of[
 ['deployment-host canonical URL',({positive})=>{positive.pages[0].canonicalUrl='https://example.invalid/';},/artifact-local/],
 ['escaped dependency',({ownership})=>{ownership.pages[0].sourceDependencies=['../outside'];},/Noncanonical/],
 ['duplicate ownership',({ownership})=>{ownership.pages.push({...ownership.pages[0]});ownership.pageCount++;},/Duplicate owner/],
 ['owner route mismatch',({ownership})=>{ownership.pages[0].route='/other/';},/Owner route/],
 ['missing declared source',({ownership})=>{ownership.pages[0].sourceDependencies=['src/absent'];},/Not a committed/],
])test('rejects '+name,t=>{const f=fixture(t,change);assert.throws(()=>appendReaderPageRecords(f.build()),pattern);});
test('current file/tree drift rejects before replacing map; undeclared source is not inferred',t=>{
 const f=fixture(t),options=f.build(),manifest=appendReaderPageRecords(options),before=fs.readFileSync(path.join(f.outputRoot,'reader-manifest.json'));
 f.write('src/not-declared.txt','Outside declared scope');assert.equal(verifyReaderPageRecords({...f,manifest}).pages,2);f.write('src/declared.txt','Changed');assert.throws(()=>appendReaderPageRecords(options),/Current Source differs/);assert(fs.readFileSync(path.join(f.outputRoot,'reader-manifest.json')).equals(before));f.git('checkout','--','src/declared.txt');f.write('src/tree/new.txt','Untracked');assert.throws(()=>verifyReaderPageRecords({...f,manifest}),/Uncommitted Source/);fs.unlinkSync(path.join(f.repositoryRoot,'src/tree/new.txt'));f.write('src/tree/item.txt','Tracked tree change');assert.throws(()=>verifyReaderPageRecords({...f,manifest}));
});
test('changed source page and nonphysical dependency reject',t=>{const f=fixture(t),options=f.build();f.write('docs/site/README.md','# Changed\n');assert.throws(()=>appendReaderPageRecords(options),/Current Source differs/);f.git('checkout','--','docs/site/README.md');fs.renameSync(path.join(f.repositoryRoot,'src/declared.txt'),path.join(f.repositoryRoot,'src/other.txt'));fs.symlinkSync('other.txt',path.join(f.repositoryRoot,'src/declared.txt'));assert.throws(()=>appendReaderPageRecords(options),/Nonphysical/);});
test('output hash renewal cannot preserve stale page records; production checker rejects removed records',t=>{
 const f=fixture(t),manifest=appendReaderPageRecords(f.build()),file=path.join(f.outputRoot,'use/page.html');fs.appendFileSync(file,'<p>changed</p>');assert.throws(()=>verifyReaderPageRecords({...f,manifest}),/output.*drift/);const record=manifest.outputs.find(r=>r.path==='use/page.html');record.bytes=fs.statSync(file).size;record.sha256=hash(fs.readFileSync(file));assert.throws(()=>verifyReaderPageRecords({...f,manifest}),/records drift/);const without={...manifest};delete without.pageRecords;assert.throws(()=>verifyReaderPageRecords({...f,manifest:without}),/missing pageRecords/);
 fs.writeFileSync(path.join(f.outputRoot,'reader-manifest.json'),JSON.stringify(without));fs.writeFileSync(path.join(f.outputRoot,'build-report.json'),'{}');const checked=spawnSync(process.execPath,[fileURLToPath(new URL('../docs-reader/check-artifact.mjs',import.meta.url)),f.outputRoot,f.repositoryRoot],{encoding:'utf8'});assert.notEqual(checked.status,0);assert.match(checked.stderr,/missing pageRecords/);
});
test('read-only verification preserves emit collision guard and rejects hash-renewed wrong fallback',t=>{
 const f=fixture(t),options=f.build(),pages=[{relative:'README.md',owner:'docs'},{relative:'use/page.md',owner:'docs'}];assert.throws(()=>compileReaderRedirects({...f,pages}),/collides/);assert.throws(()=>compileReaderRedirects({...f,pages,verifyExisting:true}),/collides/);assert.equal(verifyReaderRedirects({...f,pages,reservedOutputs:readerOutputLayout({pages,assets:[]}).htmlOutputs}).redirects.length,1);const manifest=appendReaderPageRecords(options),file=path.join(f.outputRoot,'old/index.html');fs.writeFileSync(file,'<h1>Wrong fallback</h1>');const record=manifest.outputs.find(r=>r.path==='old/index.html');record.bytes=fs.statSync(file).size;record.sha256=hash(fs.readFileSync(file));assert.throws(()=>verifyReaderPageRecords({...f,manifest}),/source-owned fallback/);
});
test('external declaration is explicit unacquired data, not fabricated bytes',t=>{const f=fixture(t,({ownership})=>{ownership.pages[0].sourceDependencies=['https://example.invalid/source'];});const manifest=appendReaderPageRecords(f.build());assert.deepEqual(manifest.pageRecords.pages[0].sourceDependencies,[{declaration:'https://example.invalid/source',kind:'unacquired-reference',contentHash:null}]);});
test('duplicate positive mapping and escaped/duplicate artifact outputs reject',t=>{
 const duplicate=fixture(t,({positive})=>{positive.pages[1]={...positive.pages[0]};});assert.throws(()=>appendReaderPageRecords(duplicate.build()),/Duplicate positive/);
 const f=fixture(t),options=f.build();options.manifest.outputs.push({...options.manifest.outputs[0]});assert.throws(()=>appendReaderPageRecords(options),/Duplicate mapped output/);options.manifest.outputs.pop();options.manifest.outputs[0]={...options.manifest.outputs[0],path:'../escape.html'};assert.throws(()=>appendReaderPageRecords(options),/Noncanonical/);
});

test('Source-owned shared assets and home reject drift even after manifest hash renewal',t=>{
 for(const name of ['reader.css','reader.js','reader-redirect.js','index.html']){
  const f=fixture(t),manifest=appendReaderPageRecords(f.build()),file=path.join(f.outputRoot,name);
  fs.appendFileSync(file,'\n/* changed */');const record=manifest.outputs.find(r=>r.path===name);record.bytes=fs.statSync(file).size;record.sha256=hash(fs.readFileSync(file));
  assert.throws(()=>verifyReaderPageRecords({...f,manifest}),name==='index.html'?/source-owned fallback/:/Source-owned bytes/);
 }
});

test('read-only redirect checks retain renderer route collisions even with an exact fallback',t=>{
 const f=fixture(t),options=f.build(),pages=[{relative:'README.md',owner:'docs'},{relative:'use/page.md',owner:'docs'}];
 const registry={...f.registry,redirects:[...f.registry.redirects,{...f.registry.redirects[0],from:'/search.html'}]},reservedOutputs=readerOutputLayout({pages,assets:[]}).htmlOutputs;
 fs.copyFileSync(path.join(f.outputRoot,'old/index.html'),path.join(f.outputRoot,'search.html'));
 assert.throws(()=>verifyReaderRedirects({...f,pages,registry,reservedOutputs}),/reserved renderer output/);
 assert.throws(()=>verifyReaderRedirects({...f,pages}),/requires the renderer output layout/);
 assert(readerOutputLayout({pages,assets:['use/examples/data.json']}).htmlOutputs.includes('use/examples/index.html'));
});

for (const flag of ['--assume-unchanged', '--skip-worktree']) test('rejects hidden physical declared-tree drift: '+flag,t=>{
 const f=fixture(t),manifest=appendReaderPageRecords(f.build());
 f.git('update-index',flag,'src/tree/item.txt');f.write('src/tree/item.txt','Hidden physical change');
 assert.equal(f.git('diff','--name-only',f.revision,'--','src/tree'),'','control: ordinary diff is masked');
 assert.throws(()=>verifyReaderPageRecords({...f,manifest}),/Masked or unsupported Source index entry/);
 assert.match(f.git('ls-files','-v','--','src/tree/item.txt'),flag==='--assume-unchanged'?/^h /:/^S /,'verification must not clear user index flags');
});
for (const name of ['src/declared.txt','src/tree/item.txt']) test('rejects staged-only declared Source drift despite restored physical bytes: '+name,t=>{
 const f=fixture(t),manifest=appendReaderPageRecords(f.build()),file=path.join(f.repositoryRoot,name),original=fs.readFileSync(file);
 f.write(name,'Changed staged bytes');f.git('add',name);fs.writeFileSync(file,original);
 assert.equal(f.git('diff','--name-only',f.revision,'--',name),'','control: ordinary revision/worktree diff misses index-only change');
 assert.equal(f.git('diff','--cached','--name-only',f.revision,'--',name),name);
 assert.throws(()=>verifyReaderPageRecords({...f,manifest}));
 assert.equal(f.git('diff','--cached','--name-only',f.revision,'--',name),name,'verification must not restore user index');
});
test('masking flags stop even unchanged declared entries but do not inspect unrelated tracked Source',t=>{
 const f=fixture(t,({write})=>write('outside/unclaimed.txt','Outside owner declarations')),manifest=appendReaderPageRecords(f.build());
 f.git('update-index','--assume-unchanged','outside/unclaimed.txt');f.write('outside/unclaimed.txt','Unclaimed change');
 assert.equal(verifyReaderPageRecords({...f,manifest}).pages,2,'not a global clean-worktree requirement');
 f.git('update-index','--assume-unchanged','src/tree/item.txt');
 assert.throws(()=>verifyReaderPageRecords({...f,manifest}),/Masked or unsupported Source index entry/);
});
test('normal production CLI requires records after BOTH sentinels are stripped; fixture mode is caller-explicit',t=>{
 const f=fixture(t),manifest=appendReaderPageRecords(f.build()),checker=fileURLToPath(new URL('../docs-reader/check-artifact.mjs',import.meta.url));
 const run=(legacy=false)=>spawnSync(process.execPath,[checker,...(legacy?['--legacy-renderer-fixture']:[]),f.outputRoot,f.repositoryRoot],{encoding:'utf8'});
 const report=path.join(f.outputRoot,'build-report.json');fs.writeFileSync(report,'{}');assert.equal(run().status,0);assert.equal(run(true).status,0,'mapped records remain checked in explicit fixture mode');
 const originalRecords=manifest.pageRecords;manifest.pageRecords={...originalRecords,pages:[]};fs.writeFileSync(path.join(f.outputRoot,'reader-manifest.json'),JSON.stringify(manifest));assert.notEqual(run(true).status,0,'explicit fixture mode still checks records when present');
 delete manifest.pageRecords;fs.writeFileSync(path.join(f.outputRoot,'reader-manifest.json'),JSON.stringify(manifest));
 assert.match(run().stderr,/missing pageRecords/);const reported=run(true);assert.notEqual(reported.status,0);assert.match(reported.stderr,/cannot omit production pageRecords/);
 fs.unlinkSync(report);const stripped=run();assert.notEqual(stripped.status,0);assert.match(stripped.stderr,/missing pageRecords/);
 assert.equal(run(true).status,0,'only caller-selected legacy mode admits a genuine unmapped renderer fixture');
 fs.appendFileSync(path.join(f.outputRoot,'README.html'),'<p>changed</p>');assert.notEqual(run(true).status,0,'fixture opt-in does not bypass output guards');
});
