import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJson} from '../contracts/pipeline-observability/v1/src/index.ts';
import {Inventory} from './observability-retirement/files.mjs';
import {runRoot} from '../skills/nova/core/execution/run-root.ts';
import {closureKey,closureIntentDigest} from '../skills/common/plugin-runtime/foundation/observability/closure-projection.ts';
import {decodeAttemptState,encodeAttemptState,attemptProjectionKey,attemptStoreDigest,readAttemptJournalPrefix} from '../skills/common/plugin-runtime/foundation/observability/attempt-projection.ts';
import {retireAttemptProjection,attemptRetirementScope,retainedAttemptRun} from './retire-attempt-result.mjs';

export async function retireAttemptClosure(input) {return retireAttemptProjection(input,'closure');}
function plannedReferences(intent,projections,closureProjections,bytes) {
  const resultKey=attemptProjectionKey(intent),result=projections.get(resultKey),closure=result?.completionIntent?.closure;
  if(!closure||closure.closureDigest!==intent.closureDigest)throw new Error('OBSERVABILITY_CLOSURE_RESULT_PROJECTION_REQUIRED');
  for(const field of ['resultDigest','recordDigest','journalSequence','journalHash']) {
    if(result.resultReference.intent[field]!==intent[field])throw new Error('OBSERVABILITY_CLOSURE_RETIREMENT_SOURCE_CHANGED');
  }
  const key=closureKey(closure),existing=closureProjections.get(key);
  if(existing&&existing.intentDigest!==closureIntentDigest(intent))throw new Error('OBSERVABILITY_CLOSURE_RETIREMENT_CONFLICT');
  if(!existing&&attemptStoreDigest(bytes)!==intent.expectedStoreDigest)throw new Error('OBSERVABILITY_CLOSURE_RETIREMENT_STORE_CHANGED');
  closureProjections.set(key,{schemaVersion:'attempt-closure-reference.v1',resultKey,closureDigest:intent.closureDigest,
    operationId:intent.operationId,actor:intent.actor,intentDigest:closureIntentDigest(intent)});
  return Boolean(existing);
}
/** Advisory only: no constructors, locks, tail repair, staging cleanup or writes. */
export function planAttemptClosure(input) {
  const scope=attemptRetirementScope(input,'closure'),intent=scope.intent,roots=new Inventory(scope.inventoryLimits);
  roots.root(scope.novaStorageRoot,'nova',false);roots.root(scope.attemptRoot,'attempts',false);
  const canonical=runRoot(scope.novaStorageRoot,intent.pipelineRunId,{maximumLegacyBytes:scope.inventoryLimits.maximumSnapshotBytes});
  if(intent.runRoot!==canonical||scope.attemptRoot!==path.join(canonical,'observability/attempts'))throw new Error('ATTEMPT_RETIREMENT_FOREIGN_SOURCE');
  const inventory=retainedAttemptRun(scope),file=path.join(scope.attemptRoot,'attempt-store.json');
  const bytes=readAttemptJournalPrefix(file,scope.attemptLimits.maximumMetadataBytes);
  const {state,projections,closureProjections}=decodeAttemptState(JSON.parse(bytes),scope.attemptRoot,scope.attemptLimits);
  const existing=plannedReferences(intent,projections,closureProjections,bytes);
  const projectedBytes=Buffer.byteLength(canonicalJson(encodeAttemptState(state,projections,closureProjections)));
  const releasedBytes=existing?0:bytes.length-projectedBytes;
  if(!existing&&releasedBytes<=0)throw new Error('OBSERVABILITY_CLOSURE_RETIREMENT_NOT_SMALLER');
  inventory.verifyUnchanged();roots.verifyUnchanged();
  if(inventory.blockers.some(item=>item.code!=='RUN_RETIREMENT_AUTHORIZATION_MISSING')||roots.blockers.length)throw new Error('ATTEMPT_RETIREMENT_RUN_CHANGED');
  return {operationId:intent.operationId,advisory:true,releasedBytes,releasedClosures:existing?0:1};
}
async function main() {
  if(process.argv.length!==4||!['--plan','--apply'].includes(process.argv[2])||!path.isAbsolute(process.argv[3]))throw new Error('ATTEMPT_RETIREMENT_USAGE');
  const input=JSON.parse(readAttemptJournalPrefix(process.argv[3],1048576).toString());
  if(process.argv[2]==='--plan'){process.stdout.write(`${JSON.stringify(planAttemptClosure(input))}\n`);return;}
  const result=await retireAttemptClosure(input);
  process.stdout.write(`${JSON.stringify({operationId:input.intent.operationId,...result,releasedClosures:result.newlyRetired?1:0})}\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{
  const code=/^(ATTEMPT_RETIREMENT_|OBSERVABILITY_|PIPELINE_RUN_|JOURNAL_|RUN_)[A-Z0-9_:.-]*$/u.test(error?.message)?error.message:'ATTEMPT_RETIREMENT_FAILED';
  process.stderr.write(`${JSON.stringify({code})}\n`);process.exitCode=1;
});
