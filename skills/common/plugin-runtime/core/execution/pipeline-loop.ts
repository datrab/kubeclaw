import type { LifecycleEvent, StageDefinition, StageResult } from '../../sdk/src/index.ts';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import type { ExecutionGraph } from './graph.ts';
import type { PipelineRunIdentity, PipelineRunResult, PipelineRunnerOptions } from './runner.ts';
import { DecisionRecorder, type CompletedStageDecision } from './run-decisions.ts';
import type { AppendLifecycleEvent, StageExecutor } from './stage-executor.ts';

interface LoopServices {
  readonly options: PipelineRunnerOptions; readonly graph: ExecutionGraph; readonly maxConcurrency: number;
  readonly overrides: Set<string>; readonly append: AppendLifecycleEvent; readonly flush: () => Promise<void>;
  readonly executor: StageExecutor; readonly result: (identity: PipelineRunIdentity, status: PipelineRunResult['status'], states: ReadonlyMap<string, StageRuntimeState>) => PipelineRunResult;
}

export class PipelineLoop {
  readonly #services: LoopServices; readonly #states: Map<string, StageRuntimeState>; readonly #forced: string[] = []; readonly #forcedIds = new Set<string>();
  constructor(services: LoopServices) { this.#services = services; this.#states = this.#initialStates(); }

  async run(identity: PipelineRunIdentity): Promise<PipelineRunResult> {
    this.#recordRunStart(identity); await this.#services.flush(); this.#restoreRemediation();
    for (;;) {
      const cancelled = await this.#cancelled(identity); if (cancelled) return cancelled;
      const selection = await this.#selectReady(identity.runId); if (selection === 'continue') continue;
      if (selection.length === 0) break;
      const decisions = await Promise.all(selection.slice(0, this.#services.maxConcurrency).map((stage) => this.#execute(identity.runId, stage)));
      const recorder = new DecisionRecorder(this.#states, this.#services.append, this.#services.options.orchestratorIssuerId, (id) => this.#force(id));
      decisions.forEach((decision) => recorder.record(identity.runId, decision)); await this.#services.flush();
      const outcome = recorder.outcome();
      if (outcome.terminal) return this.#terminal(identity, outcome.terminal);
      if (outcome.paused) return this.#services.result(identity, 'waiting', this.#states);
    }
    return this.#finalize(identity);
  }

  #initialStates(): Map<string, StageRuntimeState> {
    return new Map(this.#services.options.initialStates ?? this.#services.graph.stages().map((stage) => [stage.id, {
      stageId: stage.id, status: 'pending' as const, attemptNumber: 0, attemptsUsed: 0, remediationCyclesUsed: 0,
    }] as const));
  }

