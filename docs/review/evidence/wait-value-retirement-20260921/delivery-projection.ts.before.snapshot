import crypto from 'node:crypto';
import path from 'node:path';
import type { EffectRequest } from '@kubeclaw/plugin-sdk';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { payloadDigest, type DurableRecord } from '@kubeclaw/plugin-foundation/observability/record-retirement';
import type { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { parsePayload } from './payload.ts';

type Payload = Readonly<Record<string, unknown>>;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const same = (left: unknown, right: unknown) => payloadDigest(left) === payloadDigest(right);
function fail(): never { throw new Error('OPERATOR_PROJECTION_AUTHORITY_REQUIRED'); }
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const shape = (value: unknown, keys: string) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
export interface DeliveryProjectionIntent {
  readonly operationId: string;
  readonly actor: string;
  readonly runId: string;
  readonly runRoot: string;
  readonly deliveryRoot: string;
  readonly waitRoot: string;
  readonly effectKey: string;
  readonly expectedPayloadDigest: string;
  readonly terminalPayloadDigest: string;
  readonly runJournalHead: string;
  readonly snapshotDigest: string;
}
interface ProjectionReceipt {
  readonly schemaVersion: 'operator-request-projection-receipt.v1';
  readonly intent: DeliveryProjectionIntent;
  readonly intentDigest: string;
  readonly authorityDigest: string;
  readonly releasedBytesHex: string;
}
interface ProjectedRequest {
  readonly schemaVersion: 'notification-delivery-request-projected.v1';
  readonly originalDigest: string;
  readonly deliveryId: string;
  readonly target: string;
  readonly attempt: EffectRequest['attempt'];
  readonly effectId: string;
  readonly terminalKey: string;
  readonly terminalDigest: string;
  readonly projection: ProjectionReceipt;
}
export function deliveryRequestKey(request: EffectRequest): string {
  return `delivery:request:${hash(request.idempotencyKey)}`;
}
export function originalJsonDeliveryCandidate(request: EffectRequest, transportPayload?: Payload): Payload {
  if (request.deliveryId !== undefined || request.capability !== 'operator.request' || request.operation !== 'publish'
    || request.resource.type !== 'operator.target') fail();
  const payload = parsePayload(request.payload, 1048576);
  if (transportPayload !== undefined && !same(payload, transportPayload)) fail();
  return { schemaVersion: 'notification-delivery-request.v1', idempotencyKey: request.idempotencyKey,
    target: request.resource.canonicalId, payload };
}
export function assertDeliveryProjectionIntent(intent: DeliveryProjectionIntent): void {
  if (!shape(intent, 'actor,deliveryRoot,effectKey,expectedPayloadDigest,operationId,runId,runJournalHead,runRoot,snapshotDigest,terminalPayloadDigest,waitRoot')
    || ![intent.operationId, intent.actor, intent.runId, intent.effectKey].every(value => typeof value === 'string'
      && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value))
    || ![intent.runRoot, intent.deliveryRoot, intent.waitRoot].every(value => typeof value === 'string'
      && path.isAbsolute(value) && path.resolve(value) === value)
    || ![intent.expectedPayloadDigest, intent.terminalPayloadDigest, intent.runJournalHead, intent.snapshotDigest].every(digest)) fail();
}
function retainedTerminal(records: ReadonlyArray<DurableRecord>, request: EffectRequest): DurableRecord<Payload> {
  const stream = `notifications/${request.resource.canonicalId}`, suffix = `:${hash(request.idempotencyKey)}`;
  const selected = records.filter(record => record.stream === stream && record.idempotencyKey.endsWith(suffix)
    && record.idempotencyKey !== deliveryRequestKey(request));
  const key = `delivery:attempt-${request.attempt.attemptNumber}-${hash(request.attempt.attemptId).slice(0, 16)}${suffix}`;
  const terminal = selected[0] as DurableRecord<Payload> | undefined;
  if (selected.length !== 1 || !terminal || terminal.idempotencyKey !== key
    || !shape(terminal.payload, 'attempt,receipt,schemaVersion')
    || terminal.payload.schemaVersion !== 'notification-delivery-receipt.v1'
    || !same(terminal.payload.attempt, request.attempt)) fail();
  assertJsonReceipt(terminal.payload.receipt as Payload | undefined, request.resource.canonicalId);
  return terminal;
}
function assertJsonReceipt(receipt: Payload | undefined, target: string): void {
  if (!receipt || receipt.accepted !== true || receipt.target !== target
    || !Number.isInteger(receipt.status) || Number(receipt.status) < 200 || Number(receipt.status) >= 300
    || Object.keys(receipt).some(key => !['accepted', 'target', 'status', 'messageId'].includes(key))
    || (receipt.messageId !== undefined && (typeof receipt.messageId !== 'string' || !receipt.messageId || receipt.messageId.length > 512))) fail();
}
function assertProjection(value: ProjectedRequest, request: EffectRequest, terminal: DurableRecord<Payload>, candidate: Payload): void {
  if (!shape(value, 'attempt,deliveryId,effectId,originalDigest,projection,schemaVersion,target,terminalDigest,terminalKey')
    || !shape(value.projection, 'authorityDigest,intent,intentDigest,releasedBytesHex,schemaVersion')) fail();
  const receipt = value.projection;
  assertDeliveryProjectionIntent(receipt.intent);
  if (receipt.schemaVersion !== 'operator-request-projection-receipt.v1'
    || !digest(receipt.authorityDigest) || receipt.intentDigest !== payloadDigest(receipt.intent)
    || !/^[a-f0-9]{16}$/u.test(receipt.releasedBytesHex) || Number.parseInt(receipt.releasedBytesHex, 16) < 1
    || !Number.isSafeInteger(Number.parseInt(receipt.releasedBytesHex, 16))) fail();
  assertProjectionBinding(value, request, terminal, candidate);
}
function assertProjectionBinding(value: ProjectedRequest, request: EffectRequest, terminal: DurableRecord<Payload>, candidate: Payload): void {
  const receipt = value.projection;
  if (value.originalDigest !== payloadDigest(candidate) || value.originalDigest !== receipt.intent.expectedPayloadDigest
    || value.deliveryId !== request.idempotencyKey || receipt.intent.effectKey !== request.idempotencyKey
    || value.target !== request.resource.canonicalId || !same(value.attempt, request.attempt)
    || receipt.intent.runId !== request.attempt.runId || value.effectId !== request.effectId
    || value.terminalKey !== terminal.idempotencyKey || value.terminalDigest !== terminal.payloadDigest
    || receipt.intent.terminalPayloadDigest !== terminal.payloadDigest) fail();
}
/** Projected replay validates the original candidate even when failDelivery has no transport payload. */
export function projectedDeliveryReceipt(records: ReadonlyArray<DurableRecord>, request: EffectRequest, transportPayload?: Payload): Payload | undefined {
  const record = records.find(entry => entry.stream === `notifications/${request.resource.canonicalId}`
    && entry.idempotencyKey === deliveryRequestKey(request));
  if ((record?.payload as Payload | undefined)?.schemaVersion !== 'notification-delivery-request-projected.v1') return undefined;
  const candidate = originalJsonDeliveryCandidate(request, transportPayload), terminal = retainedTerminal(records, request);
  assertProjection(record!.payload as ProjectedRequest, request, terminal, candidate);
  return terminal.payload.receipt as Payload;
}

