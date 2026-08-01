import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AttemptIdentity,
  LifecycleEvent,
  ObserverCheckpoint,
  ObserverDelivery,
  PluginContext,
  PluginDomainEvent,
} from '../../sdk/src/index.ts';
import type { ActivatedRegistry } from '../registry/activation.ts';
import type { GrantedRegistry } from '../registry/capabilities.ts';
import { validateReferencedValue } from '../registry/schema.ts';
import { FrozenMap } from '../registry/frozen-map.ts';
import { createPluginInvocationContext } from '../execution/context.ts';
import { RevocableLease } from '../execution/lease.ts';
import type { AdapterRuntime } from '../execution/adapters.ts';
import { FileJournal, type JournalRecord } from '../state/journal.ts';

type CanonicalEvent = LifecycleEvent | PluginDomainEvent;

export interface ObserverFailure {
  readonly observerId: string;
  readonly eventId: string;
  readonly error: string;
}

export interface ObserverDrainResult {
  readonly delivered: number;
  readonly failures: readonly ObserverFailure[];
}

export interface ObserverDeliveryRecord {
  readonly schemaVersion: 'observer-delivery-record.v2';
  readonly deliveryId: string;
  readonly observerId: string;
  readonly runId: string;
  readonly eventId: string;
  readonly eventSequence: number;
  readonly attemptNumber: number;
  readonly status: 'started' | 'completed' | 'failed';
  readonly recordedAt: string;
  readonly error: string | null;
}

