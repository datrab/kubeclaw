import crypto from 'node:crypto';
import path from 'node:path';
import type { EffectRequest, LifecycleEvent, ObserverCheckpoint, PipelineDefinition, PluginDomainEvent } from '@kubeclaw/plugin-sdk';
import { activateRegistry } from '@kubeclaw/plugin-foundation/registry/activation';
import { buildRegistry } from '@kubeclaw/plugin-foundation/registry/build';
import { resolveCapabilityGrants, type CapabilityPolicy } from '@kubeclaw/plugin-foundation/registry/capabilities';
import { discoverPackages } from '@kubeclaw/plugin-foundation/registry/discovery';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { validateRuntimeRegistrationConfiguration } from '@kubeclaw/plugin-foundation/registry/configuration';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { FileEffectJournal } from '../effects/journal.ts';
import { EffectCoordinator } from '../effects/coordinator.ts';
import { FileResourceLockManager } from '../effects/locks.ts';
import { FileJournal } from '../state/journal.ts';
import { ObserverRuntime, type ObserverDeliveryRecord } from '../telemetry/observers.ts';
import { AdapterRuntime } from './adapters.ts';

function nestedMap(value: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>): ReadonlyMap<string, ReadonlyMap<string, Readonly<Record<string, unknown>>>> {
  return new Map(Object.entries(value).map(([id, grants]) => [id, new Map(Object.entries(grants))]));
}
export function objectMap(value: Readonly<Record<string, Readonly<Record<string, unknown>>>>): ReadonlyMap<string, Readonly<Record<string, unknown>>> { return new Map(Object.entries(value)); }

export interface PreparedRuntime {
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly snapshot: ReturnType<typeof buildRegistry>; readonly granted: ReturnType<typeof resolveCapabilityGrants>;
  readonly activated: Awaited<ReturnType<typeof activateRegistry>>;
}

export async function prepareRuntime(platform: PlatformConfig, definition: PipelineDefinition): Promise<PreparedRuntime> {
  validateContractValue('pipelineDefinition', definition);
  const packages = discoverPackages({ installationRoots: platform.installationRoots, trustPolicy: {
    trustedBuiltinRoots: platform.trustedBuiltinRoots, allowedSourceDigests: new Map(Object.entries(platform.externalTrust.allowedSourceDigests)),
    verifiedAttestations: new Map(Object.entries(platform.externalTrust.verifiedAttestations)), verifierId: 'kubeclaw-platform-v2',
  } });
  const snapshot = buildRegistry(packages); const enabled = enabledRegistrations(platform, definition, snapshot);
  const policy: CapabilityPolicy = { enabledRegistrations: enabled, grants: nestedMap(platform.grants), providers: new Map(Object.entries(platform.providers)) };
  const granted = resolveCapabilityGrants(snapshot, policy);
  validateRuntimeRegistrationConfiguration(snapshot, granted.enabledRegistrations, {
    stages: definition.stages.map((stage) => ({ type: stage.type, config: stage.config })), observers: objectMap(platform.observers), adapters: objectMap(platform.adapters),
  });
  return { configuration: { providers: platform.providers, grants: platform.grants, adapters: platform.adapters, activeAdapters: platform.activeAdapters, observers: platform.observers }, snapshot, granted, activated: await activateRegistry(snapshot, new Set(granted.grants.keys())) };
}

function enabledRegistrations(platform: PlatformConfig, definition: PipelineDefinition, snapshot: ReturnType<typeof buildRegistry>): Set<string> {
  const enabled = new Set<string>(Object.keys(platform.observers)); platform.activeAdapters.forEach((id) => enabled.add(id));
  for (const stage of definition.stages) {
    const owner = snapshot.stages.get(stage.type); if (!owner) throw new Error(`PIPELINE_STAGE_OWNER_MISSING:${stage.type}`);
    enabled.add(`${owner.package.manifest.id}:${owner.registration.id}`);
  }
  return enabled;
}

function effectAppender(events: FileJournal<LifecycleEvent | PluginDomainEvent>): (type: 'effect.requested' | 'effect.accepted' | 'effect.completed' | 'effect.failed', request: EffectRequest, payload: Readonly<Record<string, unknown>>) => void {
  return (type, request, payload) => {
    if (request.attempt.attemptId.startsWith('observer:')) return;
    events.appendSequenced((sequence) => ({ schemaVersion: 'lifecycle-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence,
      type, identity: { runId: request.attempt.runId, stageId: request.attempt.stageId, attemptId: request.attempt.attemptId, effectId: request.effectId },
      occurredAt: new Date().toISOString(), causationId: request.attempt.attemptId, payload }));
  };
}

function auditResult(result: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const serialized = Buffer.from(JSON.stringify(result));
  if (serialized.length <= 16 * 1024) return result;
  const contentDigest = `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
  return Object.freeze({
    schemaVersion: 'effect-result-summary.v1',
    contentDigest,
    artifactRef: `effect-result:${contentDigest}`,
    bytes: serialized.length,
    externalized: true,
  });
}

export function createAdapterRuntime(platform: PlatformConfig, runRoot: string, runtime: PreparedRuntime, events: FileJournal<LifecycleEvent | PluginDomainEvent>): AdapterRuntime {
  const append = effectAppender(events);
  const effects = new EffectCoordinator(new FileEffectJournal(path.join(runRoot, 'effects.jsonl')), () => new Date(), {
    requested: (request) => append('effect.requested', request, { capability: request.capability, operation: request.operation, resource: request.resource }),
    accepted: (request) => append('effect.accepted', request, {}),
    completed: (request, receipt) => append(receipt.status === 'completed' ? 'effect.completed' : 'effect.failed', request,
      receipt.status === 'completed' ? { adapter: receipt.adapter, result: auditResult(receipt.result ?? {}) } : { adapter: receipt.adapter, error: receipt.error ?? {} }),
  }, new FileResourceLockManager(path.join(platform.storageRoot, 'resource-locks')), platform.effectLockTtlMs ?? 300_000);
  return new AdapterRuntime({ granted: runtime.granted, activated: runtime.activated, configs: objectMap(platform.adapters), effects,
    shutdownTimeoutMs: platform.shutdownTimeoutMs, emitDomainEvent: async (registration, type, identity, payload) => { events.appendSequenced((sequence) => ({
      schemaVersion: 'plugin-domain-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence, type,
      producer: registration, identity, occurredAt: new Date().toISOString(), causationId: null, payload,
    })); } });
}

export async function drainObservers(platform: PlatformConfig, runRoot: string, runtime: PreparedRuntime, adapters: AdapterRuntime, events: FileJournal<LifecycleEvent | PluginDomainEvent>): Promise<void> {
  const observers = new ObserverRuntime({ registry: runtime.granted, activated: runtime.activated, adapters, events,
    checkpoints: new FileJournal<ObserverCheckpoint>(path.join(runRoot, 'observer-checkpoints.jsonl')),
    deliveries: new FileJournal<ObserverDeliveryRecord>(path.join(runRoot, 'observer-deliveries.jsonl')), configs: objectMap(platform.observers) });
  await observers.drain();
}

export function serializedObserverDrainer(platform: PlatformConfig, runRoot: string, runtime: PreparedRuntime, adapters: AdapterRuntime, events: FileJournal<LifecycleEvent | PluginDomainEvent>): () => Promise<void> {
  let pending = Promise.resolve(); return () => { pending = pending.then(() => drainObservers(platform, runRoot, runtime, adapters, events)); return pending; };
}
