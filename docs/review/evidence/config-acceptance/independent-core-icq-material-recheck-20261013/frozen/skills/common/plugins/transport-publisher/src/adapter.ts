import crypto from 'node:crypto';
import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';

interface TargetConfig {
  readonly endpoint: string;
  readonly signingSecret: string;
  readonly maxPayloadBytes: number;
}

const TARGET_ID = /^[a-z][a-z0-9._-]{0,127}$/;
const PUBLICATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DEFAULT_MAX_PAYLOAD_BYTES = 262_144;
const MAX_PAYLOAD_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 64;
const TERMINAL_RESERVATION_BYTES = 8_192;
const DELIVERY_RECORD_MAX_BYTES = MAX_PAYLOAD_BYTES + 65_536;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], code: string): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some((key) => !accepted.has(key))) throw new Error(code);
}

function positiveInteger(value: unknown, fallback: number): number {
  const resolved = value ?? fallback;
  if (
    !Number.isSafeInteger(resolved)
    || Number(resolved) < 1
    || Number(resolved) > MAX_PAYLOAD_BYTES
  ) {
    throw new Error('TRANSPORT_CONFIG_INVALID:maxPayloadBytes');
  }
  return Number(resolved);
}

function storeLimit(value: unknown, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || Number(resolved) < 1) {
    throw new Error(`TRANSPORT_CONFIG_INVALID:${field}`);
  }
  return Number(resolved);
}

function endpoint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('TRANSPORT_CONFIG_INVALID:endpoint');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('TRANSPORT_CONFIG_INVALID:endpoint');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error('TRANSPORT_CONFIG_INVALID:endpoint');
  }
  return parsed.href;
}

function readConfig(config: Readonly<Record<string, unknown>>): {
  readonly targets: ReadonlyMap<string, TargetConfig>;
  readonly deliveryRoot: string;
  readonly maximumDeliveryRecords: number;
  readonly maximumDeliveryBytes: number;
} {
  exactKeys(config as Record<string, unknown>, [
    'targets', 'deliveryRoot', 'maximumDeliveryRecords', 'maximumDeliveryBytes',
  ], 'TRANSPORT_CONFIG_INVALID:unknownField');
  if (!plainRecord(config.targets) || Object.keys(config.targets).length === 0) {
    throw new Error('TRANSPORT_CONFIG_INVALID:targets');
  }
  const targets = new Map<string, TargetConfig>();
  for (const [id, rawTarget] of Object.entries(config.targets)) {
    if (!TARGET_ID.test(id) || !plainRecord(rawTarget)) throw new Error(`TRANSPORT_CONFIG_INVALID:target:${id}`);
    exactKeys(rawTarget, ['endpoint', 'signingSecret', 'maxPayloadBytes'], `TRANSPORT_CONFIG_INVALID:target:${id}`);
    if (typeof rawTarget.signingSecret !== 'string' || !TARGET_ID.test(rawTarget.signingSecret)) {
      throw new Error(`TRANSPORT_CONFIG_INVALID:signingSecret:${id}`);
    }
    targets.set(id, Object.freeze({
      endpoint: endpoint(rawTarget.endpoint),
      signingSecret: rawTarget.signingSecret,
      maxPayloadBytes: positiveInteger(rawTarget.maxPayloadBytes, DEFAULT_MAX_PAYLOAD_BYTES),
    }));
  }
  if (typeof config.deliveryRoot !== 'string' || config.deliveryRoot.length === 0) {
    throw new Error('TRANSPORT_CONFIG_INVALID:deliveryRoot');
  }
  const maximumDeliveryRecords = storeLimit(config.maximumDeliveryRecords, 100_000, 'maximumDeliveryRecords');
  const maximumDeliveryBytes = storeLimit(config.maximumDeliveryBytes, 256 * 1024 * 1024, 'maximumDeliveryBytes');
  return { targets, deliveryRoot: config.deliveryRoot, maximumDeliveryRecords, maximumDeliveryBytes };
}

function assertJsonKey(key: string): void {
  if (
    key.length < 1
    || key.length > 128
    || /[\u0000-\u001f\u007f]/.test(key)
    || ['__proto__', 'constructor', 'prototype'].includes(key)
  ) throw new Error('TRANSPORT_PAYLOAD_INVALID');
}

