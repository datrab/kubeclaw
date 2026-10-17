import { restorePublisherRuntimeBindings, type PublisherRuntimeBindings } from './publisher-runtime-binding.ts';
import { restoreOperatorRuntimeBindings, type OperatorRuntimeBindings } from './operator-runtime-binding.ts';
import { restoreRedisRuntimeBindings, type RedisRuntimeBindings } from './redis-runtime-binding.ts';
import type {ReviewRuntimeBinding} from './review-runtime-targets.ts';
import { selectedStageConfiguration } from './stage-configuration.ts';
import { captureCoreRuntimePolicy, loadCoreRuntimePolicy, type CoreRuntimePolicy } from '@kubeclaw/plugin-foundation/config/core-runtime-policy';
import { resolveRetainedCoreWait } from '../state/wait-projection-reader.ts';
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

export interface RuntimeConfigurationInspection {
  readonly corePolicy: CoreRuntimePolicy;
  readonly adapterConfigurations: PlatformConfig['adapters'];
  readonly observerConfigurations: PlatformConfig['observers'];
  readonly reviewRuntimeBinding?:ReviewRuntimeBinding;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly snapshot: ReturnType<typeof buildRegistry>; readonly granted: ReturnType<typeof resolveCapabilityGrants>;
}

export interface PreparedRuntime extends RuntimeConfigurationInspection {
  readonly activated: Awaited<ReturnType<typeof activateRegistry>>;
}

/** Reads installed manifests/schemas and validates the original registry/grants,
 * without importing or activating plugin modules. This is local inspection,
 * NOT original-run discovery, a v10 source receipt, or permission to activate.
 * In particular, it does not authenticate canonical AUTHOR/task/R/caller inputs.
 */
export function inspectRuntimeConfiguration(platform: PlatformConfig, definition: PipelineDefinition, retainedCorePolicy?: CoreRuntimePolicy, retainedTimingSelections?: Readonly<Record<string,string>>, retainedHttpSelections?: Readonly<Record<string,string>>, retainedPublisherSelections?: Readonly<Record<string,string>>, retainedOperatorSelections?: Readonly<Record<string,string>>, retainedReviewBinding?:ReviewRuntimeBinding, retainedRedisBindings?:RedisRuntimeBindings, retainedOperatorBindings?:OperatorRuntimeBindings, retainedPublisherBindings?:PublisherRuntimeBindings): RuntimeConfigurationInspection {
  const corePolicy = retainedCorePolicy === undefined ? loadCoreRuntimePolicy(platform.corePolicySelection) : captureCoreRuntimePolicy(retainedCorePolicy);
  const originalRedis = retainedRedisBindings === undefined ? platform.adapters : restoreRedisRuntimeBindings(platform.adapters, retainedRedisBindings);
  const originalOperator = retainedOperatorBindings === undefined ? originalRedis : restoreOperatorRuntimeBindings(originalRedis, retainedOperatorBindings);
  const originalAdapters = retainedPublisherBindings === undefined ? originalOperator : restorePublisherRuntimeBindings(originalOperator, retainedPublisherBindings);
  const adapterConfigurations = selectedAdapterConfigurations(originalAdapters, corePolicy, retainedTimingSelections, retainedHttpSelections, retainedPublisherSelections, retainedOperatorSelections, retainedReviewBinding);
  if(retainedReviewBinding!==undefined) {
    if(corePolicy.reviewPolicyCapture?.settings.schemaVersion!=='review-owned-decision-profiles.v2' || platform.providers['runtime.dispatch']!==retainedReviewBinding.provider || !platform.activeAdapters.includes(retainedReviewBinding.provider))throw new Error('RECOVERY_REVIEW_TARGET_PROVIDER_MISMATCH');

  }
  const observerConfigurations = selectedObserverConfigurations(platform.observers, corePolicy);
  validateContractValue('pipelineDefinition', definition);
  const packages = discoverPackages({ installationRoots: platform.installationRoots, trustPolicy: {
    trustedBuiltinRoots: platform.trustedBuiltinRoots, allowedSourceDigests: new Map(Object.entries(platform.externalTrust.allowedSourceDigests)),
    verifiedAttestations: new Map(Object.entries(platform.externalTrust.verifiedAttestations)), verifierId: 'kubeclaw-platform-v2',
  } });
  const snapshot = buildRegistry(packages); const enabled = enabledRegistrations(platform, definition, snapshot);
  const policy: CapabilityPolicy = { enabledRegistrations: enabled, grants: nestedMap(platform.grants), providers: new Map(Object.entries(platform.providers)) };
  const granted = resolveCapabilityGrants(snapshot, policy);
  const provider=platform.providers['runtime.dispatch'];
  const reviewRuntimeBinding=provider && platform.activeAdapters.includes(provider) ? {provider,configuration:adapterConfigurations[provider]!} : undefined;
  validateRuntimeRegistrationConfiguration(snapshot, granted.enabledRegistrations, {
    stages: definition.stages.map((stage) => ({ type: stage.type, config: selectedStageConfiguration(stage.type, stage.config, corePolicy.humanApproval.defaultTimeoutMinutes, corePolicy.prismDesignBudgets, corePolicy.reviewPolicyCapture, reviewRuntimeBinding) })), observers: objectMap(observerConfigurations), adapters: objectMap(adapterConfigurations),
  });
  return { reviewRuntimeBinding, corePolicy, adapterConfigurations, observerConfigurations, configuration: { corePolicy, providers: platform.providers, grants: platform.grants, adapters: adapterConfigurations, activeAdapters: platform.activeAdapters, observers: observerConfigurations, ...(platform.isolation ? { isolation: platform.isolation } : {}) }, snapshot, granted };
}

