import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawnSync}from 'node:child_process';
import {qualifiedRootNodeHarnessSources,expandReviewedNodePackageGlob,reviewedRootNodeEntryRecipes}from '../docs-api-documentation-role-custody.mjs';
import {discoverScriptApiOutputs}from '../docs-api-output-discovery.mjs';
const repository=new URL('../..',import.meta.url).pathname;
const emit="const body={apiVersion:'v1',kind:'Secret',metadata:{name:'public-test-neighbor'}};console.log(JSON.stringify(body));\n";
function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-node-entry-'));const write=(source,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,source)),{recursive:true});fs.writeFileSync(path.join(root,source),bytes);};try{run({root,write});}finally{fs.rmSync(root,{recursive:true,force:true});}}
function harnessFixture(run){fixture(context=>{for(const source of new Set([...Object.keys(reviewedRootNodeEntryRecipes.entries),...reviewedRootNodeEntryRecipes.closure.map(x=>x.source)]))context.write(source,fs.readFileSync(path.join(repository,source)));context.write('package.json',JSON.stringify(activeDefinition));run(context);});}
const allHarnessEntries=Object.entries(reviewedRootNodeEntryRecipes.entries).flatMap(([source,recipe])=>recipe.callers.map(caller=>({...caller,source})));
const expectedHarnessSources=Object.keys(reviewedRootNodeEntryRecipes.entries).sort();
const assertHarnessSources=actual=>assert.deepEqual([...actual].sort(),expectedHarnessSources);
const activeDefinition={scripts:Object.fromEntries(allHarnessEntries.map(x=>[x.name,x.command]))};

test('exact caller-qualified fixture harnesses retain genuine imported and child producers',()=>harnessFixture(({root})=>{
 const qualified=qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries);
 assertHarnessSources(qualified);
 for(const product of ['skills/nova/pipeline.ts','skills/nova/plugins/preflight-contract/src/stage.ts','skills/common/plugins/artifact-store/src/adapter.ts','skills/common/plugin-runtime/foundation/observability/durable-records.ts'])assert(!qualified.has(product));
 assert(!qualified.has('scripts/tests/fixtures/review-supervisor.mjs'));
}));

test('harness caller and public reachability cannot transfer fixture purpose',()=>harnessFixture(({root})=>{
 const source='scripts/tests/docs-publication-links.test.mjs';
 assertHarnessSources(qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries));
 assert.throws(()=>qualifiedRootNodeHarnessSources(root,{},[]),/actual caller\/public entry authority differs/);
 const publicDefinition={...activeDefinition,main:source};fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(publicDefinition));assert.throws(()=>qualifiedRootNodeHarnessSources(root,publicDefinition,allHarnessEntries),/PUBLIC_CONSUMER_UNQUALIFIED.*package public entry/);
 const directDefinition={scripts:{...activeDefinition.scripts,'run:public':'node '+source}};fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(directDefinition));assert.throws(()=>qualifiedRootNodeHarnessSources(root,directDefinition,[...allHarnessEntries,{name:'run:public',command:'node '+source,source}]),/PUBLIC_CONSUMER_UNQUALIFIED.*run:public/);
 assert.throws(()=>qualifiedRootNodeHarnessSources(root,directDefinition,allHarnessEntries),/actual native caller inventory differs/);
 const nestedDefinition={scripts:{...activeDefinition.scripts,'run:nested':"bash -c 'node "+source+"'"}};fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(nestedDefinition));assert.throws(()=>qualifiedRootNodeHarnessSources(root,nestedDefinition,allHarnessEntries),/unsupported nested shell -c Node acquisition/);
 const passiveDefinition={scripts:{...activeDefinition.scripts,'run:passive':"node tools/print-path.mjs "+source}};fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(passiveDefinition));assertHarnessSources(qualifiedRootNodeHarnessSources(root,passiveDefinition,allHarnessEntries));
 fs.writeFileSync(path.join(root,'package.json'),'{}');assert.equal(qualifiedRootNodeHarnessSources(root,{},[]).size,0);
}));

