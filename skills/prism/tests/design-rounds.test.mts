import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
import {migrate,RevisionRepository} from '../storage/index.ts';
import {startDesignRound,assertSameArchitectureRequest,approvedRoundBaseline,assertArchitectureTransition} from '../control/design-generations.ts';
import {recordPreference} from '../control/preferences.ts';
import {decideDirection} from '../control/direction-decisions.ts';
import type {PrismDocument} from '@kubeclaw/prism-contracts-v1';

async function setup() {
 const db=new PGlite({extensions:{vector}});await migrate(db);
 const repo=new RevisionRepository(db);const project=await repo.createProject('project-rounds','Rounds');
 const architecture=async(revision:number)=>{
  await db.query("UPDATE prism.design_request SET status='superseded' WHERE project_id=$1",[project]);
  const id=randomUUID();await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact',$3,$4,$5::jsonb)",[id,project,`digest-${revision}`,revision,JSON.stringify({revision})]);return id;
 };
 const start=(revision:number,key:string,extra:Record<string,unknown>={})=>startDesignRound(db,{projectId:'project-rounds',subjectId:'user-one',startKey:key,architectureDigest:`digest-${revision}`,architectureRevision:revision,...extra});
 const designs=(label:string)=>['one','two','three'].map(key=>{const document=structuredClone(fixture) as PrismDocument;document.meta.projectId='project-rounds';document.meta.title=`${label} ${key}`;return {key,title:document.meta.title,summary:`Summary ${label}`,document};});
 return {db,repo,project,architecture,start,designs};
}
test('late architecture generation cannot mutate its successor; exact delivery retry is distinct from a new round',async()=>{
 const {db,repo,architecture,start,designs}=await setup();try{
  const a1=await architecture(1);const g1=await start(1,'dispatch-one');
  const a2=await architecture(2);const g2=await start(2,'dispatch-two');
  await assert.rejects(repo.createDirectionSet('project-rounds',g1.generationId,designs('old')),/stale design generation/);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,0);
  const result=await repo.createDirectionSet('project-rounds',g2.generationId,designs('new'));
  assert.deepEqual(await repo.createDirectionSet('project-rounds',g2.generationId,designs('new')),result);
  assert.equal((await db.query('SELECT id FROM prism.design_document WHERE design_request_id=$1',[a1])).rows.length,0);
  assert.equal((await db.query('SELECT id FROM prism.design_document WHERE design_request_id=$1',[a2])).rows.length,3);
  await assert.rejects(repo.createDirectionSet('project-rounds',g2.generationId,designs('changed')),/conflicts/);
  await db.query("UPDATE prism.design_request SET request='{\"later\":true}'::jsonb WHERE id=$1",[a2]);
  assert.deepEqual((await start(2,'dispatch-two')).request,{revision:2});
  assert.equal((await start(2,'dispatch-two')).generationId,g2.generationId);
  await assert.rejects(start(2,'dispatch-two',{subjectId:'user-other'}),/start key conflicts/);
 }finally{await db.close();}
});
test('three rejections feed a successor round while predecessor documents and decisions remain immutable history',async()=>{
 const {db,repo,architecture,start,designs}=await setup();try{
  await architecture(1);const first=await start(1,'initial');const r1=await repo.createDirectionSet('project-rounds',first.generationId,designs('initial'));
  for(const direction of r1.directions)await decideDirection(db,'user-one',direction.directionId,`reject-${direction.key}`,{action:'rejected'});
  await recordPreference(db,{schema:'prism.preference-event.v1',eventId:'private-other-user',userId:'other-user',projectId:'project-rounds',action:'liked',target:{directionId:r1.directions[0]!.directionId},traits:['private'],context:{surface:'direction'},source:'explicit',learningScope:'personal',occurredAt:'2026-09-01T00:00:00Z'});
  const parent={parentRoundId:first.generationId,documentId:r1.documentId,expectedRevision:1};
  const second=await start(1,'new-round',parent);
  assert.equal((second.snapshot as {target:{feedback:unknown[]}}).target.feedback.length,3);
  const r2=await repo.createDirectionSet('project-rounds',second.generationId,designs('different'));
  assert.deepEqual(await repo.createDirectionSet('project-rounds',second.generationId,designs('different')),r2);
  assert.equal((await db.query('SELECT id FROM prism.design_round')).rows.length,2);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,6);
  assert.equal((await db.query("SELECT id FROM prism.direction WHERE state='rejected'")).rows.length,3);
  await assert.rejects(start(1,'late-parent',parent),/parent has changed/);
  await assert.rejects(start(1,'wrong-revision',{parentRoundId:second.generationId,documentId:r2.documentId,expectedRevision:999}),/parent document has changed/);
  await assert.rejects(decideDirection(db,'user-one',r1.directions[0]!.directionId,'select-old',{action:'selected',documentId:r1.documentId}),/not available/);
 }finally{await db.close();}
});
test('source revision mutation after dispatch rejects result before creating new documents',async()=>{
 const {db,repo,architecture,start,designs}=await setup();try{
  await architecture(1);const first=await start(1,'initial');const r1=await repo.createDirectionSet('project-rounds',first.generationId,designs('initial'));
  const next=await start(1,'next',{parentRoundId:first.generationId,documentId:r1.documentId,expectedRevision:1});
  const current=await repo.current(r1.documentId);const changed=structuredClone(current.document);changed.meta.revision=2;
  await repo.replace(r1.documentId,current.id,changed,{type:'test.source-change'},'user-one');
  await assert.rejects(repo.createDirectionSet('project-rounds',next.generationId,designs('new')),/parent document changed/);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,3);
 }finally{await db.close();}
});

