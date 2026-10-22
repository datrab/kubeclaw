import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {assertReaderArtifactExternalCiPurpose,addReaderArtifactExternalCiSeed,assertDocumentationOwnerPurpose} from '../docs-documentation-owner-purpose-custody.mjs';
const repository=path.resolve(import.meta.dirname,'../..');
const source='scripts/docs-reader/check-artifact.mjs';
const inputs=["scripts/docs-reader/check-artifact.mjs", "scripts/docs-reader/page-records.mjs", "scripts/docs-publication.mjs", "scripts/docs-reader/renderer.mjs", "scripts/docs-reader/redirects.mjs", ".github/workflows/docs-checks.yaml", "scripts/tests/docs-reader-page-records.test.mjs", "scripts/tests/docs-reader.test.mjs", "scripts/tests/docs-reader-redirects.test.mjs", "docs/site/reference/documentation-site.md", "package.json", "scripts/lib/docs-publication-assets.mjs", "scripts/lib/docs-route-continuity.mjs", "scripts/docs-reader/metadata.mjs"];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
inputs.push('scripts/docs-reader/check-search.mjs','scripts/docs-reader/search-questions.json');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-external-ci-purpose-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),bytes);};
 for(const name of inputs)write(name,fs.readFileSync(path.join(repository,name)));
 return {root,write,read:name=>fs.readFileSync(path.join(root,name))};
}
const graph=()=>({executableSources:[source,'scripts/docs-reader/page-records.mjs'],edges:[{source,target:'scripts/docs-reader/page-records.mjs',kind:'import'}]});
test('exact CI search entry reaches its renderer helpers without admitting arbitrary siblings',t=>{
 const f=fixture(t),search='scripts/docs-reader/check-search.mjs',selected=graph(),reachable=new Set();
 selected.executableSources.push(search,'scripts/docs-reader/unreviewed-check.mjs');
 selected.edges.push({source:search,target:'scripts/docs-reader/renderer.mjs',kind:'import'});
 assert.equal(addReaderArtifactExternalCiSeed(assertReaderArtifactExternalCiPurpose(f.root),selected,reachable),true);
 assert.deepEqual([...reachable],[source,search]);
 assert.equal(assertDocumentationOwnerPurpose(f.root,search),null);
 f.write('scripts/docs-reader/search-questions.json',Buffer.concat([f.read('scripts/docs-reader/search-questions.json'),Buffer.from('\nchanged\n')]));
 assert.throws(()=>assertDocumentationOwnerPurpose(f.root,search),/PURPOSE_DRIFT/);
});
test('search entry with a new importer cannot partially seed the other entry',t=>{
 const f=fixture(t),selected=graph(),reachable=new Set();
 selected.executableSources.push('scripts/docs-reader/check-search.mjs');
 selected.edges.push({source:'scripts/runtime-consumer.mjs',target:'scripts/docs-reader/check-search.mjs',kind:'import'});
 assert.throws(()=>addReaderArtifactExternalCiSeed(assertReaderArtifactExternalCiPurpose(f.root),selected,reachable),/new selected verifier importer/);
 assert.equal(reachable.size,0);
});
test('actual physical caller proof seeds one selected verifier, never native entry facts',t=>{
 const f=fixture(t),entries=[],selected=graph(),reachable=new Set(['scripts/docs-publication.mjs']);
 for(let i=0;i<2;i++){const proof=assertReaderArtifactExternalCiPurpose(f.root);assert.equal(addReaderArtifactExternalCiSeed(proof,selected,reachable),true);}
 assert.deepEqual([...reachable],['scripts/docs-publication.mjs',source]);assert.deepEqual(entries,[]);
 assert.equal(addReaderArtifactExternalCiSeed(assertReaderArtifactExternalCiPurpose(f.root),{executableSources:[],edges:[]},new Set()),false);
});
for(const name of inputs)for(const warm of [false,true])test(`${warm?'retained-proof':'cold'} complete physical caller input drift rejects: ${name}`,t=>{
 const f=fixture(t),proof=warm?assertReaderArtifactExternalCiPurpose(f.root):null;
 f.write(name,Buffer.concat([f.read(name),Buffer.from('\nchanged source purpose bytes\n')]));
 const expected=/DOCUMENTATION_READER_CI_PURPOSE_DRIFT/;
 assert.throws(()=>assertReaderArtifactExternalCiPurpose(f.root),expected);
 if(warm)assert.throws(()=>addReaderArtifactExternalCiSeed(proof,graph(),new Set()),expected);
});
test('forged, copied and unrelated proof objects cannot grant reachability',t=>{
 const f=fixture(t),proof=assertReaderArtifactExternalCiPurpose(f.root);
 for(const forged of [{...proof},JSON.parse(JSON.stringify(proof)),{kind:proof.kind,source}])assert.throws(()=>addReaderArtifactExternalCiSeed(forged,graph(),new Set()),/unacquired proof/);
 assert.equal(addReaderArtifactExternalCiSeed(null,graph(),new Set()),false);
});
test('source plus arbitrary mutable registry SHA renewal cannot grant the route',t=>{
 const f=fixture(t),proof=assertReaderArtifactExternalCiPurpose(f.root);f.write(source,Buffer.concat([f.read(source),Buffer.from('\nconsole.log(JSON.stringify({apiVersion:"v1",kind:"Secret"}));\n')]));
 f.write('scripts/docs-api-producer-adapter-authorities.json',JSON.stringify({documentationToolBoundary:{sources:[source],purposeRoutes:[{source,sha256:sha(f.read(source)),kind:proof.kind}]}}));
 assert.throws(()=>addReaderArtifactExternalCiSeed(proof,graph(),new Set()),/PURPOSE_DRIFT/);
});
for(const importer of ['scripts/docs-unreviewed-consumer.mjs','scripts/runtime-consumer.mjs'])test(`new selected importer cannot borrow external CI authority: ${importer}`,t=>{
 const f=fixture(t),proof=assertReaderArtifactExternalCiPurpose(f.root),selected=graph();
 selected.executableSources.push(importer);selected.edges.push({source:importer,target:source,kind:'import'});
 assert.throws(()=>addReaderArtifactExternalCiSeed(proof,selected,new Set()),/new selected verifier importer/);
});
for(const kind of ['non-doc-package','public-bin-alias'])test(`new public invocation cannot borrow route: ${kind}`,t=>{
 const f=fixture(t),proof=assertReaderArtifactExternalCiPurpose(f.root),definition=JSON.parse(f.read('package.json'));
 if(kind==='non-doc-package')definition.scripts['runtime:reader']=`node ${source}`;
 else {fs.mkdirSync(path.join(f.root,'tools'));fs.symlinkSync('../'+source,path.join(f.root,'tools/reader.mjs'));definition.bin={reader:'tools/reader.mjs'};}
 f.write('package.json',JSON.stringify(definition));assert.throws(()=>addReaderArtifactExternalCiSeed(proof,graph(),new Set()),/PURPOSE_DRIFT/);
});
for(const mode of ['missing','symlink'])test(`retained proof cannot hide ${mode} physical CI caller`,t=>{
 const f=fixture(t),proof=assertReaderArtifactExternalCiPurpose(f.root),name='.github/workflows/docs-checks.yaml',bytes=f.read(name);fs.unlinkSync(path.join(f.root,name));
 if(mode==='symlink'){f.write('retained-ci.yaml',bytes);fs.symlinkSync('../../retained-ci.yaml',path.join(f.root,name));}
 assert.throws(()=>addReaderArtifactExternalCiSeed(proof,graph(),new Set()),/PURPOSE_DRIFT/);
});
test('CI declaration cannot hide a missing verifier; unrelated roots receive no seed',t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.root,source));assert.throws(()=>assertReaderArtifactExternalCiPurpose(f.root),/PURPOSE_DRIFT/);
 const unrelated=fs.mkdtempSync(path.join(os.tmpdir(),'reader-no-ci-'));t.after(()=>fs.rmSync(unrelated,{recursive:true,force:true}));assert.equal(assertReaderArtifactExternalCiPurpose(unrelated),null);
});
test('normal discovery integration validates before graph-cache lookup and preserves ordinary graph guards',()=>{
 const text=fs.readFileSync(path.join(repository,'scripts/docs-api-output-discovery.mjs'),'utf8');
 const start=text.indexOf('function documentationModuleGraph('),cache=text.indexOf('const cached=documentationGraphCache.get(root);',start);
 assert(text.indexOf('assertReaderArtifactExternalCiPurpose(root);',start)<cache);
 assert(text.includes('addReaderArtifactExternalCiSeed(assertReaderArtifactExternalCiPurpose(root),graph,docsReachable);'));
 for(const guard of ['else for(const consumer of ancestors)assert(docsReachable.has(consumer)', 'assert.deepEqual(actualEdges,[...record.graphEdges]', 'assert.deepEqual(actualEntries,record.documentationEntries', 'assert.deepEqual(unresolvedOperations,record.unresolvedModuleOperations', 'package public target', 'package invocation'])assert(text.includes(guard),guard);
});

