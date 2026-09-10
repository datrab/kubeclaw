import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {compileProject} from '../../../skills/nova/project/compiler.ts';
import {compileProjectRecovery} from '../../../skills/nova/project/recovery.ts';
import {graphSnapshot,writeRunSnapshots} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {projectSourceFixture} from './project-source-fixture.mjs';
import {materializeCurrentCore} from './repair-identity-historical.mjs';

const reviewType='kubeclaw.decision.review';
test('stored source/report modes are independent and all generated Review nodes agree',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-compiler-'));let fixture;
 try {
  fixture=await projectSourceFixture(root,{review:true,clean:false});
  fixture.project.modules[0].review={agent:'echo'};
  fixture.project.final.review={agent:'echo'};
  for(const source of ['legacy',PORTABLE_JSON_ENCODING])for(const reports of ['legacy',PORTABLE_JSON_ENCODING]){
   const compiled=compileProject(fixture.project,source,reports);
   const reviews=compiled.definition.stages.filter(stage=>stage.type===reviewType);
   assert.equal(reviews.length,2);
   for(const stage of reviews)assert.equal(stage.config.reportArtifactEncoding,reports==='legacy'?undefined:reports);
   const storageRoot=path.join(root,`stored-${source}-${reports}`),directory=runRoot(storageRoot,compiled.runId);
   fs.mkdirSync(directory,{recursive:true});
   writeRunSnapshots(directory,graphSnapshot(compiled.definition),{});
   const before=fs.readFileSync(path.join(directory,'run-snapshot.json'));
   assert.deepEqual(compileProjectRecovery(fixture.project,storageRoot),compiled);
   assert.deepEqual(fs.readFileSync(path.join(directory,'run-snapshot.json')),before);
  }
  const fresh=compileProject(fixture.project);
  assert(fresh.definition.stages.filter(stage=>stage.type===reviewType).every(stage=>stage.config.reportArtifactEncoding===PORTABLE_JSON_ENCODING));
  assert.throws(()=>compileProject(fixture.project,'legacy','future'),/PROJECT_REPORT_ENCODING_INVALID/);
  const noReview=structuredClone(fixture.project);delete noReview.modules[0].review;delete noReview.final.review;
  const without=compileProject(noReview),emptyStorage=path.join(root,'no-review'),emptyDirectory=runRoot(emptyStorage,without.runId);
  assert.equal(without.definition.stages.filter(stage=>stage.type===reviewType).length,0);
  fs.mkdirSync(emptyDirectory,{recursive:true});writeRunSnapshots(emptyDirectory,graphSnapshot(without.definition),{});
  assert.deepEqual(compileProjectRecovery(noReview,emptyStorage),without);
 } finally {await fixture?.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('archived compiler with current coverage helper preserves portable-source and legacy module/final reports',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-archived-'));let fixture;
 try{
  const overlay=materializeCurrentCore(path.join(root,'original'));
  const archive=JSON.parse(fs.readFileSync(new URL('../../fixtures/repair-budget/legacy-review-compiler.json',import.meta.url),'utf8'));
  const bytes=Buffer.from(archive.content);
  assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),archive.gitBlob);
  const target=path.join(overlay.destination,archive.path);fs.writeFileSync(target,bytes);
  const original=await import(pathToFileURL(target).href);
  const fixtureRoot=path.join(root,'project');fs.mkdirSync(fixtureRoot);
  fixture=await projectSourceFixture(fixtureRoot,{review:true,clean:false});
  fixture.project.modules[0].review={agent:'echo'};fixture.project.final.review={agent:'echo'};
  const compiled=original.compileProject(fixture.project);
  assert.equal(compiled.definition.stages.find(stage=>stage.id==='source-preflight').input.source.identityEncoding,PORTABLE_JSON_ENCODING);
  const reviews=compiled.definition.stages.filter(stage=>stage.type===reviewType);assert.equal(reviews.length,2);
  assert(reviews.every(stage=>!Object.hasOwn(stage.config,'reportArtifactEncoding')));
  const storageRoot=path.join(root,'stored'),directory=runRoot(storageRoot,compiled.runId);fs.mkdirSync(directory,{recursive:true});
  writeRunSnapshots(directory,graphSnapshot(compiled.definition),{});
  assert.deepEqual(compileProjectRecovery(fixture.project,storageRoot),compiled);
 }finally{await fixture?.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('saved Review node set, uniform mode, and the entire pinned graph remain authoritative',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-graph-'));let fixture;
 try {
  fixture=await projectSourceFixture(root,{review:true,clean:false});fixture.project.modules[0].review={agent:'echo'};
  fixture.project.final.review={agent:'echo'};
  const compiled=compileProject(fixture.project);
  const cases=[
   ['mixed',stages=>{delete stages.find(s=>s.type===reviewType).config.reportArtifactEncoding;},/PROJECT_RECOVERY_REPORT_ENCODING_MIXED/],
   ['unknown',stages=>{for(const s of stages.filter(s=>s.type===reviewType))s.config.reportArtifactEncoding='future';},/PROJECT_RECOVERY_REPORT_ENCODING_INVALID/],
   ['missing',stages=>{stages.splice(stages.findIndex(s=>s.id==='final-review'),1);for(const s of stages)s.dependsOn=s.dependsOn.filter(id=>id!=='final-review');},/PROJECT_RECOVERY_REVIEW_NODES_MISMATCH/],
   ['mistyped',stages=>{stages.find(s=>s.type===reviewType).type='other.stage';},/PROJECT_RECOVERY_REVIEW_NODES_MISMATCH/],
   ['extra',stages=>{const extra={...structuredClone(stages.find(s=>s.type===reviewType)),id:'extra-review'};delete extra.on;delete extra.execution.repairCategory;stages.push(extra);},/PROJECT_RECOVERY_REVIEW_NODES_MISMATCH/],
   ['other-config',stages=>{stages.find(s=>s.type===reviewType).config.agent='changed';},/RECOVERY_GRAPH_DIGEST_MISMATCH/],
  ];
  for(const [name,mutate,error] of cases){
   const storageRoot=path.join(root,name),directory=runRoot(storageRoot,compiled.runId);
   fs.mkdirSync(directory,{recursive:true});
   const definition=structuredClone(compiled.definition);mutate(definition.stages);
   writeRunSnapshots(directory,graphSnapshot(definition),{});
   const before=fs.readFileSync(path.join(directory,'run-snapshot.json'));
   assert.throws(()=>compileProjectRecovery(fixture.project,storageRoot),error,name);
   assert.deepEqual(fs.readFileSync(path.join(directory,'run-snapshot.json')),before,name);
  }
 } finally {await fixture?.close();fs.rmSync(root,{recursive:true,force:true});}
});
