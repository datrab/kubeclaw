import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileDurableRecordStore } from '../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { assertWaitProjectionIntent, projectWaitValue } from '../skills/common/plugin-runtime/foundation/observability/wait-projection.ts';
import { payloadDigest } from '../skills/common/plugin-runtime/foundation/observability/record-retirement.ts';
import { resolveRetainedCoreWait } from '../skills/nova/core/state/wait-projection-reader.ts';
import { runRoot } from '../skills/nova/core/execution/run-root.ts';
import { withRunMutationLock } from '../skills/nova/core/execution/run-mutation.ts';
import { Inventory } from './observability-retirement/files.mjs';
import { inspectRun } from './observability-retirement/journals.mjs';
import { operatorAuthority, operatorConfiguration } from './observability-retirement/operator-authority.mjs';

function scopeValue(input) {
  const scope = structuredClone(input);
  if (!scope || Object.keys(scope).sort().join(',') !== 'action,intent,novaStorageRoot,orchestratorIssuerId,schemaVersion'
    || scope.schemaVersion !== 'wait-value-retirement-scope.v1' || scope.action !== 'project-completed-human-approval-wait'
    || typeof scope.novaStorageRoot !== 'string' || !path.isAbsolute(scope.novaStorageRoot)
    || path.resolve(scope.novaStorageRoot) !== scope.novaStorageRoot
    || typeof scope.orchestratorIssuerId !== 'string' || !scope.orchestratorIssuerId) throw new Error('WAIT_RETENTION_SCOPE_INVALID');
  assertWaitProjectionIntent(scope.intent);
  return scope;
}
function assertInventory(inventory) {
  const blocker = inventory.blockers.find(item => item.code !== 'RUN_RETIREMENT_AUTHORIZATION_MISSING');
  if (blocker) throw new Error(`WAIT_RETENTION_BLOCKED:${blocker.code}`);
}
function rootInventory(scope) {
  const inventory = new Inventory(scope.intent.source.inventoryLimits);
  const roots = [scope.intent.waitRoot, scope.intent.deliveryRoot], identities = new Set();
  for (const root of roots) {
    inventory.root(root, root, false);
    if (roots.some(other => other !== root && (root.startsWith(`${other}${path.sep}`) || other.startsWith(`${root}${path.sep}`)))) {
      throw new Error('WAIT_RETENTION_ALIASED_STORE');
    }
    const file = path.join(root, 'records/store.json'), stat = fs.lstatSync(file), identity = `${stat.dev}:${stat.ino}`;
    if (fs.realpathSync(file) !== file || !stat.isFile() || stat.nlink !== 1 || identities.has(identity)) throw new Error('WAIT_RETENTION_ALIASED_STORE');
    identities.add(identity);
  }
  assertInventory(inventory);
  return inventory;
}
function retainedRun(scope) {
  const inventory = new Inventory(scope.inventoryLimits);
  inventory.root(scope.intent.runRoot, scope.intent.runId);
  const run = inspectRun(inventory, scope.intent.runRoot, scope.intent.runId);
  if (run.snapshot?.digest !== scope.intent.snapshotDigest
    || run.journals.find(item => item.path === path.join(scope.intent.runRoot, 'events.jsonl'))?.head !== scope.intent.runJournalHead) {
    throw new Error('WAIT_RETENTION_RUN_CHANGED');
  }
  const configuration = operatorConfiguration(inventory, scope);
  assertInventory(inventory);
  return { inventory, configuration };
}
function receiptAuthority(records, intent, authority) {
  const selected = records.filter(record => record.stream === `notifications/${authority.request.resource.canonicalId}`
    && record.payload?.schemaVersion === 'notification-delivery-receipt.v1'
    && record.payloadDigest === intent.terminalPayloadDigest);
  if (selected.length !== 1 || payloadDigest(selected[0].payload.receipt) !== payloadDigest(authority.receipt)) {
    throw new Error('WAIT_RETENTION_RECEIPT_CHANGED');
  }
}
/** One explicit manual action, retaining the original history, receipt and idempotency key. */
export async function retireWaitValue(input) {
  const scope = scopeValue(input), roots = rootInventory(scope), source = scope.intent.source;
  const root = runRoot(scope.novaStorageRoot, source.runId, { maximumLegacyBytes: source.inventoryLimits.maximumTotalBytes });
  const authorityScope = { novaStorageRoot: scope.novaStorageRoot, orchestratorIssuerId: scope.orchestratorIssuerId,
    inventoryLimits: source.inventoryLimits, intent: { ...scope.intent, runRoot: root, runId: source.runId,
      runJournalHead: source.runJournalHead, snapshotDigest: source.snapshotDigest, effectKey: scope.intent.operatorEffectKey } };
  const resolve = ref => resolveRetainedCoreWait(ref, { storageRoot: scope.novaStorageRoot,
    waitRoot: scope.intent.waitRoot, orchestratorIssuerId: scope.orchestratorIssuerId });
  return withRunMutationLock(root, async signal => {
    signal.throwIfAborted();
    const initial = retainedRun(authorityScope), config = initial.configuration;
    for (const [name, bytes] of [['events.jsonl', source.eventsPrefixBytes], ['effects.jsonl', source.effectsPrefixBytes],
      ['signals.jsonl', source.signalsPrefixBytes]]) {
      if (fs.lstatSync(path.join(root, name)).size !== bytes) throw new Error('WAIT_RETENTION_CURRENT_PREFIX_REQUIRED');
    }
    const waits = new FileDurableRecordStore(scope.intent.waitRoot, config.waitLimits);
    const deliveries = new FileDurableRecordStore(scope.intent.deliveryRoot, config.deliveryLimits);
    const initialWaits = await waits.read('waits/all');
    const authority = operatorAuthority(initial.inventory, authorityScope, config, initialWaits);
    if (authority.waitEffectKey !== source.effectKey || authority.originalWaitPayloadDigest !== source.originalPayloadDigest
      || authority.wait.waitId !== source.waitId) throw new Error('WAIT_RETENTION_FOREIGN_WAIT');
    return projectWaitValue(waits, deliveries, `notifications/${authority.request.resource.canonicalId}`, scope.intent,
      authority.digest, resolve, (currentWaits, receipts) => {
        signal.throwIfAborted();
        const current = retainedRun(authorityScope);
        const confirmed = operatorAuthority(current.inventory, authorityScope, current.configuration, currentWaits);
        if (confirmed.digest !== authority.digest) throw new Error('WAIT_RETENTION_AUTHORITY_CHANGED');
        receiptAuthority(receipts, scope.intent, confirmed);
        for (const inventory of [initial.inventory, current.inventory, roots]) { inventory.verifyUnchanged(); assertInventory(inventory); }
        signal.throwIfAborted();
      });
  });
}
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--apply' || !path.isAbsolute(process.argv[3])) throw new Error('WAIT_RETENTION_USAGE');
  const file = process.argv[3], fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1048576) throw new Error('WAIT_RETENTION_SCOPE_FILE_INVALID');
    const bytes = Buffer.alloc(stat.size + 1); let length = 0;
    while (length < bytes.length) { const count = fs.readSync(fd, bytes, length, bytes.length - length, length); if (!count) break; length += count; }
    const after = fs.fstatSync(fd);
    if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('WAIT_RETENTION_SCOPE_CHANGED');
    console.log(JSON.stringify(await retireWaitValue(JSON.parse(bytes.subarray(0, length).toString()))));
  } finally { fs.closeSync(fd); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
