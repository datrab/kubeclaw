import crypto from 'node:crypto';
import path from 'node:path';
import type { RetainedWaitResolver, RetainedWaitSource, WaitRequest } from '@kubeclaw/plugin-sdk';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { payloadDigest, type DurableRecord } from './record-retirement.ts';
import type { FileDurableRecordStore } from './durable-records.ts';

type Payload = Readonly<Record<string, unknown>>;
export interface WaitProjectionIntent {
  readonly operationId: string;
  readonly actor: string;
  readonly waitRoot: string;
  readonly deliveryRoot: string;
  readonly operatorEffectKey: string;
  readonly terminalPayloadDigest: string;
  readonly source: RetainedWaitSource;
}
export interface WaitValueProjection {
  readonly schemaVersion: 'wait-value-projected.v1';
  readonly originalDigest: string;
  readonly source: RetainedWaitSource;
  readonly projection: {
    readonly schemaVersion: 'wait-value-projection-receipt.v1';
    readonly intent: WaitProjectionIntent;
    readonly intentDigest: string;
    readonly authorityDigest: string;
    readonly releasedBytesHex: string;
  };
}
const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256
  && !/[\u0000-\u001f\u007f]/u.test(value);
const shape = (value: unknown, keys: string): boolean => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
function fail(): never { throw new Error('WAIT_PROJECTION_AUTHORITY_REQUIRED'); }

export function assertRetainedWaitSource(source: RetainedWaitSource): void {
  if (!shape(source, 'effectKey,effectsDigest,effectsPrefixBytes,eventsDigest,eventsPrefixBytes,inventoryLimits,originalPayloadDigest,rootIdentityDigest,runId,runJournalHead,schemaVersion,signalsDigest,signalsPrefixBytes,snapshotDigest,waitId')
    || source.schemaVersion !== 'retained-core-wait-source.v1'
    || ![source.runId, source.effectKey, source.waitId].every(id)
    || ![source.eventsDigest, source.effectsDigest, source.originalPayloadDigest, source.rootIdentityDigest, source.runJournalHead,
      source.signalsDigest, source.snapshotDigest].every(digest)
    || ![source.eventsPrefixBytes, source.effectsPrefixBytes, source.signalsPrefixBytes].every(value => Number.isSafeInteger(value) && value > 0)
    || !shape(source.inventoryLimits, 'maximumFiles,maximumSnapshotBytes,maximumTotalBytes')
    || !Object.values(source.inventoryLimits).every(value => Number.isSafeInteger(value) && value > 0)
    || source.waitId !== `wait:${crypto.createHash('sha256').update(source.effectKey).digest('hex')}`) fail();
}
export function assertWaitProjectionIntent(intent: WaitProjectionIntent): void {
  if (!shape(intent, 'actor,deliveryRoot,operationId,operatorEffectKey,source,terminalPayloadDigest,waitRoot')
    || ![intent.actor, intent.operationId, intent.operatorEffectKey].every(id)
    || !digest(intent.terminalPayloadDigest)
    || ![intent.waitRoot, intent.deliveryRoot].every(value => typeof value === 'string'
      && path.isAbsolute(value) && path.resolve(value) === value)
    || intent.waitRoot === intent.deliveryRoot) fail();
  assertRetainedWaitSource(intent.source);
}
export function assertWaitProjection(value: WaitValueProjection, key: string): void {
  if (!shape(value, 'originalDigest,projection,schemaVersion,source') || value.schemaVersion !== 'wait-value-projected.v1'
    || !shape(value.projection, 'authorityDigest,intent,intentDigest,releasedBytesHex,schemaVersion')) fail();
  assertRetainedWaitSource(value.source);
  const receipt = value.projection;
  assertWaitProjectionIntent(receipt.intent);
  if (receipt.schemaVersion !== 'wait-value-projection-receipt.v1' || !digest(receipt.authorityDigest)
    || receipt.intentDigest !== payloadDigest(receipt.intent) || payloadDigest(value.source) !== payloadDigest(receipt.intent.source)
    || value.originalDigest !== value.source.originalPayloadDigest || key !== value.source.effectKey
    || typeof receipt.releasedBytesHex !== 'string' || !/^[a-f0-9]{16}$/u.test(receipt.releasedBytesHex)
    || !Number.isSafeInteger(Number.parseInt(receipt.releasedBytesHex, 16))
    || Number.parseInt(receipt.releasedBytesHex, 16) < 1) fail();
}
/** Shared by the actual adapter and the operator authority reader. */
export function resolveWaitValue(record: DurableRecord<Payload>, resolve?: RetainedWaitResolver): { schemaVersion: 'wait-value.v1'; wait: WaitRequest } {
  if (record.payload.schemaVersion === 'wait-value.v1') return record.payload as { schemaVersion: 'wait-value.v1'; wait: WaitRequest };
  const value = record.payload as unknown as WaitValueProjection;
  assertWaitProjection(value, record.idempotencyKey);
  if (!resolve) fail();
  const wait = resolve(structuredClone(value.source));
  const original = { schemaVersion: 'wait-value.v1' as const, wait };
  if (wait.waitId !== value.source.waitId || payloadDigest(original) !== value.originalDigest) fail();
  return original;
}

