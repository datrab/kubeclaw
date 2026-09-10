import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {compileProject} from '../../../skills/nova/project/compiler.ts';
import {projectSourceFixture} from './project-source-fixture.mjs';

test('own project review authoring domain rejects report selector before compiler-owned selection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-author-domain-'));let fixture;
 try{
  fixture=await projectSourceFixture(root,{review:true,clean:false});
  for(const place of ['module','final'])for(const selected of ['legacy',PORTABLE_JSON_ENCODING]){
   for(const value of [undefined,null,'future',PORTABLE_JSON_ENCODING,'legacy']){
    const project=structuredClone(fixture.project),owner=place==='module'?project.modules[0]:project.final;
    owner.review={agent:'echo',reportArtifactEncoding:value};
    assert.throws(()=>compileProject(project,'legacy',selected),/PROJECT_OBJECT_INVALID:(?:final\.)?review/);
   }
   const project=structuredClone(fixture.project),owner=place==='module'?project.modules[0]:project.final;
   let reads=0;owner.review={agent:'echo',get reportArtifactEncoding(){reads++;return PORTABLE_JSON_ENCODING;}};
   assert.throws(()=>compileProject(project,'legacy',selected),/PROJECT_OBJECT_INVALID:(?:final\.)?review/);
   assert.equal(reads,0);
  }
  const valid=structuredClone(fixture.project);valid.modules[0].review={agent:'echo'};valid.final.review={agent:'echo'};
  for(const selected of ['legacy',PORTABLE_JSON_ENCODING]){
   const reviews=compileProject(valid,'legacy',selected).definition.stages.filter(stage=>stage.type==='kubeclaw.decision.review');
   assert.equal(reviews.length,2);
   for(const stage of reviews)assert.deepEqual(stage.config,selected==='legacy'?{agent:'echo'}:{agent:'echo',reportArtifactEncoding:selected});
  }
 }finally{await fixture?.close();fs.rmSync(root,{recursive:true,force:true});}
});
