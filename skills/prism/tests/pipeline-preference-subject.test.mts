import {loadControlConfig} from '../server/control-config.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizePipelinePreferenceSubject} from '../control/pipeline-preference-subject.ts';

test('signed dispatch cannot select a personal subject without exact platform authorization',()=>{
 const authorized=`user-${'a'.repeat(24)}`;const other=`user-${'b'.repeat(24)}`;
 assert.equal(authorizePipelinePreferenceSubject(authorized,authorized),authorized);
 assert.equal(authorizePipelinePreferenceSubject(undefined,undefined),null);
 assert.equal(authorizePipelinePreferenceSubject(undefined,authorized),authorized);
 for(const request of [authorized,other,null,123])assert.throws(()=>authorizePipelinePreferenceSubject(request,undefined),/not authorized/);
 assert.throws(()=>authorizePipelinePreferenceSubject(other,authorized),/not authorized/);
 assert.throws(()=>authorizePipelinePreferenceSubject(authorized,'operator:design'),/invalid platform/);
});

import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {migrate,RevisionRepository} from '../storage/index.ts';
import {recordPreference} from '../control/preferences.ts';
import {createPreferenceGeneration} from '../control/preference-snapshot.ts';

test('platform subject automatically selects its real persisted personal history in another project',async()=>{
 const db=new PGlite({extensions:{vector}});
 try {
  await migrate(db);const repo=new RevisionRepository(db);
  await repo.createProject('origin-project','Origin');await repo.createProject('new-project','New');
  const authorized=`user-${'a'.repeat(24)}`;const other=`user-${'b'.repeat(24)}`;
  for(const [userId,eventId] of [[authorized,'authorized-event'],[other,'other-event']])await recordPreference(db,{schema:'prism.preference-event.v1',eventId:eventId!,userId:userId!,projectId:'origin-project',action:'liked',traits:['dense'],context:{domain:'tools'},source:'explicit',learningScope:'personal',occurredAt:'2026-09-01T00:00:00Z'});
  const snapshot=await createPreferenceGeneration(db,authorizePipelinePreferenceSubject(undefined,authorized),'new-project');
  assert.equal(snapshot.snapshot.subjectId,authorized);
  assert.deepEqual(snapshot.snapshot.events.map(event=>event.eventId),['authorized-event']);
  const anonymous=await createPreferenceGeneration(db,authorizePipelinePreferenceSubject(undefined,undefined),'new-project');
  assert.equal(anonymous.snapshot.events.length,0);
 }finally{await db.close();}
});


test('Control startup validates and freezes platform subject configuration',()=>{
 const subject=`user-${'a'.repeat(24)}`;
 const environment={PRISM_PIPELINE_PREFERENCE_SUBJECT:subject};
 const config=loadControlConfig(environment);
 environment.PRISM_PIPELINE_PREFERENCE_SUBJECT=`user-${'b'.repeat(24)}`;
 assert.equal(config.pipelinePreferenceSubject,subject);
 assert.equal(Object.isFrozen(config),true);
 assert.equal(loadControlConfig({}).pipelinePreferenceSubject,undefined);
 assert.throws(()=>loadControlConfig({PRISM_PIPELINE_PREFERENCE_SUBJECT:'operator:wrong'}),/invalid platform/);
});
