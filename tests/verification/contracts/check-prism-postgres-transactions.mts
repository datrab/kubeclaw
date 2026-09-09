import {enqueueAgentJob,claimAgentJob,agentJob} from '../../../skills/prism/control/agent-jobs.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';
import { startDesignRound } from '../../../skills/prism/control/design-generations.ts';
import { RevisionRepository, inTransaction } from '../../../skills/prism/storage/index.ts';
const connectionString = process.env.KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE;
if (!connectionString) throw new Error('REAL_POSTGRES_DATABASE_REQUIRED');
const pool = new Pool({ connectionString, max: 2 });
try {
  await pool.query('CREATE SCHEMA prism');
  // Apply the actual production tables used by this regression, without unrelated vector infrastructure.
  const migrations = 'skills/prism/storage/migrations/';
  await pool.query(fs.readFileSync(migrations + '001_prism.sql', 'utf8').split('CREATE TABLE IF NOT EXISTS prism.baseline')[0]);
  await pool.query(fs.readFileSync(migrations + '006_design_request.sql', 'utf8').split('ALTER TABLE prism.approval')[0]);
  await pool.query(fs.readFileSync(migrations + '008_document_request_binding.sql', 'utf8'));
  await pool.query(fs.readFileSync(migrations + '005_direction_source.sql', 'utf8'));
  await pool.query(fs.readFileSync(migrations + '007_direction_evidence.sql', 'utf8'));
  const initial = fs.readFileSync(migrations + '001_prism.sql', 'utf8');
  await pool.query(initial.slice(initial.indexOf('CREATE TABLE IF NOT EXISTS prism.preference_event'), initial.indexOf('CREATE TABLE IF NOT EXISTS prism.engine_operation')));
  await pool.query(fs.readFileSync(migrations + '011_preference_wire_ids.sql', 'utf8'));
  await pool.query(fs.readFileSync(migrations + '012_preference_generation.sql', 'utf8'));
  // This regression checks pooled transactions, not deployment role grants.
  await pool.query(fs.readFileSync(migrations + '013_design_round.sql', 'utf8').split('GRANT SELECT')[0]);
  await pool.query(fs.readFileSync(migrations + '014_agent_jobs.sql', 'utf8').split('GRANT SELECT')[0]);
  const repository = new RevisionRepository(pool);
  const projectId = await repository.createProject('transaction-regression', 'Transaction regression');
  const document = JSON.parse(fs.readFileSync('contracts/prism/v1/fixtures/minimal-web.json', 'utf8'));
  const documentId = await repository.createDocument(projectId, 'main', document, 'test');
  const original = await repository.current(documentId);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => repository.replace(documentId, original.id,
    { ...document, meta: { ...document.meta, revision: 2, title: `Concurrent edit ${index}` } }, { type: 'test.concurrent-edit' }, 'test')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await pool.query('SELECT id FROM prism.design_revision WHERE document_id=$1', [documentId])).rows.length, 2);
  const current = await repository.current(documentId);
  assert.notEqual(current.id, original.id);
  await assert.rejects(() => inTransaction(pool, async connection => {
    await connection.query("UPDATE prism.project SET name='must roll back' WHERE id=$1", [projectId]);
    await connection.query('SELECT 1 / 0');
  }), /division by zero/);
  assert.equal((await pool.query('SELECT name FROM prism.project WHERE id=$1', [projectId])).rows[0].name, 'Transaction regression');
  await pool.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES(gen_random_uuid(),$1,'artifact:test','sha256:test',1,'{}')", [projectId]);
  const generation = await startDesignRound(pool,{projectId:'transaction-regression',subjectId:null,startKey:'round-start',architectureDigest:'sha256:test',architectureRevision:1});
  const designs = ['one', 'two', 'three'].map(key => ({ key, title: key, summary: key,
    document: { ...document, meta: { ...document.meta, projectId: 'transaction-regression', title: key } } }));
  await pool.query("CREATE FUNCTION prism.reject_second_direction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.direction_key='two' THEN RAISE EXCEPTION 'actual second direction failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER reject_second BEFORE INSERT ON prism.direction FOR EACH ROW EXECUTE FUNCTION prism.reject_second_direction()');
  await assert.rejects(() => repository.createDirectionSet('transaction-regression', generation.generationId, designs), /actual second direction failure/);
  assert.equal((await pool.query('SELECT id FROM prism.direction')).rows.length, 0);
  assert.equal((await pool.query('SELECT id FROM prism.design_document')).rows.length, 1, 'the failed set must leave no partial documents');
  await pool.query('DROP TRIGGER reject_second ON prism.direction');
  const published = await repository.createDirectionSet('transaction-regression', generation.generationId, designs);
  assert.equal(published.directions.length, 3);
  assert.deepEqual(await repository.createDirectionSet('transaction-regression', generation.generationId, designs), published);
  assert.equal((await pool.query('SELECT id FROM prism.direction')).rows.length, 3);
  const parent={projectId:'transaction-regression',subjectId:null,architectureDigest:'sha256:test',architectureRevision:1,parentRoundId:generation.generationId,documentId:published.documentId,expectedRevision:1};
  const starts = await Promise.allSettled(['round-two-a','round-two-b'].map(startKey=>startDesignRound(pool,{...parent,startKey})));
  assert.equal(starts.filter(result=>result.status==='fulfilled').length,1,'one parent frontier admits exactly one competing round');
  assert.equal(starts.filter(result=>result.status==='rejected').length,1);
  const winner=starts.find(result=>result.status==='fulfilled');
  if(winner?.status!=='fulfilled')throw new Error('missing round winner');
  const revised=designs.map(item=>({...item,document:{...item.document,meta:{...item.document.meta,title:`new ${item.key}`}}}));
  const deliveries=await Promise.all([repository.createDirectionSet('transaction-regression',winner.value.generationId,revised),repository.createDirectionSet('transaction-regression',winner.value.generationId,revised)]);
  assert.deepEqual(deliveries[0],deliveries[1]);
  assert.equal((await pool.query('SELECT id FROM prism.direction')).rows.length,6);
  const next=await startDesignRound(pool,{...parent,startKey:'agent-job-round',parentRoundId:winner.value.generationId,documentId:deliveries[0]!.documentId});
  const queued=await enqueueAgentJob(pool,'spiffe://test/control/main/v2','transaction-regression','design-set',{projectId:'transaction-regression',preferences:next});
  const claims=await Promise.all(['bridge-one','bridge-two'].map(owner=>claimAgentJob(pool,owner)));
  assert.equal(claims.filter(Boolean).length,1,'native pooled claims cannot launch the same session twice');
  const claim=claims.find(Boolean)!;
  assert.equal(claim.id,queued.id);assert.ok(claim.fence);
  const identity={jobId:claim.id,fence:claim.fence!,payload:revised};
  const committed=await Promise.all([repository.createDirectionSet('transaction-regression',queued.id,revised,identity),repository.createDirectionSet('transaction-regression',queued.id,revised,identity)]);
  assert.deepEqual(committed[0],committed[1]);assert.deepEqual((await agentJob(pool,queued.id)).result,committed[0]);
  // Every reserved connection is released after both commit and rollback.
  const probes = await Promise.all(Array.from({ length: 4 }, () => pool.query('SELECT 1 AS healthy')));
  assert.ok(probes.every(probe => probe.rows[0].healthy === 1));
} finally { await pool.end(); }
console.log(JSON.stringify({ ok: true, suite: 'real-postgres-pooled-transactions', concurrentEdits: 8 }));
