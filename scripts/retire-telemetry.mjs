import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {FileDurableRecordStore} from '../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import {runRoot} from '../skills/nova/core/execution/run-root.ts';
import {withRunMutationLock} from '../skills/nova/core/execution/run-mutation.ts';
import {Inventory} from './observability-retirement/files.mjs';
import {inspectRun} from './observability-retirement/journals.mjs';

const STREAM = 'telemetry/plugin-events';
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
function scopeValue(input) {
  const value = structuredClone(input);
  if (!value || Object.keys(value).sort().join(',') !== 'action,actor,expectedJournalHead,expectedSnapshotDigest,inventoryLimits,novaStorageRoot,operationId,records,runId,schemaVersion,storeLimits,telemetryRoot'
    || value.schemaVersion !== 'telemetry-retirement-scope.v1' || value.action !== 'delete-telemetry-projections'
    || !DIGEST.test(value.expectedJournalHead) || !DIGEST.test(value.expectedSnapshotDigest)
    || ![value.telemetryRoot,value.novaStorageRoot].every(item => typeof item === 'string' && path.isAbsolute(item) && path.resolve(item) === item)
    || !value.storeLimits || Object.keys(value.storeLimits).sort().join(',') !== 'maximumBytes,maximumRecordBytes,maximumRecords'
    || !value.inventoryLimits || Object.keys(value.inventoryLimits).sort().join(',') !== 'maximumFiles,maximumSnapshotBytes,maximumTotalBytes') throw new Error('TELEMETRY_RETIREMENT_SCOPE_INVALID');
  return value;
}

function retainedRun(scope, root) {
  const inventory = new Inventory(scope.inventoryLimits);
  inventory.root(root, scope.runId);
  const run = inspectRun(inventory, root, scope.runId);
  // This operation only deletes the redundant telemetry projection. It does
  // not retire the run, its logs, effects, decisions, results or continuation.
  const blockers = inventory.blockers.filter(item => item.code !== 'RUN_RETIREMENT_AUTHORIZATION_MISSING');
  if (blockers.length) throw new Error(`TELEMETRY_RETIREMENT_RUN_BLOCKED:${blockers[0].code}`);
  const head = run.journals.find(item => item.path === path.join(root,'events.jsonl'))?.head;
  if (head !== scope.expectedJournalHead || run.snapshot?.digest !== scope.expectedSnapshotDigest) throw new Error('TELEMETRY_RETIREMENT_RUN_CHANGED');
  return {inventory, evidence: {schemaVersion:'telemetry-retained-run.v1',runId:scope.runId,runRoot:root,
    journalHead:head,snapshotDigest:run.snapshot.digest,canonicalHistory:'retained-unchanged'}};
}

/** Local operator filesystem authority; the actor field is audit data, not remote authentication. */
export async function retireTelemetry(input) {
  const scope = scopeValue(input);
  const roots = new Inventory(scope.inventoryLimits);
  roots.root(scope.novaStorageRoot,'nova',false);
  roots.root(scope.telemetryRoot,'telemetry',false);
  const root = runRoot(scope.novaStorageRoot,scope.runId,{maximumLegacyBytes:scope.inventoryLimits.maximumSnapshotBytes});
  if (scope.telemetryRoot === root || scope.telemetryRoot.startsWith(root+path.sep) || root.startsWith(scope.telemetryRoot+path.sep)) throw new Error('TELEMETRY_RETIREMENT_ROOT_OVERLAP');
  if (!fs.lstatSync(path.join(scope.telemetryRoot,'records/store.json')).isFile()) throw new Error('TELEMETRY_RETIREMENT_STORE_REQUIRED');
  return withRunMutationLock(root, async signal => {
    signal.throwIfAborted();
    const initial = retainedRun(scope,root);
    const store = new FileDurableRecordStore(scope.telemetryRoot,scope.storeLimits);
    return store.retire({operationId:scope.operationId,actor:scope.actor,owner:scope.runId,stream:STREAM,
      records:scope.records,evidence:initial.evidence}, async records => {
      signal.throwIfAborted();
      const current = retainedRun(scope,root);
      if (JSON.stringify(current.evidence) !== JSON.stringify(initial.evidence)) throw new Error('TELEMETRY_RETIREMENT_RUN_CHANGED');
      if (records.some(record => record.owner !== scope.runId || record.stream !== STREAM)) throw new Error('TELEMETRY_RETIREMENT_OWNER_INVALID');
      initial.inventory.verifyUnchanged(); current.inventory.verifyUnchanged(); roots.verifyUnchanged();
      if ([...initial.inventory.blockers,...current.inventory.blockers,...roots.blockers].some(item => item.code !== 'RUN_RETIREMENT_AUTHORIZATION_MISSING')) throw new Error('TELEMETRY_RETIREMENT_RUN_CHANGED');
      signal.throwIfAborted();
    });
  });
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply' || !path.isAbsolute(process.argv[3])) throw new Error('TELEMETRY_RETIREMENT_USAGE');
  const fd = fs.openSync(process.argv[3],fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  let input;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 1048576) throw new Error('TELEMETRY_RETIREMENT_SCOPE_SIZE');
    const buffer = Buffer.alloc(stat.size+1); let offset = 0;
    while (offset < buffer.length) {const count=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if(!count)break;offset+=count;}
    if(offset !== stat.size)throw new Error('TELEMETRY_RETIREMENT_SCOPE_CHANGED');
    try {input=JSON.parse(buffer.subarray(0,offset).toString());} catch {throw new Error('TELEMETRY_RETIREMENT_SCOPE_JSON_INVALID');}
  } finally {fs.closeSync(fd);}
  const result=await retireTelemetry(input);
  process.stdout.write(`${JSON.stringify({operationId:result.intent.operationId,newlyRetired:result.newlyRetired,
    releasedRecords:result.newlyRetired?result.intent.records.length:0,releasedBytes:result.newlyRetired?result.releasedBytes:0})}\n`);
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{
  const code=/^(TELEMETRY_RETIREMENT_|DURABLE_|PIPELINE_RUN_MUTATION_LOCKED|OBSERVABILITY_|JOURNAL_|RUN_)[A-Z0-9_:.-]*$/u.test(error?.message)?error.message:'TELEMETRY_RETIREMENT_FAILED';
  process.stderr.write(`${JSON.stringify({code})}\n`);process.exitCode=1;
});
