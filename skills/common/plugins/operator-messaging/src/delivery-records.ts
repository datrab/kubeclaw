import crypto from 'node:crypto';
import type { EffectRequest } from '@kubeclaw/plugin-sdk';
import type { FileDurableRecordStore, DurableRecord } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { projectedDeliveryReceipt } from './delivery-projection.ts';

type Payload = Readonly<Record<string, unknown>>;
export interface Reservation { readonly stream: string; readonly key: string; readonly digest: string; }
function hash(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
function key(deliveryId: string, kind: string): string { return `delivery:${kind}:${hash(deliveryId)}`; }
export function deliveryIdentity(request: EffectRequest): string { return request.deliveryId ?? request.idempotencyKey; }
function completed(records: readonly DurableRecord<Payload>[], deliveryId: string): Payload | undefined {
  return records.find(entry => entry.idempotencyKey.endsWith(`:${hash(deliveryId)}`)
    && entry.payload.schemaVersion === 'notification-delivery-receipt.v1')?.payload.receipt as Payload | undefined;
}

export async function deliveryReceipt(records: FileDurableRecordStore, request: EffectRequest, transportPayload?: Payload): Promise<Payload | undefined> {
  const entries = await records.read<Payload>(`notifications/${request.resource.canonicalId}`);
  const projected = projectedDeliveryReceipt(entries, request, transportPayload);
  if (projected) return projected;
  if (request.deliveryId !== undefined) {
    const original = entries.find(entry => entry.idempotencyKey === key(request.deliveryId!, 'request'))?.payload;
    if (!original) return undefined;
    const owner = original.owner as Payload | undefined;
    if (original.schemaVersion !== 'notification-delivery-request.v2' || original.idempotencyKey !== request.deliveryId
      || original.target !== request.resource.canonicalId || owner?.runId !== request.attempt.runId || owner.stageId !== request.attempt.stageId
      || (transportPayload !== undefined && original.transportBody !== JSON.stringify(transportPayload))) throw new Error('OPERATOR_RECEIPT_REQUEST_UNBOUND');
  }
  return completed(entries, deliveryIdentity(request));
}

export async function reserveDelivery(records: FileDurableRecordStore, request: EffectRequest, payload: Payload, receiverSupported: boolean): Promise<Reservation | Payload> {
  const deliveryId = deliveryIdentity(request), stream = `notifications/${request.resource.canonicalId}`;
  const projected = projectedDeliveryReceipt(await records.read(stream), request, payload);
  if (projected) return projected;
  try { await records.append(stream, key(deliveryId, 'request'), request.deliveryId === undefined
    ? { schemaVersion: 'notification-delivery-request.v1', idempotencyKey: deliveryId, target: request.resource.canonicalId, payload }
    : { schemaVersion: 'notification-delivery-request.v2', idempotencyKey: deliveryId, target: request.resource.canonicalId,
      owner: { runId: request.attempt.runId, stageId: request.attempt.stageId }, transportBody: JSON.stringify(payload) }); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'DURABLE_RECORD_IDEMPOTENCY_CONFLICT') throw error;
    const raced = projectedDeliveryReceipt(await records.read(stream), request, payload);
    if (raced) return raced;
    throw error;
  }
  const prior = await records.read<Payload>(stream), receipt = completed(prior, deliveryId);
  if (receipt) return receipt;
  const uncertain = prior.some(entry => entry.idempotencyKey.endsWith(`:${hash(deliveryId)}`)
    && ['notification-delivery-reservation.v1', 'notification-delivery-failure.v1'].includes(String(entry.payload.schemaVersion))
    && entry.payload.outcome !== 'not_sent');
  if (uncertain && !receiverSupported) throw new Error('OPERATOR_DELIVERY_UNRESOLVED:receiver_receipt_required');
  const terminalKey = key(deliveryId, `attempt-${request.attempt.attemptNumber}-${hash(request.attempt.attemptId).slice(0, 16)}`);
  const existing = prior.find(entry => entry.idempotencyKey === terminalKey);
  const reserved = existing ?? (await records.append<Payload>(stream, terminalKey, {
    schemaVersion: 'notification-delivery-reservation.v1', attempt: request.attempt, reserved: ' '.repeat(8192),
  })).record;
  if (reserved.payload.schemaVersion === 'notification-delivery-failure.v1') throw new Error(String(reserved.payload.error));
  return { stream, key: terminalKey, digest: reserved.payloadDigest };
}

