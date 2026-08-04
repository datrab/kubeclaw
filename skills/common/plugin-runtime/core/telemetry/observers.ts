import fs from 'node:fs';
import path from 'node:path';
import type { LifecycleEvent, ObserverCheckpoint, PluginDomainEvent } from '../../sdk/src/index.ts';
import type { ActivatedRegistry } from '../registry/activation.ts';
import type { GrantedRegistry } from '../registry/capabilities.ts';
import { validateReferencedValue } from '../registry/schema.ts';
import { FrozenMap } from '../registry/frozen-map.ts';
import type { AdapterRuntime } from '../execution/adapters.ts';
import type { FileJournal} from '../state/journal.ts';
import { type JournalRecord } from '../state/journal.ts';
import { deliverObserver } from './observer-delivery.ts';
import { checkpointKey, deliveryKey, recoverObservers } from './observer-recovery.ts';

export type CanonicalEvent = LifecycleEvent | PluginDomainEvent;
export interface ObserverFailure { readonly observerId: string; readonly eventId: string; readonly error: string }
export interface ObserverDrainResult { readonly delivered: number; readonly failures: readonly ObserverFailure[] }
export interface ObserverDeliveryRecord {
  readonly schemaVersion: 'observer-delivery-record.v2'; readonly deliveryId: string; readonly observerId: string; readonly runId: string;
  readonly eventId: string; readonly eventSequence: number; readonly attemptNumber: number; readonly status: 'started' | 'completed' | 'failed';
  readonly recordedAt: string; readonly error: string | null;
}
export interface ObserverRuntimeOptions {
  readonly registry: GrantedRegistry; readonly activated: ActivatedRegistry; readonly adapters: AdapterRuntime; readonly events: FileJournal<CanonicalEvent>;
  readonly checkpoints: FileJournal<ObserverCheckpoint>; readonly deliveries: FileJournal<ObserverDeliveryRecord>;
  readonly configs: ReadonlyMap<string, Readonly<Record<string, unknown>>>; readonly now?: () => Date; readonly wait?: (milliseconds: number) => Promise<void>;
}
function globalId(pluginId: string, localId: string): string { return `${pluginId}:${localId}`; }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function isObserverDeliveryInput(event: CanonicalEvent): boolean {
  return !(event.schemaVersion === 'lifecycle-event.v2' && event.type.startsWith('effect.')
    && typeof event.identity.attemptId === 'string' && event.identity.attemptId.startsWith('observer:'));
}

export class ObserverRuntime {
  readonly #options: ObserverRuntimeOptions; readonly #now: () => Date; readonly #wait: (milliseconds: number) => Promise<void>;
  readonly #checkpoints: Map<string, ObserverCheckpoint>; readonly #attempts: Map<string, number>;
  constructor(options: ObserverRuntimeOptions) {
    this.#options = options; this.#now = options.now ?? (() => new Date());
    this.#wait = options.wait ?? ((milliseconds) => new Promise((resolve) => { const timer = setTimeout(resolve, milliseconds); timer.unref(); }));
    const recovered = recoverObservers(options); this.#checkpoints = recovered.checkpoints; this.#attempts = recovered.attempts;
  }

