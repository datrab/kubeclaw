import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {FileDurableAttemptStore} from '../skills/common/plugin-runtime/foundation/observability/durable-attempts.ts';
import {assertAttemptRetirementIntent,attemptImportJournal,readAttemptJournalPrefix} from '../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import {parseHashJournal} from '../skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
import {runRoot} from '../skills/nova/core/execution/run-root.ts';
import {withRunMutationLock} from '../skills/nova/core/execution/run-mutation.ts';
import {FileMutex} from '../skills/nova/core/state/file-mutex.ts';
import {Inventory} from './observability-retirement/files.mjs';
import {inspectRun} from './observability-retirement/journals.mjs';
import {inspectAdmission,inspectAttempts} from './observability-retirement/stores.mjs';

function scopeValue(input) {
  const scope=structuredClone(input);
  if(!scope||Object.keys(scope).sort().join(',')!=='action,attemptLimits,attemptRoot,intent,inventoryLimits,novaStorageRoot,schemaVersion'
    ||scope.schemaVersion!=='attempt-result-retirement-scope.v1'||scope.action!=='compact-imported-result'
    ||![scope.novaStorageRoot,scope.attemptRoot].every(value=>typeof value==='string'&&path.isAbsolute(value)&&path.resolve(value)===value)
    ||!scope.attemptLimits||Object.keys(scope.attemptLimits).sort().join(',')!=='maximumClosures,maximumEvidenceBytes,maximumEvidenceObjectBytes,maximumEvidenceObjects,maximumMetadataBytes,maximumPendingEvidenceAgeMs,maximumResults'
    ||!scope.inventoryLimits||Object.keys(scope.inventoryLimits).sort().join(',')!=='maximumFiles,maximumSnapshotBytes,maximumTotalBytes')throw new Error('ATTEMPT_RETIREMENT_SCOPE_INVALID');
  assertAttemptRetirementIntent(scope.intent,scope.attemptRoot);
  return scope;
}
function retainedRun(scope) {
  const {intent}=scope,inventory=new Inventory(scope.inventoryLimits);
  inventory.root(intent.runRoot,intent.pipelineRunId);
  const run=inspectRun(inventory,intent.runRoot,intent.pipelineRunId);
  const journal=attemptImportJournal(scope.attemptRoot);
  // Unlike replay of a retained immutable prefix, authorization checks the full
  // current nested journal. An incomplete or corrupt later tail blocks mutation.
  parseHashJournal(Buffer.from(inventory.text(journal)),journal);
  inspectAdmission(inventory,path.join(intent.runRoot,'observability/admission'),intent.pipelineRunId);
  inspectAttempts(inventory,scope.attemptRoot,intent.pipelineRunId,[]);
  const blockers=inventory.blockers.filter(item=>item.code!=='RUN_RETIREMENT_AUTHORIZATION_MISSING');
  if(blockers.length)throw new Error(`ATTEMPT_RETIREMENT_RUN_BLOCKED:${blockers[0].code}`);
  const head=run.journals.find(item=>item.path===path.join(intent.runRoot,'events.jsonl'))?.head;
  if(head!==intent.runJournalHead||run.snapshot?.digest!==intent.snapshotDigest)throw new Error('ATTEMPT_RETIREMENT_RUN_CHANGED');
  return inventory;
}

/** Local operator authority; this only removes a copy already durably imported. */
export async function retireAttemptResult(input) {
  const scope=scopeValue(input),roots=new Inventory(scope.inventoryLimits);
  roots.root(scope.novaStorageRoot,'nova',false);
  roots.root(scope.attemptRoot,'attempts',false);
  const canonical=runRoot(scope.novaStorageRoot,scope.intent.pipelineRunId,{maximumLegacyBytes:scope.inventoryLimits.maximumSnapshotBytes});
  if(scope.intent.runRoot!==canonical||scope.attemptRoot!==path.join(canonical,'observability/attempts'))throw new Error('ATTEMPT_RETIREMENT_FOREIGN_SOURCE');
  const journal=attemptImportJournal(scope.attemptRoot);
  for(const file of [path.join(scope.attemptRoot,'attempt-store.json'),journal,`${journal}.append-lock`]) {
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('ATTEMPT_RETIREMENT_SOURCE_REQUIRED');
  }
  return withRunMutationLock(canonical,async signal=>{
    signal.throwIfAborted();
    const attempts=new FileDurableAttemptStore(scope.attemptRoot,scope.attemptLimits);
    let initial;
    return attempts.retireImportedResult(scope.intent,operation=>new FileMutex(`${journal}.append-lock`,5000,'ATTEMPT_RETIREMENT_JOURNAL_LOCKED').withLock(operation),()=>{
      signal.throwIfAborted();const current=retainedRun(scope);
      initial??=current;
      initial.verifyUnchanged();current.verifyUnchanged();roots.verifyUnchanged();
      if([...initial.blockers,...current.blockers,...roots.blockers].some(item=>item.code!=='RUN_RETIREMENT_AUTHORIZATION_MISSING'))throw new Error('ATTEMPT_RETIREMENT_RUN_CHANGED');
      signal.throwIfAborted();
    });
  });
}
async function main() {
  if(process.argv.length!==4||process.argv[2]!=='--apply'||!path.isAbsolute(process.argv[3]))throw new Error('ATTEMPT_RETIREMENT_USAGE');
  const input=JSON.parse(readAttemptJournalPrefix(process.argv[3],1048576).toString());
  const result=await retireAttemptResult(input);
  process.stdout.write(`${JSON.stringify({operationId:input.intent.operationId,...result,releasedResults:result.newlyRetired?1:0})}\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{
  const code=/^(ATTEMPT_RETIREMENT_|OBSERVABILITY_|PIPELINE_RUN_|JOURNAL_|RUN_)[A-Z0-9_:.-]*$/u.test(error?.message)?error.message:'ATTEMPT_RETIREMENT_FAILED';
  process.stderr.write(`${JSON.stringify({code})}\n`);process.exitCode=1;
});
