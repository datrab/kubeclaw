import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {FileDurableAttemptStore} from '../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {FileObservabilityAdmissionStore} from '../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import {runRoot} from '../skills/nova/core/execution/run-root.ts';
import {withRunMutationLock} from '../skills/nova/core/execution/run-mutation.ts';
import {Inventory} from './observability-retirement/files.mjs';
import {inspectRun} from './observability-retirement/journals.mjs';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
function scopeValue(input) {
  const value = structuredClone(input);
  if (!value || Object.keys(value).sort().join(',') !== 'action,actor,admissionLimits,admissionRoot,attemptId,attemptLimits,attemptRoot,claimGeneration,expectedJournalHead,expectedSnapshotDigest,inventoryLimits,novaStorageRoot,operationId,recordDigest,runId,schemaVersion'
    || value.schemaVersion !== 'admission-retirement-scope.v1' || value.action !== 'compact-admission-completion'
    || !DIGEST.test(value.expectedJournalHead) || !DIGEST.test(value.expectedSnapshotDigest)
    || ![value.admissionRoot,value.attemptRoot,value.novaStorageRoot].every(item => typeof item === 'string' && path.isAbsolute(item) && path.resolve(item) === item)
    || !DIGEST.test(value.recordDigest)
    || !value.admissionLimits || Object.keys(value.admissionLimits).sort().join(',') !== 'maximumBytes,maximumIngressBytes,maximumQuarantineBytes,maximumQuarantineRecords,maximumRecords'
    || !value.attemptLimits || Object.keys(value.attemptLimits).sort().join(',') !== 'maximumClosures,maximumEvidenceBytes,maximumEvidenceObjectBytes,maximumEvidenceObjects,maximumMetadataBytes,maximumPendingEvidenceAgeMs,maximumResults'
    || !value.inventoryLimits || Object.keys(value.inventoryLimits).sort().join(',') !== 'maximumFiles,maximumSnapshotBytes,maximumTotalBytes') throw new Error('ADMISSION_RETIREMENT_SCOPE_INVALID');
  return value;
}

function retainedRun(scope, root) {
  const inventory = new Inventory(scope.inventoryLimits);
  inventory.root(root, scope.runId);
  const run = inspectRun(inventory, root, scope.runId);
  // Only the redundant admission copy is compacted. Original completion,
  // evidence, run logs, effects, results and continuation remain readable.
  const blockers = inventory.blockers.filter(item => item.code !== 'RUN_RETIREMENT_AUTHORIZATION_MISSING');
  if (blockers.length) throw new Error(`ADMISSION_RETIREMENT_RUN_BLOCKED:${blockers[0].code}`);
  const head = run.journals.find(item => item.path === path.join(root,'events.jsonl'))?.head;
  if (head !== scope.expectedJournalHead || run.snapshot?.digest !== scope.expectedSnapshotDigest) throw new Error('ADMISSION_RETIREMENT_RUN_CHANGED');
  return {inventory, evidence: {schemaVersion:'admission-retained-run.v1',runId:scope.runId,runRoot:root,
    journalHead:head,snapshotDigest:run.snapshot.digest,canonicalHistory:'retained-unchanged'}};
}

/** Local operator filesystem authority; the actor field is audit data, not remote authentication. */
export async function retireAdmission(input) {
  const scope=scopeValue(input);
  const roots=new Inventory(scope.inventoryLimits);
  roots.root(scope.novaStorageRoot,'nova',false);
  roots.root(scope.attemptRoot,'attempts',false);
  roots.root(scope.admissionRoot,'admission',false);
  const root=runRoot(scope.novaStorageRoot,scope.runId,{maximumLegacyBytes:scope.inventoryLimits.maximumSnapshotBytes});
  if(scope.attemptRoot!==path.join(root,'observability/attempts') || scope.admissionRoot!==path.join(root,'observability/admission'))throw new Error('ADMISSION_RETIREMENT_FOREIGN_SOURCE');
  for(const file of [path.join(scope.attemptRoot,'attempt-store.json'),path.join(scope.admissionRoot,'admission.json')]) {
    if(!fs.lstatSync(file).isFile())throw new Error('ADMISSION_RETIREMENT_STORE_REQUIRED');
  }
  return withRunMutationLock(root,async signal=>{
    signal.throwIfAborted();const initial=retainedRun(scope,root);
    const attempts=new FileDurableAttemptStore(scope.attemptRoot,scope.attemptLimits);
    const admission=new FileObservabilityAdmissionStore(scope.admissionRoot,scope.admissionLimits);
    return attempts.retireAdmissionCompletion(admission,{pipelineRunId:scope.runId,attemptId:scope.attemptId,claimGeneration:scope.claimGeneration,
      recordDigest:scope.recordDigest,operationId:scope.operationId,actor:scope.actor,authority:{runRoot:root,journalHead:initial.evidence.journalHead,snapshotDigest:initial.evidence.snapshotDigest}},async()=>{
      signal.throwIfAborted();const current=retainedRun(scope,root);
      if(JSON.stringify(current.evidence)!==JSON.stringify(initial.evidence))throw new Error('ADMISSION_RETIREMENT_RUN_CHANGED');
      initial.inventory.verifyUnchanged();current.inventory.verifyUnchanged();roots.verifyUnchanged();
      if([...initial.inventory.blockers,...current.inventory.blockers,...roots.blockers].some(item=>item.code!=='RUN_RETIREMENT_AUTHORIZATION_MISSING'))throw new Error('ADMISSION_RETIREMENT_RUN_CHANGED');
      signal.throwIfAborted();
    });
  });
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply' || !path.isAbsolute(process.argv[3])) throw new Error('ADMISSION_RETIREMENT_USAGE');
  const fd = fs.openSync(process.argv[3],fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  let input;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 1048576) throw new Error('ADMISSION_RETIREMENT_SCOPE_SIZE');
    const buffer = Buffer.alloc(stat.size+1); let offset = 0;
    while (offset < buffer.length) {const count=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if(!count)break;offset+=count;}
    if(offset !== stat.size)throw new Error('ADMISSION_RETIREMENT_SCOPE_CHANGED');
    try {input=JSON.parse(buffer.subarray(0,offset).toString());} catch {throw new Error('ADMISSION_RETIREMENT_SCOPE_JSON_INVALID');}
  } finally {fs.closeSync(fd);}
  const result=await retireAdmission(input);
  process.stdout.write(`${JSON.stringify({operationId:input.operationId,newlyRetired:result.newlyRetired,
    releasedRecords:result.newlyRetired?1:0,releasedBytes:result.newlyRetired?result.releasedBytes:0})}\n`);
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{
  const code=/^(ADMISSION_RETIREMENT_|DURABLE_|PIPELINE_RUN_MUTATION_LOCKED|OBSERVABILITY_|JOURNAL_|RUN_)[A-Z0-9_:.-]*$/u.test(error?.message)?error.message:'ADMISSION_RETIREMENT_FAILED';
  process.stderr.write(`${JSON.stringify({code})}\n`);process.exitCode=1;
});