export interface ObserverRuntimeOptions {
  readonly registry: GrantedRegistry;
  readonly activated: ActivatedRegistry;
  readonly adapters: AdapterRuntime;
  readonly events: FileJournal<CanonicalEvent>;
  readonly checkpoints: FileJournal<ObserverCheckpoint>;
  readonly deliveries: FileJournal<ObserverDeliveryRecord>;
  readonly configs: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly now?: () => Date;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

function globalRegistrationId(pluginId: string, localId: string): string {
  return `${pluginId}:${localId}`;
}

function checkpointKey(observerId: string, runId: string): string {
  return `${observerId}\u0000${runId}`;
}

function deliveryKey(observerId: string, eventId: string): string {
  return `${observerId}\u0000${eventId}`;
}

function deliveryAttemptKey(
  observerId: string,
  eventId: string,
  attemptNumber: number,
): string {
  return `${deliveryKey(observerId, eventId)}\u0000${attemptNumber}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isObserverDeliveryInput(event: CanonicalEvent): boolean {
  return !(event.schemaVersion === 'lifecycle-event.v2'
    && event.type.startsWith('effect.')
    && typeof event.identity.attemptId === 'string'
    && event.identity.attemptId.startsWith('observer:'));
}

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error('OBSERVER_DELIVERY_TIMEOUT'));
    }, milliseconds);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class ObserverRuntime {
  readonly #options: ObserverRuntimeOptions;
  readonly #now: () => Date;
  readonly #wait: (milliseconds: number) => Promise<void>;
  readonly #checkpoints = new Map<string, ObserverCheckpoint>();
  readonly #attempts = new Map<string, number>();

  constructor(options: ObserverRuntimeOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.#wait = options.wait ?? ((milliseconds) => new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      timer.unref();
    }));
    const events = options.events.records();
    const eventsByIdentity = new Map<string, CanonicalEvent>();
    const latestEventSequence = new Map<string, number>();
    for (const record of events) {
      const event = record.entry;
      if (eventsByIdentity.has(event.eventId)) {
        throw new Error(`OBSERVER_EVENT_ID_DUPLICATE:${event.eventId}`);
      }
      const runSequence = latestEventSequence.get(event.identity.runId) ?? 0;
      if (event.sequence <= runSequence) {
        throw new Error(`OBSERVER_EVENT_ORDER_INVALID:${event.identity.runId}:${event.eventId}`);
      }
      latestEventSequence.set(event.identity.runId, event.sequence);
      eventsByIdentity.set(event.eventId, event);
    }
    for (const record of options.checkpoints.records()) {
      const checkpoint = record.entry;
      const observerId = globalRegistrationId(
        checkpoint.observer.package.package.pluginId,
        checkpoint.observer.registrationId,
      );
      const entry = options.registry.snapshot.observers.get(observerId);
      if (!entry || !options.registry.grants.has(observerId)) {
        throw new Error(`OBSERVER_CHECKPOINT_OWNER_INVALID:${observerId}`);
      }
      if (
        checkpoint.observer.package.package.contentDigest
          !== entry.provenance.package.package.contentDigest
        || checkpoint.observer.package.package.packageVersion
          !== entry.provenance.package.package.packageVersion
      ) {
        throw new Error(`OBSERVER_CHECKPOINT_PROVENANCE_MISMATCH:${observerId}`);
      }
      if (typeof checkpoint.eventId !== 'string') {
        throw new Error(`OBSERVER_CHECKPOINT_EVENT_INVALID:${observerId}:<missing>`);
      }
      const event = eventsByIdentity.get(checkpoint.eventId);
      if (
        !event
        || event.identity.runId !== checkpoint.runId
        || event.sequence !== checkpoint.sequence
        || !entry.registration.subscriptions.includes(event.type)
      ) {
        throw new Error(`OBSERVER_CHECKPOINT_EVENT_INVALID:${observerId}:${checkpoint.eventId}`);
      }
      const key = checkpointKey(observerId, checkpoint.runId);
      const current = this.#checkpoints.get(key);
      if (current && checkpoint.sequence < current.sequence) {
        throw new Error(`OBSERVER_CHECKPOINT_REGRESSION:${observerId}:${checkpoint.runId}`);
      }
      if (
        current
        && checkpoint.sequence === current.sequence
        && checkpoint.eventId !== current.eventId
      ) {
        throw new Error(`OBSERVER_CHECKPOINT_CONFLICT:${observerId}:${checkpoint.runId}`);
      }
      if (!current || checkpoint.sequence > current.sequence) this.#checkpoints.set(key, checkpoint);
    }
    const deliveryStates = new Map<string, ObserverDeliveryRecord['status']>();
    for (const record of options.deliveries.records()) {
      const delivery = record.entry;
      const entry = options.registry.snapshot.observers.get(delivery.observerId);
      const event = eventsByIdentity.get(delivery.eventId);
      if (
        delivery.schemaVersion !== 'observer-delivery-record.v2'
        || delivery.deliveryId !== `delivery:${delivery.observerId}:${delivery.eventId}`
        || !entry
        || !options.registry.grants.has(delivery.observerId)
        || !event
        || event.identity.runId !== delivery.runId
        || event.sequence !== delivery.eventSequence
        || !entry.registration.subscriptions.includes(event.type)
        || !Number.isSafeInteger(delivery.attemptNumber)
        || delivery.attemptNumber < 1
      ) {
        throw new Error(
          `OBSERVER_DELIVERY_RECORD_INVALID:${delivery.observerId}:${delivery.eventId}`,
        );
      }
      const attemptKey = deliveryAttemptKey(
        delivery.observerId,
        delivery.eventId,
        delivery.attemptNumber,
      );
      const priorStatus = deliveryStates.get(attemptKey);
      if (
        (delivery.status === 'started' && priorStatus !== undefined)
        || (delivery.status !== 'started' && priorStatus !== 'started')
        || (delivery.status === 'started' && delivery.error !== null)
        || (delivery.status === 'completed' && delivery.error !== null)
        || (delivery.status === 'failed' && typeof delivery.error !== 'string')
      ) {
        throw new Error(
          `OBSERVER_DELIVERY_TRANSITION_INVALID:${delivery.observerId}:${delivery.eventId}:${delivery.attemptNumber}`,
        );
      }
      deliveryStates.set(attemptKey, delivery.status);
      const key = deliveryKey(delivery.observerId, delivery.eventId);
      this.#attempts.set(key, Math.max(this.#attempts.get(key) ?? 0, delivery.attemptNumber));
    }
    for (const [id, entry] of options.registry.snapshot.observers) {
      if (!options.registry.grants.has(id)) continue;
      validateReferencedValue(
        fs.realpathSync(path.join(entry.package.root, entry.registration.configSchema)),
        options.configs.get(id) ?? {},
      );
    }
  }

  async #deliver(
    observerId: string,
    eventRecord: JournalRecord<CanonicalEvent>,
    deliveryAttempt: number,
  ): Promise<void> {
    const entry = this.#options.registry.snapshot.observers.get(observerId);
    const activated = this.#options.activated.observers.get(observerId);
    if (!entry || !activated) throw new Error(`OBSERVER_NOT_ACTIVATED:${observerId}`);
    const event = eventRecord.entry;
    const attempt: AttemptIdentity = {
      runId: event.identity.runId,
      stageId: entry.registration.id,
      attemptId: `observer:${observerId}:${event.eventId}`,
      attemptNumber: 1,
    };
    const timeoutMs = entry.registration.failurePolicy.timeoutMs;
    const leaseContract = {
      schemaVersion: 'invocation-lease.v2' as const,
      leaseId: `lease:${crypto.randomUUID()}`,
      attempt,
      registration: entry.provenance,
      status: 'active' as const,
      grants: [...(this.#options.registry.grants.get(observerId) ?? [])],
      limits: {
        wallTimeMs: timeoutMs,
        memoryBytes: 256 * 1024 * 1024,
        cpuMillis: timeoutMs,
      },
      issuedAt: this.#now().toISOString(),
      expiresAt: new Date(this.#now().getTime() + timeoutMs).toISOString(),
    };
    const lease = new RevocableLease(leaseContract, this.#now);
    const controller = new AbortController();
    const delivery: ObserverDelivery = {
      schemaVersion: 'observer-delivery.v2',
      deliveryId: `delivery:${observerId}:${event.eventId}`,
      observer: entry.provenance,
      attemptNumber: deliveryAttempt,
      event,
      deliveredAt: this.#now().toISOString(),
    };
    const contract: PluginContext = {
      schemaVersion: 'plugin-context.v2',
      lease: leaseContract,
      config: this.#options.configs.get(observerId) ?? {},
      input: { delivery },
      artifacts: [],
    };
    let capabilitySequence = 0;
    const context = createPluginInvocationContext(contract, lease, {
      invoke: async (_leaseId, capability, operation, resource, payload) => {
        capabilitySequence += 1;
        return this.#options.adapters.invoke(
          capability,
          attempt,
          `${delivery.deliveryId}:${capabilitySequence}`,
          { operation, resource, payload },
          controller.signal,
        );
      },
    }, {
      append: async (_leaseId, type, identity, payload) => {
        this.#options.events.append({
          schemaVersion: 'plugin-domain-event.v2',
          eventId: `event:${crypto.randomUUID()}`,
          sequence: this.#options.events.records().length + 1,
          type,
          producer: entry.provenance,
          identity,
          occurredAt: this.#now().toISOString(),
          causationId: delivery.deliveryId,
          payload,
        });
      },
    });
    try {
      await withTimeout(
        activated.execute(delivery, context, controller.signal) as Promise<void>,
        timeoutMs,
        () => controller.abort(new Error('OBSERVER_DELIVERY_TIMEOUT')),
      );
    } finally {
      controller.abort(new Error('OBSERVER_DELIVERY_COMPLETED'));
      lease.revoke({ code: 'core.observer_delivery_completed' }, this.#now());
    }
  }

  #recordDelivery(
    observerId: string,
    event: CanonicalEvent,
    attemptNumber: number,
    status: ObserverDeliveryRecord['status'],
    error: string | null,
  ): void {
    this.#options.deliveries.append({
      schemaVersion: 'observer-delivery-record.v2',
      deliveryId: `delivery:${observerId}:${event.eventId}`,
      observerId,
      runId: event.identity.runId,
      eventId: event.eventId,
      eventSequence: event.sequence,
      attemptNumber,
      status,
      recordedAt: this.#now().toISOString(),
      error,
    });
    const key = deliveryKey(observerId, event.eventId);
    this.#attempts.set(key, Math.max(this.#attempts.get(key) ?? 0, attemptNumber));
  }

  #commitCheckpoint(observerId: string, event: CanonicalEvent): boolean {
    const entry = this.#options.registry.snapshot.observers.get(observerId);
    if (!entry) throw new Error(`OBSERVER_NOT_REGISTERED:${observerId}`);
    const key = checkpointKey(observerId, event.identity.runId);
    const checkpoint: ObserverCheckpoint = {
      schemaVersion: 'observer-checkpoint.v2',
      observer: entry.provenance,
      runId: event.identity.runId,
      sequence: event.sequence,
      eventId: event.eventId,
      updatedAt: this.#now().toISOString(),
    };
    validateReferencedValue(
      fs.realpathSync(path.join(entry.package.root, entry.registration.checkpointSchema)),
      { sequence: checkpoint.sequence, eventId: checkpoint.eventId },
    );
    const appended = this.#options.checkpoints.transact((records, append) => {
      const latest = records
        .map((record) => record.entry)
        .filter((candidate) => (
          globalRegistrationId(
            candidate.observer.package.package.pluginId,
            candidate.observer.registrationId,
          ) === observerId
          && candidate.runId === event.identity.runId
        ))
        .at(-1);
      if (latest && latest.sequence > event.sequence) {
        throw new Error(`OBSERVER_CHECKPOINT_REGRESSION:${observerId}:${event.identity.runId}`);
      }
      if (latest && latest.sequence === event.sequence) {
        if (latest.eventId !== event.eventId) {
          throw new Error(`OBSERVER_CHECKPOINT_CONFLICT:${observerId}:${event.identity.runId}`);
        }
        return false;
      }
      append(checkpoint);
      return true;
    });
    this.#checkpoints.set(key, checkpoint);
    return appended;
  }

  async drain(): Promise<ObserverDrainResult> {
    let delivered = 0;
    const failures: ObserverFailure[] = [];
    const observers = new FrozenMap([...this.#options.registry.snapshot.observers]);
    // A drain operates on one immutable event generation. Observer capability
    // effects are delivery plumbing, not new domain input; feeding them back
    // into observers would make effect-subscribing telemetry recurse forever.
    const sourceEvents = [...this.#options.events.refresh()]
      .filter((event) => isObserverDeliveryInput(event.entry));
    for (const [observerId, entry] of observers) {
      if (!this.#options.registry.grants.has(observerId)) continue;
      const blockedRuns = new Set<string>();
      for (const eventRecord of sourceEvents) {
        const event = eventRecord.entry;
        if (!entry.registration.subscriptions.includes(event.type)) continue;
        if (blockedRuns.has(event.identity.runId)) continue;
        const key = checkpointKey(observerId, event.identity.runId);
        if ((this.#checkpoints.get(key)?.sequence ?? 0) >= event.sequence) continue;
        let error: unknown;
        const priorAttempts = this.#attempts.get(deliveryKey(observerId, event.eventId)) ?? 0;
        for (
          let offset = 1;
          offset <= entry.registration.failurePolicy.maxAttempts;
          offset += 1
        ) {
          const attempt = priorAttempts + offset;
          this.#recordDelivery(observerId, event, attempt, 'started', null);
          try {
            await this.#deliver(observerId, eventRecord, attempt);
            this.#recordDelivery(observerId, event, attempt, 'completed', null);
            error = undefined;
            break;
          } catch (caught) {
            error = caught;
            this.#recordDelivery(observerId, event, attempt, 'failed', errorText(caught));
            if (
              offset < entry.registration.failurePolicy.maxAttempts
              && entry.registration.failurePolicy.backoffMs > 0
            ) {
              await this.#wait(entry.registration.failurePolicy.backoffMs);
            }
          }
        }
        if (error !== undefined) {
          const failure: ObserverFailure = {
            observerId,
            eventId: event.eventId,
            error: errorText(error),
          };
          failures.push(failure);
          if (entry.registration.failurePolicy.mode === 'required') {
            throw new Error(
              `REQUIRED_OBSERVER_DELIVERY_FAILED:${observerId}:${event.eventId}:${failure.error}`,
            );
          }
          blockedRuns.add(event.identity.runId);
          continue;
        }
        if (this.#commitCheckpoint(observerId, event)) delivered += 1;
      }
    }
    return Object.freeze({ delivered, failures: Object.freeze(failures) });
  }
}
