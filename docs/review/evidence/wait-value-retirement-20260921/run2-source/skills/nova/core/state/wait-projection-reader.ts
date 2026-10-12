import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, type RetainedWaitSource, type WaitRequest, type EffectRequest, type EffectReceipt } from '@kubeclaw/plugin-sdk';
import { assertRetainedWaitSource } from '@kubeclaw/plugin-foundation/observability/wait-projection';
import { payloadDigest } from '@kubeclaw/plugin-foundation/observability/record-retirement';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { runRoot } from '../execution/run-root.ts';
import { assertRunSnapshot } from '../execution/engine-snapshots.ts';
import { readAttemptJournalPrefix } from '@kubeclaw/plugin-foundation/observability/attempt-projection';
import { validEffectIdentity } from '../effects/identity.ts';
import { parseJournalRecords, type JournalRecord } from './journal.ts';

interface Owner {
  readonly storageRoot: string;
  readonly waitRoot: string;
  readonly orchestratorIssuerId: string;
}
const fail = (): never => { throw new Error('WAIT_RETAINED_CORE_EVIDENCE_INVALID'); };
const hash = (bytes: Buffer): string => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

/** Only owner-derived paths are opened; the persisted source supplies identities and explicit manual limits. */
export function resolveRetainedCoreWait(input: RetainedWaitSource, configured: Owner): WaitRequest {
  const source = structuredClone(input), owner = structuredClone(configured);
  assertRetainedWaitSource(source);
  const root = runRoot(owner.storageRoot, source.runId, { maximumLegacyBytes: source.inventoryLimits.maximumTotalBytes });
  const pinned = new Map<string, fs.Stats>();
  let cursor = path.parse(root).root;
  for (const component of root.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    pinned.set(cursor, stat);
  }
  const rootStat = pinned.get(root)!;

  let remaining = source.inventoryLimits.maximumTotalBytes;
  let files = 0;
  const held = new Map<string, fs.Stats>();
  const read = (name: string, limit = remaining, prefixBytes?: number): Buffer => {
    if (++files > source.inventoryLimits.maximumFiles) fail();
    const file = path.join(root, name);
    if (prefixBytes !== undefined) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.nlink !== 1 || prefixBytes > Math.min(limit, remaining)) fail();
      const bytes = readAttemptJournalPrefix(file, Math.min(limit, remaining), prefixBytes);
      if (bytes.at(-1) !== 0x0a) fail();
      held.set(file, stat); remaining -= bytes.length;
      return bytes;
    }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > Math.min(limit, remaining)) fail();
      const bytes = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < bytes.length) {
        const count = fs.readSync(fd, bytes, size, bytes.length - size, size);
        if (count === 0) break;
        size += count;
      }
      const after = fs.fstatSync(fd);
      if (size !== stat.size || !unchanged(stat, after)) fail();
      held.set(file, stat); remaining -= size;
      return bytes.subarray(0, size);
    } finally { fs.closeSync(fd); }
  };
  const snapshot = JSON.parse(read('run-snapshot.json', source.inventoryLimits.maximumSnapshotBytes).toString());
  assertRunSnapshot(snapshot);
  if (snapshot.digest !== source.snapshotDigest) fail();
  const selected = snapshot.registry?.selectedProviders?.filter((entry: { capability: string }) => entry.capability === 'signal.wait');
  if (selected?.length !== 1 || selected[0].provider.package.package.pluginId !== 'kubeclaw.wait-store'
    || selected[0].provider.registrationId !== 'waits'
    || snapshot.registry.configuration?.adapters?.['kubeclaw.wait-store:waits']?.root !== owner.waitRoot) fail();
  // Count all four source files in one explicit budget, including the original lifecycle journal.
  const events = read('events.jsonl', remaining, source.eventsPrefixBytes);
  const effects = read('effects.jsonl', remaining, source.effectsPrefixBytes);
  const signals = read('signals.jsonl', remaining, source.signalsPrefixBytes);
  if (hash(effects) !== source.effectsDigest || hash(signals) !== source.signalsDigest) fail();
  const originalEvents: JournalRecord<{ type: string; identity: { runId: string } }>[] = [];
  parseJournalRecords(events, originalEvents, path.join(root, 'events.jsonl'));
  if (originalEvents.at(-1)?.hash !== source.runJournalHead
    || originalEvents.some(({ entry }) => entry.identity.runId !== source.runId)) fail();
  const terminal = originalEvents.filter(({ entry }) => entry.type.startsWith('run.')).at(-1)?.entry.type;
  if (!terminal || !['run.succeeded', 'run.failed', 'run.cancelled'].includes(terminal)) fail();
  const records: JournalRecord<{ type: string; request?: EffectRequest; receipt?: EffectReceipt }>[] = [];
  parseJournalRecords(effects, records, path.join(root, 'effects.jsonl'));
  const chosen = records.filter(({ entry }) => (entry.request?.idempotencyKey ?? entry.receipt?.idempotencyKey) === source.effectKey);
  if (chosen.map(record => record.entry.type).join(',') !== 'requested,accepted,completed') fail();
  const request = chosen[0]!.entry.request!, receipt = chosen[2]!.entry.receipt!;
  validateContractValue('effectRequest', request);
  validateContractValue('effectReceipt', receipt);
  if (!validEffectIdentity(request) || receipt.effectId !== request.effectId
    || receipt.idempotencyKey !== request.idempotencyKey) fail();
  const provider = selected[0].provider;
  if (request.capability !== 'signal.wait' || request.operation !== 'create' || request.attempt.runId !== source.runId
    || !same(request, chosen[1]!.entry.request) || receipt.status !== 'completed'
    || !same(receipt.adapter, { ...provider.package.package, registrationId: provider.registrationId })) fail();
  const wait = receipt.result?.wait as WaitRequest;
  validateContractValue('waitRequest', wait);
  const originalValue = { schemaVersion: 'wait-value.v1', wait };
  const originalMaximum = Number(snapshot.registry.configuration?.adapters?.['kubeclaw.wait-store:waits']?.maxEntryBytes ?? 1048576);
  if (!Number.isSafeInteger(originalMaximum) || originalMaximum < 1
    || Buffer.byteLength(canonicalJson(originalValue)) > originalMaximum
    || wait.waitId !== source.waitId || payloadDigest(originalValue) !== source.originalPayloadDigest) fail();
  const originalSignals: JournalRecord<Record<string, unknown>>[] = [];
  parseJournalRecords(signals, originalSignals, path.join(root, 'signals.jsonl'));
  const selectedSignals = originalSignals.filter(({ entry }) => entry.waitId === wait.waitId);
  if (selectedSignals.length !== 1) fail();
  const signal = selectedSignals[0]!.entry;
  validateContractValue('resumeSignal', signal);
  if (!same(signal.issuer, wait.authorizedIssuer) || signal.signalType !== wait.signalType) fail();
  const identities = [...held].map(([file, stat]) => ({ name: path.basename(file), dev: stat.dev, ino: stat.ino }));
  if (payloadDigest({ root, dev: rootStat.dev, ino: rootStat.ino, files: identities }) !== source.rootIdentityDigest) fail();
  for (const [file, stat] of held) {
    const current = fs.lstatSync(file);
    if (!current.isFile() || current.nlink !== 1 || current.dev !== stat.dev || current.ino !== stat.ino) fail();
    if (file.endsWith('run-snapshot.json') && !unchanged(stat, current)) fail();
    const prefix = file.endsWith('events.jsonl') ? source.eventsPrefixBytes
      : file.endsWith('effects.jsonl') ? source.effectsPrefixBytes
        : file.endsWith('signals.jsonl') ? source.signalsPrefixBytes : 0;
    if (current.size < prefix) fail();
  }
  for (const [directory, stat] of pinned) {
    const now = fs.lstatSync(directory);
    if (!now.isDirectory() || now.dev !== stat.dev || now.ino !== stat.ino) fail();
  }
  return structuredClone(wait);
}
function unchanged(before: fs.Stats, after: fs.Stats): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}
