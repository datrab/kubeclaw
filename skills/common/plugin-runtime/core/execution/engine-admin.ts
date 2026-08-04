import crypto from 'node:crypto';
import path from 'node:path';
import type { AdministrativeReopenDecision, LifecycleEvent, PipelineDefinition, PluginDomainEvent } from '../../sdk/src/index.ts';
import type { PlatformConfig } from '../config/platform.ts';
import { recoverStageStates } from '../lifecycle/recovery.ts';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import { FrozenMap } from '../registry/frozen-map.ts';
import { validateContractValue } from '../registry/schema.ts';
import { FileJournal } from '../state/journal.ts';
import type { AdministrativeDecisionAuthenticator } from './engine.ts';
import { createAdapterRuntime, drainObservers, prepareRuntime, type PreparedRuntime } from './engine-runtime.ts';
import { executePrepared } from './engine-run.ts';
import { canonicalJson, deepFreeze, verifyPinnedGraph, verifyPinnedPackages } from './engine-snapshots.ts';
import type { ExecutionGraphSnapshot } from './graph.ts';
import type { PipelineRunResult } from './runner.ts';
import { withRunMutationLock } from './run-mutation.ts';

interface Context { readonly platform: PlatformConfig; readonly definition: PipelineDefinition; readonly decision: AdministrativeReopenDecision;
  readonly runtime: PreparedRuntime; readonly runId: string; readonly runRoot: string; readonly lease: AbortSignal;
  readonly events: FileJournal<LifecycleEvent | PluginDomainEvent>; readonly recovered: ReadonlyMap<string, StageRuntimeState>;
  readonly graph: ExecutionGraphSnapshot; readonly recorded: boolean; readonly target: StageRuntimeState }

export async function reopenPipeline(platform: PlatformConfig, definitionInput: PipelineDefinition, decisionInput: AdministrativeReopenDecision, authenticate: AdministrativeDecisionAuthenticator): Promise<PipelineRunResult> {
  const definition = deepFreeze(structuredClone(definitionInput)); const decision = deepFreeze(structuredClone(decisionInput));
  validateContractValue('administrativeReopenDecision', decision); const runtime = await prepareRuntime(platform, definition);
  const runRoot = path.join(platform.storageRoot, 'runs', decision.runId.replaceAll(':', '_'));
  return withRunMutationLock(runRoot, async (lease) => new AdministrativeReopener(platform, definition, decision, runtime, runRoot, lease, authenticate).run());
}

class AdministrativeReopener {
  readonly #platform: PlatformConfig; readonly #definition: PipelineDefinition; readonly #decision: AdministrativeReopenDecision;
  readonly #runtime: PreparedRuntime; readonly #runRoot: string; readonly #lease: AbortSignal; readonly #authenticate: AdministrativeDecisionAuthenticator;
  constructor(platform: PlatformConfig, definition: PipelineDefinition, decision: AdministrativeReopenDecision, runtime: PreparedRuntime, runRoot: string, lease: AbortSignal, authenticate: AdministrativeDecisionAuthenticator) {
    this.#platform = platform; this.#definition = definition; this.#decision = decision; this.#runtime = runtime; this.#runRoot = runRoot; this.#lease = lease; this.#authenticate = authenticate;
  }