function assertJsonObject(value: object, seen: Set<object>, depth: number): void {
  if (seen.has(value)) throw new Error('TRANSPORT_PAYLOAD_CYCLIC');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJson(item, seen, depth + 1);
  } else {
    if (!plainRecord(value)) throw new Error('TRANSPORT_PAYLOAD_INVALID');
    for (const [key, item] of Object.entries(value)) {
      assertJsonKey(key);
      assertJson(item, seen, depth + 1);
    }
  }
  seen.delete(value);
}

function assertJson(value: unknown, seen: Set<object>, depth: number): void {
  if (depth > MAX_JSON_DEPTH) throw new Error('TRANSPORT_PAYLOAD_DEPTH_EXCEEDED');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('TRANSPORT_PAYLOAD_INVALID');
    return;
  }
  if (typeof value !== 'object') throw new Error('TRANSPORT_PAYLOAD_INVALID');
  assertJsonObject(value, seen, depth);
}

function publicationBody(payload: Readonly<Record<string, unknown>>, maxBytes: number): {
  readonly body: Readonly<Record<string, unknown>>;
  readonly serialized: string;
} {
  if (!plainRecord(payload)) throw new Error('TRANSPORT_PAYLOAD_INVALID');
  exactKeys(payload, ['message'], 'TRANSPORT_PAYLOAD_UNKNOWN_FIELD');
  if (!plainRecord(payload.message)) throw new Error('TRANSPORT_MESSAGE_INVALID');
  assertJson(payload.message, new Set(), 0);
  const body = Object.freeze({ message: payload.message });
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error('TRANSPORT_PAYLOAD_SIZE_EXCEEDED');
  return { body, serialized };
}

function secretValue(value: Readonly<Record<string, unknown>>): string {
  exactKeys(value as Record<string, unknown>, ['value'], 'TRANSPORT_SECRET_RESPONSE_INVALID');
  if (typeof value.value !== 'string' || value.value.length === 0 || /[\r\n]/.test(value.value)) {
    throw new Error('TRANSPORT_SECRET_INVALID');
  }
  return value.value;
}

function validateResponse(value: Readonly<Record<string, unknown>>): {
  readonly status: number;
  readonly publicationId: string;
} {
  if (!Number.isSafeInteger(value.status) || Number(value.status) < 200 || Number(value.status) > 299) {
    throw new Error('TRANSPORT_RESPONSE_STATUS_INVALID');
  }
  if (!plainRecord(value.body)) throw new Error('TRANSPORT_RESPONSE_BODY_INVALID');
  exactKeys(value.body, ['accepted', 'publicationId'], 'TRANSPORT_RESPONSE_BODY_INVALID');
  if (value.body.accepted !== true) throw new Error('TRANSPORT_PUBLICATION_REJECTED');
  if (typeof value.body.publicationId !== 'string' || !PUBLICATION_ID.test(value.body.publicationId)) {
    throw new Error('TRANSPORT_PUBLICATION_ID_INVALID');
  }
  return { status: Number(value.status), publicationId: value.body.publicationId };
}

function deliveryRecordKey(idempotencyKey: string, kind: string): string {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
  return `delivery:${kind}:${digest}`;
}

function terminalRecordKey(idempotencyKey: string, attemptId: string, attemptNumber: number): string {
  const attempt = crypto.createHash('sha256').update(attemptId).digest('hex').slice(0, 16);
  return deliveryRecordKey(idempotencyKey, `attempt-${attemptNumber}-${attempt}`);
}

