import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import {publishJsonPair,readPublishedPair} from '../../../../skills/common/plugin-runtime/foundation/config/published-pair.ts';
import {loadPipelineTestScope} from '../../../../skills/nova/core/test-gates/pipeline.ts';
const cli=path.resolve(import.meta.dirname,'../../../../skills/nova/project_setup/tools/progress-scaffold.ts');
const names=['progress.json','pipeline.json'];
async function fixture(operation) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scaffold-publication-')),swarm=path.join(root,'Projects/demo/src/.swarm');
 const args=[cli,'--repo',root,'--project','demo'];
 const run=(...extra)=>execFileSync(process.execPath,[...args,...extra],{encoding:'utf8',stdio:'pipe'});
 try {
  execFileSync('git',['init','-q',root]);fs.mkdirSync(path.join(swarm,'modules/01-app'),{recursive:true});
  fs.writeFileSync(path.join(swarm,'modules/01-app/FORGE.md'),'# App\nBuild it.\n');fs.writeFileSync(path.join(swarm,'modules/01-app/BUSTER.md'),'# Tests\nHTTP health.\n');run();
  const draft=path.join(swarm,'progress.scaffold.json'),value=JSON.parse(fs.readFileSync(draft,'utf8'));
  value.description='Published first';value.notes=['Local original filesystem regression'];value.execution_order=['01-app'];
  value.pipeline.modules['01-app'].tests['http-health'].config.url='http://app.demo.svc.cluster.local:3000';
  const save=()=>fs.writeFileSync(draft,JSON.stringify(value));save();run('--apply');
  await operation({root,swarm,args,run,value,save});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
const scope=swarm=>loadPipelineTestScope(path.join(swarm,'pipeline.json'),{moduleId:'01-app',gateId:null});

test('second-target EISDIR rejects before changing either member or committed generation',()=>fixture(({swarm,run,value,save})=>{
 const progress=fs.readFileSync(path.join(swarm,'progress.json')),pipeline=fs.readFileSync(path.join(swarm,'pipeline.json'));
 const pointer=path.join(swarm,'.scaffold-publication/current.json'),committed=fs.readFileSync(pointer);
 value.description='Do not partly publish';save();fs.unlinkSync(path.join(swarm,'pipeline.json'));fs.mkdirSync(path.join(swarm,'pipeline.json'));
 assert.throws(()=>run('--apply'),/PUBLISHED_PAIR_TARGET_INVALID/);
 assert.deepEqual(fs.readFileSync(path.join(swarm,'progress.json')),progress);assert.deepEqual(fs.readFileSync(pointer),committed);
 fs.rmdirSync(path.join(swarm,'pipeline.json'));fs.writeFileSync(path.join(swarm,'pipeline.json'),pipeline);assert.equal(scope(swarm).project,'demo');
}));

test('SIGKILL after first materialization cannot execute a mixed pair; explicit apply reconciles',()=>fixture(async({swarm,args,run,value,save})=>{
 const pointer=path.join(swarm,'.scaffold-publication/current.json'),committed=fs.readFileSync(pointer);
 value.description='Second generation';value.pipeline.modules['01-app'].tests['http-health'].config.path=`/${'x'.repeat(24*1024*1024)}`;save();
 let child;let observed=false;
 const watcher=fs.watch(swarm,(_event,file)=>{if(file==='progress.json'&&child){observed=true;child.kill('SIGKILL');}});
 let output='';
 try {
  child=spawn(process.execPath,[...args,'--apply'],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const [code,signal]=await once(child,'close');assert.equal(signal,'SIGKILL',`${code}: ${output}`);assert.ok(observed);
 }finally{watcher.close();}
 assert.deepEqual(fs.readFileSync(pointer),committed,'kill occurred before single commit');
 assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);
 const previous=readPublishedPair(swarm,names,false);assert.equal(previous[0].description,'Published first');
 run('--apply');assert.equal(readPublishedPair(swarm,names)[0].description,'Second generation');assert.equal(scope(swarm).project,'demo');
}));

test('published corruption, traversal, symlinks and missing marker reject without loose-file fallback',()=>fixture(({swarm,run})=>{
 const pointer=path.join(swarm,'.scaffold-publication/current.json'),original=fs.readFileSync(pointer),manifest=JSON.parse(original);
 for(const bytes of ['{',JSON.stringify({...manifest,generation:'../outside'})]) {
  fs.writeFileSync(pointer,bytes);assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);fs.writeFileSync(pointer,original);
 }
 fs.unlinkSync(pointer);assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);fs.writeFileSync(pointer,original);
 const pointerCopy=`${pointer}.saved`;fs.writeFileSync(pointerCopy,original);fs.unlinkSync(pointer);fs.symlinkSync(pointerCopy,pointer);assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);fs.unlinkSync(pointer);fs.writeFileSync(pointer,original);
 const generation=path.join(swarm,'.scaffold-publication',manifest.generation),member=path.join(generation,'pipeline.json'),bytes=fs.readFileSync(member);
 fs.unlinkSync(member);fs.symlinkSync(path.join(swarm,'pipeline.json'),member);assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);
 fs.unlinkSync(member);fs.writeFileSync(member,Buffer.alloc(bytes.length));assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);fs.writeFileSync(member,bytes);
 fs.truncateSync(member,64*1024*1024+1);assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);fs.writeFileSync(member,bytes);
 const moved=`${generation}-moved`;fs.renameSync(generation,moved);fs.symlinkSync(moved,generation,'dir');assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);
 fs.unlinkSync(generation);fs.renameSync(moved,generation);
 fs.writeFileSync(path.join(swarm,'pipeline.json'),'{}');assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);
 run();assert.equal(fs.readFileSync(path.join(swarm,'pipeline.json'),'utf8'),'{}','generate leaves manual materialization untouched');
 run('--apply');assert.equal(scope(swarm).project,'demo');
}));


test('concurrent publishers serialize complete generations and an interrupted first publication reconciles',()=>fixture(async({swarm})=>{
 const first=readPublishedPair(swarm,names);
 const publication=path.join(swarm,'.scaffold-publication');
 fs.rmSync(publication,{recursive:true});fs.mkdirSync(publication);
 assert.throws(()=>scope(swarm),/TEST_PLAN_PIPELINE_INVALID/);
 await publishJsonPair(swarm,names,first);
 const variants=Array.from({length:4},(_unused,index)=>[
  {...first[0],description:`Generation ${index}`},
  {...first[1],project:`generation-${index}`},
 ]);
 await Promise.all(variants.map(pair=>publishJsonPair(swarm,names,pair)));
 const current=readPublishedPair(swarm,names);
 const winner=variants.find(pair=>pair[0].description===current[0].description);
 assert.ok(winner);assert.deepEqual(current,winner);
 assert.equal(scope(swarm).project,winner[1].project);
}));
