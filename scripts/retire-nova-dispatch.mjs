import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileNovaRemotePlanStore } from '../skills/nova/core/test-gates/remote-dispatch.ts';
import { FileNovaGateImportStore } from '../skills/nova/core/test-gates/remote-result-import.ts';
import { assertDispatchProjectionIntent } from '../skills/nova/core/test-gates/dispatch-projection.ts';
import { runRoot } from '../skills/nova/core/execution/run-root.ts';
import { withRunMutationLock } from '../skills/nova/core/execution/run-mutation.ts';
import { Inventory } from './observability-retirement/files.mjs';
import { inspectRun } from './observability-retirement/journals.mjs';

function shape(value, keys) { return value && Object.keys(value).sort().join(',') === keys; }
function limits(value, keys) {
  if (!shape(value, keys) || Object.values(value).some(number => !Number.isSafeInteger(number) || number < 1)) {
    throw new Error('NOVA_DISPATCH_RETENTION_LIMITS_INVALID');
  }
}
function scopeValue(input) {
  const scope = structuredClone(input);
  if (!shape(scope, 'action,dispatchOptions,importOptions,intent,inventoryLimits,novaStorageRoot,schemaVersion,stateRoot')
    || scope.schemaVersion !== 'nova-dispatch-retirement-scope.v1' || scope.action !== 'compact-imported-dispatch-archive'
    || ![scope.novaStorageRoot, scope.stateRoot].every(root => typeof root === 'string' && path.isAbsolute(root) && path.resolve(root) === root)
    || !shape(scope.dispatchOptions, 'maximumArchiveBytes,maximumArchiveStoreBytes,recordLimits')
    || !shape(scope.importOptions, 'maximumEvidenceStoreBytes,recordLimits')) throw new Error('NOVA_DISPATCH_RETENTION_SCOPE_INVALID');
  assertDispatchProjectionIntent(scope.intent);
  limits(scope.inventoryLimits, 'maximumFiles,maximumSnapshotBytes,maximumTotalBytes');
  for (const options of [scope.dispatchOptions, scope.importOptions]) {
    limits(options.recordLimits, 'maximumBytes,maximumRecordBytes,maximumRecords');
    if (Object.entries(options).some(([key, value]) => key !== 'recordLimits' && (!Number.isSafeInteger(value) || value < 1))) {
      throw new Error('NOVA_DISPATCH_RETENTION_LIMITS_INVALID');
    }
  }
  if (scope.intent.dispatchRoot !== path.join(scope.stateRoot, 'dispatch')
    || scope.intent.importRoot !== path.join(scope.stateRoot, 'imports')) throw new Error('NOVA_DISPATCH_RETENTION_STORE_BINDING');
  return scope;
}
function retainedRun(scope) {
  const inventory = new Inventory(scope.inventoryLimits), { intent } = scope;
  inventory.root(intent.runRoot, intent.runId);
  inventory.root(intent.importRoot, 'imports');
  inventory.root(intent.dispatchRoot, 'dispatch');
  const run = inspectRun(inventory, intent.runRoot, intent.runId);
  const head = run.journals.find(item => item.path === path.join(intent.runRoot, 'events.jsonl'))?.head;
  if (head !== intent.runJournalHead || run.snapshot?.digest !== intent.snapshotDigest) throw new Error('NOVA_DISPATCH_RETENTION_RUN_CHANGED');
  assertInventory(inventory);
  return inventory;
}
function assertInventory(inventory) {
  const blocker = inventory.blockers.find(item => item.code !== 'RUN_RETIREMENT_AUTHORIZATION_MISSING');
  if (blocker) throw new Error(`NOVA_DISPATCH_RETENTION_BLOCKED:${blocker.code}`);
}
function existingDistinctStores(scope) {
  const inventory = new Inventory(scope.inventoryLimits), identities = new Set();
  for (const root of [scope.novaStorageRoot, scope.stateRoot, scope.intent.runRoot, scope.intent.importRoot, scope.intent.dispatchRoot]) {
    inventory.root(root, root, false);
  }
  for (const root of [scope.intent.importRoot, scope.intent.dispatchRoot]) {
    const file = path.join(root, 'records/store.json'), stat = fs.lstatSync(file);
    const identity = `${stat.dev}:${stat.ino}`;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || identities.has(identity)) {
      throw new Error('NOVA_DISPATCH_RETENTION_ALIASED_STORE');
    }
    identities.add(identity);
  }
  return inventory;
}

/** Explicit local operator action: only redundant metadata, never logs or the original blob. */
export async function retireNovaDispatch(input) {
  const scope = scopeValue(input), roots = existingDistinctStores(scope);
  const canonical = runRoot(scope.novaStorageRoot, scope.intent.runId, { maximumLegacyBytes: scope.inventoryLimits.maximumSnapshotBytes });
  if (scope.intent.runRoot !== canonical) throw new Error('NOVA_DISPATCH_RETENTION_FOREIGN_RUN');
  return withRunMutationLock(canonical, async signal => {
    signal.throwIfAborted();
    const initial = retainedRun(scope);
    const dispatch = new FileNovaRemotePlanStore(scope.intent.dispatchRoot, scope.dispatchOptions);
    const imports = new FileNovaGateImportStore(scope.intent.importRoot, scope.importOptions);
    const { job } = await dispatch.projectionCandidate(scope.intent.jobId);
    if (job.plan.runId !== scope.intent.runId || job.requestDigest !== scope.intent.requestDigest) throw new Error('NOVA_DISPATCH_RETENTION_JOB_MISMATCH');
    // Fixed order: canonical run -> original import writer -> distinct dispatch CAS writer.
    // The callback never reenters the import store or performs an inverse-order read.
    return imports.withRetainedImport(job, scope.intent.importPayloadDigest, authority =>
      dispatch.compactImportedArchive(scope.intent, authority, () => {
        signal.throwIfAborted();
        const current = retainedRun(scope);
        initial.verifyUnchanged(); current.verifyUnchanged(); roots.verifyUnchanged();
        for (const inventory of [initial, current, roots]) assertInventory(inventory);
        signal.throwIfAborted();
      }));
  });
}
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply' || !path.isAbsolute(process.argv[3])) throw new Error('NOVA_DISPATCH_RETENTION_USAGE');
  const inventory = new Inventory({ maximumFiles: 1, maximumTotalBytes: 1048576, maximumSnapshotBytes: 1048576 });
  // Bound and no-follow the explicitly selected scope, without walking its directory.
  const file = process.argv[3], stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw new Error('NOVA_DISPATCH_RETENTION_SCOPE_INVALID');
  inventory.root(path.dirname(file), 'scope', false);
  inventory.files.set(file, { path: file, bytes: stat.size, hash: inventory.hashFile(file, stat),
    stamp: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`, disposition: 'retain' });
  const scope = JSON.parse(inventory.text(file));
  process.stdout.write(`${JSON.stringify(await retireNovaDispatch(scope))}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => {
  process.stderr.write(`${JSON.stringify({ code: /^(NOVA_DISPATCH_|DURABLE_|OBSERVABILITY_|PIPELINE_RUN_)[A-Z0-9_:.-]*$/u.test(error?.message)
    ? error.message : 'NOVA_DISPATCH_RETENTION_FAILED' })}\n`);
  process.exitCode = 1;
});