test('direct existing role-purpose entry revalidates external caller inputs before role-cache return',t=>{
 const f=fixture(t);assert.equal(assertDocumentationOwnerPurpose(f.root,source),null);
 f.write('.github/workflows/docs-checks.yaml',Buffer.concat([f.read('.github/workflows/docs-checks.yaml'),Buffer.from('\nchanged caller\n')]));
 for(const selected of [source,'scripts/docs-reader/page-records.mjs','scripts/docs-publication.mjs','scripts/docs-reader/renderer.mjs','scripts/docs-reader/redirects.mjs'])assert.throws(()=>assertDocumentationOwnerPurpose(f.root,selected),/PURPOSE_DRIFT/);
});

// These are inert physical Source fixtures, not evaluated reader/product modules.
for(const warm of [false,true])test(`${warm?'retained':'cold'} copied CI alone is not verifier/project authority`,t=>{
 const f=fixture(t),proof=warm?assertReaderArtifactExternalCiPurpose(f.root):null;
 for(const name of inputs)if(!['.github/workflows/docs-checks.yaml','docs/site/reference/documentation-site.md'].includes(name))fs.unlinkSync(path.join(f.root,name));
 f.write('package.json','{}');
 assert.equal(assertReaderArtifactExternalCiPurpose(f.root),null);
 const reachable=new Set();assert.equal(addReaderArtifactExternalCiSeed(null,graph(),reachable),false);assert.deepEqual([...reachable],[]);
 if(warm)assert.throws(()=>addReaderArtifactExternalCiSeed(proof,graph(),reachable),/PURPOSE_DRIFT|ENOENT/);
});
for(const mode of ['package-changed','package-removed','ci-changed','ci-removed','package-and-ci-changed','one-context-file-removed'])test(`missing verifier in finite artifact-project context rejects: ${mode}`,t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.root,source));
 if(mode.includes('package')){if(mode==='package-removed')fs.unlinkSync(path.join(f.root,'package.json'));else f.write('package.json','{}');}
 if(mode.includes('ci')){if(mode==='ci-removed')fs.unlinkSync(path.join(f.root,'.github/workflows/docs-checks.yaml'));else f.write('.github/workflows/docs-checks.yaml','unrelated: true');}
 if(mode==='one-context-file-removed')fs.unlinkSync(path.join(f.root,'scripts/docs-reader/page-records.mjs'));
 assert.throws(()=>assertReaderArtifactExternalCiPurpose(f.root),/PURPOSE_DRIFT/);
});
test('dangling selected verifier entry cannot become unrelated-root absence',t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.root,source));fs.symlinkSync('absent-verifier.mjs',path.join(f.root,source));
 assert.throws(()=>assertReaderArtifactExternalCiPurpose(f.root),/PURPOSE_DRIFT/);
});
test('present selected verifier cannot borrow partial caller or changed package context',t=>{
 const f=fixture(t);for(const name of inputs)if(name!==source)fs.unlinkSync(path.join(f.root,name));f.write('package.json','{}');
 assert.throws(()=>assertReaderArtifactExternalCiPurpose(f.root),/PURPOSE_DRIFT/);
});
