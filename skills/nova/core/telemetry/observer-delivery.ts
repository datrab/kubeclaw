import crypto from 'node:crypto';
import type { AttemptIdentity, ObserverDelivery, PluginContext } from '@kubeclaw/plugin-sdk';
import { createPluginInvocationContext } from '../execution/context.ts';
import { RevocableLease } from '../execution/lease.ts';
import type { JournalRecord } from '../state/journal.ts';
import type { CanonicalEvent, ObserverRuntimeOptions } from './observers.ts';

function withTimeout<T>(promise: Promise<T>, milliseconds: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { onTimeout(); reject(new Error('OBSERVER_DELIVERY_TIMEOUT')); }, milliseconds); timer.unref();
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export async function deliverObserver(options: ObserverRuntimeOptions, now: () => Date, observerId: string, record: JournalRecord<CanonicalEvent>, deliveryAttempt: number): Promise<void> {
  const entry = options.registry.snapshot.observers.get(observerId); const activated = options.activated.observers.get(observerId);
  if (!entry || !activated) throw new Error(`OBSERVER_NOT_ACTIVATED:${observerId}`);
  const event = record.entry; const attempt: AttemptIdentity = { runId: event.identity.runId, stageId: entry.registration.id,
    attemptId: `observer:${observerId}:${event.eventId}`, attemptNumber: 1 };
  const timeoutMs = entry.registration.failurePolicy.timeoutMs; const timestamp = now();
  const leaseContract = { schemaVersion: 'invocation-lease.v2' as const, leaseId: `lease:${crypto.randomUUID()}`, attempt,
    registration: entry.provenance, status: 'active' as const, grants: [...(options.registry.grants.get(observerId) ?? [])],
    limits: { wallTimeMs: timeoutMs, memoryBytes: 256 * 1024 * 1024, cpuMillis: timeoutMs }, issuedAt: timestamp.toISOString(),
    expiresAt: new Date(timestamp.getTime() + timeoutMs).toISOString() };
  const lease = new RevocableLease(leaseContract, now); const controller = new AbortController();
  const delivery: ObserverDelivery = { schemaVersion: 'observer-delivery.v2', deliveryId: `delivery:${observerId}:${event.eventId}`,
    observer: entry.provenance, attemptNumber: deliveryAttempt, event, deliveredAt: now().toISOString() };
  const contract: PluginContext = { schemaVersion: 'plugin-context.v2', lease: leaseContract, config: options.configs.get(observerId) ?? {}, input: { delivery }, artifacts: [] };
  let sequence = 0;
  const context = createPluginInvocationContext(contract, lease, { invoke: async (_leaseId, capability, operation, resource, payload) => {
    sequence += 1;
    const stableKey = `${delivery.deliveryId}:${sequence}`;
    const provider = options.registry.selectedProviders.get(capability);
    const supported = capability === 'operator.request' && provider?.package.manifest.id === 'kubeclaw.operator-messaging';
    const executionAttempt = supported ? { ...attempt, attemptId: `${attempt.attemptId}:execution:${deliveryAttempt}`, attemptNumber: deliveryAttempt } : attempt;
    return options.adapters.invoke(capability, executionAttempt, supported ? `${stableKey}:execution:${deliveryAttempt}` : stableKey,
      { operation, resource, payload }, controller.signal, supported ? stableKey : undefined);
  } }, { append: async (_leaseId, type, identity, payload) => { options.events.appendSequenced((eventSequence) => ({
    schemaVersion: 'plugin-domain-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence: eventSequence,
    type, producer: entry.provenance, identity, occurredAt: now().toISOString(), causationId: delivery.deliveryId, payload,
  })); } });
  try { await withTimeout(activated.execute(delivery, context, controller.signal) as Promise<void>, timeoutMs, () => controller.abort(new Error('OBSERVER_DELIVERY_TIMEOUT'))); }
  finally { controller.abort(new Error('OBSERVER_DELIVERY_COMPLETED')); lease.revoke({ code: 'core.observer_delivery_completed' }, now()); }
}
