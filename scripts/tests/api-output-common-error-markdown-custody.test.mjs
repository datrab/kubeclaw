import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import {discoverScriptInputGraph} from '../docs-api-output-discovery.mjs';
import {shellNativeNodeEntries} from '../docs-shell-source-custody.mjs';
import {expandReviewedNodePackageGlob} from '../docs-api-documentation-role-custody.mjs';
import {classifySerializedOutputRoles,deriveNativeOperationFacts,nativeOperationFactDigest} from '../docs-api-output-role-classification.mjs';
const root=path.resolve(import.meta.dirname,'../..'),modulePath='scripts/docs-api-output-discovery.mjs',source='scripts/docs-common-error-catalogue.mjs',helper='scripts/lib/docs-catalogue-input-surface.mjs';
const code=fs.readFileSync(path.join(root,modulePath),'utf8'),tree=ts.createSourceFile(modulePath,code,ts.ScriptTarget.Latest,true),graph=discoverScriptInputGraph(root);
const statement=(tree,name)=>{const n=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)===name));assert(n,name);return n.getText(tree);};
const declaration=(tree,name)=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(tree).replace('export function','function');};
const helperTree=ts.createSourceFile(helper,fs.readFileSync(path.join(root,helper),'utf8'),ts.ScriptTarget.Latest,true);
const raw=classifySerializedOutputRoles(root,source),manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/config/common-error-input-surface.json'))),firstInput=Object.keys(manifest.files)[0];
function verifier({overrides=new Map(),cwd=root,selectedGraph=graph,missingTarget=null,aliasTarget=null,missingInput=null,addedInput=null}={}){
 const readFileSync=(file,...args)=>{
  const s=String(file);if(addedInput&&s===path.join(root,addedInput))return args[0]?'unreviewed':'unreviewed';
  const value=overrides.get(s);return value!==undefined?(args[0]?value.toString(args[0]):value):fs.readFileSync(file,...args);
 };
 const reader={...fs,readFileSync,
  existsSync:file=>String(file)===missingTarget?false:fs.existsSync(file),
  realpathSync:file=>String(file)===aliasTarget?String(file)+'.alias':fs.realpathSync(file),
  readdirSync:(file,options)=>{let entries=fs.readdirSync(file,options);if(missingInput&&String(file)===path.dirname(path.join(root,missingInput)))entries=entries.filter(e=>e.name!==path.basename(missingInput));if(addedInput&&String(file)===path.dirname(path.join(root,addedInput)))entries=[...entries,{name:path.basename(addedInput),isDirectory:()=>false,isSymbolicLink:()=>false,isFile:()=>true}];return entries;}
 };
 const context=vm.createContext({assert,fs:reader,path,process:{cwd:()=>cwd},createHash,hash:b=>createHash('sha256').update(b).digest('hex'),deriveNativeOperationFacts,nativeOperationFactDigest,shellNativeNodeEntries,expandReviewedNodePackageGlob});
 const src=statement(tree,'reviewedCommonErrorMarkdownOutput')+'\n'+statement(tree,'commonErrorMarkdownReceipts')+'\n'+statement(helperTree,'catalogueInputPolicy').replace('export const','const')+'\n'+['catalogueInputSurface','checkCatalogueInputSurface'].map(n=>declaration(helperTree,n)).join('\n')+'\n'+['documentationEntryPoints','commonErrorOutputDescriptor','checkedCommonErrorMarkdownOutput','selectedCommonErrorMarkdownOutput'].map(n=>declaration(tree,n)).join('\n');
 vm.runInContext(src+'\nglobalThis.api={acquire:checkedCommonErrorMarkdownOutput,slot:selectedCommonErrorMarkdownOutput};',context);
 // Native raw descriptor JSON crosses realms without changing the production rows.
 context.rawJSON=JSON.stringify(raw);
 const classify=()=>vm.runInContext('JSON.parse(rawJSON)',context);
 return {acquire:(selectedRoot=root)=>context.api.acquire(selectedRoot,selectedGraph,classify,[source]),slot:(role,receipt,selectedSource=source)=>context.api.slot(selectedSource,role,receipt)};
}
test('only the exact existing seven Markdown receivers acquire a private non-api purpose while raw role stays UNKNOWN',()=>{
 const v=verifier(),r=v.acquire();assert.equal(r.outputs.length,7);assert.equal(r.role,'non-api');assert.equal(r.defaultGenerationIsWriter,true);assert.equal(r.runtimeExecutionAuthorized,false);assert.equal(r.apiApplyAuthorized,false);assert.equal(raw[0].role,'unknown');assert(v.slot(raw[0],r));assert.equal(v.slot(raw[1],r),false);assert.throws(()=>v.slot(raw[0],{...r}),/unacquired/);assert.equal(v.slot(raw[0],r,'scripts/arbitrary.mjs'),false);
});
test('source loop sink content branch and helper changes cannot borrow the exact renderer profile',()=>{
 const cases=[
  [source,s=>s.replace('fs.writeFileSync(path.join(root, name), content)','fs.writeFileSync(path.join(root, name), arbitrary)')],
  [source,s=>s.replace('if (check) { if','if (!check) { if')],
  [source,s=>s.replace('for (const [name, content] of outputs)','for (const [name, content] of arbitraryMap)')],
  [source,s=>s+'\nfs.writeFileSync("arbitrary.yaml","apiVersion: v1");\n'],
  [helper,s=>s.replace('return actual;','return {};')]
 ];
 for(const [p,mutate]of cases){const old=fs.readFileSync(path.join(root,p),'utf8'),next=mutate(old);assert.notEqual(next,old);assert.throws(()=>verifier({overrides:new Map([[path.join(root,p),Buffer.from(next)]])}).acquire(),/fixed source\/data/);}
});
test('catalogue and section map added missing reordered renamed traversal data plus manifest changes refuse',()=>{
 const dataPath='docs/config/common-error-catalogue.json',data=JSON.parse(fs.readFileSync(path.join(root,dataPath)));
 for(const mutate of [d=>d.sections.push({id:'unreviewed'}),d=>d.sections.pop(),d=>d.sections.reverse(),d=>d.sections[0].id='renamed',d=>d.sections[0].id='../../arbitrary']){
  const d=structuredClone(data);mutate(d);assert.throws(()=>verifier({overrides:new Map([[path.join(root,dataPath),Buffer.from(JSON.stringify(d))]])}).acquire(),/fixed source\/data/);
 }
 const p='docs/config/common-error-input-surface.json';assert.throws(()=>verifier({overrides:new Map([[path.join(root,p),Buffer.from('{}')]])}).acquire(),/fixed source\/data/);
 const target=path.join(root,'docs/site/reference/common-errors.md');assert.throws(()=>verifier({missingTarget:target}).acquire(),/physical path/);assert.throws(()=>verifier({aliasTarget:target}).acquire(),/physical path/);
});
test('existing complete source-surface guard rejects changed removed and newly selected production members',()=>{
 const file=path.join(root,firstInput),before=fs.readFileSync(file);assert.throws(()=>verifier({overrides:new Map([[file,Buffer.concat([before,Buffer.from('\nUNREVIEWED')])]])}).acquire(),/CATALOGUE_INPUT_SURFACE_DRIFT:changed/);
 assert.throws(()=>verifier({missingInput:firstInput}).acquire(),/CATALOGUE_INPUT_SURFACE_DRIFT:removed/);
 const addedInput=path.posix.join(path.posix.dirname(firstInput),'ref003-unreviewed.json');assert(!fs.existsSync(path.join(root,addedInput)));assert.throws(()=>verifier({addedInput}).acquire(),/CATALOGUE_INPUT_SURFACE_DRIFT:added/);
});
test('root cwd package extra argv public entry and imported callback stay closed',()=>{
 assert.throws(()=>verifier().acquire('/tmp'),/canonical root\/cwd/);assert.throws(()=>verifier({cwd:'/tmp'}).acquire(),/canonical root\/cwd/);
 const p='package.json',pkg=JSON.parse(fs.readFileSync(path.join(root,p)));
 for(const mutate of [d=>d.scripts['docs:errors:generate']+=' --extra',d=>d.scripts['run:foreign']='node scripts/docs-common-error-catalogue.mjs',d=>d.scripts['docs:errors:check']='node scripts/other.mjs']){
  const d=structuredClone(pkg);mutate(d);assert.throws(()=>verifier({overrides:new Map([[path.join(root,p),Buffer.from(JSON.stringify(d))]])}).acquire(),/fixed source\/data/);
 }
 const imported=structuredClone(graph);imported.edges.push({source:'scripts/arbitrary.mjs',target:source,kind:'import',operation:'import catalogue'});assert.throws(()=>verifier({selectedGraph:imported}).acquire(),/imported\/callback/);
 const publicEntry=structuredClone(graph);publicEntry.publicEntries.push({path:'scripts/arbitrary-alias.mjs',canonicalSource:source});assert.throws(()=>verifier({selectedGraph:publicEntry}).acquire(),/public writer alias/);
});
test('actual sealed Map-loop check compares without writes and default keeps API-looking samples only in Markdown files',()=>{
 const b=fs.readFileSync(path.join(root,source),'utf8'),t=ts.createSourceFile(source,b,ts.ScriptTarget.Latest,true),loop=t.statements.find(n=>ts.isForOfStatement(n)&&n.expression.getText(t)==='outputs');assert(loop);
 const paths=Array.from(verifier().acquire().outputs),payload='API sample only:\napiVersion: v1\nkind: Secret\n',outputs=new Map(paths.map(p=>[p,payload]));
 function branch(check,drift=false){const writes=[],context=vm.createContext({root,path,outputs,check,read:()=>Buffer.from(drift?'changed':payload),fs:{existsSync:()=>true,writeFileSync:(p,text)=>writes.push({path:p,text})}});vm.runInContext(loop.getText(t),context);return writes;}
 assert.equal(branch(true).length,0);assert.throws(()=>branch(true,true),/CATALOGUE_OUTPUT_DRIFT/);const writes=branch(false);assert.equal(writes.length,7);assert(writes.every(w=>w.path.startsWith(path.join(root,'docs/site/reference/common-errors'))&&w.path.endsWith('.md')&&w.text===payload));
});
