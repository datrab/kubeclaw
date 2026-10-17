import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalJson, type RetainedWaitSource, type WaitRequest, type EffectRequest,
  type EffectReceipt, type RegistrationProvenance } from '@kubeclaw/plugin-sdk';
import { assertRetainedWaitSource } from '@kubeclaw/plugin-foundation/observability/wait-projection';
import { payloadDigest } from '@kubeclaw/plugin-foundation/observability/record-retirement';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { runRoot } from '../execution/run-root.ts';
import { assertRunSnapshot, type RunSnapshot } from '../execution/engine-snapshots.ts';
import { validEffectIdentity } from '../effects/identity.ts';
import { parseJournalRecords, type JournalRecord } from './journal.ts';
import { RetainedWaitFiles, retainedWaitFailure as fail } from './wait-projection-source.ts';

interface Owner {
  readonly storageRoot: string;
  readonly waitRoot: string;
  readonly orchestratorIssuerId: string;
}
interface WaitContext { readonly provider: RegistrationProvenance; readonly maximumEntryBytes: number }
const hash = (bytes: Buffer): string => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

function pinnedContext(snapshot: RunSnapshot, source: RetainedWaitSource, owner: Owner): WaitContext {
  assertRunSnapshot(snapshot);
  if (snapshot.digest !== source.snapshotDigest) fail();
  const registry = snapshot.registry as {
    selectedProviders?: { capability: string; provider: RegistrationProvenance }[];
    configuration?: { adapters?: Record<string, { root?: unknown; maxEntryBytes?: unknown }> };
  };
  const selected = registry.selectedProviders?.filter(entry => entry.capability === 'signal.wait');
  const config = registry.configuration?.adapters?.['kubeclaw.wait-store:waits'];
  if (!selected || !config) return fail();
  if (selected.length !== 1 || selected[0]!.provider.package.package.pluginId !== 'kubeclaw.wait-store'
    || selected[0]!.provider.registrationId !== 'waits' || config.root !== owner.waitRoot) fail();
  const maximumEntryBytes = Number(config.maxEntryBytes);
  if (typeof config.maxEntryBytes !== 'number' || !Number.isSafeInteger(maximumEntryBytes) || maximumEntryBytes < 1) fail();
  return { provider: selected[0]!.provider, maximumEntryBytes };
}

function originalEvents(bytes: Buffer, source: RetainedWaitSource, root: string): void {
  const records: JournalRecord<{ type: string; identity: { runId: string } }>[] = [];
  parseJournalRecords(bytes, records, path.join(root, 'events.jsonl'));
  if (records.at(-1)?.hash !== source.runJournalHead || records.some(({ entry }) => entry.identity.runId !== source.runId)) fail();
  const terminal = records.filter(({ entry }) => entry.type.startsWith('run.')).at(-1)?.entry.type;
  if (!terminal || !['run.succeeded', 'run.failed', 'run.cancelled'].includes(terminal)) fail();
}

function originalWait(bytes: Buffer, source: RetainedWaitSource, root: string, context: WaitContext): WaitRequest {
  const records: JournalRecord<{ type: string; request?: EffectRequest; receipt?: EffectReceipt }>[] = [];
  parseJournalRecords(bytes, records, path.join(root, 'effects.jsonl'));
  const chosen = records.filter(({ entry }) => (entry.request?.idempotencyKey ?? entry.receipt?.idempotencyKey) === source.effectKey);
  if (chosen.map(record => record.entry.type).join(',') !== 'requested,accepted,completed') fail();
  const request = chosen[0]!.entry.request!, receipt = chosen[2]!.entry.receipt!;
  validateContractValue('effectRequest', request); validateContractValue('effectReceipt', receipt);
  if (!validEffectIdentity(request) || receipt.effectId !== request.effectId || receipt.idempotencyKey !== request.idempotencyKey) fail();
  if (request.capability !== 'signal.wait' || request.operation !== 'create' || request.attempt.runId !== source.runId
    || !same(request, chosen[1]!.entry.request) || receipt.status !== 'completed'
    || !same(receipt.adapter, { ...context.provider.package.package, registrationId: context.provider.registrationId })) fail();
  const wait = receipt.result?.wait as WaitRequest;
  validateContractValue('waitRequest', wait);
  return wait;
}

function originalValue(wait: WaitRequest, source: RetainedWaitSource, context: WaitContext): void {
  const value = { schemaVersion: 'wait-value.v1', wait };
  if (Buffer.byteLength(canonicalJson(value)) > context.maximumEntryBytes
    || wait.waitId !== source.waitId || payloadDigest(value) !== source.originalPayloadDigest) fail();
}

function originalSignal(bytes: Buffer, wait: WaitRequest, root: string): void {
  const records: JournalRecord<Record<string, unknown>>[] = [];
  parseJournalRecords(bytes, records, path.join(root, 'signals.jsonl'));
  const selected = records.filter(({ entry }) => entry.waitId === wait.waitId);
  if (selected.length !== 1) fail();
  const signal = selected[0]!.entry;
  validateContractValue('resumeSignal', signal);
  if (!same(signal.issuer, wait.authorizedIssuer) || signal.signalType !== wait.signalType) fail();
}

/** Reconstruct the original value; unrelated current tails supply no authority and are not opened. */
export function resolveRetainedCoreWait(input: RetainedWaitSource, configured: Owner): WaitRequest {
  const source = structuredClone(input), owner = structuredClone(configured);
  assertRetainedWaitSource(source);
  const root = runRoot(owner.storageRoot, source.runId, { maximumLegacyBytes: source.inventoryLimits.maximumTotalBytes });
  const files = new RetainedWaitFiles(root, source.inventoryLimits);
  const context = pinnedContext(JSON.parse(files.snapshot().toString()), source, owner);
  const events = files.prefix('events.jsonl', source.eventsPrefixBytes);
  const effects = files.prefix('effects.jsonl', source.effectsPrefixBytes);
  const signals = files.prefix('signals.jsonl', source.signalsPrefixBytes);
  if (hash(events) !== source.eventsDigest || hash(effects) !== source.effectsDigest || hash(signals) !== source.signalsDigest) fail();
  originalEvents(events, source, root);
  const wait = originalWait(effects, source, root, context);
  originalValue(wait, source, context); originalSignal(signals, wait, root);
  files.verify(source.rootIdentityDigest);
  return structuredClone(wait);
}