export async function completeDelivery(records: FileDurableRecordStore, request: EffectRequest, reservation: Reservation, receipt: Payload): Promise<Payload> {
  const payload = { schemaVersion: 'notification-delivery-receipt.v1', attempt: request.attempt, receipt };
  try { await records.transition(reservation.stream, reservation.key, reservation.digest, payload); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'DURABLE_RECORD_TRANSITION_CONFLICT') throw error;
    const current = await records.read<Payload>(reservation.stream), accepted = projectedDeliveryReceipt(current, request)
      ?? completed(current, deliveryIdentity(request));
    if (accepted) return accepted;
    const terminal = current.find(entry => entry.idempotencyKey === reservation.key);
    if (!terminal) throw error;
    await records.transition(reservation.stream, reservation.key, terminal.payloadDigest, payload);
  }
  return receipt;
}

export async function failDelivery(records: FileDurableRecordStore, request: EffectRequest, reservation: Reservation, sent: boolean, error: unknown): Promise<Payload> {
  const reason = error instanceof Error ? error.message : String(error);
  try {
    await records.transition(reservation.stream, reservation.key, reservation.digest, {
      schemaVersion: 'notification-delivery-failure.v1', idempotencyKey: deliveryIdentity(request), target: request.resource.canonicalId,
      attempt: request.attempt, outcome: sent ? 'possible' : 'not_sent', reasonId: hash(reason).slice(0, 16), error: reason.slice(0, 2048),
    });
  } catch (transitionError) {
    if (transitionError instanceof Error && transitionError.message === 'DURABLE_RECORD_TRANSITION_CONFLICT') {
      const accepted = await deliveryReceipt(records, request); if (accepted) return accepted;
    }
    throw transitionError;
  }
  throw error;
}

/** A lookup never reserves or transmits. Legacy records without explicit ownership cannot authorize a handoff. */
export async function lookupDelivery(records: FileDurableRecordStore, request: EffectRequest, deliveryId: string, stageId: string, payload: Payload): Promise<Payload> {
  const entries = await records.read<Payload>(`notifications/${request.resource.canonicalId}`);
  const original = entries.find(entry => entry.idempotencyKey === key(deliveryId, 'request'))?.payload;
  assertLookupRequest(original,request,deliveryId,stageId,payload);
  const terminals = entries.filter(entry => entry.idempotencyKey.endsWith(`:${hash(deliveryId)}`)
    && entry.payload.schemaVersion === 'notification-delivery-receipt.v1');
  if (terminals.length !== 1) throw new Error('OPERATOR_RECEIPT_UNRESOLVED');
  const terminal = terminals[0]!.payload;
  const attempt = terminal.attempt as Payload | undefined;
  if (attempt?.runId !== request.attempt.runId || attempt.stageId !== stageId) throw new Error('OPERATOR_RECEIPT_OWNER_UNBOUND');
  const receipt = terminal.receipt;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('OPERATOR_RECEIPT_UNRESOLVED');
  return receipt as Payload;
}

function assertLookupRequest(original:Payload|undefined,request:EffectRequest,deliveryId:string,stageId:string,payload:Payload) {
  const owner = original?.owner as Payload | undefined;
  if (!original || original.schemaVersion !== 'notification-delivery-request.v2'
    || original.idempotencyKey !== deliveryId || original.target !== request.resource.canonicalId
    || owner?.runId !== request.attempt.runId || owner.stageId !== stageId
    || original.transportBody !== JSON.stringify(payload)) throw new Error('OPERATOR_RECEIPT_REQUEST_UNBOUND');
}
