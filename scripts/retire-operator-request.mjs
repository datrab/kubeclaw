import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileDurableRecordStore } from '../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { payloadDigest } from '../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { assertDeliveryProjectionIntent, projectDeliveryRequest } from '../skills/common/plugins/operator-messaging/src/delivery-projection.ts';
import { runRoot } from '../skills/nova/core/execution/run-root.ts';
import { withRunMutationLock } from '../skills/nova/core/execution/run-mutation.ts';
import { Inventory } from './observability-retirement/files.mjs';
import { inspectRun } from './observability-retirement/journals.mjs';
import { operatorConfiguration, operatorAuthority } from './observability-retirement/operator-authority.mjs';

function scopeValue(input) {
  const scope = structuredClone(input);
  if (!scope || Object.keys(scope).sort().join(',') !== 'action,intent,inventoryLimits,novaStorageRoot,orchestratorIssuerId,schemaVersion'
    || scope.schemaVersion !== 'operator-request-retirement-scope.v1' || scope.action !== 'compact-completed-human-approval-request'
    || typeof scope.novaStorageRoot !== 'string' || !path.isAbsolute(scope.novaStorageRoot) || path.resolve(scope.novaStorageRoot) !== scope.novaStorageRoot
    || typeof scope.orchestratorIssuerId !== 'string' || !scope.orchestratorIssuerId
    || !scope.inventoryLimits || Object.keys(scope.inventoryLimits).sort().join(',') !== 'maximumFiles,maximumSnapshotBytes,maximumTotalBytes') {
    throw new Error('OPERATOR_RETENTION_SCOPE_INVALID');
  }
  assertDeliveryProjectionIntent(scope.intent);
  return scope;
}
function assertInventory(inventory) {
  const blocker = inventory.blockers.find(item => item.code !== 'RUN_RETIREMENT_AUTHORIZATION_MISSING');
  if (blocker) throw new Error(`OPERATOR_RETENTION_BLOCKED:${blocker.code}`);
}
function distinctRoots(scope) {
  const inventory = new Inventory(scope.inventoryLimits), roots = [scope.intent.waitRoot, scope.intent.deliveryRoot];
  const identities = new Set();
  for (const root of roots) {
    inventory.root(root, root, false);
    if (roots.some(other => other !== root && (root.startsWith(`${other}${path.sep}`) || other.startsWith(`${root}${path.sep}`)))) throw new Error('OPERATOR_RETENTION_ALIASED_STORE');
    const stat = fs.lstatSync(path.join(root, 'records/store.json')), id = `${stat.dev}:${stat.ino}`;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || identities.has(id)) throw new Error('OPERATOR_RETENTION_ALIASED_STORE');
    identities.add(id);
  }
  return inventory;
}
function retainedRun(scope) {
  const inventory = new Inventory(scope.inventoryLimits);
  inventory.root(scope.intent.runRoot, scope.intent.runId);
  const run = inspectRun(inventory, scope.intent.runRoot, scope.intent.runId);
  if (run.snapshot?.digest !== scope.intent.snapshotDigest
    || run.journals.find(item => item.path === path.join(scope.intent.runRoot, 'events.jsonl'))?.head !== scope.intent.runJournalHead) throw new Error('OPERATOR_RETENTION_RUN_CHANGED');
  const configuration = operatorConfiguration(inventory, scope);
  assertInventory(inventory);
  return { inventory, configuration };
}
function finalReceipt(records, scope, authority) {
  const selected = records.filter(record => record.stream === `notifications/${authority.request.resource.canonicalId}`
    && record.payload?.schemaVersion === 'notification-delivery-receipt.v1'
    && record.payloadDigest === scope.intent.terminalPayloadDigest);
  if (selected.length !== 1 || payloadDigest(selected[0].payload.receipt) !== payloadDigest(authority.receipt)) throw new Error('OPERATOR_RETENTION_RECEIPT_CHANGED');
}
/** Explicit local policy action. No network, receipt lookup, journal deletion or automatic retention. */
export async function retireOperatorRequest(input) {
  const scope = scopeValue(input), roots = distinctRoots(scope);
  const canonical = runRoot(scope.novaStorageRoot, scope.intent.runId, { maximumLegacyBytes: scope.inventoryLimits.maximumSnapshotBytes });
  if (canonical !== scope.intent.runRoot) throw new Error('OPERATOR_RETENTION_FOREIGN_RUN');
  return withRunMutationLock(canonical, async signal => {
    signal.throwIfAborted();
    const initial = retainedRun(scope), config = initial.configuration;
    const waits = new FileDurableRecordStore(scope.intent.waitRoot, config.waitLimits);
    const deliveries = new FileDurableRecordStore(scope.intent.deliveryRoot, config.deliveryLimits);
    return waits.withRecords('waits/all', async waitRecords => {
      const authority = operatorAuthority(initial.inventory, scope, config, waitRecords);
      return projectDeliveryRequest(deliveries, authority.request, scope.intent, authority.digest, records => {
        signal.throwIfAborted();
        const current = retainedRun(scope), confirmed = operatorAuthority(current.inventory, scope, current.configuration, waitRecords);
        if (confirmed.digest !== authority.digest) throw new Error('OPERATOR_RETENTION_AUTHORITY_CHANGED');
        finalReceipt(records, scope, confirmed);
        initial.inventory.verifyUnchanged(); current.inventory.verifyUnchanged(); roots.verifyUnchanged();
        for (const inventory of [initial.inventory, current.inventory, roots]) assertInventory(inventory);
        signal.throwIfAborted();
      });
    });
  });
}
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply' || !path.isAbsolute(process.argv[3])) throw new Error('OPERATOR_RETENTION_USAGE');
  const file = process.argv[3], inventory = new Inventory({ maximumFiles: 1, maximumTotalBytes: 1048576, maximumSnapshotBytes: 1048576 });
  inventory.root(path.dirname(file), 'scope', false);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw new Error('OPERATOR_RETENTION_SCOPE_FILE_INVALID');
  inventory.files.set(file, { path: file, bytes: stat.size, stamp: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`,
    hash: inventory.hashFile(file, stat), disposition: 'retain' });
  console.log(JSON.stringify(await retireOperatorRequest(inventory.json(file))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
