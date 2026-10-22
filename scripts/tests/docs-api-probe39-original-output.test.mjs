import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {checkedOriginalProbe39Output, selectedOriginalProbe39Output} from '../docs-api-probe39-original-output.mjs';
import {createSerializedOutputRoleClassifier} from '../docs-api-output-role-classification.mjs';
const repository=path.resolve(import.meta.dirname,'../..');
const source='scripts/render-kubernetes-api-probe.mjs';
const authorityPath='scripts/docs-api-probe39-original-authority.json';
const authority=JSON.parse(fs.readFileSync(path.join(repository,authorityPath)));
const graph={edges:authority.incomingEdges,publicEntries:authority.publicEntries};
const sources=[source];
const original=()=>[{...authority.descriptor}];
async function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'probe39-original-'));const write=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};try{for(const file of [authorityPath,...Object.keys(authority.inputs)])write(file,fs.readFileSync(path.join(repository,file)));await run({root,write,acquire:(g=graph,classify=original)=>checkedOriginalProbe39Output(root,g,classify,sources)});}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('actual canonical UNKNOWN and original ordered capture; no execution or live Pod claim',()=>{
 const classify=createSerializedOutputRoleClassifier(repository,sources),role=classify(source)[0];assert.equal(role.role,'unknown');
 const witness=checkedOriginalProbe39Output(repository,graph,classify,sources);assert.equal(selectedOriginalProbe39Output(source,role,witness),witness);
 assert.equal(role.role,'unknown');assert.equal(witness.outputs.length,2);assert.deepEqual(witness.outputs.map(x=>x.value.kind),['ConfigMap','Job']);
 assert.deepEqual(witness.outputs.map(x=>x.value),authority.observation.parsedValues);
 for(const output of witness.outputs){assert.equal(output.context.line,39);assert.equal(output.context.actualPodObserved,false);assert.equal(output.context.runtimeExecutionAuthorized,false);assert.equal(output.context.apiApplyAuthorized,false);}
 assert.throws(()=>selectedOriginalProbe39Output(source,role,{...witness}),/unacquired receipt/u);
 assert.throws(()=>witness.outputs[0].value.metadata.name='changed',TypeError);
});
test('every pinned source/helper/values/parser input change rejects after warm acquisition',()=>fixture(({root,write,acquire})=>{
 acquire();acquire();for(const file of Object.keys(authority.inputs)){const before=fs.readFileSync(path.join(root,file));write(file,Buffer.concat([before,Buffer.from('\n ')]));assert.throws(()=>acquire(),/changed original source\/input\/parser/u,file);write(file,before);}
}));
test('new callers, alias and loader/package boundary reject warm reuse',()=>fixture(({root,write,acquire})=>{
 acquire();assert.throws(()=>acquire({...graph,edges:[...graph.edges,{source:'scripts/new-computed-caller.mjs',target:source,kind:'import',operation:'import computed'}]}),/caller/u);
 assert.throws(()=>acquire({...graph,publicEntries:[...graph.publicEntries,{path:'scripts/alias.mjs',canonicalSource:source}]}),/public entry/u);
 for(const file of authority.absentBoundaries){write(file,'{}');assert.throws(()=>acquire(),/loader boundary/u);fs.unlinkSync(path.join(root,file));}
}));
test('role promotion, descriptor mutation, missing and extra native slots reject',()=>fixture(({acquire})=>{
 for(const roles of [[],[...original(),{...authority.descriptor,line:40}],[{...authority.descriptor,role:'api-adapted'}],[{...authority.descriptor,expression:'unreviewed()'}]])assert.throws(()=>acquire(graph,()=>roles),/native role\/slot\/descriptor/u);
}));
test('capture, member, UUID, fixture, ordering and extra API cannot mutate the immutable authority',()=>fixture(({root,write,acquire})=>{
 acquire();for(const change of [a=>a.podFixture.metadata.uid='foreign',a=>a.originsFixture.push('https://192.0.2.1'),a=>a.observation.stdout+='---\napiVersion: v1\nkind: Secret\n',a=>a.observation.parsedValues.reverse(),a=>a.observation.parsedValues[0].metadata.name='normalized-uuid',a=>a.observation.parsedValues.push({apiVersion:'v1',kind:'Secret'})]){const changed=structuredClone(authority);change(changed);write(authorityPath,JSON.stringify(changed));assert.throws(()=>acquire(),/immutable original capture/u);write(authorityPath,fs.readFileSync(path.join(repository,authorityPath)));}
}));
test('parser actually loaded by adapter is pinned even for a different supplied fixture root',()=>fixture(async({root})=>{
 const importer=fs.mkdtempSync(path.join(os.tmpdir(),'probe39-private-importer-'));
 try{
  for(const relative of ['scripts/docs-api-probe39-original-output.mjs','node_modules/js-yaml/package.json','node_modules/js-yaml/dist/js-yaml.mjs']){
   const file=path.join(importer,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(repository,relative),file);
  }
  const actual=await import(pathToFileURL(path.join(importer,'scripts/docs-api-probe39-original-output.mjs')).href);
  const acquire=()=>actual.checkedOriginalProbe39Output(root,graph,original,sources);
  acquire();const file=path.join(importer,'node_modules/js-yaml/dist/js-yaml.mjs');fs.appendFileSync(file,'\n ');
  assert.throws(()=>acquire(),/actual loaded parser closure/u);
 }finally{fs.rmSync(importer,{recursive:true,force:true});}
}));