test('import-time effects, generated crash/historical child bytes, fixture root and new exports revoke cached harness purpose',()=>{
 for(const [source,before,after]of [
  ['scripts/tests/docs-parity-status.test.mjs','process.exit(86)','process.exit(0)'],
  ['scripts/tests/docs-parity-transition.test.mjs','fixture parity: PASS','fixture parity: NOT PASS'],
  ['scripts/tests/docs-parity-extract.test.mjs',"os.tmpdir()","process.cwd()"],
  ['scripts/tests/docs-tree-boundary.test.mjs','assert(record.executableConsumers.includes(consumer)','assert(!record.executableConsumers.includes(consumer)'],
  ['scripts/docs-tree-boundary.mjs',"'61cda6e05a7e12b28a8d16adb0a3de5b439418645a738b3e0a284522df68ef74'","'"+'0'.repeat(64)+"'"],
  ['scripts/docs-parity-batches.mjs',null,"\nprocess.stdout.write(process.env.EXTERNAL_BODY);\n"],
  ['scripts/tests/docs-publication-links.test.mjs',null,"\nexport function publish(){console.log(JSON.stringify({apiVersion:'v1',kind:'Secret'}));}\n"]
 ])harnessFixture(({root,write})=>{
  assertHarnessSources(qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries));
  let bytes=fs.readFileSync(path.join(root,source),'utf8');
  if(before){assert(bytes.includes(before),'native fixture mutation target missing: '+source);bytes=bytes.replace(before,after);}else bytes+=after;
  write(source,bytes);assert.throws(()=>qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries),/NODE_ENTRY_CUSTODY_UNQUALIFIED|PUBLIC_CONSUMER_UNQUALIFIED/);
 });
});

test('literal generated supervisor child argument/lease and declarative registration/schema authority remain bound',()=>{
 for(const source of ['scripts/tests/repository-review-supervisor-state.test.mjs','skills/nova/plugins/preflight-contract/schemas/config.schema.json'])harnessFixture(({root,write})=>{
  assertHarnessSources(qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries));
  const bytes=fs.readFileSync(path.join(root,source),'utf8');
  write(source,source.endsWith('.json')?JSON.stringify({...JSON.parse(bytes),additionalProperties:true}):bytes.replace('process.argv[1]','process.argv[2]'));
  assert.notEqual(fs.readFileSync(path.join(root,source),'utf8'),bytes);
  assert.throws(()=>qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries),/NODE_ENTRY_CUSTODY_UNQUALIFIED/);
 });
});

test('reviewed refs fixture and copied CLI still reject changed authority with warm and fresh roots',()=>{
 for(const [source,before,after]of [
  ['scripts/tests/docs-check-refs.test.mjs',"const second = git('rev-parse', 'HEAD');",'const second = first;'],
  ['scripts/docs-check-refs.mjs','!declared.includes(revision)','false'],
  ['scripts/docs-check-refs.mjs',"from 'node:fs'","from 'node:fs/promises'"],
  ['scripts/docs-check-refs.mjs','const errors = [];',"const errors = ['unreviewed'];"],
  ['scripts/lib/docs-upstream-reference.mjs',null,'\nprocess.stdout.write(process.argv[2]);\n'],
 ])for(const mode of ['warm','fresh'])harnessFixture(({root,write})=>{
  if(mode==='warm')assertHarnessSources(qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries));
  const original=fs.readFileSync(path.join(root,source),'utf8');
  if(before)assert(original.includes(before),'reviewed mutation target missing: '+source);
  const changed=before?original.replace(before,after):original+after;
  assert.notEqual(changed,original);
  write(source,changed);
  assert.throws(()=>qualifiedRootNodeHarnessSources(root,activeDefinition,allHarnessEntries),/NODE_ENTRY_CUSTODY_UNQUALIFIED/);
 });
});

function globFixture(run){fixture(context=>{context.write('package.json',JSON.stringify({scripts:Object.fromEntries(reviewedRootNodeEntryRecipes.wildcards.map(recipe=>[recipe.script,recipe.command]))}));for(const recipe of reviewedRootNodeEntryRecipes.wildcards)for(const item of recipe.selectedSources)context.write(item.source,'export {};\n');run(context);});}
function globArgs(recipe){return {name:recipe.script,command:recipe.command,word:{value:recipe.pattern,raw:recipe.pattern},nativeTest:true};}
test('bounded4 native POSIX package globs acquire every142 source and no harness roles',()=>globFixture(({root})=>{
 const admitted=[];
 for(const recipe of reviewedRootNodeEntryRecipes.wildcards){const actual=expandReviewedNodePackageGlob(root,globArgs(recipe));assert.deepEqual(actual,[...recipe.selectedSources.map(x=>x.source)].sort());admitted.push(...actual);}
 assert.equal(admitted.length,142);assert.equal(new Set(admitted).size,142);assert(admitted.every(source=>!reviewedRootNodeEntryRecipes.entries[source]));
}));

