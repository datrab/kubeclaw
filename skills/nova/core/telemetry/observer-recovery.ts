import fs from 'node:fs';
import path from 'node:path';
import type { ObserverCheckpoint } from '@kubeclaw/plugin-sdk';
import { validateReferencedValue } from '@kubeclaw/plugin-foundation/registry/schema';
import type { CanonicalEvent, ObserverDeliveryRecord, ObserverRuntimeOptions } from './observers.ts';

export function checkpointKey(observerId: string, runId: string): string { return `${observerId}\u0000${runId}`; }
export function deliveryKey(observerId: string, eventId: string): string { return `${observerId}\u0000${eventId}`; }
function attemptKey(observerId: string, eventId: string, attempt: number): string { return `${deliveryKey(observerId, eventId)}\u0000${attempt}`; }
function globalId(pluginId: string, localId: string): string { return `${pluginId}:${localId}`; }

export interface ObserverRecovery { readonly checkpoints: Map<string, ObserverCheckpoint>; readonly attempts: Map<string, number>; readonly completed: Set<string> }

export function recoverObservers(options: ObserverRuntimeOptions): ObserverRecovery {
  const events = validateEvents(options); const checkpoints = recoverCheckpoints(options, events); const deliveries = recoverDeliveries(options, events);
  for (const [id, entry] of options.registry.snapshot.observers) {
    if (options.registry.grants.has(id)) validateReferencedValue(fs.realpathSync(path.join(entry.package.root, entry.registration.configSchema)), options.configs.get(id) ?? {});
  }
  return { checkpoints, ...deliveries };
}

function validateEvents(options: ObserverRuntimeOptions): Map<string, CanonicalEvent> {
  const events = new Map<string, CanonicalEvent>(); const sequence = new Map<string, number>();
  for (const { entry } of options.events.records()) {
    if (events.has(entry.eventId)) throw new Error(`OBSERVER_EVENT_ID_DUPLICATE:${entry.eventId}`);
    const prior = sequence.get(entry.identity.runId) ?? 0;
    if (entry.sequence <= prior) throw new Error(`OBSERVER_EVENT_ORDER_INVALID:${entry.identity.runId}:${entry.eventId}`);
    sequence.set(entry.identity.runId, entry.sequence); events.set(entry.eventId, entry);
  }
  return events;
}

function recoverCheckpoints(options: ObserverRuntimeOptions, events: ReadonlyMap<string, CanonicalEvent>): Map<string, ObserverCheckpoint> {
  const checkpoints = new Map<string, ObserverCheckpoint>();
  for (const { entry: checkpoint } of options.checkpoints.records()) {
    const observerId = globalId(checkpoint.observer.package.package.pluginId, checkpoint.observer.registrationId);
    const registration = options.registry.snapshot.observers.get(observerId);
    if (!registration || !options.registry.grants.has(observerId)) throw new Error(`OBSERVER_CHECKPOINT_OWNER_INVALID:${observerId}`);
    if (checkpoint.observer.package.package.contentDigest !== registration.provenance.package.package.contentDigest
      || checkpoint.observer.package.package.packageVersion !== registration.provenance.package.package.packageVersion) throw new Error(`OBSERVER_CHECKPOINT_PROVENANCE_MISMATCH:${observerId}`);
    if (typeof checkpoint.eventId !== 'string') throw new Error(`OBSERVER_CHECKPOINT_EVENT_INVALID:${observerId}:<missing>`);
    const event = events.get(checkpoint.eventId);
    assertCheckpointEvent(observerId, checkpoint, event, registration.registration.subscriptions);
    const key = checkpointKey(observerId, checkpoint.runId); const current = checkpoints.get(key);
    if (current && checkpoint.sequence < current.sequence) throw new Error(`OBSERVER_CHECKPOINT_REGRESSION:${observerId}:${checkpoint.runId}`);
    if (current && checkpoint.sequence === current.sequence && checkpoint.eventId !== current.eventId) throw new Error(`OBSERVER_CHECKPOINT_CONFLICT:${observerId}:${checkpoint.runId}`);
    if (!current || checkpoint.sequence > current.sequence) checkpoints.set(key, checkpoint);
  }
  return checkpoints;
}

function assertCheckpointEvent(observerId: string, checkpoint: ObserverCheckpoint, event: CanonicalEvent | undefined, subscriptions: readonly string[]): void {
  if (!event || event.identity.runId !== checkpoint.runId || event.sequence !== checkpoint.sequence || !subscriptions.includes(event.type)) {
    throw new Error(`OBSERVER_CHECKPOINT_EVENT_INVALID:${observerId}:${String(checkpoint.eventId)}`);
  }
}

function validDelivery(options: ObserverRuntimeOptions, events: ReadonlyMap<string, CanonicalEvent>, delivery: ObserverDeliveryRecord): boolean {
  const registration = options.registry.snapshot.observers.get(delivery.observerId); const event = events.get(delivery.eventId);
  return delivery.schemaVersion === 'observer-delivery-record.v2' && delivery.deliveryId === `delivery:${delivery.observerId}:${delivery.eventId}`
    && Boolean(registration) && options.registry.grants.has(delivery.observerId) && Boolean(event) && event!.identity.runId === delivery.runId
    && event!.sequence === delivery.eventSequence && registration!.registration.subscriptions.includes(event!.type)
    && Number.isSafeInteger(delivery.attemptNumber) && delivery.attemptNumber >= 1;
}

function validTransition(delivery: ObserverDeliveryRecord, prior: ObserverDeliveryRecord['status'] | undefined): boolean {
  return !((delivery.status === 'started' && prior !== undefined) || (delivery.status !== 'started' && prior !== 'started')
    || (delivery.status !== 'failed' && delivery.error !== null) || (delivery.status === 'failed' && typeof delivery.error !== 'string'));
}

function recoverDeliveries(options: ObserverRuntimeOptions, events: ReadonlyMap<string, CanonicalEvent>): Pick<ObserverRecovery, 'attempts' | 'completed'> {
  const completed = new Set<string>();
  const attempts = new Map<string, number>(); const states = new Map<string, ObserverDeliveryRecord['status']>();
  for (const { entry: delivery } of options.deliveries.records()) {
    if (!validDelivery(options, events, delivery)) throw new Error(`OBSERVER_DELIVERY_RECORD_INVALID:${delivery.observerId}:${delivery.eventId}`);
    const key = attemptKey(delivery.observerId, delivery.eventId, delivery.attemptNumber); const prior = states.get(key);
    if (!validTransition(delivery, prior)) throw new Error(`OBSERVER_DELIVERY_TRANSITION_INVALID:${delivery.observerId}:${delivery.eventId}:${delivery.attemptNumber}`);
    states.set(key, delivery.status); const deliveryIdentity = deliveryKey(delivery.observerId, delivery.eventId);
    attempts.set(deliveryIdentity, Math.max(attempts.get(deliveryIdentity) ?? 0, delivery.attemptNumber));
    if (delivery.status === 'completed') completed.add(deliveryIdentity);
  }
  return { attempts, completed };
}
