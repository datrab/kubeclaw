import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AttemptIdentity,
  LifecycleEvent,
  ObserverCheckpoint,
  ObserverDelivery,
  ObserverHandler,
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

export interface ObserverRuntimeOptions {
  readonly registry: GrantedRegistry;
  readonly activated: ActivatedRegistry;
  readonly adapters: AdapterRuntime;
  readonly events: FileJournal<CanonicalEvent>;
  readonly checkpoints: FileJournal<ObserverCheckpoint>;
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

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OBSERVER_DELIVERY_TIMEOUT')), milliseconds);
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

  constructor(options: ObserverRuntimeOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.#wait = options.wait ?? ((milliseconds) => new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      timer.unref();
    }));
    for (const record of options.checkpoints.records()) {
      const checkpoint = record.entry;
      const observerId = globalRegistrationId(
        checkpoint.observer.package.package.pluginId,
        checkpoint.observer.registrationId,
      );
      const key = checkpointKey(observerId, checkpoint.runId);
      const current = this.#checkpoints.get(key);
      if (!current || checkpoint.sequence > current.sequence) this.#checkpoints.set(key, checkpoint);
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
      attemptId: `observer:${crypto.randomUUID()}`,
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
          new AbortController().signal,
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
      await withTimeout((activated.execute as ObserverHandler)(delivery, context), timeoutMs);
    } finally {
      lease.revoke({ code: 'core.observer_delivery_completed' }, this.#now());
    }
  }

  async drain(): Promise<ObserverDrainResult> {
    let delivered = 0;
    const failures: ObserverFailure[] = [];
    const observers = new FrozenMap([...this.#options.registry.snapshot.observers]);
    for (const [observerId, entry] of observers) {
      if (!this.#options.registry.grants.has(observerId)) continue;
      for (const eventRecord of this.#options.events.records()) {
        const event = eventRecord.entry;
        if (!entry.registration.subscriptions.includes(event.type)) continue;
        const key = checkpointKey(observerId, event.identity.runId);
        if ((this.#checkpoints.get(key)?.sequence ?? 0) >= event.sequence) continue;
        let error: unknown;
        for (let attempt = 1; attempt <= entry.registration.failurePolicy.maxAttempts; attempt += 1) {
          try {
            await this.#deliver(observerId, eventRecord, attempt);
            error = undefined;
            break;
          } catch (caught) {
            error = caught;
            if (
              attempt < entry.registration.failurePolicy.maxAttempts
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
            error: error instanceof Error ? error.message : String(error),
          };
          failures.push(failure);
          if (entry.registration.failurePolicy.mode === 'required') {
            throw new Error(
              `REQUIRED_OBSERVER_DELIVERY_FAILED:${observerId}:${event.eventId}:${failure.error}`,
            );
          }
          break;
        }
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
        this.#options.checkpoints.append(checkpoint);
        this.#checkpoints.set(key, checkpoint);
        delivered += 1;
      }
    }
    return Object.freeze({ delivered, failures: Object.freeze(failures) });
  }
}
