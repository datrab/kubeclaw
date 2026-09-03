import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AdministrativeReopenDecision, LifecycleEvent, PipelineDefinition, PluginDomainEvent, ResumeSignal } from '@kubeclaw/plugin-sdk';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { recoverStageStates } from '../lifecycle/recovery.ts';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import { FileJournal } from '../state/journal.ts';
import type { PipelineRunResult, PipelineRunnerOptions } from './runner.ts';
import { PipelineRunner } from './runner.ts';
import { createAdapterRuntime, prepareRuntime, serializedObserverDrainer, type PreparedRuntime } from './engine-runtime.ts';
import { canonicalJson, deepFreeze, frozenRegistryRecord, graphSnapshot, recordedPackageUpgrades, validateSignal, verifyPinnedGraph, verifyPinnedPackages, writeRunSnapshots } from './engine-snapshots.ts';
import { withRunMutationLock } from './run-mutation.ts';
import { reconcileNovaObservabilityOnRecovery } from '../observability/reconciler.ts';

export interface ExecutionContext { readonly platform: PlatformConfig; readonly definition: PipelineDefinition; readonly runtime: PreparedRuntime; readonly runId: string; readonly runRoot: string; readonly leaseSignal: AbortSignal; readonly events: FileJournal<LifecycleEvent | PluginDomainEvent> }

export async function executePrepared(context: ExecutionContext, options: Omit<PipelineRunnerOptions, 'definition' | 'registry' | 'activated' | 'adapters' | 'journal' | 'orchestratorIssuerId' | 'signal' | 'onEventsCommitted'>): Promise<PipelineRunResult> {
  const adapters = createAdapterRuntime(context.platform, context.runRoot, context.runtime, context.events); await adapters.start();
  const flush = serializedObserverDrainer(context.platform, context.runRoot, context.runtime, adapters, context.events);
  try { return await new PipelineRunner({ definition: context.definition, registry: context.runtime.granted, activated: context.runtime.activated,
    adapters, journal: context.events, orchestratorIssuerId: context.platform.orchestratorIssuerId, signal: context.leaseSignal,
    onEventsCommitted: flush, ...options }).run(context.runId); }
  finally { try { await flush(); } finally { await adapters.shutdown(); } }
}

export async function runNewPipeline(platform: PlatformConfig, definitionInput: PipelineDefinition, runId?: string, signal?: AbortSignal): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput)); const runtime = await prepareRuntime(platform, definition);
  const effectiveRunId = runId ?? `run:${crypto.randomUUID()}`; const runRoot = path.join(platform.storageRoot, 'runs', effectiveRunId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
    fs.mkdirSync(runRoot, { recursive: true }); const graph = graphSnapshot(definition); writeRunSnapshots(runRoot, graph, frozenRegistryRecord(runtime, definition, graph));
    const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl'));
    return executePrepared({ platform, definition, runtime, runId: effectiveRunId, runRoot, leaseSignal: signal ? AbortSignal.any([signal, leaseSignal]) : leaseSignal, events }, {});
  });
}

function assertRecoverableRun(events: FileJournal<LifecycleEvent | PluginDomainEvent>, runId: string, prefix: 'RECOVERY' | 'WAIT'): void {
  const boundary = [...events.records()].reverse().find(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.identity.runId === runId
    && ['run.resumed', 'run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(entry.type));
  if (boundary && boundary.entry.type !== 'run.resumed') throw new Error(`${prefix}_RUN_TERMINAL:${runId}:${boundary.entry.type}`);
}

function recoveryStates(definition: PipelineDefinition, events: FileJournal<LifecycleEvent | PluginDomainEvent>, runId: string, issuer: string): Map<string, StageRuntimeState> {
  return new Map(recoverStageStates(definition, events.records(), runId, issuer));
}

export async function recoverPipeline(platform: PlatformConfig, definitionInput: PipelineDefinition, runId: string): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput)); const runtime = await prepareRuntime(platform, definition);
  const runRoot = path.join(platform.storageRoot, 'runs', runId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
    const decisions = new FileJournal<AdministrativeReopenDecision>(path.join(runRoot, 'administrative-decisions.jsonl'));
    verifyPinnedPackages(runRoot, runtime, recordedPackageUpgrades(decisions.records().map(({ entry }) => entry))); verifyPinnedGraph(runRoot, definition);
    const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl')); assertRecoverableRun(events, runId, 'RECOVERY');
    // Phase 7 persists this run's test-attempt reconciliation plan before
    // dispatch. The recovery hook is active now; it is a no-op for legacy runs.
    await reconcileNovaObservabilityOnRecovery(runRoot, runId);
    const initialStates = dueRecoveryStates(recoveryStates(definition, events, runId, platform.orchestratorIssuerId));
    const wait = [...initialStates.values()].find((state) => state.wait)?.wait; if (wait) throw new Error(`RECOVERY_SIGNAL_REQUIRED:${wait.waitId}`);
    return executePrepared({ platform, definition, runtime, runId, runRoot, leaseSignal, events }, { initialStates, resume: true, resumePayload: { recovery: 'journal' } });
  });
}

