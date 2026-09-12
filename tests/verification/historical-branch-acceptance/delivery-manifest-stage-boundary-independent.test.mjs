import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {canonicalJson, sha256Text} from '@kubeclaw/plugin-sdk';

const repository=fileURLToPath(new URL('../../../',import.meta.url));
const child=path.join(repository,'tests/verification/historical-branch-acceptance/delivery-manifest-stage-boundary-child.mjs');

function records(raw){return raw.trimEnd().split('\n').filter(Boolean).map(line=>JSON.parse(line));}
function entriesFor(raw,key){return records(raw).filter(row=>row.entry?.request?.idempotencyKey===key||row.entry?.receipt?.idempotencyKey===key);}

test('independent registered Summary persistence and original downstream locale boundary',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-boundary-independent-'));
 try{
  const transcript=[];
  for(const [phase,locale] of [['produce','en_US.UTF-8'],['consume-en','en_US.UTF-8'],['consume-portable-en','en_US.UTF-8'],['consume-cs','cs_CZ.UTF-8']]){
   const env={...process.env,LANG:locale,LC_ALL:locale};delete env.NODE_TEST_CONTEXT;
   const result=spawnSync(process.execPath,[child,root,phase],{cwd:repository,env,encoding:'utf8',timeout:30000});
   transcript.push({phase,locale,status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr});
   assert.equal(result.status,0,`${phase}: ${result.stderr}`);assert.equal(result.signal,null);
  }
  const producer=JSON.parse(fs.readFileSync(path.join(root,'producer-proof.json'),'utf8'));
  const manifest=producer.manifest,{digest,...unsigned}=manifest,ref=producer.storedArtifactRef;
  assert.deepEqual(producer.boundary,{registeredProjectSummaryStage:true,sharedWorkerCoreLifecycle:true,actualArtifactStore:true,diskFileEffectJournal:true,upstreamArtifactContractFixtures:true,providerExecution:false,importStoreSuccess:false});
  assert.equal(manifest.schemaVersion,'delivery-manifest.v2');assert.deepEqual(unsigned,producer.unsignedManifest);
  assert.equal(digest,producer.semanticDigest);assert.equal(digest,sha256Text(canonicalJson(unsigned)));
  assert.deepEqual(JSON.parse(producer.storedJsonBytes),manifest);
  assert.equal(Buffer.byteLength(producer.storedJsonBytes),ref.sizeBytes);assert.equal(sha256Text(producer.storedJsonBytes),ref.digest);
  assert.deepEqual(producer.readArtifactRef,ref);assert.equal(ref.producer.stageId,'project-summary');
  const write=producer.summaryWrite;assert.equal(write.request.capability,'artifacts.write');assert.equal(write.request.operation,'put_json');
  assert.equal(write.request.resource.canonicalId,`project-summary:${producer.runId}`);assert.equal(write.request.payload.namespace,'kubeclaw.project-summary');
  assert.equal(write.request.payload.mediaType,'application/json');assert.equal(Object.hasOwn(write.request.payload,'encoding'),false);
  assert.deepEqual(write.request.payload.value,manifest);assert.equal(write.receipt.status,'completed');assert.equal(write.receipt.adapter.pluginId,'kubeclaw.artifact-store');assert.deepEqual(write.receipt.result.artifact,ref);
  assert.deepEqual(entriesFor(producer.exactProducerEffectJournalJsonl,write.request.idempotencyKey).map(row=>row.entry.type),['requested','accepted','completed']);
  const lifecycle=records(producer.exactProducerLifecycleJournalJsonl),attempt=lifecycle.find(row=>row.entry?.type==='attempt.created'&&row.entry.identity?.stageId==='project-summary');
  assert.equal(attempt.entry.payload.attempt.owner.pluginId,'kubeclaw.project-summary');assert.equal(attempt.entry.payload.attempt.owner.registrationId,'summary');assert.equal(attempt.entry.payload.attempt.stageType,'kubeclaw.report.project-summary');
  const completed=lifecycle.find(row=>row.entry?.type==='attempt.completed'&&row.entry.identity?.stageId==='project-summary'),created=lifecycle.find(row=>row.entry?.type==='artifact.created'&&row.entry.identity?.stageId==='project-summary');
  assert.deepEqual(completed.entry.payload.result.artifacts,[ref]);assert.deepEqual(created.entry.payload.artifact,ref);assert.deepEqual(producer.summaryLifecycle,{attemptCompleted:completed,artifactCreated:created});

  const english=JSON.parse(fs.readFileSync(path.join(root,'consume-en-proof.json'),'utf8'));
  const portable=JSON.parse(fs.readFileSync(path.join(root,'consume-portable-en-proof.json'),'utf8'));
  const czech=JSON.parse(fs.readFileSync(path.join(root,'consume-cs-proof.json'),'utf8'));
  for(const proof of [english,portable,czech]){
   assert.equal(proof.evidenceReceipt.adapter.pluginId,'kubeclaw.remote-test-gate');assert.equal(proof.evidenceReceipt.adapter.registrationId,'evidence');assert.equal(proof.evidenceReceipt.status,'failed');
   assert.deepEqual(proof.evidenceRequest.payload.manifest,proof.sameStoredArtifactRef);assert.equal(proof.nestedArtifactRead.receipt.adapter.pluginId,'kubeclaw.artifact-store');assert.equal(proof.nestedArtifactRead.receipt.status,'completed');
   assert.deepEqual(entriesFor(proof.exactConsumerEffectJournalJsonl,proof.evidenceRequest.idempotencyKey).map(row=>row.entry.type),['requested','accepted','completed']);
   assert.equal(proof.boundary.providerExecution,false);assert.equal(proof.boundary.importedResultSuccess,false);assert.equal(proof.parsedManifestMatchesProducer,true);
  }
  assert.deepEqual(english.sameStoredArtifactRef,ref);assert.equal(english.error.message,'NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED');assert.equal(english.boundary.manifestIntegrityRejected,false);assert.equal(english.boundary.importStoreReached,true);assert.equal(english.recomputedSemanticDigest,digest);
  assert.equal(records(english.exactConsumerEffectJournalJsonl).filter(row=>row.entry?.type==='requested'&&row.entry.request?.capability==='artifacts.read').length,2);
  assert.equal(portable.sameStoredArtifactRef.encoding,'kubeclaw-json.utf16.v1');assert.equal(portable.sameStoredArtifactRef.digest,ref.digest);assert.equal(portable.error.message,'NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED');assert.equal(portable.boundary.manifestIntegrityRejected,false);assert.equal(portable.boundary.importStoreReached,true);assert.equal(portable.recomputedSemanticDigest,digest);
  assert.equal(records(portable.exactConsumerEffectJournalJsonl).filter(row=>row.entry?.type==='requested'&&row.entry.request?.capability==='artifacts.read').length,2);
  assert.deepEqual(czech.sameStoredArtifactRef,ref);assert.equal(czech.error.message,'DEMO_EVIDENCE_MANIFEST_INVALID');assert.equal(czech.boundary.manifestIntegrityRejected,true);assert.equal(czech.boundary.importStoreReached,false);assert.notEqual(czech.recomputedSemanticDigest,digest);
  assert.equal(records(czech.exactConsumerEffectJournalJsonl).filter(row=>row.entry?.type==='requested'&&row.entry.request?.capability==='artifacts.read').length,1);
  assert.equal(transcript.every(item=>item.status===0&&item.signal===null),true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