/** Owner holds Run mutation ownership. This operation then holds Wait → Delivery. */
export async function projectWaitValue(store: FileDurableRecordStore, deliveries: FileDurableRecordStore,
  deliveryStream: string, intentInput: WaitProjectionIntent, authorityDigest: string, resolve: RetainedWaitResolver,
  authorize: (waits: readonly DurableRecord[], receipts: readonly DurableRecord[]) => void,
): Promise<{ newlyProjected: boolean; releasedBytes: number }> {
  const intent = structuredClone(intentInput);
  assertWaitProjectionIntent(intent);
  if (!digest(authorityDigest) || !deliveryStream.startsWith('notifications/')) fail();
  const original = (await store.read<Payload>('waits/all')).find(record => record.idempotencyKey === intent.source.effectKey);
  if (!original) fail();
  const resolved = resolveWaitValue(original, resolve);
  if (payloadDigest(resolved) !== intent.source.originalPayloadDigest) fail();
  if (original.payload.schemaVersion === 'wait-value-projected.v1') {
    return store.withRetainedRecords<Payload, { newlyProjected: boolean; releasedBytes: number }>('waits/all',
      deliveries, deliveryStream, async (waits, receipts) => {
        const current = waits.find(record => record.idempotencyKey === intent.source.effectKey);
        if (!current || current.payload.schemaVersion !== 'wait-value-projected.v1') fail();
        resolveWaitValue(current, resolve);
        const value = current.payload as unknown as WaitValueProjection;
        if (payloadDigest(value.projection.intent) !== payloadDigest(intent) || value.projection.authorityDigest !== authorityDigest) fail();
        if (authorize(waits, receipts) !== undefined) fail();
        return { newlyProjected: false, releasedBytes: 0 };
      });
  }
  if (original.payloadDigest !== intent.source.originalPayloadDigest) fail();
  const value: WaitValueProjection = { schemaVersion: 'wait-value-projected.v1', originalDigest: original.payloadDigest,
    source: intent.source, projection: { schemaVersion: 'wait-value-projection-receipt.v1', intent,
      intentDigest: payloadDigest(intent), authorityDigest, releasedBytesHex: '0000000000000000' } };
  const replacement = { ...original, committedAt: '2000-01-01T00:00:00.000Z', payloadDigest: payloadDigest(value), payload: value };
  const releasedBytes = Buffer.byteLength(canonicalJson(original)) - Buffer.byteLength(canonicalJson(replacement));
  if (releasedBytes < 1) throw new Error('WAIT_PROJECTION_NO_NET_SAVINGS');
  const retained = { ...value, projection: { ...value.projection, releasedBytesHex: releasedBytes.toString(16).padStart(16, '0') } };
  await store.transitionWithRetainedStore('waits/all', intent.source.effectKey, original.payloadDigest, retained,
    deliveries, deliveryStream, (waits, receipts) => {
      if (payloadDigest(resolve(intent.source)) !== payloadDigest(resolved.wait)) fail();
      if (authorize(waits, receipts) !== undefined) fail();
    });
  return { newlyProjected: true, releasedBytes };
}