test('glob quoted/custom/dynamic callers and added/renamed/removed/aliased sources fail before acceptance',()=>{
 const recipe=reviewedRootNodeEntryRecipes.wildcards[0];
 globFixture(({root,write})=>{
  const args=globArgs(recipe);assert.throws(()=>expandReviewedNodePackageGlob(root,{...args,word:{value:recipe.pattern,raw:"'"+recipe.pattern+"'"}}),/unknown\/quoted\/dynamic/);
  assert.throws(()=>expandReviewedNodePackageGlob(root,{...args,name:'run:other'}),/unknown\/quoted\/dynamic/);
  assert.throws(()=>expandReviewedNodePackageGlob(root,{...args,command:'cd elsewhere && '+recipe.command}),/unknown\/quoted\/dynamic/);
  write('.npmrc','script-shell=/bin/bash\n');assert.throws(()=>expandReviewedNodePackageGlob(root,args),/script-shell authority/);fs.rmSync(path.join(root,'.npmrc'));
  write('.npmrc','node-options=--import=./unreviewed.mjs\n');assert.throws(()=>expandReviewedNodePackageGlob(root,args),/node-options authority/);fs.rmSync(path.join(root,'.npmrc'));
  write('node_modules/.bin/node',emit);assert.throws(()=>expandReviewedNodePackageGlob(root,args),/local Node executable override/);fs.rmSync(path.join(root,'node_modules/.bin/node'));
  const oldOptions=process.env.NODE_OPTIONS;try{process.env.NODE_OPTIONS='--import=./unreviewed.mjs';assert.throws(()=>expandReviewedNodePackageGlob(root,args),/NODE_OPTIONS acquisition/);}finally{if(oldOptions===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=oldOptions;}
  write(path.posix.dirname(recipe.pattern)+'/new-unknown.test.mts',emit);assert.throws(()=>expandReviewedNodePackageGlob(root,args),/selected source-set changed/);
 });
 for(const mode of ['remove','rename','alias'])globFixture(({root})=>{const args=globArgs(recipe),source=recipe.selectedSources[0].source,file=path.join(root,source);if(mode==='alias'){fs.rmSync(file);fs.symlinkSync(path.join(root,recipe.selectedSources[1].source),file);}else if(mode==='remove')fs.rmSync(file);else fs.renameSync(file,file.replace('.test.mts','-renamed.test.mts'));assert.throws(()=>expandReviewedNodePackageGlob(root,args),/source-set changed|canonical regular source/);});
});

test('a known wildcard-selected test is an ordinary native API producer, not a fixture-purpose exclusion',()=>globFixture(({root,write})=>{
 const recipe=reviewedRootNodeEntryRecipes.wildcards.find(x=>x.pattern.endsWith('.test.mjs')&&x.script==='verify:reliability');
 const source=recipe.selectedSources[0].source;write(source,emit);
 // Complete the other actual direct Node argv in this exact package command.
 for(const file of recipe.command.matchAll(/\bnode (tests\/[^\s]+)/gu))write(file[1],'export {};\n');
 write('package.json',JSON.stringify({scripts:{[recipe.script]:recipe.command}}));
 const native=spawnSync(process.execPath,[path.join(root,source)],{encoding:'utf8'});assert.equal(native.status,0,native.stderr);assert.equal(JSON.parse(native.stdout).kind,'Secret');
 const outputs=discoverScriptApiOutputs(root);assert(outputs.some(output=>output.context.path===source&&output.value.kind==='Secret'));
 write(source,"import test from 'node:test';test('native publisher',()=>{"+emit+"});\n");
 const childEnvironment={...process.env};delete childEnvironment.NODE_TEST_CONTEXT;
 const nativeTest=spawnSync(process.execPath,['--test',path.join(root,source)],{encoding:'utf8',env:childEnvironment});assert.equal(nativeTest.status,0,nativeTest.stderr);assert.match(nativeTest.stdout,/\"kind\":\"Secret\"/);
 assert(discoverScriptApiOutputs(root).some(output=>output.context.path===source&&output.value.kind==='Secret'));
 write(source,'process.stdout.write(process.argv[2]);');assert.throws(()=>discoverScriptApiOutputs(root),new RegExp('OUTPUT_ROLE_UNQUALIFIED.*'+source.replaceAll('.','\\.')));
}));
