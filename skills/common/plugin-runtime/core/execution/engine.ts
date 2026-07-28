import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
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
import type { PlatformConfig } from '../config/platform.ts';
import { FileEffectJournal } from '../effects/journal.ts';
import { EffectCoordinator } from '../effects/coordinator.ts';
import { FileJournal } from '../state/journal.ts';
import { ObserverRuntime } from '../telemetry/observers.ts';
import { recoverStageStates } from '../lifecycle/recovery.ts';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import { AdapterRuntime } from './adapters.ts';
import { PipelineRunner, type PipelineRunResult } from './runner.ts';

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
  return {
    snapshot,
    granted,
    activated: await activateRegistry(snapshot, new Set(granted.grants.keys())),
  };
}

function createAdapterRuntime(
  platform: PlatformConfig,
  runRoot: string,
  runtime: PreparedRuntime,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>,
): AdapterRuntime {
  const appendEffectEvent = (
    type: 'effect.requested' | 'effect.accepted' | 'effect.completed' | 'effect.failed',
    request: EffectRequest,
    payload: Readonly<Record<string, unknown>>,
  ): void => {
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
    configs: objectMap(platform.observers),
  });
  await observers.drain();
}

function verifyPinnedPackages(runRoot: string, runtime: PreparedRuntime): void {
  const file = path.join(runRoot, 'registry-snapshot.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    packages: Array<readonly [string, { package: { contentDigest: string } }]>;
  };
  for (const [pluginId, provenance] of stored.packages) {
    const current = runtime.snapshot.packages.get(pluginId);
    if (!current) throw new Error(`RECOVERY_PINNED_PACKAGE_MISSING:${pluginId}`);
    if (current.provenance.package.contentDigest !== provenance.package.contentDigest) {
      throw new Error(`RECOVERY_PINNED_PACKAGE_DIGEST_MISMATCH:${pluginId}`);
    }
  }
}

function resolvedPackageProvenance(runtime: PreparedRuntime): readonly (readonly [string, unknown])[] {
  const packageIds = new Set<string>();
  for (const registrationId of runtime.granted.grants.keys()) {
    const stage = [...runtime.snapshot.stages.values()].find(
      (entry) => `${entry.package.manifest.id}:${entry.registration.id}` === registrationId,
    );
    const observer = runtime.snapshot.observers.get(registrationId);
    const adapter = runtime.snapshot.adapters.get(registrationId);
    const owner = stage ?? observer ?? adapter;
    if (owner) packageIds.add(owner.package.manifest.id);
  }
  return Object.freeze([...packageIds].sort().map((pluginId) => {
    const pkg = runtime.snapshot.packages.get(pluginId);
    if (!pkg) throw new Error(`REGISTRY_PACKAGE_MISSING:${pluginId}`);
    return [pluginId, pkg.provenance] as const;
  }));
}

function validateSignal(wait: NonNullable<StageRuntimeState['wait']>, signal: ResumeSignal): void {
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
}

export async function runPipelineV2(
  platform: PlatformConfig,
  definition: PipelineDefinition,
  runId?: string,
): Promise<PipelineRunResult> {
  const runtime = await prepareRuntime(platform, definition);
  const effectiveRunId = runId ?? `run:${crypto.randomUUID()}`;
  const runRoot = path.join(platform.storageRoot, 'runs', effectiveRunId.replaceAll(':', '_'));
  fs.mkdirSync(runRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runRoot, 'registry-snapshot.json'),
    `${JSON.stringify({
      apiVersion: runtime.snapshot.apiVersion,
      packages: resolvedPackageProvenance(runtime),
      stages: definition.stages.map((stage) => {
        const owner = runtime.snapshot.stages.get(stage.type)!;
        return {
          stageId: stage.id,
          stageType: stage.type,
          owner: owner.provenance,
        };
      }),
    }, null, 2)}\n`,
    { flag: 'wx' },
  );
  const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
  const adapters = createAdapterRuntime(platform, runRoot, runtime, events);
  await adapters.start();
  try {
    const runner = new PipelineRunner({
      definition,
      registry: runtime.granted,
      activated: runtime.activated,
      adapters,
      journal: events,
      orchestratorIssuerId: platform.orchestratorIssuerId,
    });
    const result = await runner.run(effectiveRunId);
    await drainObservers(platform, runRoot, runtime, adapters, events);
    return result;
  } finally {
    await adapters.shutdown();
  }
}

export async function resumePipelineV2(
  platform: PlatformConfig,
  definition: PipelineDefinition,
  runId: string,
  signal: ResumeSignal,
): Promise<PipelineRunResult> {
  const runtime = await prepareRuntime(platform, definition);
  const runRoot = path.join(platform.storageRoot, 'runs', runId.replaceAll(':', '_'));
  verifyPinnedPackages(runRoot, runtime);
  const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
  const recovered = recoverStageStates(definition, events.records(), runId);
  const waiting = [...recovered.values()].find((state) => state.wait?.waitId === signal.waitId);
  if (!waiting?.wait) throw new Error(`WAIT_UNKNOWN_OR_STALE:${signal.waitId}`);
  validateSignal(waiting.wait, signal);
  const signals = new FileJournal<ResumeSignal>(path.join(runRoot, 'signals.jsonl'));
  if (signals.records().some((record) => record.entry.idempotencyKey === signal.idempotencyKey)) {
    throw new Error(`WAIT_SIGNAL_DUPLICATE:${signal.idempotencyKey}`);
  }
  if (signals.records().some((record) => record.entry.waitId === signal.waitId)) {
    throw new Error(`WAIT_ALREADY_RESOLVED:${signal.waitId}`);
  }
  signals.append(signal);
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
    });
    const result = await runner.run(runId);
    await drainObservers(platform, runRoot, runtime, adapters, events);
    return result;
  } finally {
    await adapters.shutdown();
  }
}