function completedReceipt(
  records: ReadonlyArray<{
    readonly idempotencyKey: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }>,
  idempotencyKey: string,
): Readonly<Record<string, unknown>> | undefined {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
  const completed = records.find((entry) =>
    entry.idempotencyKey.endsWith(`:${digest}`)
    && entry.payload.schemaVersion === 'transport-publication-receipt.v1');
  return completed?.payload.receipt as Readonly<Record<string, unknown>> | undefined;
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const config = readConfig(context.config);
  const targets = config.targets;
  const records = new FileDurableRecordStore(config.deliveryRoot, {
    maximumRecords: config.maximumDeliveryRecords,
    maximumBytes: config.maximumDeliveryBytes,
    maximumRecordBytes: DELIVERY_RECORD_MAX_BYTES,
  });
  let shuttingDown = false;
  return {
    async ready() {
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
    },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (request.capability !== 'transport.publish' || request.operation !== 'publish') {
        throw new Error('TRANSPORT_OPERATION_UNSUPPORTED');
      }
      if (request.resource.type !== 'transport.target') {
        throw new Error('TRANSPORT_RESOURCE_TYPE_INVALID');
      }
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`TRANSPORT_TARGET_UNKNOWN:${request.resource.canonicalId}`);
      const publication = publicationBody(request.payload, target.maxPayloadBytes);
      const stream = `publications/${request.resource.canonicalId}`;
      const requestKey = deliveryRecordKey(request.idempotencyKey, 'request');
      await records.append(stream, requestKey, {
        schemaVersion: 'transport-publication-request.v1',
        idempotencyKey: request.idempotencyKey,
        target: request.resource.canonicalId,
        message: publication.body,
      });
      const prior = await records.read<Readonly<Record<string, unknown>>>(stream);
      const completed = completedReceipt(prior, request.idempotencyKey);
      if (completed) return completed;
      const terminalKey = terminalRecordKey(
        request.idempotencyKey,
        request.attempt.attemptId,
        request.attempt.attemptNumber,
      );
      const existingTerminal = prior.find((entry) => entry.idempotencyKey === terminalKey);
      const reservation = existingTerminal
        ? { appended: false, record: existingTerminal }
        : await records.append<Readonly<Record<string, unknown>>>(stream, terminalKey, {
          schemaVersion: 'transport-publication-reservation.v1',
          attempt: request.attempt,
          reserved: ' '.repeat(TERMINAL_RESERVATION_BYTES),
        });
      if (!reservation.appended) {
        if (reservation.record.payload.schemaVersion === 'transport-publication-receipt.v1') {
          return reservation.record.payload.receipt as Readonly<Record<string, unknown>>;
        }
        if (reservation.record.payload.schemaVersion === 'transport-publication-failure.v1') {
          throw new Error(String(reservation.record.payload.error));
        }
      }
      try {
        const resolved = await context.invoke('secrets.read', {
          operation: 'resolve',
          resource: { type: 'secret.name', canonicalId: target.signingSecret },
          payload: {},
        });
        if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
        const signature = crypto
          .createHmac('sha256', secretValue(resolved))
          .update(`${request.resource.canonicalId}\n${request.idempotencyKey}\n${publication.serialized}`)
          .digest('hex');
        const response = await context.invoke('network.http', {
          operation: 'request',
          resource: { type: 'network.url', canonicalId: target.endpoint },
          payload: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': request.idempotencyKey,
              'x-kubeclaw-target': request.resource.canonicalId,
              'x-kubeclaw-signature': `sha256=${signature}`,
            },
            body: publication.body,
          },
        });
        if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
        const receipt = validateResponse(response);
        const result = Object.freeze({
          accepted: true,
          target: request.resource.canonicalId,
          publicationId: receipt.publicationId,
          status: receipt.status,
        });
        try {
          const committed = await records.transition(stream, terminalKey, reservation.record.payloadDigest, {
            schemaVersion: 'transport-publication-receipt.v1',
            attempt: request.attempt,
            receipt: result,
          });
          return committed.payload.receipt as Readonly<Record<string, unknown>>;
        } catch (error) {
          if (error instanceof Error && error.message === 'DURABLE_RECORD_TRANSITION_CONFLICT') {
            const current = await records.read<Readonly<Record<string, unknown>>>(stream);
            const accepted = completedReceipt(current, request.idempotencyKey);
            if (accepted) return accepted;
            const terminal = current.find((entry) => entry.idempotencyKey === terminalKey);
            if (terminal) {
              const reconciled = await records.transition(stream, terminalKey, terminal.payloadDigest, {
                schemaVersion: 'transport-publication-receipt.v1',
                attempt: request.attempt,
                receipt: result,
              });
              return reconciled.payload.receipt as Readonly<Record<string, unknown>>;
            }
          }
          throw error;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const reasonId = crypto.createHash('sha256').update(reason).digest('hex').slice(0, 16);
        const boundedReason = reason.slice(0, 2_048);
        try {
          await records.transition(stream, terminalKey, reservation.record.payloadDigest, {
            schemaVersion: 'transport-publication-failure.v1',
            idempotencyKey: request.idempotencyKey,
            target: request.resource.canonicalId,
            attempt: request.attempt,
            reasonId,
            error: boundedReason,
          });
        } catch (transitionError) {
          if (transitionError instanceof Error && transitionError.message === 'DURABLE_RECORD_TRANSITION_CONFLICT') {
            const accepted = completedReceipt(
              await records.read<Readonly<Record<string, unknown>>>(stream),
              request.idempotencyKey,
            );
            if (accepted) return accepted;
          }
          throw transitionError;
        }
        throw error;
      }
    },
    async shutdown() {
      shuttingDown = true;
    },
  };
}