/** Caller must hold original Core/wait fences and provide synchronous full causal authorization. */
export async function projectDeliveryRequest(records: FileDurableRecordStore, request: EffectRequest, intent: DeliveryProjectionIntent,
  authorityDigest: string, authorize: (records: ReadonlyArray<DurableRecord>) => void): Promise<{ newlyProjected: boolean; releasedBytes: number }> {
  request = structuredClone(request); intent = structuredClone(intent);
  assertDeliveryProjectionIntent(intent);
  const candidate = originalJsonDeliveryCandidate(request), stream = `notifications/${request.resource.canonicalId}`;
  if (!digest(authorityDigest) || intent.runId !== request.attempt.runId || intent.effectKey !== request.idempotencyKey
    || intent.expectedPayloadDigest !== payloadDigest(candidate)) fail();
  const observed = await records.read(stream), terminal = retainedTerminal(observed, request);
  if (terminal.payloadDigest !== intent.terminalPayloadDigest) fail();
  if (projectedDeliveryReceipt(observed, request)) {
    return records.withRecords(stream, async current => {
      if (!projectedDeliveryReceipt(current, request)) fail();
      const stored = current.find(record => record.idempotencyKey === deliveryRequestKey(request))!.payload as ProjectedRequest;
      if (!same(stored.projection.intent, intent) || stored.projection.authorityDigest !== authorityDigest) fail();
      if (authorize(current) !== undefined) fail();
      return { newlyProjected: false, releasedBytes: 0 };
    });
  }
  const projection: ProjectionReceipt = { schemaVersion: 'operator-request-projection-receipt.v1', intent,
    intentDigest: payloadDigest(intent), authorityDigest, releasedBytesHex: '0000000000000000' };
  const value: ProjectedRequest = { schemaVersion: 'notification-delivery-request-projected.v1', originalDigest: intent.expectedPayloadDigest,
    deliveryId: request.idempotencyKey, target: request.resource.canonicalId, attempt: request.attempt, effectId: request.effectId,
    terminalKey: terminal.idempotencyKey, terminalDigest: terminal.payloadDigest, projection };
  const original = observed.find(record => record.idempotencyKey === deliveryRequestKey(request));
  if (!original || original.payloadDigest !== intent.expectedPayloadDigest) fail();
  const replacement = { ...original, committedAt: '2000-01-01T00:00:00.000Z', payloadDigest: payloadDigest(value), payload: value };
  const releasedBytes = Buffer.byteLength(canonicalJson(original)) - Buffer.byteLength(canonicalJson(replacement));
  if (releasedBytes < 1) throw new Error('OPERATOR_PROJECTION_NO_NET_SAVINGS');
  const retained = { ...value, projection: { ...projection, releasedBytesHex: releasedBytes.toString(16).padStart(16, '0') } };
  await records.transition(stream, deliveryRequestKey(request), intent.expectedPayloadDigest, retained, current => {
    const actual = retainedTerminal(current, request);
    if (actual.payloadDigest !== terminal.payloadDigest) fail();
    if (authorize(current) !== undefined) fail();
  });
  return { newlyProjected: true, releasedBytes };
}