  #recordDelivery(observerId: string, event: CanonicalEvent, attemptNumber: number, status: ObserverDeliveryRecord['status'], error: string | null): void {
    this.#options.deliveries.append({ schemaVersion: 'observer-delivery-record.v2', deliveryId: `delivery:${observerId}:${event.eventId}`,
      observerId, runId: event.identity.runId, eventId: event.eventId, eventSequence: event.sequence, attemptNumber, status,
      recordedAt: this.#now().toISOString(), error });
    const key = deliveryKey(observerId, event.eventId); this.#attempts.set(key, Math.max(this.#attempts.get(key) ?? 0, attemptNumber));
  }

  #commitCheckpoint(observerId: string, event: CanonicalEvent): boolean {
    const entry = this.#options.registry.snapshot.observers.get(observerId); if (!entry) throw new Error(`OBSERVER_NOT_REGISTERED:${observerId}`);
    const key = checkpointKey(observerId, event.identity.runId); const checkpoint: ObserverCheckpoint = { schemaVersion: 'observer-checkpoint.v2',
      observer: entry.provenance, runId: event.identity.runId, sequence: event.sequence, eventId: event.eventId, updatedAt: this.#now().toISOString() };
    validateReferencedValue(fs.realpathSync(path.join(entry.package.root, entry.registration.checkpointSchema)), { sequence: checkpoint.sequence, eventId: checkpoint.eventId });
    const appended = this.#options.checkpoints.transact((records, append) => this.#appendCheckpoint(records, append, observerId, event, checkpoint));
    this.#checkpoints.set(key, checkpoint); return appended;
  }

  #appendCheckpoint(records: readonly JournalRecord<ObserverCheckpoint>[], append: (entry: ObserverCheckpoint) => JournalRecord<ObserverCheckpoint>, observerId: string, event: CanonicalEvent, checkpoint: ObserverCheckpoint): boolean {
    const latest = records.map(({ entry }) => entry).filter((candidate) => globalId(candidate.observer.package.package.pluginId, candidate.observer.registrationId) === observerId
      && candidate.runId === event.identity.runId).at(-1);
    if (latest && latest.sequence > event.sequence) throw new Error(`OBSERVER_CHECKPOINT_REGRESSION:${observerId}:${event.identity.runId}`);
    if (latest && latest.sequence === event.sequence) {
      if (latest.eventId !== event.eventId) throw new Error(`OBSERVER_CHECKPOINT_CONFLICT:${observerId}:${event.identity.runId}`); return false;
    }
    append(checkpoint); return true;
  }

  async drain(): Promise<ObserverDrainResult> {
    let delivered = 0; const failures: ObserverFailure[] = [];
    const events = [...this.#options.events.refresh()].filter(({ entry }) => isObserverDeliveryInput(entry));
    for (const [observerId, entry] of new FrozenMap([...this.#options.registry.snapshot.observers])) {
      if (!this.#options.registry.grants.has(observerId)) continue;
      delivered += await this.#drainObserver(observerId, entry.registration.subscriptions, entry.registration.failurePolicy, events, failures);
    }
    return Object.freeze({ delivered, failures: Object.freeze(failures) });
  }

  async #drainObserver(observerId: string, subscriptions: readonly string[], policy: { readonly maxAttempts: number; readonly backoffMs: number; readonly mode: string }, events: readonly JournalRecord<CanonicalEvent>[], failures: ObserverFailure[]): Promise<number> {
    let delivered = 0; const blockedRuns = new Set<string>();
    for (const record of events) {
      const event = record.entry;
      if (!subscriptions.includes(event.type) || blockedRuns.has(event.identity.runId)) continue;
      if ((this.#checkpoints.get(checkpointKey(observerId, event.identity.runId))?.sequence ?? 0) >= event.sequence) continue;
      const error = await this.#attemptDelivery(observerId, record, policy);
      if (error) { const failure = { observerId, eventId: event.eventId, error }; failures.push(failure);
        if (policy.mode === 'required') throw new Error(`REQUIRED_OBSERVER_DELIVERY_FAILED:${observerId}:${event.eventId}:${error}`);
        blockedRuns.add(event.identity.runId); continue; }
      if (this.#commitCheckpoint(observerId, event)) delivered += 1;
    }
    return delivered;
  }

  async #attemptDelivery(observerId: string, record: JournalRecord<CanonicalEvent>, policy: { readonly maxAttempts: number; readonly backoffMs: number }): Promise<string | undefined> {
    const event = record.entry; const prior = this.#attempts.get(deliveryKey(observerId, event.eventId)) ?? 0; let error: unknown;
    for (let offset = 1; offset <= policy.maxAttempts; offset += 1) {
      const attempt = prior + offset; this.#recordDelivery(observerId, event, attempt, 'started', null);
      try { await deliverObserver(this.#options, this.#now, observerId, record, attempt); this.#recordDelivery(observerId, event, attempt, 'completed', null); return undefined; }
      catch (caught) { error = caught; this.#recordDelivery(observerId, event, attempt, 'failed', errorText(caught));
        if (offset < policy.maxAttempts && policy.backoffMs > 0) await this.#wait(policy.backoffMs); }
    }
    return errorText(error);
  }
}
