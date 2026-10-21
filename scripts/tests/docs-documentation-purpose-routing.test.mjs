import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {discoverScriptApiOutputs,producerAdapterOperationRecipe} from '../docs-api-output-discovery.mjs';
import {documentationExecutableRoleRecipes,assertDocumentationExecutableRole} from '../docs-api-documentation-role-custody.mjs';

const repository=path.resolve(import.meta.dirname,'../..');
const source='scripts/check-fixture-registration-drift.mjs';
const authority='scripts/docs-api-producer-adapter-authorities.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'docs-finite-purpose-'));
 const write=(relative,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),bytes);};
 const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
 const update=change=>{const registry=JSON.parse(read(authority));change(registry);write(authority,JSON.stringify(registry));};
 try{
  const recipe=documentationExecutableRoleRecipes[source];
  for(const relative of [source,...recipe.purposeInputs.map(input=>input.path),...recipe.authorityInputs.map(input=>input.path)])write(relative,fs.readFileSync(path.join(repository,relative)));
  const command=`node ${source}`,name='docs:drift:plugin-registration:fixture:check';
  write('package.json',JSON.stringify({scripts:{[name]:command}}));
  const record={kind:'reviewed-documentation-consumer/v1',source,sha256:sha(read(source)),operationRecipe:producerAdapterOperationRecipe(source,read(source)),graphEdges:[],documentationEntries:[{name,command,source}],dynamicGraphOperations:[],unresolvedModuleOperations:[]};
  write(authority,JSON.stringify({documentationToolBoundary:{sources:[source],qualifications:[record]}}));
  run({root,write,read,update,discover:()=>discoverScriptApiOutputs(root)});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('genuine exact read-only fixture-policy comparator is documentation purpose, not execution evidence',()=>fixture(({discover})=>{
 assert.deepEqual(discover(),[]);
 assert.deepEqual(discover(),[]);
}));

test('mutable source/operation digest refresh cannot authorize new API emission',()=>fixture(({discover,write,read,update})=>{
 assert.deepEqual(discover(),[]);
 write(source,read(source)+"\nconsole.log(JSON.stringify({apiVersion:'v1',kind:'Secret'}));\n");
 update(registry=>{const record=registry.documentationToolBoundary.qualifications[0];record.sha256=sha(read(source));record.operationRecipe=producerAdapterOperationRecipe(source,read(source));});
 assert.throws(discover,/DOCUMENTATION_TOOL_PURPOSE_SOURCE_DRIFT/);
}));

test('changed primary purpose-input bytes invalidate warm role and qualification caches',()=>fixture(({discover,root,write,read})=>{
 assert.deepEqual(discover(),[]);
 const input=documentationExecutableRoleRecipes[source].purposeInputs[0].path;
 write(input,read(input)+'\n// changed primary input\n');
 assert.throws(()=>assertDocumentationExecutableRole(root,source),/DOCUMENTATION_TOOL_PURPOSE_INPUT_DRIFT/);
 assert.throws(discover,/DOCUMENTATION_TOOL_PURPOSE_INPUT_DRIFT/);
}));

test('deleting a new-kind qualification cannot silently preserve the excluded role',()=>fixture(({discover,update})=>{
 assert.deepEqual(discover(),[]);
 update(registry=>{registry.documentationToolBoundary.qualifications=[];});
 assert.throws(discover,/DOCUMENTATION_TOOL_QUALIFICATION_MISSING/);
}));

test('a new public invocation cannot borrow the documentation entry qualification',()=>fixture(({discover,write,read})=>{
 assert.deepEqual(discover(),[]);
 const pkg=JSON.parse(read('package.json'));pkg.scripts['serve:fixture-policy']=`node ${source}`;write('package.json',JSON.stringify(pkg));
 assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
}));

test('a new selected importer is rejected even if its source name looks like documentation',()=>fixture(({discover,write})=>{
 assert.deepEqual(discover(),[]);
 write('scripts/docs-unreviewed-consumer.mjs',"import './check-fixture-registration-drift.mjs';\n");
 assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED|DOCUMENTATION_TOOL_QUALIFICATION_GRAPH_DRIFT/);
}));

test('an unreviewed alias/public target cannot enter through a warm qualification',()=>fixture(({discover,root,write})=>{
 assert.deepEqual(discover(),[]);
 fs.mkdirSync(path.join(root,'tools'),{recursive:true});fs.symlinkSync('../'+source,path.join(root,'tools','alias.mjs'));
 write('package.json',JSON.stringify({scripts:{'docs:drift:plugin-registration:fixture:check':`node ${source}`},bin:{fixture:'tools/alias.mjs'}}));
 assert.throws(discover,/DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED/);
}));

test('a neighboring API producer remains an API producer, never a docs-prefix exception',()=>fixture(({discover,write,read,update})=>{
 assert.deepEqual(discover(),[]);
 const neighbor='scripts/docs-unreviewed-resource.mjs';
 write(neighbor,"const body={apiVersion:'v1',kind:'Secret',metadata:{name:'purpose-neighbor'}};console.log(JSON.stringify(body));\n");
 assert.equal(discover().some(output=>output.value?.kind==='Secret'),true);
 update(registry=>{registry.documentationToolBoundary.sources.push(neighbor);});
 assert.equal(discover().some(output=>output.value?.kind==='Secret'),true);
 const pkg=JSON.parse(read('package.json'));pkg.scripts['docs:unreviewed-resource']=`node ${neighbor}`;write('package.json',JSON.stringify(pkg));
 assert.throws(discover,/DOCUMENTATION_TOOL_OUTPUT_ROLE_UNQUALIFIED/);
}));
