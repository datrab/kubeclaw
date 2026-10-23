import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSerializedOutputRoleClassifier} from '../docs-api-output-role-classification.mjs';
const repository=fileURLToPath(new URL('../..',import.meta.url));
const source='skills/buster/engine/test-gates/exposure-generation.ts';
const original=fs.readFileSync(path.join(repository,source),'utf8');
const baseline=createSerializedOutputRoleClassifier(repository,[source])(source);
const dependencies=baseline.flatMap(role=>role.dependencies);
function candidate(transform,run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pr13-exposure-role-'));
 try{
  for(const file of new Set([source,...dependencies])){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repository,file),target);}
  for(const file of new Set(dependencies.filter(file=>file.endsWith('/package.json')))){
   const pkg=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
   const target=path.join(root,'node_modules',pkg.name);
   fs.mkdirSync(path.dirname(target),{recursive:true});
   fs.symlinkSync(path.join(root,path.dirname(file)),target,'dir');
  }
  fs.writeFileSync(path.join(root,source),transform(original));
  const classify=createSerializedOutputRoleClassifier(root,[source]);
  run(classify(source),{root,classify});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
const selected=roles=>roles.find(role=>role.line===36&&role.sink==='return');
test('original runtime-guarded predecessor array has only the selected codec role',()=>{
 assert.equal(selected(baseline).basis,'Source-owned-bounded-guarded-exposure-predecessor-string-array-codec');
 candidate(text=>text,roles=>assert.equal(selected(roles).role,'non-api'));
});
for(const [name,transform] of [
 ['remove runtime owner guard',text=>text.replace("typeof owner !== 'string'",'false')],
 ['remove runtime array guard',text=>text.replace('!Array.isArray(previous)','false')],
 ['allow object members',text=>text.replace("typeof item !== 'string'",'false')],
 ['replace guarded union with API object',text=>text.replace('const lineage = [...new Set([...(completed ? [] : previous as string[]), owner])];',"const lineage = {apiVersion:'v1',kind:'Secret'};")],
 ['inject API object after union',text=>text.replace("if (lineage.length > 64)","lineage.push({apiVersion:'v1',kind:'Secret'} as any); if (lineage.length > 64)")],
 ['replace native Set',text=>text.replace('new Set([','new ReplacedSet([')],
])test(name+' cannot inherit the sealed Source role',()=>candidate(transform,roles=>{
 const result=roles.find(role=>role.sink==='return'&&role.line>=36&&role.line<40);
 assert.equal(result.role,'unknown');
}));

test('warm classifier revokes codec role after guarded source becomes API-bearing',()=>candidate(text=>text,(roles,{root,classify})=>{
 assert.equal(selected(roles).role,'non-api');
 fs.writeFileSync(path.join(root,source),original.replace('const lineage = [...new Set([...(completed ? [] : previous as string[]), owner])];',"const lineage = {apiVersion:'v1',kind:'Secret'};"));
 assert.equal(selected(classify(source)).role,'unknown');
 fs.writeFileSync(path.join(root,source),original);
 assert.equal(selected(classify(source)).basis,'Source-owned-bounded-guarded-exposure-predecessor-string-array-codec');
}));
