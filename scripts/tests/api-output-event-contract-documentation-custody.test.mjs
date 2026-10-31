import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import {discoverScriptInputGraph} from '../docs-api-output-discovery.mjs';
import {classifySerializedOutputRoles,deriveNativeOperationFacts,nativeOperationFactDigest} from '../docs-api-output-role-classification.mjs';
import {shellNativeNodeEntries} from '../docs-shell-source-custody.mjs';
import {expandReviewedNodePackageGlob} from '../docs-api-documentation-role-custody.mjs';
import {replaceEventReference} from '../lib/docs-event-reference.mjs';
const root=path.resolve(import.meta.dirname,'../..'),modulePath='scripts/docs-api-output-discovery.mjs',source='scripts/docs-event-contracts.mjs';
const code=fs.readFileSync(path.join(root,modulePath),'utf8'),tree=ts.createSourceFile(modulePath,code,ts.ScriptTarget.Latest,true),graph=discoverScriptInputGraph(root),raw=classifySerializedOutputRoles(root,source);
const statement=name=>{const n=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)===name));assert(n,name);return n.getText(tree);};
const declaration=name=>{const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(tree).replace('export function','function');};
function verifier({overrides=new Map(),cwd=root,selectedGraph=graph,rows=raw,nativeFacts=undefined,absent=new Set(),alias=null,hardlink=null}={}){
 const reader={...fs,
  readFileSync:(file,...args)=>overrides.has(String(file))?(args[0]?overrides.get(String(file)).toString(args[0]):overrides.get(String(file))):fs.readFileSync(file,...args),
  existsSync:file=>absent.has(String(file))?false:fs.existsSync(file),
  lstatSync:file=>{if(absent.has(String(file))){const e=new Error('controlled missing');e.code='ENOENT';throw e;}const s=fs.lstatSync(file);return String(file)===hardlink?{...s,nlink:2,isFile:()=>s.isFile(),isDirectory:()=>s.isDirectory(),isSymbolicLink:()=>s.isSymbolicLink()}:s;},
  realpathSync:file=>String(file)===alias?String(file)+'.alias':fs.realpathSync(file)
 };
 const context=vm.createContext({assert,fs:reader,path,process:{cwd:()=>cwd},hash:b=>createHash('sha256').update(b).digest('hex'),deriveNativeOperationFacts:(...args)=>nativeFacts??deriveNativeOperationFacts(...args),nativeOperationFactDigest,shellNativeNodeEntries,expandReviewedNodePackageGlob});
 const declarations=['documentationEntryPoints','eventContractOutputDescriptor','checkedEventContractDocumentationOutputs','selectedEventContractDocumentationOutput'].map(declaration).join('\n');
 vm.runInContext(statement('reviewedEventContractDocumentationOutput')+'\n'+statement('eventContractDocumentationReceipts')+'\n'+declarations+'\nglobalThis.api={acquire:checkedEventContractDocumentationOutputs,slot:selectedEventContractDocumentationOutput};',context);
 context.rawJSON=JSON.stringify(rows);const classify=()=>vm.runInContext('JSON.parse(rawJSON)',context);
 return {acquire:(selectedRoot=root)=>context.api.acquire(selectedRoot,selectedGraph,classify,[source]),slot:(role,receipt,selectedSource=source)=>context.api.slot(selectedSource,role,receipt)};
}
test('exact two documentation targets and distinct writer/failure receipts preserve all raw classifications',()=>{
 const v=verifier(),r=v.acquire();assert.deepEqual(Array.from(r.targets),['docs/generated/inventory/event-contracts.json','docs/site/reference/events.md']);assert.equal(raw.length,4);assert.equal(raw.filter(row=>row.role==='unknown').length,2);
 assert.equal(v.slot(raw[1],r).kind,'two-member-documentation-map-writer');assert.equal(v.slot(raw[3],r).kind,'source-owned-failure-diagnostic');assert.equal(v.slot(raw[0],r),false);assert.equal(v.slot(raw[2],r),false);
 assert(r.slots.every(s=>s.role==='non-api'&&s.runtimeExecutionAuthorized===false&&s.apiApplyAuthorized===false));
 assert.equal(r.qualifiedSourceVectorSatisfaction,'not-observed');assert.equal(r.currentEventSemanticClosureGranted,false);assert.equal(r.defaultMayPartiallyWrite,true);assert.equal(r.checkModeNeverWrites,true);
 assert.throws(()=>v.slot(raw[1],{...r}),/unacquired/);assert.equal(v.slot(raw[1],r,'scripts/arbitrary.mjs'),false);
});
test('original fixed inventory creation is permitted but physical aliases and hardlinks refuse',()=>{
 const target=path.join(root,'docs/generated/inventory/event-contracts.json'),absent=new Set([target,path.dirname(target),path.dirname(path.dirname(target))]);assert.equal(verifier({absent}).acquire().targets.length,2);
 assert.throws(()=>verifier({alias:target}).acquire(),/alias\/symlink/);assert.throws(()=>verifier({hardlink:target}).acquire(),/physical target/);
});
test('added missing reordered renamed traversal callback and outside maps plus source guard relaxation cannot borrow purpose',()=>{
 const before=fs.readFileSync(path.join(root,source),'utf8'),mutations=[
  s=>s.replace('[inventoryPath, JSON.stringify(inventory, null, 2)',"['outside.yaml', JSON.stringify(inventory, null, 2)"),
  s=>s.replace('const outputs = new Map([','const outputs = arbitraryCallback(new Map(['),
  s=>s.replace("const inventoryPath = 'docs/generated/inventory/event-contracts.json';","const inventoryPath = '../../outside.yaml';"),
  s=>s.replace('if (!check) for (const [file, content] of outputs)','if (check) for (const [file, content] of outputs)'),
  s=>s.replace('bindings.qualifiedSourceVectorSha256 !== census.sourceSetSha256','false'),
  s=>s.replace('[inventoryPath, JSON.stringify(inventory, null, 2) + \'\\n\'],',''),
  s=>s.replace('const outputs = new Map([',"const outputs = new Map([['docs/site/reference/extra.md','extra'],"),
  s=>s.replace('for (const [file, content] of outputs)','for (const [file, content] of [...outputs].reverse())')
 ];
 for(const mutate of mutations){const after=mutate(before);assert.notEqual(after,before);assert.throws(()=>verifier({overrides:new Map([[path.join(root,source),Buffer.from(after)]])}).acquire(),/fixed source\/input/);}
});
test('helper binding page and raw descriptor changes refuse without a census or source-vector update',()=>{
 for(const p of ['scripts/lib/docs-event-contracts.mjs','scripts/lib/docs-event-reference-collector.mjs','scripts/lib/docs-event-reference.mjs','docs/config/event-reference-bindings.json','docs/site/reference/events.md']){
  const b=fs.readFileSync(path.join(root,p));assert.throws(()=>verifier({overrides:new Map([[path.join(root,p),Buffer.concat([b,Buffer.from('\nUNREVIEWED')])]])}).acquire(),/fixed source\/input/);
 }
 const facts=structuredClone(deriveNativeOperationFacts(root,source,raw.filter(r=>r.role==='unknown').map(r=>({expression:r.expression}))));assert(facts.length);facts[0].sha256='0'.repeat(64);assert.throws(()=>verifier({nativeFacts:facts}).acquire(),/complete native facts/);
 for(const rows of [raw.slice(1),[...raw,raw[0]],[...raw].reverse(),raw.map((r,i)=>i===1?{...r,role:'non-api'}:r),raw.map((r,i)=>i===3?{...r,expression:'arbitraryError'}:r)])assert.throws(()=>verifier({rows}).acquire(),/four-slot raw vector/);
});
test('canonical native root/cwd three package commands compound drift and caller edges stay closed',()=>{
 assert.throws(()=>verifier().acquire('/tmp'),/canonical root\/cwd/);assert.throws(()=>verifier({cwd:'/tmp'}).acquire(),/canonical root\/cwd/);
 const p=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(p));
 for(const mutate of [d=>d.scripts['docs:events:generate']+=' --extra',d=>d.scripts['docs:drift:event:check']='node scripts/docs-event-contracts.mjs --check',d=>d.scripts['run:unreviewed']='node scripts/docs-event-contracts.mjs']){
  const d=structuredClone(pkg);mutate(d);assert.throws(()=>verifier({overrides:new Map([[p,Buffer.from(JSON.stringify(d))]])}).acquire(),/fixed source\/input/);
 }
 const publicAlias=structuredClone(graph);publicAlias.publicEntries.push({path:'scripts/alias.mjs',canonicalSource:source});assert.throws(()=>verifier({selectedGraph:publicAlias}).acquire(),/canonical public entry/);
 const imported=structuredClone(graph);imported.edges.push({source:'scripts/arbitrary.mjs',target:source,kind:'import',operation:'import event'});assert.throws(()=>verifier({selectedGraph:imported}).acquire(),/incoming import\/callback/);
});
const generatorCode=fs.readFileSync(path.join(root,source),'utf8'),generatorTree=ts.createSourceFile(source,generatorCode,ts.ScriptTarget.Latest,true);
const program=generatorTree.statements.filter(n=>!ts.isImportDeclaration(n)&&!(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['root','args'].includes(d.name.getText(generatorTree))))).map(n=>n.getText(generatorTree)).join('\n');
function mode({args=[],stale=false,sourceMismatch=false,secondWriteFailure=false}={}){
 const inventory={schemaVersion:'controlled-event-documentation',families:[{sample:'apiVersion: v1\nkind: Secret\n'}]},generated='<!-- BEGIN GENERATED EVENT CONTRACT REFERENCE -->\napiVersion: v1\nkind: Secret\n<!-- END GENERATED EVENT CONTRACT REFERENCE -->\n';
 const page=replaceEventReference('Operator introduction\n\nExisting page body\n',generated),expectedInventory=JSON.stringify(inventory,null,2)+'\n',writes=new Map(),attempts=[],mkdir=[],stdout=[],stderr=[];let censusCalls=0,bindingCalls=0;
 const binding='a'.repeat(64),state={exitCode:0,stdout:{write:s=>stdout.push(s)},stderr:{write:s=>stderr.push(s)}};
 const fakeFs={existsSync:()=>true,readFileSync:(file)=>{
  if(file.endsWith('event-reference-bindings.json'))return JSON.stringify({qualifiedSourceVectorSha256:binding});
  if(file.endsWith('event-contracts.json'))return stale?'stale inventory':expectedInventory;
  if(file.endsWith('events.md'))return page;
  throw Error('unreviewed read '+file);
 },mkdirSync:file=>mkdir.push(file),writeFileSync:(file,body)=>{attempts.push(file);if(secondWriteFailure&&attempts.length===2)throw new Error('controlled second-write failure: apiVersion: v1');writes.set(file,body);}};
 const context=vm.createContext({root,path,args,process:state,fs:fakeFs,collectEventSourceVector:()=>{censusCalls++;return {sourceSetSha256:sourceMismatch?'b'.repeat(64):binding,sources:[{path:'controlled'}]};},collectBoundEventReference:()=>{bindingCalls++;return inventory;},renderEventReference:()=>generated,replaceEventReference});
 vm.runInContext(program,context);
 return {exitCode:state.exitCode,writes,attempts,mkdir,stdout,stderr,censusCalls,bindingCalls,page,expectedInventory};
}
test('actual sealed mode program uses fake inputs only: invalid argv/check/default/source guard and partial failure boundaries',()=>{
 for(const args of [['--extra'],['--check','--check']]){const r=mode({args});assert.equal(r.exitCode,2);assert.equal(r.censusCalls,0);assert.equal(r.writes.size,0);assert.equal(r.mkdir.length,0);}
 const check=mode({args:['--check']});assert.equal(check.exitCode,0);assert.equal(check.writes.size,0);assert.equal(check.mkdir.length,0);
 const drift=mode({args:['--check'],stale:true});assert.equal(drift.exitCode,1);assert(drift.stderr[0].includes('DOC_DRIFT_EVENT_CONTRACT'));assert.equal(drift.writes.size,0);assert.equal(drift.mkdir.length,0);
 const mismatch=mode({sourceMismatch:true});assert.equal(mismatch.exitCode,1);assert(mismatch.stderr[0].includes('EVENT_SOURCE_SEMANTIC_DISPOSITION_REQUIRED'));assert.equal(mismatch.bindingCalls,0);assert.equal(mismatch.writes.size,0);assert.equal(mismatch.mkdir.length,0);
 const generated=mode();assert.equal(generated.exitCode,0);assert.deepEqual(generated.attempts,[path.join(root,'docs/generated/inventory/event-contracts.json'),path.join(root,'docs/site/reference/events.md')]);assert.equal(generated.writes.size,2);
 const partial=mode({secondWriteFailure:true});assert.equal(partial.exitCode,1);assert.equal(partial.attempts.length,2);assert.equal(partial.writes.size,1);assert(partial.writes.has(path.join(root,'docs/generated/inventory/event-contracts.json')));assert(partial.stderr[0].includes('controlled second-write failure'));
 // API-looking samples stay in the two documentation files / diagnostic stream.
 assert(generated.writes.get(path.join(root,'docs/site/reference/events.md')).includes('kind: Secret'));assert.equal(generated.stdout.length,1);assert.equal(partial.stdout.length,0);
});