function dueRecoveryStates(recovered: ReadonlyMap<string, StageRuntimeState>): Map<string, StageRuntimeState> {
  const states = new Map<string, StageRuntimeState>();
  for (const [stageId, state] of recovered) {
    if (!state.retryAt) { states.set(stageId, state); continue; }
    if (Date.now() < Date.parse(state.retryAt)) throw new Error(`RECOVERY_COOLDOWN_NOT_DUE:${stageId}:${state.retryAt}`);
    const { retryAt: _retryAt, ...withoutCooldown } = state; states.set(stageId, { ...withoutCooldown, status: 'pending' });
  }
  return states;
}

export async function resumePipeline(platform: PlatformConfig, definitionInput: PipelineDefinition, runId: string, signal: ResumeSignal): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput)); const runtime = await prepareRuntime(platform, definition);
  const runRoot = path.join(platform.storageRoot, 'runs', runId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (leaseSignal) => {
    const decisions = new FileJournal<AdministrativeReopenDecision>(path.join(runRoot, 'administrative-decisions.jsonl'));
    verifyPinnedPackages(runRoot, runtime, recordedPackageUpgrades(decisions.records().map(({ entry }) => entry))); verifyPinnedGraph(runRoot, definition);
    const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(runRoot, 'events.jsonl')); assertRecoverableRun(events, runId, 'WAIT');
    const recovered = recoveryStates(definition, events, runId, platform.orchestratorIssuerId); const waiting = recoveredWait(recovered, signal.waitId);
    const created = validateWaitHistory(events, runId, signal.waitId); validateSignal(waiting.wait!, signal, created.entry.occurredAt); leaseSignal.throwIfAborted();
    recordSignal(runRoot, signal); recordWaitResolution(events, runId, waiting, signal, leaseSignal);
    const initialStates = resumeStates(recovered, waiting.stageId);
    return executePrepared({ platform, definition, runtime, runId, runRoot, leaseSignal, events }, { initialStates,
      resumeGuidance: new Map([[waiting.stageId, signal.payload]]), resume: true });
  });
}

function recoveredWait(states: ReadonlyMap<string, StageRuntimeState>, waitId: string): StageRuntimeState {
  const waiting = [...states.values()].find((state) => state.wait?.waitId === waitId); if (!waiting?.wait) throw new Error(`WAIT_UNKNOWN_OR_STALE:${waitId}`); return waiting;
}
function validateWaitHistory(events: FileJournal<LifecycleEvent | PluginDomainEvent>, runId: string, waitId: string) {
  const terminal = [...events.records()].reverse().find(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.identity.runId === runId
    && ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(entry.type));
  const created = [...events.records()].reverse().find(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.identity.runId === runId
    && (entry.payload.wait as { waitId?: unknown } | undefined)?.waitId === waitId);
  if (terminal && (!created || created.sequence <= terminal.sequence)) throw new Error(`WAIT_INVALIDATED_BY_TERMINAL_RUN:${waitId}`);
  if (!created) throw new Error(`WAIT_CREATION_RECORD_MISSING:${waitId}`); return created;
}
function recordSignal(runRoot: string, signal: ResumeSignal): void {
  new FileJournal<ResumeSignal>(path.join(runRoot, 'signals.jsonl')).transact((records, append) => {
    const duplicate = records.find(({ entry }) => entry.idempotencyKey === signal.idempotencyKey)?.entry;
    if (duplicate) { if (canonicalJson(duplicate) !== canonicalJson(signal)) throw new Error(`WAIT_SIGNAL_CONFLICT:${signal.idempotencyKey}`); return; }
    if (records.some(({ entry }) => entry.waitId === signal.waitId)) throw new Error(`WAIT_ALREADY_RESOLVED:${signal.waitId}`); append(signal);
  });
}
function recordWaitResolution(events: FileJournal<LifecycleEvent | PluginDomainEvent>, runId: string, waiting: StageRuntimeState, signal: ResumeSignal, lease: AbortSignal): void {
  const exists = events.records().some(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.type === 'wait.resolved'
    && entry.identity.runId === runId && entry.identity.waitId === signal.waitId && entry.causationId === signal.signalId);
  if (exists) return; lease.throwIfAborted(); events.appendSequenced((sequence) => ({ schemaVersion: 'lifecycle-event.v2', eventId: `event:${crypto.randomUUID()}`,
    sequence, type: 'wait.resolved', identity: { runId, stageId: waiting.stageId, waitId: signal.waitId },
    occurredAt: new Date().toISOString(), causationId: signal.signalId, payload: { signal } }));
}
function resumeStates(recovered: ReadonlyMap<string, StageRuntimeState>, resumedStageId: string): Map<string, StageRuntimeState> {
  const states = new Map(recovered); const state = states.get(resumedStageId)!; const { wait: _wait, ...withoutWait } = state;
  states.set(resumedStageId, { ...withoutWait, status: 'pending' }); return states;
}
