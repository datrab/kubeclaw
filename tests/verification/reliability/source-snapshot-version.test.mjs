import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readRunSnapshot,verifyPinnedGraph,graphSnapshot,writeRunSnapshots} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {PORTABLE_JSON_ENCODING,parseReviewSource,parseSourceBinding} from '@kubeclaw/plugin-sdk';
import {validateReferencedSchema} from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
const file=fileURLToPath(import.meta.url);
const fixtures=path.join(path.dirname(file),'fixtures/legacy-source-snapshots');
if(process.argv[2]==='--child'){
 const [kind,root]=process.argv.slice(3);
 const definition=JSON.parse(fs.readFileSync(path.join(root,'definition.json'),'utf8'));
 if(kind==='write')writeRunSnapshots(root,graphSnapshot(definition),{policy:{ä:1,z:2,a:3}});
 const snapshot=readRunSnapshot(root);const graph=verifyPinnedGraph(root,definition);
 assert.equal(snapshot.graph.digest,graph.digest);
 process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,digest:snapshot.digest,graph:graph.digest}));
}else{
 const child=(kind,root,locale)=>execFileSync(process.execPath,[file,'--child',kind,root],{encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
 test('captured original v1/v2 snapshot bytes remain verified or fail closed across locales',()=>{
  for(const kind of ['ascii','unicode']){
   const root=path.join(fixtures,kind),before=fs.readFileSync(path.join(root,'run-snapshot.json'));
   const initial=JSON.parse(child('read',root,'en_US.UTF-8'));
   if(kind==='ascii')assert.equal(JSON.parse(child('read',root,'sv_SE.UTF-8')).digest,initial.digest);
   else assert.throws(()=>child('read',root,'sv_SE.UTF-8'),/RUN_SNAPSHOT_INTEGRITY_INVALID/);
   assert.deepEqual(fs.readFileSync(path.join(root,'run-snapshot.json')),before);
  }
 });
 test('new original snapshot writer and graph verifier preserve Unicode maps and node ordering across locales',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-version-'));
  try{
   const definition=JSON.parse(fs.readFileSync(path.join(fixtures,'unicode/definition.json'),'utf8'));
   definition.stages=['ä','z','a'].map(id=>({...definition.stages[0],id}));
   fs.writeFileSync(path.join(root,'definition.json'),JSON.stringify(definition));
   const writer=JSON.parse(child('write',root,'en_US.UTF-8')),reader=JSON.parse(child('read',root,'sv_SE.UTF-8'));
   assert.equal(writer.digest,reader.digest);assert.equal(writer.graph,reader.graph);assert.notEqual(writer.locale,reader.locale);
   const saved=fs.readFileSync(path.join(root,'run-snapshot.json'),'utf8'),snapshot=JSON.parse(saved);
   assert.equal(snapshot.schemaVersion,'run-snapshot.v2');assert.equal(snapshot.graph.schemaVersion,'execution-graph-snapshot.v3');
   for(const changed of [{...snapshot,schemaVersion:'run-snapshot.v99'},{...snapshot,graph:{...snapshot.graph,schemaVersion:'execution-graph-snapshot.v99'}}]){
    fs.writeFileSync(path.join(root,'run-snapshot.json'),JSON.stringify(changed));assert.throws(()=>readRunSnapshot(root),/INTEGRITY_INVALID/);
   }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 test('all five actual closed source inputs reject unknown identity codecs; legacy and explicit version accepted',()=>{
  for(const [name,field] of [['preflight-contract/schemas/source-input.schema.json','source'],['architecture-validator/schemas/input.schema.json','source'],
   ['architecture-validator/schemas/input.schema.json','sourceBinding'],['blueprint-sync/schemas/input.schema.json','sourceBinding'],['implementation-agent/schemas/input.schema.json','sourceBinding']]){
   const schema=JSON.parse(fs.readFileSync(path.join('skills/nova/plugins',name),'utf8')).properties[field];
   const validator=validateReferencedSchema(JSON.stringify(schema),`${name}:${field}`);
   const input=field==='source'?{projectId:'source',repositoryRoot:'/repository',architectureRef:'architecture',paths:['architecture.md']}:{stageId:'source-preflight',inputDigest:`sha256:${'a'.repeat(64)}`};
   validator.validate(input);validator.validate({...input,identityEncoding:PORTABLE_JSON_ENCODING});
   assert.throws(()=>validator.validate({...input,identityEncoding:'unknown'}),/failed schema/);
   const parse=field==='source'?parseReviewSource:parseSourceBinding;
   assert.throws(()=>parse({...input,identityEncoding:'unknown'}),/INVALID/);
   assert.throws(()=>parse({...input,identityEncoding:undefined}),/INVALID/);
  }
 });
}