  async run(): Promise<PipelineRunResult> {
    verifyPinnedPackages(this.#runRoot, this.#runtime); const graph = verifyPinnedGraph(this.#runRoot, this.#definition);
    const events = new FileJournal<LifecycleEvent | PluginDomainEvent>(path.join(this.#runRoot, 'events.jsonl'));
    const recovered = recoverStageStates(this.#definition, events.records(), this.#decision.runId, this.#platform.orchestratorIssuerId);
    const decisions = new FileJournal<AdministrativeReopenDecision>(path.join(this.#runRoot, 'administrative-decisions.jsonl'));
    const recorded = this.#recorded(decisions); await this.#authorize(recorded); const target = this.#validate(recovered, events, recorded);
    if (!recorded) { this.#lease.throwIfAborted(); decisions.append(Object.freeze(structuredClone(this.#decision))); }
    const context: Context = { platform: this.#platform, definition: this.#definition, decision: this.#decision, runtime: this.#runtime,
      runId: this.#decision.runId, runRoot: this.#runRoot, lease: this.#lease, events, recovered, graph, recorded, target };
    this.#appendOnce(context, 'run.resumed', undefined, this.#audit());
    return this.#continue(context);
  }

  #recorded(decisions: FileJournal<AdministrativeReopenDecision>): boolean {
    const prior = decisions.records().find(({ entry }) => entry.decisionId === this.#decision.decisionId || entry.idempotencyKey === this.#decision.idempotencyKey)?.entry;
    if (prior && canonicalJson(prior) !== canonicalJson(this.#decision)) throw new Error(`ADMIN_REOPEN_IDEMPOTENCY_CONFLICT:${this.#decision.idempotencyKey}`);
    return Boolean(prior);
  }

  async #authorize(recorded: boolean): Promise<void> {
    if (recorded) return; const principal = await this.#authenticate(this.#decision);
    if (principal.type !== this.#decision.actor.type || principal.id !== this.#decision.actor.id) throw new Error(`ADMIN_REOPEN_ACTOR_MISMATCH:${this.#decision.actor.type}:${this.#decision.actor.id}`);
    if (!this.#platform.administrativeDecisionIssuers.some((issuer) => issuer.type === principal.type && issuer.id === principal.id)) throw new Error(`ADMIN_REOPEN_ISSUER_DENIED:${principal.type}:${principal.id}`);
  }

  #validate(recovered: ReadonlyMap<string, StageRuntimeState>, events: FileJournal<LifecycleEvent | PluginDomainEvent>, recorded: boolean): StageRuntimeState {
    const stage = this.#definition.stages.find(({ id }) => id === this.#decision.stageId); if (!stage) throw new Error(`GRAPH_STAGE_MISSING:${this.#decision.stageId}`);
    if (this.#decision.continuation === 'remediation' && stage.on?.request_fix !== this.#decision.remediationStageId) throw new Error(`ADMIN_REMEDIATION_UNDECLARED:${this.#decision.stageId}:${this.#decision.remediationStageId}`);
    const target = recovered.get(this.#decision.stageId); if (!target || (!recorded && target.status !== 'blocked')) throw new Error(`ADMIN_REOPEN_STAGE_NOT_BLOCKED:${this.#decision.stageId}`);
    const terminal = [...events.records()].reverse().find(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.identity.runId === this.#decision.runId
      && ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(entry.type));
    if (!recorded && terminal && terminal.entry.type !== 'run.blocked') throw new Error(`ADMIN_REOPEN_RUN_NOT_BLOCKED:${this.#decision.runId}`);
    if (this.#decision.continuation === 'remediation' && !recorded) this.#validateRemediation(recovered, target, stage.execution.maxRemediationCycles, this.#decision.remediationStageId);
    return target;
  }

  #validateRemediation(recovered: ReadonlyMap<string, StageRuntimeState>, target: StageRuntimeState, max: number, remediationStageId: string): void {
    if (target.remediationCyclesUsed + 1 > max) throw new Error(`ADMIN_REMEDIATION_BUDGET_EXHAUSTED:${this.#decision.stageId}`);
    const remediation = recovered.get(remediationStageId);
    if (remediation && ['blocked', 'failed', 'cancelled'].includes(remediation.status)) throw new Error(`ADMIN_REMEDIATION_TARGET_TERMINAL:${remediationStageId}:${remediation.status}`);
  }

  async #continue(context: Context): Promise<PipelineRunResult> {
    const completed = this.#completedStatus(context); if (context.recorded && completed) return this.#replay(context, completed);
    if (context.recorded && context.target.status === 'waiting' && context.target.wait) return this.#replay(context, 'waiting');
    if (context.decision.continuation === 'cancel') return this.#cancel(context);
    const initialStates = new Map(context.recovered); const overrides = new Set<string>();
    if (context.decision.continuation === 'retry') this.#retry(context, initialStates, overrides);
    else this.#remediate(context, initialStates);
    return executePrepared({ ...context, leaseSignal: context.lease }, { initialStates, resume: true, resumeEventAlreadyRecorded: true,
      resumeCausationId: context.decision.decisionId, resumePayload: this.#audit(), administrativeAttemptOverrides: overrides });
  }

  #completedStatus(context: Context): PipelineRunResult['status'] | undefined {
    return ([['run.succeeded', 'succeeded'], ['run.failed', 'failed'], ['run.blocked', 'blocked'], ['run.cancelled', 'cancelled']] as const)
      .find(([type]) => this.#hasEvent(context, type))?.[1];
  }

  async #replay(context: Context, status: PipelineRunResult['status'], states: ReadonlyMap<string, StageRuntimeState> = context.recovered): Promise<PipelineRunResult> {
    const adapters = createAdapterRuntime(context.platform, context.runRoot, context.runtime, context.events); await adapters.start();
    try { await drainObservers(context.platform, context.runRoot, context.runtime, adapters, context.events); } finally { await adapters.shutdown(); }
    return this.#result(context, status, states);
  }

  async #cancel(context: Context): Promise<PipelineRunResult> {
    this.#appendOnce(context, 'stage.cancelled', context.decision.stageId, { ...this.#audit(), attemptsUsed: context.target.attemptsUsed, remediationCyclesUsed: context.target.remediationCyclesUsed });
    this.#appendOnce(context, 'run.cancelled', undefined, this.#audit()); const states = new Map(context.recovered);
    states.set(context.decision.stageId, { ...context.target, status: 'cancelled' }); return this.#replay(context, 'cancelled', states);
  }

  #retry(context: Context, states: Map<string, StageRuntimeState>, overrides: Set<string>): void {
    const terminal = ['stage.skipped', 'stage.succeeded', 'stage.failed', 'stage.blocked', 'stage.cancelled'].some((type) => this.#hasEvent(context, type as LifecycleEvent['type'], context.decision.stageId));
    if (terminal || !['blocked', 'pending', 'running'].includes(context.target.status)) return;
    const { wait: _wait, remediationTarget: _target, remediationReturnTo: _return, ...withoutPause } = context.target;
    const consumed = this.#hasEvent(context, 'attempt.created', context.decision.stageId); states.set(context.decision.stageId, { ...withoutPause, status: consumed ? 'blocked' : 'pending' });
    if (!consumed) overrides.add(context.decision.stageId); else this.#appendOnce(context, 'stage.blocked', context.decision.stageId, {
      ...this.#audit(), attemptsUsed: context.target.attemptsUsed, remediationCyclesUsed: context.target.remediationCyclesUsed, reason: 'administrative_attempt_interrupted' });
  }

  #remediate(context: Context, states: Map<string, StageRuntimeState>): void {
    if (context.decision.continuation !== 'remediation' || this.#hasEvent(context, 'stage.waiting', context.decision.stageId)) return;
    const id = context.decision.remediationStageId!; const remediation = states.get(id); if (!remediation) throw new Error(`GRAPH_STAGE_MISSING:${id}`);
    const cycles = context.target.remediationCyclesUsed + 1; states.set(context.decision.stageId, { ...context.target, status: 'waiting', remediationCyclesUsed: cycles, remediationTarget: id });
    states.set(id, { ...remediation, status: 'pending', remediationReturnTo: context.decision.stageId });
    this.#appendOnce(context, 'stage.waiting', context.decision.stageId, { ...this.#audit(), attemptsUsed: context.target.attemptsUsed, remediationCyclesUsed: cycles, remediationStageId: id });
    this.#appendOnce(context, 'stage.scheduled', id, { reason: 'administrative_remediation', remediationReturnTo: context.decision.stageId });
  }

  #hasEvent(context: Context, type: LifecycleEvent['type'], stageId?: string): boolean {
    return context.events.records().some(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.causationId === context.decision.decisionId
      && entry.type === type && (stageId === undefined || entry.identity.stageId === stageId));
  }
  #appendOnce(context: Context, type: LifecycleEvent['type'], stageId: string | undefined, payload: Readonly<Record<string, unknown>> = {}): void {
    context.lease.throwIfAborted(); if (this.#hasEvent(context, type, stageId)) return;
    context.events.append({ schemaVersion: 'lifecycle-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence: context.events.records().length + 1,
      type, identity: { runId: context.runId, ...(stageId ? { stageId } : {}) }, occurredAt: new Date().toISOString(), causationId: context.decision.decisionId, payload });
  }
  #audit(): Readonly<Record<string, unknown>> { return { administrativeDecision: this.#decision }; }
  #result(context: Context, status: PipelineRunResult['status'], states: ReadonlyMap<string, StageRuntimeState>): PipelineRunResult {
    return Object.freeze({ runId: context.runId, identity: Object.freeze({ runId: context.runId, pipelineId: context.graph.pipelineId, graphDigest: context.graph.digest }), status,
      stages: new FrozenMap([...states].map(([id, state]) => [id, deepFreeze(structuredClone(state))])) });
  }
}