  #recordRunStart(identity: PipelineRunIdentity): void {
    const options = this.#services.options;
    if (options.resume) {
      if (!options.resumeEventAlreadyRecorded) this.#services.append('run.resumed', { runId: identity.runId }, { runIdentity: identity, ...(options.resumePayload ?? {}) });
      return;
    }
    this.#services.append('run.created', { runId: identity.runId }, { runIdentity: identity }); this.#services.append('run.started', { runId: identity.runId });
  }

  #restoreRemediation(): void {
    for (const [stageId, state] of this.#states) {
      if (state.status !== 'waiting' || !state.remediationTarget) continue;
      const target = this.#states.get(state.remediationTarget);
      if (!target) throw new Error(`GRAPH_REMEDIATION_MISSING:${stageId}:${state.remediationTarget}`);
      if (!target.remediationReturnTo) this.#states.set(state.remediationTarget, { ...target, status: 'pending', remediationReturnTo: stageId });
    }
    for (const [stageId, state] of this.#states) this.#restoreReturn(stageId, state);
  }

  #restoreReturn(stageId: string, state: StageRuntimeState): void {
    if (!state.remediationReturnTo) return;
    if (state.status === 'pending') { this.#force(stageId); return; }
    if (state.status !== 'succeeded') return;
    const requester = this.#states.get(state.remediationReturnTo); if (!requester) return;
    const { remediationTarget: _target, ...requesterWithoutTarget } = requester;
    const { remediationReturnTo, ...stageWithoutReturn } = state;
    this.#states.set(remediationReturnTo, { ...requesterWithoutTarget, status: 'pending' }); this.#states.set(stageId, stageWithoutReturn); this.#force(remediationReturnTo);
  }

  async #cancelled(identity: PipelineRunIdentity): Promise<PipelineRunResult | undefined> {
    if (!this.#services.options.signal?.aborted) return undefined;
    for (const [stageId, state] of this.#states) {
      if (['skipped', 'succeeded', 'failed', 'blocked', 'cancelled'].includes(state.status)) continue;
      this.#states.set(stageId, { ...state, status: 'cancelled' });
      this.#services.append('stage.cancelled', { runId: identity.runId, stageId }, { attemptsUsed: state.attemptsUsed, remediationCyclesUsed: state.remediationCyclesUsed });
    }
    this.#services.append('run.cancelled', { runId: identity.runId }); await this.#services.flush();
    return this.#services.result(identity, 'cancelled', this.#states);
  }

  async #selectReady(runId: string): Promise<readonly StageDefinition[] | 'continue'> {
    const completed = new Set([...this.#states].filter(([, state]) => state.status === 'succeeded' || state.status === 'skipped').map(([id]) => id));
    const active = new Set([...this.#states].filter(([, state]) => !['pending', 'skipped', 'succeeded'].includes(state.status)).map(([id]) => id));
    let ready = this.#forcedReady(completed, active);
    const skipped = ready.filter((stage) => this.#shouldSkip(stage));
    skipped.forEach((stage) => this.#skip(runId, stage));
    if (skipped.length === 0) return ready;
    const skippedIds = new Set(skipped.map(({ id }) => id)); ready = ready.filter(({ id }) => !skippedIds.has(id)); await this.#services.flush();
    return ready.length === 0 ? 'continue' : ready;
  }

  #forcedReady(completed: ReadonlySet<string>, active: ReadonlySet<string>): readonly StageDefinition[] {
    const forced = this.#nextForced(); if (!forced) return this.#services.graph.ready(completed, active);
    const definition = this.#services.graph.stage(forced); const returnTo = this.#states.get(forced)?.remediationReturnTo;
    const dependenciesReady = definition.dependsOn.every((dependency) => dependency === returnTo || completed.has(dependency));
    if (!returnTo || dependenciesReady) return [definition];
    this.#force(forced); return this.#services.graph.ready(completed, active);
  }

  #shouldSkip(definition: StageDefinition): boolean {
    const activation = this.#services.graph.activation(definition.id); if (!activation) return false;
    const source = this.#states.get(activation.sourceStage); return !source?.facts || !Object.is(source.facts[activation.fact], activation.equals);
  }

  #skip(runId: string, definition: StageDefinition): void {
    const current = this.#states.get(definition.id)!; const activation = this.#services.graph.activation(definition.id)!;
    const observed = this.#states.get(activation.sourceStage)?.facts?.[activation.fact]; this.#states.set(definition.id, { ...current, status: 'skipped' });
    this.#services.append('stage.skipped', { runId, stageId: definition.id }, { stageType: definition.type, reason: { code: 'core.activation_condition_not_met', details: {
      sourceStage: activation.sourceStage, fact: activation.fact, equals: activation.equals, factPresent: observed !== undefined, ...(observed !== undefined ? { observed } : {}),
    } }, attemptsUsed: current.attemptsUsed, remediationCyclesUsed: current.remediationCyclesUsed });
  }

  async #execute(runId: string, definition: StageDefinition): Promise<CompletedStageDecision> {
    const current = this.#states.get(definition.id)!; const override = this.#services.overrides.delete(definition.id);
    if (current.attemptsUsed >= definition.execution.maxAttempts && !override) return { definition, administrativeOverride: false, decision: {
      state: { ...current, status: 'blocked' }, action: { type: 'stop' }, result: { schemaVersion: 'stage-result.v2', outcome: 'blocked',
        reason: { code: 'core.attempt_budget_exhausted', message: `Attempt budget exhausted for ${definition.id}` }, artifacts: [] },
    } };
    this.#states.set(definition.id, { ...current, status: 'running' });
    this.#services.append('stage.started', { runId, stageId: definition.id }, { stageType: definition.type,
      ...(typeof definition.config.agentRole === 'string' ? { agentRole: definition.config.agentRole } : {}), ...(override ? { administrativeOverride: true } : {}) });
    await this.#services.flush();
    const decision = await this.#services.executor.execute(runId, current, this.#services.options.resumeGuidance?.get(definition.id));
    return { definition, decision, administrativeOverride: override };
  }

  async #terminal(identity: PipelineRunIdentity, status: 'failed' | 'blocked' | 'cancelled'): Promise<PipelineRunResult> {
    this.#services.append(`run.${status}` as LifecycleEvent['type'], { runId: identity.runId }); await this.#services.flush();
    return this.#services.result(identity, status, this.#states);
  }

  async #finalize(identity: PipelineRunIdentity): Promise<PipelineRunResult> {
    const statuses = [...this.#states.values()].map(({ status }) => status);
    const complete = [...this.#states].every(([id, state]) => state.status === 'succeeded' || state.status === 'skipped'
      || (state.status === 'pending' && this.#services.graph.isRemediationOnlyTarget(id) && !state.remediationReturnTo));
    const status: PipelineRunResult['status'] = complete ? 'succeeded' : ['failed', 'blocked', 'cancelled', 'waiting'].find((candidate) => statuses.includes(candidate as StageRuntimeState['status'])) as PipelineRunResult['status'] ?? 'failed';
    if (status !== 'waiting') this.#services.append(`run.${status}` as LifecycleEvent['type'], { runId: identity.runId });
    await this.#services.flush(); return this.#services.result(identity, status, this.#states);
  }

  #force(stageId: string): void { if (!this.#forcedIds.has(stageId)) { this.#forcedIds.add(stageId); this.#forced.push(stageId); } }
  #nextForced(): string | undefined { const id = this.#forced.shift(); if (id) this.#forcedIds.delete(id); return id; }
}