test('real insertion failure rolls back the whole round and leaves its delivery retry usable',async()=>{
 const {db,repo,architecture,start,designs}=await setup();try{
  await architecture(1);const generation=await start(1,'initial');
  await db.exec("CREATE FUNCTION prism.fail_round() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.direction_key='two' THEN RAISE EXCEPTION 'round insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_round BEFORE INSERT ON prism.direction FOR EACH ROW EXECUTE FUNCTION prism.fail_round();");
  await assert.rejects(repo.createDirectionSet('project-rounds',generation.generationId,designs('initial')),/round insert failure/);
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,0);
  assert.equal((await db.query<{result_digest:unknown}>('SELECT result_digest FROM prism.design_round')).rows[0]?.result_digest,null);
  await db.exec('DROP TRIGGER fail_round ON prism.direction');
  await repo.createDirectionSet('project-rounds',generation.generationId,designs('initial'));
  assert.equal((await db.query('SELECT id FROM prism.design_document')).rows.length,3);
 }finally{await db.close();}
});


test('final Nova baseline consumption rejects an approved predecessor after a new round starts',async()=>{
 const {db,repo,project,architecture,start,designs}=await setup();try{
  await architecture(1);const first=await start(1,'initial');const r1=await repo.createDirectionSet('project-rounds',first.generationId,designs('initial'));
  const revision=await repo.current(r1.documentId);
  await db.query("INSERT INTO prism.approval(id,project_id,design_revision_id,design_digest,approved_by,architecture_digest) VALUES('approval-one',$1,$2,'design-digest','operator','digest-1')",[project,revision.id]);
  await db.query("INSERT INTO prism.baseline(id,project_id,design_revision_id,bundle_key,bundle_revision,bundle_digest,bundle_artifact_id,approval_id,specification_digest,criteria_digest,preview_index_digest) VALUES($1,$2,$3,'baseline',1,'bundle-digest','artifact','approval-one','spec','criteria','preview')",[randomUUID(),project,revision.id]);
  assert.equal((await approvedRoundBaseline(db,project,'approval-one')).rows.length,1);
  await start(1,'next',{parentRoundId:first.generationId,documentId:r1.documentId,expectedRevision:1});
  assert.equal((await approvedRoundBaseline(db,project,'approval-one')).rows.length,0);
 }finally{await db.close();}
});
test('same architecture revision cannot substitute content under a replayed dispatch',()=>{
 const source={architecture:{contentDigest:'digest',revision:1},architectureContent:{goal:'original'}};
 assert.doesNotThrow(()=>assertSameArchitectureRequest(source,{...source,approvalId:'accepted'}));
 assert.throws(()=>assertSameArchitectureRequest(source,{...source,architectureContent:{goal:'changed'}}),/content conflicts/);
});

test('legacy unbound documents can start a first explicit round without invented predecessor identity',async()=>{
 const {db,repo,project,architecture,start,designs}=await setup();try{
  const requestId=await architecture(1);
  const documentId=await repo.createDocument(project,'legacy',designs('legacy')[0]!.document,'user-one',requestId);
  const next=await start(1,'legacy-successor',{documentId,expectedRevision:1});
  const result=await repo.createDirectionSet('project-rounds',next.generationId,designs('new'));
  assert.equal(result.directions.length,3);
  assert.equal((next.snapshot as {target:{parentRoundId:unknown}}).target.parentRoundId,null);
 }finally{await db.close();}
});


test('installed pg int8 parser strings cannot bypass the original architecture transition guard',async()=>{
 const {db,architecture}=await setup();try{
  const id=await architecture(1);
  const request={architecture:{revision:1,contentDigest:'digest-1'},architectureContent:{goal:'original'}};
  await db.query('UPDATE prism.design_request SET request=$2::jsonb WHERE id=$1',[id,JSON.stringify(request)]);
  const row=(await db.query<{architecture_revision:number;architecture_digest:string;request:Record<string,unknown>}>('SELECT architecture_revision,architecture_digest,request FROM prism.design_request WHERE id=$1',[id])).rows[0]!;
  const parsed=pg.types.getTypeParser(20,'text')(String(row.architecture_revision));
  assert.equal(typeof parsed,'string','actual installed pg returns int8 as text');
  const nativeRow={...row,architecture_revision:parsed as string};
  assert.doesNotThrow(()=>assertArchitectureTransition(nativeRow,{...request,approvalId:'approved'}));
  assert.throws(()=>assertArchitectureTransition(nativeRow,{...request,architectureContent:{goal:'tampered'}}),/content conflicts/);
  assert.throws(()=>assertArchitectureTransition(nativeRow,{...request,architecture:{revision:1,contentDigest:'other'}}),/digest conflict/);
  assert.throws(()=>assertArchitectureTransition({...nativeRow,architecture_revision:'9007199254740993'},request),/stored architecture revision is invalid/);
  assert.deepEqual((await db.query<{request:unknown}>('SELECT request FROM prism.design_request WHERE id=$1',[id])).rows[0]?.request,request);
 }finally{await db.close();}
});