export async function prepareRuntime(platform: PlatformConfig, definition: PipelineDefinition, retainedCorePolicy?: CoreRuntimePolicy, retainedTimingSelections?: Readonly<Record<string,string>>, retainedHttpSelections?: Readonly<Record<string,string>>, retainedPublisherSelections?: Readonly<Record<string,string>>, retainedOperatorSelections?: Readonly<Record<string,string>>, retainedReviewBinding?:ReviewRuntimeBinding, retainedRedisBindings?:RedisRuntimeBindings, retainedOperatorBindings?:OperatorRuntimeBindings, retainedPublisherBindings?:PublisherRuntimeBindings): Promise<PreparedRuntime> {
  const inspected = inspectRuntimeConfiguration(platform, definition, retainedCorePolicy, retainedTimingSelections, retainedHttpSelections, retainedPublisherSelections, retainedOperatorSelections, retainedReviewBinding, retainedRedisBindings, retainedOperatorBindings, retainedPublisherBindings);
  return { ...inspected, activated: await activateRegistry(inspected.snapshot, new Set(inspected.granted.grants.keys()), platform.isolation, inspected.corePolicy.isolationSession) };
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

export function auditResult(result: Readonly<Record<string, unknown>>, maximumAuditResultBytes: number): Readonly<Record<string, unknown>> {
  const serialized = Buffer.from(JSON.stringify(result));
  if (serialized.length <= maximumAuditResultBytes) return result;
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
  const effects = new EffectCoordinator(new FileEffectJournal(path.join(runRoot, 'effects.jsonl'), runtime.corePolicy), () => new Date(), {
    requested: (request, executionMode) => append('effect.requested', request, { executionMode, capability: request.capability, operation: request.operation, resource: request.resource }),
    accepted: (request, executionMode) => append('effect.accepted', request, { executionMode }),
    completed: (request, receipt, executionMode) => append(receipt.status === 'completed' ? 'effect.completed' : 'effect.failed', request,
      receipt.status === 'completed' ? { executionMode, adapter: receipt.adapter, result: auditResult(receipt.result ?? {}, runtime.corePolicy.maximumAuditResultBytes) } : { executionMode, adapter: receipt.adapter, error: receipt.error ?? {} }),
  }, new FileResourceLockManager(path.join(platform.storageRoot, 'resource-locks'), runtime.corePolicy), platform.effectLockTtlMs, runtime.corePolicy.resourceAcquisition);
  return new AdapterRuntime({ granted: runtime.granted, activated: runtime.activated, configs: objectMap(runtime.adapterConfigurations), effects,
    resolveRetainedWait: source => {
      const waitRoot = platform.adapters?.['kubeclaw.wait-store:waits']?.root;
      if (typeof waitRoot !== 'string') throw new Error('WAIT_RETAINED_CORE_EVIDENCE_INVALID');
      return resolveRetainedCoreWait(source, { storageRoot: platform.storageRoot, waitRoot,
        orchestratorIssuerId: platform.orchestratorIssuerId });
    },
    shutdownTimeoutMs: platform.shutdownTimeoutMs, emitDomainEvent: async (registration, type, identity, payload) => { events.appendSequenced((sequence) => ({
      schemaVersion: 'plugin-domain-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence, type,
      producer: registration, identity, occurredAt: new Date().toISOString(), causationId: null, payload,
    })); } });
}

export async function drainObservers(platform: PlatformConfig, runRoot: string, runtime: PreparedRuntime, adapters: AdapterRuntime, events: FileJournal<LifecycleEvent | PluginDomainEvent>): Promise<void> {
  const observers = new ObserverRuntime({ memoryBytes: runtime.corePolicy.observerMemoryBytes, registry: runtime.granted, activated: runtime.activated, adapters, events,
    checkpoints: new FileJournal<ObserverCheckpoint>(path.join(runRoot, 'observer-checkpoints.jsonl'), runtime.corePolicy.journalAppendLockTimeoutMs),
    deliveries: new FileJournal<ObserverDeliveryRecord>(path.join(runRoot, 'observer-deliveries.jsonl'), runtime.corePolicy.journalAppendLockTimeoutMs), configs: objectMap(runtime.observerConfigurations) });
  await observers.drain();
}

export function serializedObserverDrainer(platform: PlatformConfig, runRoot: string, runtime: PreparedRuntime, adapters: AdapterRuntime, events: FileJournal<LifecycleEvent | PluginDomainEvent>): () => Promise<void> {
  let pending = Promise.resolve(); return () => { pending = pending.then(() => drainObservers(platform, runRoot, runtime, adapters, events)); return pending; };
}

/** Central policy is projected before registry schema validation and retained in
 * the run configuration. Raw Platform adapter data is installation/target data;
 * equal-valued duplicate operator policies are still rejected. */
export function selectedAdapterConfigurations(adapters: PlatformConfig['adapters'], policy: CoreRuntimePolicy, retainedTimingSelections?: Readonly<Record<string,string>>, retainedHttpSelections?: Readonly<Record<string,string>>, retainedPublisherSelections?: Readonly<Record<string,string>>, retainedOperatorSelections?: Readonly<Record<string,string>>, retainedReviewBinding?:ReviewRuntimeBinding): PlatformConfig['adapters'] {
  const selected: Record<string, Readonly<Record<string, unknown>>> = structuredClone(adapters);
  const openClawId = 'kubeclaw.runtime-dispatch:openclaw';
  if(retainedReviewBinding!==undefined) {
    if(retainedReviewBinding.provider!==openClawId || policy.reviewPolicyCapture?.settings.schemaVersion!=='review-owned-decision-profiles.v2')throw new Error('RECOVERY_REVIEW_TARGET_BINDING_INVALID');
    selected[openClawId]={targets:structuredClone(retainedReviewBinding.configuration.targets)};
  }
  if (retainedTimingSelections !== undefined && Object.hasOwn(selected,openClawId)) {
    const raw = selected[openClawId]!;
    if (!raw.targets || typeof raw.targets !== 'object' || Array.isArray(raw.targets)) throw new Error('RECOVERY_TARGET_TIMING_SELECTION_MISSING');
    const targets = Object.fromEntries(Object.entries(raw.targets).map(([targetId, target]) => {
      if (!Object.hasOwn(retainedTimingSelections,targetId) || !target || typeof target !== 'object' || Array.isArray(target)) throw new Error('RECOVERY_TARGET_TIMING_SELECTION_MISSING:use original runtime');
      return [targetId,Object.freeze({...target,timingProfile:retainedTimingSelections[targetId]})];
    }));
    selected[openClawId] = {...raw,targets:Object.freeze(targets)};
  }
  const httpId = 'kubeclaw.runtime-dispatch:runtime';
  if (retainedHttpSelections !== undefined && Object.hasOwn(selected,httpId)) {
    const raw = selected[httpId]!;
    if (!raw.targets || typeof raw.targets !== 'object' || Array.isArray(raw.targets)) throw new Error('RECOVERY_TARGET_BYTE_SELECTION_MISSING');
    const targets = Object.fromEntries(Object.entries(raw.targets).map(([id,target]) => {
      if (!Object.hasOwn(retainedHttpSelections,id) || !target || typeof target !== 'object' || Array.isArray(target)) throw new Error('RECOVERY_TARGET_BYTE_SELECTION_MISSING:use original runtime');
      return [id,Object.freeze({...target,byteProfile:retainedHttpSelections[id]})];
    }));
    selected[httpId] = {...raw,targets:Object.freeze(targets)};
  }
  const publisherId = 'kubeclaw.transport-publisher:publisher';
  if (retainedPublisherSelections !== undefined && Object.hasOwn(selected,publisherId)) {
    const raw = selected[publisherId]!;
    if (!raw.targets || typeof raw.targets !== 'object' || Array.isArray(raw.targets)) throw new Error('RECOVERY_TARGET_PAYLOAD_SELECTION_MISSING');
    const targets = Object.fromEntries(Object.entries(raw.targets).map(([id,target]) => {
      if (!Object.hasOwn(retainedPublisherSelections,id) || !target || typeof target !== 'object' || Array.isArray(target)) throw new Error('RECOVERY_TARGET_PAYLOAD_SELECTION_MISSING:use original runtime');
      return [id,Object.freeze({...target,payloadProfile:retainedPublisherSelections[id]})];
    }));
    selected[publisherId] = {...raw,targets:Object.freeze(targets)};
  }
  const operatorId = 'kubeclaw.operator-messaging:operator';
  if (retainedOperatorSelections !== undefined && Object.hasOwn(selected,operatorId)) {
    const raw = selected[operatorId]!;
    if (!raw.targets || typeof raw.targets !== 'object' || Array.isArray(raw.targets)) throw new Error('RECOVERY_OPERATOR_PAYLOAD_SELECTION_MISSING');
    const targets = Object.fromEntries(Object.entries(raw.targets).map(([id,target]) => {
      if (!Object.hasOwn(retainedOperatorSelections,id) || !target || typeof target !== 'object' || Array.isArray(target)) throw new Error('RECOVERY_OPERATOR_PAYLOAD_SELECTION_MISSING:use original runtime');
      return [id,Object.freeze({...target,payloadProfile:retainedOperatorSelections[id]})];
    }));
    selected[operatorId] = {...raw,targets:Object.freeze(targets)};
  }
  const operator = selected['kubeclaw.operator-messaging:operator'];
  if (operator && ['payloadStructure','payloadPolicyVersion'].some(field => Object.hasOwn(operator,field))) throw new Error('OPERATOR_PAYLOAD_POLICY_COMPETING_AUTHOR');
  const policies = [
    ['kubeclaw.repository-adapter:repository', policy.repositoryRead, 'REPOSITORY_READ'],
    ['kubeclaw.remote-test-gate:plan', {gateLimits:policy.remoteTestGate}, 'REMOTE_TEST_GATE'],
    ['kubeclaw.remote-test-gate:evidence', {gateLimits:policy.remoteTestGate}, 'REMOTE_TEST_GATE'],
    ['kubeclaw.demo-handoff:handoff', {recordLimits: policy.demoHandoffStore}, 'DEMO_HANDOFF_STORE'],
    ['kubeclaw.command-runner:command', {maximumCatalogEntries: policy.commandCatalog.maximumEntries}, 'COMMAND_CATALOG'],
    ['kubeclaw.redis-transport:publisher', policy.redisTransport, 'REDIS_TRANSPORT'],
    ['kubeclaw.redis-transport:telemetry', policy.redisTransport, 'REDIS_TRANSPORT'],
    ['kubeclaw.command-runner:command', policy.commandProcessCleanup, 'COMMAND_CLEANUP'],
    ['kubeclaw.command-runner:command', policy.commandRunnerMonitoring, 'COMMAND_MONITORING'],
    ['kubeclaw.notification-observer:notifications', policy.notificationPresentation, 'NOTIFICATION_PRESENTATION'],
    ['kubeclaw.git-workspace:git', policy.gitWorkspaceFailure, 'GIT_WORKSPACE_FAILURE'],
    ['kubeclaw.operator-messaging:operator', policy.operatorMessagingFailure, 'OPERATOR_FAILURE'],
    ['kubeclaw.transport-publisher:publisher', policy.transportPublisherStructure, 'TRANSPORT_STRUCTURE'],
    ['kubeclaw.transport-publisher:publisher', policy.transportPublisherFailure, 'TRANSPORT_FAILURE'],
    ['kubeclaw.openclaw-agent-events:source', policy.agentEventSource, 'AGENT_EVENT_SOURCE'],
    ['kubeclaw.network-http:http', policy.networkHttp, 'NETWORK_HTTP'],
    ['kubeclaw.operator-messaging:operator', policy.policyVersion === 'nova-core-runtime-policy.v3' ? {...policy.operatorMessagingPayload, payloadPolicyVersion: 'operator-payload.v2'} : policy.operatorMessagingPayload, 'OPERATOR_PAYLOAD'],
    ['kubeclaw.transport-publisher:publisher', policy.transportPublisherPayload, 'TRANSPORT_PAYLOAD'],
    ['kubeclaw.artifact-store:artifact-store', policy.artifactStore, 'ARTIFACT'],
    ['kubeclaw.state-store:state', policy.stateStore, 'STATE'],
    ['kubeclaw.wait-store:waits', policy.waitStore, 'WAIT'],
    ['kubeclaw.telemetry-store:telemetry', policy.telemetryStore, 'TELEMETRY'],
    ['kubeclaw.operator-messaging:operator', policy.operatorMessagingStore, 'OPERATOR'],
    ['kubeclaw.transport-publisher:publisher', policy.transportPublisherStore, 'TRANSPORT'],
    ['kubeclaw.runtime-dispatch:runtime', policy.httpDispatch, 'HTTP_DISPATCH'],
    ['kubeclaw.runtime-dispatch:openclaw', policy.openClawDispatch, 'OPENCLAW'],
  ] as const;
  for (const [id, limits, label] of policies) {
    if (!Object.hasOwn(selected, id)) continue;
    const raw = selected[id]!;
    for (const field of Object.keys(limits)) {
      if (Object.hasOwn(raw, field)) throw new Error(`${label}_POLICY_COMPETING_AUTHOR:${field}`);
    }
    selected[id] = Object.freeze({ ...raw, ...limits });
  }
  return Object.freeze(selected);
}

/** Observer registrations have their own configuration lane, separate from adapters.
 * Reproject from the supplied original policy on recovery; never read current Core.
 */
export function selectedObserverConfigurations(observers: PlatformConfig['observers'], policy: CoreRuntimePolicy): PlatformConfig['observers'] {
  const selected: Record<string, Readonly<Record<string, unknown>>> = structuredClone(observers);
  for (const id of ['kubeclaw.notification-observer:notifications', 'kubeclaw.notification-observer:preview-delivery']) {
    if (!Object.hasOwn(selected, id)) continue;
    const raw = selected[id]!;
    for (const field of Object.keys(policy.notificationPresentation)) {
      if (Object.hasOwn(raw, field)) throw new Error(`NOTIFICATION_PRESENTATION_POLICY_COMPETING_AUTHOR:${field}`);
    }
    selected[id] = Object.freeze({ ...raw, ...policy.notificationPresentation });
  }
  return Object.freeze(selected);
}
