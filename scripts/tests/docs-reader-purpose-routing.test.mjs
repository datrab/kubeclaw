import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {discoverScriptApiOutputs,producerAdapterOperationRecipe} from '../docs-api-output-discovery.mjs';
import {assertDocumentationExecutableRole,documentationExecutableRoleRecipes} from '../docs-api-documentation-role-custody.mjs';
const repository=path.resolve(import.meta.dirname,'../..');
const source='scripts/docs-reader/serve.mjs',authority='scripts/docs-api-producer-adapter-authorities.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-reader-purpose-'));
 const write=(relative,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),bytes);};
 const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
 const update=change=>{const registry=JSON.parse(read(authority));change(registry);write(authority,JSON.stringify(registry));};
 try{
  for(const relative of [source,...documentationExecutableRoleRecipes[source].purposeInputs.map(input=>input.path)])write(relative,fs.readFileSync(path.join(repository,relative)));
  write('package.json','{}');
  write(authority,JSON.stringify({documentationToolBoundary:{sources:[source],purposeRoutes:[{kind:'manual-reader-preview-with-external-ci-fixtures/v1',source,sha256:sha(read(source)),operationRecipe:producerAdapterOperationRecipe(source,read(source)),graphEdges:[],documentationEntries:[],dynamicGraphOperations:[],unresolvedModuleOperations:[]}]}}));
  return run({root,write,read,update,discover:()=>discoverScriptApiOutputs(root)});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('actual finite preview role and discovery work cold and warm without invented package entries',()=>fixture(({root,read,discover})=>{
 assert.equal(assertDocumentationExecutableRole(root,source),undefined);assert.deepEqual(discover(),[]);assert.deepEqual(discover(),[]);
 assert.deepEqual(JSON.parse(read('package.json')),{});
 const record=JSON.parse(read(authority)).documentationToolBoundary.purposeRoutes[0];assert.deepEqual(record.documentationEntries,[]);assert.deepEqual(record.graphEdges,[]);
}));
for(const input of ['.github/workflows/docs-checks.yaml','scripts/tests/docs-reader-redirects.test.mjs','scripts/tests/docs-reader-redirects.browser.mjs','docs/site/reference/documentation-site.md']){
 for(const warm of [false,true])test(`${warm?'warm':'cold'} actual external caller/CLI proof substitution rejects: ${input}`,()=>fixture(({root,write,read,discover})=>{
  if(warm)assert.deepEqual(discover(),[]);
  const original=read(input);
  const changed=input.startsWith('.github/')?original.replace('node scripts/tests/docs-reader-redirects.browser.mjs','node scripts/tests/unreviewed-preview.browser.mjs'):input.includes('/tests/')?original.replace("server.listen(0,'127.0.0.1'","server.listen(0,'0.0.0.0'"):original.replace('node scripts/docs-reader/serve.mjs .tmp/docs-publication 4173','node scripts/docs-reader/other-serve.mjs .tmp/docs-publication 4173');
  assert.notEqual(changed,original,'Actual caller mutation anchor missing');write(input,changed);
  assert.throws(()=>assertDocumentationExecutableRole(root,source),/DOCUMENTATION_TOOL_PURPOSE_INPUT_DRIFT/);
  assert.throws(discover,/DOCUMENTATION_TOOL_PURPOSE_INPUT_DRIFT/);
 }));
}
test('source plus mutable registry digest/operation refresh cannot authorize a changed receiver',()=>fixture(({write,read,update,discover})=>{
 assert.deepEqual(discover(),[]);write(source,read(source).replace("response.end(request.method==='HEAD'?undefined:bytes)","response.end(JSON.stringify({apiVersion:'v1',kind:'Secret'}))"));
 update(registry=>{const record=registry.documentationToolBoundary.purposeRoutes[0];record.sha256=sha(read(source));record.operationRecipe=producerAdapterOperationRecipe(source,read(source));});
 assert.throws(discover,/DOCUMENTATION_TOOL_PURPOSE_SOURCE_DRIFT/);
}));
for(const name of ['docs:preview','serve:preview'])test(`new root package invocation rejects, never invented: ${name}`,()=>fixture(({write,discover})=>{
 assert.deepEqual(discover(),[]);write('package.json',JSON.stringify({scripts:{[name]:`node ${source}`}}));
 assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED|DOCUMENTATION_TOOL_QUALIFICATION_GRAPH_DRIFT/);
}));
for(const importer of ['scripts/docs-new-preview-consumer.mjs','scripts/runtime-preview-consumer.mjs'])test(`new selected importer rejects: ${importer}`,()=>fixture(({write,discover})=>{
 assert.deepEqual(discover(),[]);write(importer,"import './docs-reader/serve.mjs';\n");
 assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED|DOCUMENTATION_TOOL_QUALIFICATION_GRAPH_DRIFT/);
}));
test('package bin alias cannot borrow the finite manual/CI route',()=>fixture(({root,write,discover})=>{
 assert.deepEqual(discover(),[]);fs.mkdirSync(path.join(root,'tools'));fs.symlinkSync('../'+source,path.join(root,'tools/preview.mjs'));write('package.json',JSON.stringify({bin:{preview:'tools/preview.mjs'}}));
 assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
}));
test('removing the exact route rejects even after warm cache',()=>fixture(({update,discover})=>{
 assert.deepEqual(discover(),[]);update(registry=>{registry.documentationToolBoundary.purposeRoutes=[];});assert.throws(discover,/DOCUMENTATION_TOOL_PURPOSE_ROUTE_MISSING/);
}));
test('neighbor server is not admitted by name, kind, or mutable registry membership',()=>fixture(({write,read,update,discover})=>{
 assert.deepEqual(discover(),[]);const neighbor='scripts/docs-reader/other-serve.mjs';write(neighbor,read(source));
 update(registry=>{registry.documentationToolBoundary.sources.push(neighbor);registry.documentationToolBoundary.purposeRoutes.push({kind:'manual-reader-preview-with-external-ci-fixtures/v1',source:neighbor,sha256:sha(read(neighbor)),operationRecipe:producerAdapterOperationRecipe(neighbor,read(neighbor)),graphEdges:[],documentationEntries:[],dynamicGraphOperations:[],unresolvedModuleOperations:[]});});
 assert.throws(discover,/DOCUMENTATION_TOOL_OUTPUT_ROLE_UNQUALIFIED|DOCUMENTATION_TOOL_PURPOSE_ROUTE_UNQUALIFIED/);
}));
test('exact redirects recipe accepts actual source purpose with separate docs-reachability qualification still required',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-redirect-purpose-'));
 try{for(const relative of ['scripts/docs-reader/redirects.mjs',...documentationExecutableRoleRecipes['scripts/docs-reader/redirects.mjs'].purposeInputs.map(input=>input.path)]){fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.copyFileSync(path.join(repository,relative),path.join(root,relative));}
 assert.equal(assertDocumentationExecutableRole(root,'scripts/docs-reader/redirects.mjs'),undefined);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 assert.equal(documentationExecutableRoleRecipes['scripts/docs-reader/redirects.mjs'].qualificationKind,'reviewed-documentation-consumer/v1');
 assert.equal(documentationExecutableRoleRecipes['scripts/tests/docs-reader-redirects.test.mjs'],undefined);
 assert.equal(documentationExecutableRoleRecipes['scripts/tests/docs-reader-redirects.browser.mjs'],undefined);
});
for(const mode of ['missing','symlink'])test(`warm external proof must remain physical and present: ${mode}`,()=>fixture(({root,read,write,discover})=>{
 assert.deepEqual(discover(),[]);const input='.github/workflows/docs-checks.yaml',bytes=read(input);fs.unlinkSync(path.join(root,input));
 if(mode==='symlink'){write('retained-ci.yaml',bytes);fs.symlinkSync('../../retained-ci.yaml',path.join(root,input));}
 assert.throws(discover,/DOCUMENTATION_TOOL_PURPOSE_INPUT_DRIFT/);
}));
test('synthetic docs-import fixture exercises ordinary redirects reachability without a new main package command',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-redirect-qualified-'));const source='scripts/docs-reader/redirects.mjs';
 const write=(p,b)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),b);};
 try{
  for(const p of [source,...documentationExecutableRoleRecipes[source].purposeInputs.map(i=>i.path)])write(p,fs.readFileSync(path.join(repository,p)));
  const caller='scripts/docs-synthetic-importer.mjs',name='docs:synthetic-importer',command=`node ${caller}`;
  const operation="import './docs-reader/redirects.mjs';";write(caller,operation+'\n');write('package.json',JSON.stringify({scripts:{[name]:command}}));
  const bytes=fs.readFileSync(path.join(root,source),'utf8');
  write(authority,JSON.stringify({documentationToolBoundary:{sources:[source],qualifications:[{kind:'reviewed-documentation-consumer/v1',source,sha256:sha(bytes),operationRecipe:producerAdapterOperationRecipe(source,bytes),graphEdges:[{source:caller,target:source,kind:'import',operation}],documentationEntries:[{name,command,source:caller}],dynamicGraphOperations:[],unresolvedModuleOperations:[]}]}}));
  assert.deepEqual(discoverScriptApiOutputs(root),[]);assert.deepEqual(discoverScriptApiOutputs(root),[]);
  write('package.json','{}');assert.throws(()=>discoverScriptApiOutputs(root),/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED|DOCUMENTATION_TOOL_QUALIFICATION_GRAPH_DRIFT/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
