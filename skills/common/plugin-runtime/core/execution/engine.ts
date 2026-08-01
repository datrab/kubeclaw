import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AdministrativeReopenDecision,
  EffectRequest,
  LifecycleEvent,
  ObserverCheckpoint,
  PipelineDefinition,
  PluginDomainEvent,
  ResumeSignal,
} from '../../sdk/src/index.ts';
import { activateRegistry } from '../registry/activation.ts';
import { buildRegistry } from '../registry/build.ts';
import { resolveCapabilityGrants, type CapabilityPolicy } from '../registry/capabilities.ts';
import { discoverPackages } from '../registry/discovery.ts';
import { validateContractValue } from '../registry/schema.ts';
import { validateRuntimeRegistrationConfiguration } from '../registry/configuration.ts';
import type { PlatformConfig } from '../config/platform.ts';
import { FileEffectJournal } from '../effects/journal.ts';
import { EffectCoordinator } from '../effects/coordinator.ts';
import { FileResourceLockManager } from '../effects/locks.ts';
import { FileJournal } from '../state/journal.ts';
import {
  ObserverRuntime,
  type ObserverDeliveryRecord,
} from '../telemetry/observers.ts';
import { recoverStageStates } from '../lifecycle/recovery.ts';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import { AdapterRuntime } from './adapters.ts';
import {
  PipelineRunner,
  type PipelineRunResult,
  validatePipelineDefinitionAgainstRegistry,
} from './runner.ts';
import { ExecutionGraph, type ExecutionGraphSnapshot } from './graph.ts';
import { FrozenMap } from '../registry/frozen-map.ts';

function nestedMap(
  value: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>,
): ReadonlyMap<string, ReadonlyMap<string, Readonly<Record<string, unknown>>>> {
  return new Map(Object.entries(value).map(([registrationId, grants]) => [
    registrationId,
    new Map(Object.entries(grants)),
  ]));
}

function objectMap(
  value: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  return new Map(Object.entries(value));
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const activeRunMutations = new Set<string>();

async function withRunMutationLock<T>(
  runRoot: string,
  operation: (leaseSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const key = path.resolve(runRoot);
  if (activeRunMutations.has(key)) throw new Error(`PIPELINE_RUN_MUTATION_LOCKED:${key}`);
  activeRunMutations.add(key);
  let locks: FileResourceLockManager | undefined;
  let owner: string | undefined;
  let lock: ReturnType<FileResourceLockManager['acquire']> | undefined;
  let renewalError: unknown;
  let renewal: NodeJS.Timeout | undefined;
  const leaseController = new AbortController();
  try {
    fs.mkdirSync(path.dirname(key), { recursive: true });
    locks = new FileResourceLockManager(path.join(path.dirname(key), '.run-mutation-locks'));
    owner = `mutation:${process.pid}:${crypto.randomUUID()}`;
    lock = locks.acquire(
      { type: 'pipeline.run', canonicalId: key },
      owner,
      60_000,
    );
    renewal = setInterval(() => {
      try {
        lock = locks!.renew(lock!.lockId, owner!, 60_000);
      } catch (error) {
        renewalError = error;
        leaseController.abort(error);
      }
    }, 20_000);
    renewal.unref();
    const result = await operation(leaseController.signal);
    if (renewalError) throw renewalError;
    return result;
  } finally {
    if (renewal) clearInterval(renewal);
    try {
      if (locks && lock && owner) locks.release(lock.lockId, owner);
    } finally {
      activeRunMutations.delete(key);
    }
  }
}

export function loadPipelineDefinition(file: string): PipelineDefinition {
  const value = JSON.parse(fs.readFileSync(fs.realpathSync(file), 'utf8')) as unknown;
  validateContractValue('pipelineDefinition', value);
  return value as PipelineDefinition;
}

interface PreparedRuntime {
  readonly snapshot: ReturnType<typeof buildRegistry>;
  readonly granted: ReturnType<typeof resolveCapabilityGrants>;
  readonly activated: Awaited<ReturnType<typeof activateRegistry>>;
}

export interface AuthenticatedAdministrativePrincipal {
  readonly type: 'operator' | 'administrator';
  readonly id: string;
}

export type AdministrativeDecisionAuthenticator = (
  decision: AdministrativeReopenDecision,
) => Promise<AuthenticatedAdministrativePrincipal> | AuthenticatedAdministrativePrincipal;

async function prepareRuntime(
  platform: PlatformConfig,
  definition: PipelineDefinition,
): Promise<PreparedRuntime> {
  validateContractValue('pipelineDefinition', definition);
  const packages = discoverPackages({
    installationRoots: platform.installationRoots,
    trustPolicy: {
      trustedBuiltinRoots: platform.trustedBuiltinRoots,
      allowedSourceDigests: new Map(Object.entries(platform.externalTrust.allowedSourceDigests)),
      verifiedAttestations: new Map(Object.entries(platform.externalTrust.verifiedAttestations)),
      verifierId: 'kubeclaw-platform-v2',
    },
  });
  const snapshot = buildRegistry(packages);
  const enabled = new Set<string>(Object.keys(platform.observers));
  for (const adapterId of platform.activeAdapters) enabled.add(adapterId);
  for (const stage of definition.stages) {
    const owner = snapshot.stages.get(stage.type);
    if (!owner) throw new Error(`PIPELINE_STAGE_OWNER_MISSING:${stage.type}`);
    enabled.add(`${owner.package.manifest.id}:${owner.registration.id}`);
  }
  const policy: CapabilityPolicy = {
    enabledRegistrations: enabled,
    grants: nestedMap(platform.grants),
    providers: new Map(Object.entries(platform.providers)),
  };
  const granted = resolveCapabilityGrants(snapshot, policy);
  validateRuntimeRegistrationConfiguration(
    snapshot,
    granted.enabledRegistrations,
    {
      stages: definition.stages.map((stage) => ({
        type: stage.type,
        config: stage.config,
      })),
      observers: objectMap(platform.observers),
      adapters: objectMap(platform.adapters),
    },
  );
  return {
    snapshot,
    granted,
    activated: await activateRegistry(snapshot, new Set(granted.grants.keys())),
  };
}

export async function validatePipelineRuntimeV2(
  platform: PlatformConfig,
  definitionInput: PipelineDefinition,
): Promise<Readonly<{
  packageCount: number;
  stageCount: number;
  observerCount: number;
  adapterCount: number;
}>> {
  const definition = deepFreeze(structuredClone(definitionInput));
  const runtime = await prepareRuntime(platform, definition);
  validatePipelineDefinitionAgainstRegistry(definition, runtime.granted);
  return Object.freeze({
    packageCount: runtime.snapshot.packages.size,
    stageCount: runtime.activated.stages.size,
    observerCount: runtime.activated.observers.size,
    adapterCount: runtime.activated.adapters.size,
  });
}

function createAdapterRuntime(
  platform: PlatformConfig,
  runRoot: string,
  runtime: PreparedRuntime,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>,
): AdapterRuntime {
  const isObserverDeliveryEffect = (request: EffectRequest): boolean =>
    request.attempt.attemptId.startsWith('observer:');
  const appendEffectEvent = (
    type: 'effect.requested' | 'effect.accepted' | 'effect.completed' | 'effect.failed',
    request: EffectRequest,
    payload: Readonly<Record<string, unknown>>,
  ): void => {
    // Observer delivery already has its own durable attempt/checkpoint journal.
    // Keeping its adapter plumbing out of the lifecycle journal prevents the
    // observer transport from becoming new observable pipeline work.
    if (isObserverDeliveryEffect(request)) return;
    events.append({
      schemaVersion: 'lifecycle-event.v2',
      eventId: `event:${crypto.randomUUID()}`,
      sequence: events.records().length + 1,
      type,
      identity: {
        runId: request.attempt.runId,
        stageId: request.attempt.stageId,
        attemptId: request.attempt.attemptId,
        effectId: request.effectId,
      },
      occurredAt: new Date().toISOString(),
      causationId: request.attempt.attemptId,
      payload,
    });
  };
  return new AdapterRuntime({
    granted: runtime.granted,
    activated: runtime.activated,
    configs: objectMap(platform.adapters),
    effects: new EffectCoordinator(
      new FileEffectJournal(path.join(runRoot, 'effects.jsonl')),
      () => new Date(),
      {
        requested(request) {
          appendEffectEvent('effect.requested', request, {
            capability: request.capability,
            operation: request.operation,
            resource: request.resource,
          });
        },
        accepted(request) {
          appendEffectEvent('effect.accepted', request, {});
        },
        completed(request, receipt) {
          appendEffectEvent(
            receipt.status === 'completed' ? 'effect.completed' : 'effect.failed',
            request,
            receipt.status === 'completed'
              ? { adapter: receipt.adapter, result: receipt.result ?? {} }
              : { adapter: receipt.adapter, error: receipt.error ?? {} },
          );
        },
      },
      new FileResourceLockManager(path.join(platform.storageRoot, 'resource-locks')),
      Math.max(platform.shutdownTimeoutMs * 2, 60_000),
    ),
    shutdownTimeoutMs: platform.shutdownTimeoutMs,
    emitDomainEvent: async (registration, type, identity, payload) => {
      events.append({
        schemaVersion: 'plugin-domain-event.v2',
        eventId: `event:${crypto.randomUUID()}`,
        sequence: events.records().length + 1,
        type,
        producer: registration,
        identity,
        occurredAt: new Date().toISOString(),
        causationId: null,
        payload,
      });
    },
  });
}

async function drainObservers(
  platform: PlatformConfig,
  runRoot: string,
  runtime: PreparedRuntime,
  adapters: AdapterRuntime,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>,
): Promise<void> {
  const observers = new ObserverRuntime({
    registry: runtime.granted,
    activated: runtime.activated,
    adapters,
    events,
    checkpoints: new FileJournal<ObserverCheckpoint>(path.join(runRoot, 'observer-checkpoints.jsonl')),
    deliveries: new FileJournal<ObserverDeliveryRecord>(path.join(runRoot, 'observer-deliveries.jsonl')),
    configs: objectMap(platform.observers),
  });
  await observers.drain();
}

function serializedObserverDrainer(
  platform: PlatformConfig,
  runRoot: string,
  runtime: PreparedRuntime,
  adapters: AdapterRuntime,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>,
): () => Promise<void> {
  let pending = Promise.resolve();
  return () => {
    pending = pending.then(() => drainObservers(platform, runRoot, runtime, adapters, events));
    return pending;
  };
}

function verifyPinnedPackages(runRoot: string, runtime: PreparedRuntime): void {
  const file = path.join(runRoot, 'registry-snapshot.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  }
  const packages = (stored as { packages?: unknown }).packages;
  if (!Array.isArray(packages)) throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
  const pinned = new Map<string, { package: { packageVersion: string; contentDigest: string } }>();
  for (const value of packages) {
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string') {
      throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
    }
    const provenance = value[1] as {
      package?: { packageVersion?: unknown; contentDigest?: unknown };
    } | null;
    if (
      !provenance
      || typeof provenance !== 'object'
      || !provenance.package
      || typeof provenance.package.packageVersion !== 'string'
      || typeof provenance.package.contentDigest !== 'string'
      || pinned.has(value[0])
    ) {
      throw new Error('RECOVERY_REGISTRY_SNAPSHOT_INVALID');
    }
    pinned.set(value[0], provenance as {
      package: { packageVersion: string; contentDigest: string };
    });
  }
  const currentIds = [...runtime.snapshot.packages.keys()].sort();
  const pinnedIds = [...pinned.keys()].sort();
  if (canonicalJson(currentIds) !== canonicalJson(pinnedIds)) {
    throw new Error('RECOVERY_PINNED_PACKAGE_SET_MISMATCH');
  }
  for (const [pluginId, provenance] of pinned) {
    const current = runtime.snapshot.packages.get(pluginId);
    if (!current) throw new Error(`RECOVERY_PINNED_PACKAGE_MISSING:${pluginId}`);
    if (current.provenance.package.packageVersion !== provenance.package.packageVersion) {
      throw new Error(`RECOVERY_PINNED_PACKAGE_VERSION_MISMATCH:${pluginId}`);
    }
    if (current.provenance.package.contentDigest !== provenance.package.contentDigest) {
      throw new Error(`RECOVERY_PINNED_PACKAGE_DIGEST_MISMATCH:${pluginId}`);
    }
  }
}

function graphSnapshot(definition: PipelineDefinition): ExecutionGraphSnapshot {
  return ExecutionGraph.fromDefinition(definition).snapshot(
    definition.id,
    definition.maxConcurrency,
  );
}

function verifyPinnedGraph(
  runRoot: string,
  definition: PipelineDefinition,
): ExecutionGraphSnapshot {
  const file = path.join(runRoot, 'graph-snapshot.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as ExecutionGraphSnapshot;
  const current = graphSnapshot(definition);
  if (stored.schemaVersion !== 'execution-graph-snapshot.v2') {
    throw new Error('RECOVERY_GRAPH_SNAPSHOT_INVALID');
  }
  if (stored.pipelineId !== current.pipelineId) {
    throw new Error(`RECOVERY_PIPELINE_ID_MISMATCH:${stored.pipelineId}:${current.pipelineId}`);
  }
  if (stored.digest !== current.digest) {
    throw new Error(`RECOVERY_GRAPH_DIGEST_MISMATCH:${stored.digest}:${current.digest}`);
  }
  return current;
}

function writeRunSnapshots(
  runRoot: string,
  graph: ExecutionGraphSnapshot,
  registry: Readonly<Record<string, unknown>>,
): void {
  const graphFile = path.join(runRoot, 'graph-snapshot.json');
  const registryFile = path.join(runRoot, 'registry-snapshot.json');
  if (fs.existsSync(graphFile) || fs.existsSync(registryFile)) {
    throw new Error(`RUN_ALREADY_EXISTS:${runRoot}`);
  }
  const created: string[] = [];
  try {
    fs.writeFileSync(graphFile, `${JSON.stringify(graph, null, 2)}\n`, { flag: 'wx' });
    created.push(graphFile);
    fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`, { flag: 'wx' });
    created.push(registryFile);
  } catch (error) {
    for (const file of created.reverse()) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Preserve the initialization failure while rolling back partial snapshots.
      }
    }
    throw error;
  }
}

function frozenRegistryRecord(
  runtime: PreparedRuntime,
  definition: PipelineDefinition,
  graph: ExecutionGraphSnapshot,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    apiVersion: runtime.snapshot.apiVersion,
    packages: [...runtime.snapshot.packages].map(([pluginId, pkg]) => [
      pluginId,
      pkg.provenance,
    ]),
    registrations: {
      stages: [...runtime.snapshot.stages].map(([stageType, entry]) => ({
        stageType,
        registration: entry.registration,
        provenance: entry.provenance,
      })),
      observers: [...runtime.snapshot.observers].map(([registrationId, entry]) => ({
        registrationId,
        registration: entry.registration,
        provenance: entry.provenance,
      })),
      adapters: [...runtime.snapshot.adapters].map(([registrationId, entry]) => ({
        registrationId,
        registration: entry.registration,
        provenance: entry.provenance,
      })),
    },
    enabledRegistrations: [...runtime.granted.enabledRegistrations].sort(),
    grants: [...runtime.granted.grants],
    selectedProviders: [...runtime.granted.selectedProviders].map(([capability, entry]) => ({
      capability,
      provider: entry.provenance,
    })),
    executionGraph: {
      pipelineId: graph.pipelineId,
      digest: graph.digest,
    },
    configuredStages: definition.stages.map((stage) => {
      const owner = runtime.snapshot.stages.get(stage.type)!;
      return {
        stageId: stage.id,
        stageType: stage.type,
        owner: owner.provenance,
      };
    }),
  });
}

function validateSignal(
  wait: NonNullable<StageRuntimeState['wait']>,
  signal: ResumeSignal,
  waitCreatedAt: string,
): void {
  validateContractValue('resumeSignal', signal);
  if (signal.waitId !== wait.waitId) throw new Error(`WAIT_SIGNAL_MISMATCH:${signal.waitId}`);
  if (signal.signalType !== wait.signalType) throw new Error(`WAIT_SIGNAL_TYPE_MISMATCH:${signal.signalType}`);
  if (
    signal.issuer.type !== wait.authorizedIssuer.type
    || signal.issuer.id !== wait.authorizedIssuer.id
  ) {
    throw new Error(`WAIT_ISSUER_DENIED:${signal.issuer.type}:${signal.issuer.id}`);
  }
  if (wait.expiresAt !== null && Date.now() >= Date.parse(wait.expiresAt)) {
    throw new Error(`WAIT_EXPIRED:${wait.waitId}`);
  }
  if (Date.parse(signal.issuedAt) < Date.parse(waitCreatedAt)) {
    throw new Error(`WAIT_SIGNAL_STALE:${signal.signalId}`);
  }
}

export async function runPipelineV2(
  platform: PlatformConfig,
  definitionInput: PipelineDefinition,
  runId?: string,
  signal?: AbortSignal,
): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput));
  const runtime = await prepareRuntime(platform, definition);
  const effectiveRunId = runId ?? `run:${crypto.randomUUID()}`;
  const runRoot = path.join(platform.storageRoot, 'runs', effectiveRunId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
  fs.mkdirSync(runRoot, { recursive: true });
  const graph = graphSnapshot(definition);
  writeRunSnapshots(runRoot, graph, frozenRegistryRecord(runtime, definition, graph));
  const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
  const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
  await adapters.start();
  const flushObservers = serializedObserverDrainer(platform, runRoot, runtime, adapters, events);
  try {
    const runner = new PipelineRunner({
      definition,
      registry: runtime.granted,
      activated: runtime.activated,
      adapters,
      journal: events,
      orchestratorIssuerId: platform.orchestratorIssuerId,
      signal: signal ? AbortSignal.any([signal, leaseSignal]) : leaseSignal,
      onEventsCommitted: flushObservers,
    });
    return await runner.run(effectiveRunId);
  } finally {
    try {
      await flushObservers();
    } finally {
      await adapters.shutdown();
    }
  }
  });
}

export async function recoverPipelineV2(
  platform: PlatformConfig,
  definitionInput: PipelineDefinition,
  runId: string,
): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput));
  const runtime = await prepareRuntime(platform, definition);
  const runRoot = path.join(platform.storageRoot, 'runs', runId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
  verifyPinnedPackages(runRoot, runtime);
  verifyPinnedGraph(runRoot, definition);
  const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
  const latestRunBoundary = [...events.records()].reverse().find(({ entry }) =>
    entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === runId
    && [
      'run.resumed',
      'run.succeeded',
      'run.failed',
      'run.blocked',
      'run.cancelled',
    ].includes(entry.type));
  if (latestRunBoundary && latestRunBoundary.entry.type !== 'run.resumed') {
    throw new Error(`RECOVERY_RUN_TERMINAL:${runId}:${latestRunBoundary.entry.type}`);
  }
  const recovered = recoverStageStates(
    definition,
    events.records(),
    runId,
    platform.orchestratorIssuerId,
  );
  const initialStates = new Map<string, StageRuntimeState>();
  for (const [stageId, state] of recovered) {
    if (!state.retryAt) {
      initialStates.set(stageId, state);
      continue;
    }
    if (Date.now() < Date.parse(state.retryAt)) {
      throw new Error(`RECOVERY_COOLDOWN_NOT_DUE:${stageId}:${state.retryAt}`);
    }
    const { retryAt: _retryAt, ...withoutCooldown } = state;
    initialStates.set(stageId, { ...withoutCooldown, status: 'pending' });
  }
  const signalWait = [...initialStates.values()].find((state) => state.wait);
  if (signalWait?.wait) {
    throw new Error(`RECOVERY_SIGNAL_REQUIRED:${signalWait.wait.waitId}`);
  }
  const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
  await adapters.start();
  const flushObservers = serializedObserverDrainer(platform, runRoot, runtime, adapters, events);
  try {
    const runner = new PipelineRunner({
      definition,
      registry: runtime.granted,
      activated: runtime.activated,
      adapters,
      journal: events,
      orchestratorIssuerId: platform.orchestratorIssuerId,
      initialStates,
      resume: true,
      resumePayload: { recovery: 'journal' },
      signal: leaseSignal,
      onEventsCommitted: flushObservers,
    });
    return await runner.run(runId);
  } finally {
    try {
      await flushObservers();
    } finally {
      await adapters.shutdown();
    }
  }
  });
}

export async function resumePipelineV2(
  platform: PlatformConfig,
  definitionInput: PipelineDefinition,
  runId: string,
  signal: ResumeSignal,
): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput));
  const runtime = await prepareRuntime(platform, definition);
  const runRoot = path.join(platform.storageRoot, 'runs', runId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
  verifyPinnedPackages(runRoot, runtime);
  verifyPinnedGraph(runRoot, definition);
  const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
  const latestRunBoundary = [...events.records()].reverse().find(({ entry }) =>
    entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === runId
    && [
      'run.resumed',
      'run.succeeded',
      'run.failed',
      'run.blocked',
      'run.cancelled',
    ].includes(entry.type));
  if (
    latestRunBoundary
    && latestRunBoundary.entry.type !== 'run.resumed'
  ) {
    throw new Error(`WAIT_RUN_TERMINAL:${runId}:${latestRunBoundary.entry.type}`);
  }
  const recovered = recoverStageStates(
    definition,
    events.records(),
    runId,
    platform.orchestratorIssuerId,
  );
  const waiting = [...recovered.values()].find((state) => state.wait?.waitId === signal.waitId);
  if (!waiting?.wait) throw new Error(`WAIT_UNKNOWN_OR_STALE:${signal.waitId}`);
  const latestTerminalRecord = [...events.records()].reverse().find(({ entry }) =>
    entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === runId
    && ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(entry.type));
  const waitCreatedRecord = [...events.records()].reverse().find(({ entry }) =>
    entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === runId
    && (
      entry.payload.wait as { waitId?: unknown } | undefined
    )?.waitId === signal.waitId);
  if (
    latestTerminalRecord
    && (!waitCreatedRecord || waitCreatedRecord.sequence <= latestTerminalRecord.sequence)
  ) {
    throw new Error(`WAIT_INVALIDATED_BY_TERMINAL_RUN:${signal.waitId}`);
  }
  if (!waitCreatedRecord) throw new Error(`WAIT_CREATION_RECORD_MISSING:${signal.waitId}`);
  validateSignal(waiting.wait, signal, waitCreatedRecord.entry.occurredAt);
  leaseSignal.throwIfAborted();
  const signals = new FileJournal<ResumeSignal>(path.join(runRoot, 'signals.jsonl'));
  signals.transact((records, append) => {
    const duplicate = records.find(
      (record) => record.entry.idempotencyKey === signal.idempotencyKey,
    )?.entry;
    if (duplicate) {
      if (canonicalJson(duplicate) !== canonicalJson(signal)) {
        throw new Error(`WAIT_SIGNAL_CONFLICT:${signal.idempotencyKey}`);
      }
      return;
    }
    if (records.some((record) => record.entry.waitId === signal.waitId)) {
      throw new Error(`WAIT_ALREADY_RESOLVED:${signal.waitId}`);
    }
    append(signal);
  });
  const signalResolutionExists = events.records().some(({ entry }) =>
    entry.schemaVersion === 'lifecycle-event.v2'
    && entry.type === 'wait.resolved'
    && entry.identity.runId === runId
    && entry.identity.waitId === signal.waitId
    && entry.causationId === signal.signalId);
  if (!signalResolutionExists) {
    leaseSignal.throwIfAborted();
    events.append({
      schemaVersion: 'lifecycle-event.v2',
      eventId: `event:${crypto.randomUUID()}`,
      sequence: events.records().length + 1,
      type: 'wait.resolved',
      identity: { runId, stageId: waiting.stageId, waitId: waiting.wait.waitId },
      occurredAt: new Date().toISOString(),
      causationId: signal.signalId,
      payload: { signal },
    });
  }
  const initialStates = new Map<string, StageRuntimeState>();
  for (const [stageId, state] of recovered) {
    if (stageId !== waiting.stageId) {
      initialStates.set(stageId, state);
      continue;
    }
    const { wait: _wait, ...withoutWait } = state;
    initialStates.set(stageId, { ...withoutWait, status: 'pending' });
  }
  const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
  await adapters.start();
  const flushObservers = serializedObserverDrainer(platform, runRoot, runtime, adapters, events);
  try {
    const runner = new PipelineRunner({
      definition,
      registry: runtime.granted,
      activated: runtime.activated,
      adapters,
      journal: events,
      orchestratorIssuerId: platform.orchestratorIssuerId,
      initialStates,
      resumeGuidance: new Map([[waiting.stageId, signal.payload]]),
      resume: true,
      signal: leaseSignal,
      onEventsCommitted: flushObservers,
    });
    return await runner.run(runId);
  } finally {
    try {
      await flushObservers();
    } finally {
      await adapters.shutdown();
    }
  }
  });
}

export async function reopenBlockedPipelineV2(
  platform: PlatformConfig,
  definitionInput: PipelineDefinition,
  decisionInput: AdministrativeReopenDecision,
  authenticate: AdministrativeDecisionAuthenticator,
): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput));
  const decision = deepFreeze(structuredClone(decisionInput));
  validateContractValue('administrativeReopenDecision', decision);
  const runtime = await prepareRuntime(platform, definition);
  const runId = decision.runId;
  const runRoot = path.join(platform.storageRoot, 'runs', runId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
    verifyPinnedPackages(runRoot, runtime);
    const graph = verifyPinnedGraph(runRoot, definition);
    const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
    const recovered = recoverStageStates(
      definition,
      events.records(),
      runId,
      platform.orchestratorIssuerId,
    );
    const decisions = new FileJournal<AdministrativeReopenDecision>(
      path.join(runRoot, 'administrative-decisions.jsonl'),
    );
    const recordedDecision = decisions.records().find(({ entry }) =>
      entry.decisionId === decision.decisionId
      || entry.idempotencyKey === decision.idempotencyKey)?.entry;
    if (recordedDecision && canonicalJson(recordedDecision) !== canonicalJson(decision)) {
      throw new Error(`ADMIN_REOPEN_IDEMPOTENCY_CONFLICT:${decision.idempotencyKey}`);
    }
    if (
      !recordedDecision
    ) {
      const principal = await authenticate(decision);
      if (
        principal.type !== decision.actor.type
        || principal.id !== decision.actor.id
      ) {
        throw new Error(`ADMIN_REOPEN_ACTOR_MISMATCH:${decision.actor.type}:${decision.actor.id}`);
      }
      if (!platform.administrativeDecisionIssuers.some((issuer) =>
        issuer.type === principal.type && issuer.id === principal.id)
      ) {
        throw new Error(`ADMIN_REOPEN_ISSUER_DENIED:${principal.type}:${principal.id}`);
      }
    }
    const stageDefinition = definition.stages.find(({ id }) => id === decision.stageId);
    if (!stageDefinition) throw new Error(`GRAPH_STAGE_MISSING:${decision.stageId}`);
    if (
      decision.continuation === 'remediation'
      && stageDefinition.on?.request_fix !== decision.remediationStageId
    ) {
      throw new Error(`ADMIN_REMEDIATION_UNDECLARED:${decision.stageId}:${decision.remediationStageId}`);
    }
    const targetState = recovered.get(decision.stageId);
    if (!targetState || (!recordedDecision && targetState.status !== 'blocked')) {
      throw new Error(`ADMIN_REOPEN_STAGE_NOT_BLOCKED:${decision.stageId}`);
    }
    const latestRunTerminal = [...events.records()].reverse().find(({ entry }) =>
      entry.schemaVersion === 'lifecycle-event.v2'
      && entry.identity.runId === runId
      && ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(entry.type));
    if (
      !recordedDecision
      && latestRunTerminal
      && latestRunTerminal.entry.type !== 'run.blocked'
    ) {
      throw new Error(`ADMIN_REOPEN_RUN_NOT_BLOCKED:${runId}`);
    }
    if (decision.continuation === 'remediation' && !recordedDecision) {
      if (
        targetState.remediationCyclesUsed + 1
        > stageDefinition.execution.maxRemediationCycles
      ) {
        throw new Error(`ADMIN_REMEDIATION_BUDGET_EXHAUSTED:${decision.stageId}`);
      }
      const remediationTarget = recovered.get(decision.remediationStageId);
      if (
        remediationTarget
        && ['blocked', 'failed', 'cancelled'].includes(remediationTarget.status)
      ) {
        throw new Error(
          `ADMIN_REMEDIATION_TARGET_TERMINAL:${decision.remediationStageId}:${remediationTarget.status}`,
        );
      }
    }
    if (!recordedDecision) {
      leaseSignal.throwIfAborted();
      decisions.append(Object.freeze(structuredClone(decision)));
    }
    const hasDecisionEvent = (type: LifecycleEvent['type'], stageId?: string): boolean =>
      events.records().some(({ entry }) =>
        entry.schemaVersion === 'lifecycle-event.v2'
        && entry.causationId === decision.decisionId
        && entry.type === type
        && (stageId === undefined || entry.identity.stageId === stageId));
    const appendOnce = (
      type: LifecycleEvent['type'],
      stageId: string | undefined,
      payload: Readonly<Record<string, unknown>> = {},
    ): void => {
      leaseSignal.throwIfAborted();
      if (hasDecisionEvent(type, stageId)) return;
      events.append({
        schemaVersion: 'lifecycle-event.v2',
        eventId: `event:${crypto.randomUUID()}`,
        sequence: events.records().length + 1,
        type,
        identity: { runId, ...(stageId ? { stageId } : {}) },
        occurredAt: new Date().toISOString(),
        causationId: decision.decisionId,
        payload,
      });
    };
    const auditPayload = { administrativeDecision: decision };
    appendOnce('run.resumed', undefined, auditPayload);
    const completedStatus = ([
      ['run.succeeded', 'succeeded'],
      ['run.failed', 'failed'],
      ['run.blocked', 'blocked'],
      ['run.cancelled', 'cancelled'],
    ] as const).find(([type]) => hasDecisionEvent(type))?.[1];
    if (recordedDecision && completedStatus) {
      const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
      await adapters.start();
      try {
        await drainObservers(platform, runRoot, runtime, adapters, events);
      } finally {
        await adapters.shutdown();
      }
      return Object.freeze({
        runId,
        identity: Object.freeze({
          runId,
          pipelineId: graph.pipelineId,
          graphDigest: graph.digest,
        }),
        status: completedStatus,
        stages: new FrozenMap(
          [...recovered].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
        ),
      });
    }
    if (recordedDecision && targetState.status === 'waiting' && targetState.wait) {
      const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
      await adapters.start();
      try {
        await drainObservers(platform, runRoot, runtime, adapters, events);
      } finally {
        await adapters.shutdown();
      }
      return Object.freeze({
        runId,
        identity: Object.freeze({
          runId,
          pipelineId: graph.pipelineId,
          graphDigest: graph.digest,
        }),
        status: 'waiting',
        stages: new FrozenMap(
          [...recovered].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
        ),
      });
    }
    if (decision.continuation === 'cancel') {
      appendOnce('stage.cancelled', decision.stageId, {
        ...auditPayload,
        attemptsUsed: targetState.attemptsUsed,
        remediationCyclesUsed: targetState.remediationCyclesUsed,
      });
      appendOnce('run.cancelled', undefined, auditPayload);
      const cancelled = new Map(recovered);
      cancelled.set(decision.stageId, { ...targetState, status: 'cancelled' });
      const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
      await adapters.start();
      try {
        await drainObservers(platform, runRoot, runtime, adapters, events);
      } finally {
        await adapters.shutdown();
      }
      return Object.freeze({
        runId,
        identity: Object.freeze({
          runId,
          pipelineId: graph.pipelineId,
          graphDigest: graph.digest,
        }),
        status: 'cancelled',
        stages: new FrozenMap(
          [...cancelled].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
        ),
      });
    }

    const initialStates = new Map(recovered);
    const administrativeAttemptOverrides = new Set<string>();
    if (decision.continuation === 'retry') {
      const decisionAlreadyTerminal = (
        hasDecisionEvent('stage.skipped', decision.stageId)
        || hasDecisionEvent('stage.succeeded', decision.stageId)
        || hasDecisionEvent('stage.failed', decision.stageId)
        || hasDecisionEvent('stage.blocked', decision.stageId)
        || hasDecisionEvent('stage.cancelled', decision.stageId)
      );
      if (!decisionAlreadyTerminal && ['blocked', 'pending', 'running'].includes(targetState.status)) {
        const {
          wait: _wait,
          remediationTarget: _target,
          remediationReturnTo: _return,
          ...withoutPause
        } = targetState;
        const overrideConsumed = hasDecisionEvent('attempt.created', decision.stageId);
        initialStates.set(decision.stageId, {
          ...withoutPause,
          status: overrideConsumed ? 'blocked' : 'pending',
        });
        // The override is consumed when its immutable attempt identity is
        // journaled, not by the preceding stage scheduling transition. A
        // crashed consumed attempt remains blocked until a new decision.
        if (!overrideConsumed) {
          administrativeAttemptOverrides.add(decision.stageId);
        } else {
          appendOnce('stage.blocked', decision.stageId, {
            ...auditPayload,
            attemptsUsed: targetState.attemptsUsed,
            remediationCyclesUsed: targetState.remediationCyclesUsed,
            reason: 'administrative_attempt_interrupted',
          });
        }
      }
    } else if (
      decision.continuation === 'remediation'
      && !hasDecisionEvent('stage.waiting', decision.stageId)
    ) {
      const remediationCyclesUsed = targetState.remediationCyclesUsed + 1;
      const remediationStageId = decision.remediationStageId!;
      const remediation = initialStates.get(remediationStageId);
      if (!remediation) throw new Error(`GRAPH_STAGE_MISSING:${remediationStageId}`);
      initialStates.set(decision.stageId, {
        ...targetState,
        status: 'waiting',
        remediationCyclesUsed,
        remediationTarget: remediationStageId,
      });
      initialStates.set(remediationStageId, {
        ...remediation,
        status: 'pending',
        remediationReturnTo: decision.stageId,
      });
      appendOnce('stage.waiting', decision.stageId, {
        ...auditPayload,
        attemptsUsed: targetState.attemptsUsed,
        remediationCyclesUsed,
        remediationStageId,
      });
      appendOnce('stage.scheduled', remediationStageId, {
        reason: 'administrative_remediation',
        remediationReturnTo: decision.stageId,
      });
    }

    const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
    await adapters.start();
    const flushObservers = serializedObserverDrainer(platform, runRoot, runtime, adapters, events);
    try {
      const runner = new PipelineRunner({
        definition,
        registry: runtime.granted,
        activated: runtime.activated,
        adapters,
        journal: events,
        orchestratorIssuerId: platform.orchestratorIssuerId,
        initialStates,
        resume: true,
        signal: leaseSignal,
        resumeEventAlreadyRecorded: true,
        resumeCausationId: decision.decisionId,
        resumePayload: auditPayload,
        administrativeAttemptOverrides,
        onEventsCommitted: flushObservers,
      });
      return await runner.run(runId);
    } finally {
      try {
        await flushObservers();
      } finally {
        await adapters.shutdown();
      }
    }
  });
}
