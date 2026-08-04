import crypto from 'node:crypto';
import type { LifecycleEvent, StageDefinition, StageResult } from '../../sdk/src/index.ts';
import type { LifecycleDecision, StageRuntimeState } from '../lifecycle/reducer.ts';
import type { AppendLifecycleEvent } from './stage-executor.ts';

export interface CompletedStageDecision {
  readonly definition: StageDefinition;
  readonly decision: LifecycleDecision & { readonly result: StageResult };
  readonly administrativeOverride: boolean;
}

type TerminalStatus = 'failed' | 'blocked' | 'cancelled';
export interface BatchOutcome { readonly terminal?: TerminalStatus; readonly paused: boolean }

export class DecisionRecorder {
  readonly #states: Map<string, StageRuntimeState>; readonly #append: AppendLifecycleEvent; readonly #issuer: string;
  readonly #force: (stageId: string) => void; #terminal: TerminalStatus | undefined; #paused = false;
  constructor(states: Map<string, StageRuntimeState>, append: AppendLifecycleEvent, issuer: string, force: (stageId: string) => void) {
    this.#states = states; this.#append = append; this.#issuer = issuer; this.#force = force;
  }

  record(runId: string, completed: CompletedStageDecision): void {
    const { definition, decision, administrativeOverride } = completed;
    this.#states.set(definition.id, decision.state); this.#artifacts(runId, definition.id, decision.result);
    if (administrativeOverride && !['complete', 'stop'].includes(decision.action.type)) { this.#administrativeBlocked(runId, definition.id, decision.state); return; }
    const handler = this.#handlers()[decision.action.type]; handler(runId, completed);
  }

  outcome(): BatchOutcome { return { ...(this.#terminal ? { terminal: this.#terminal } : {}), paused: this.#paused }; }

  #handlers(): Record<LifecycleDecision['action']['type'], (runId: string, completed: CompletedStageDecision) => void> {
    return {
      schedule_attempt: (runId, completed) => this.#retry(runId, completed),
      schedule_remediation: (runId, completed) => this.#remediate(runId, completed),
      request_orchestrator: (runId, completed) => this.#orchestrator(runId, completed, true),
      pause_for_orchestrator: (runId, completed) => this.#orchestrator(runId, completed, false),
      persist_wait: (runId, completed) => this.#wait(runId, completed), cooldown: (runId, completed) => this.#wait(runId, completed),
      stop: (runId, completed) => this.#stop(runId, completed), complete: (runId, completed) => this.#complete(runId, completed),
    };
  }

  #artifacts(runId: string, stageId: string, result: StageResult): void {
    for (const artifact of result.artifacts) this.#append('artifact.created', { runId, stageId, artifactId: artifact.artifactId }, {
      namespace: artifact.namespace, mediaType: artifact.mediaType, digest: artifact.digest, sizeBytes: artifact.sizeBytes,
    });
  }

  #administrativeBlocked(runId: string, stageId: string, state: StageRuntimeState): void {
    const blocked = { ...state, status: 'blocked' as const }; this.#states.set(stageId, blocked);
    this.#append('stage.blocked', { runId, stageId }, { attemptsUsed: blocked.attemptsUsed, remediationCyclesUsed: blocked.remediationCyclesUsed, reason: 'administrative_attempt_consumed' });
    this.#recordTerminal('blocked');
  }

  #retry(runId: string, { definition, decision }: CompletedStageDecision): void {
    this.#states.set(definition.id, { ...decision.state, status: 'pending' });
    this.#append('stage.retrying', { runId, stageId: definition.id }, { attemptsUsed: decision.state.attemptsUsed, remediationCyclesUsed: decision.state.remediationCyclesUsed });
    this.#force(definition.id);
  }

  #remediate(runId: string, { definition, decision }: CompletedStageDecision): void {
    if (decision.action.type !== 'schedule_remediation') return;
    const targetId = decision.action.stageId; const remediation = this.#states.get(targetId)!;
    if (['blocked', 'failed', 'cancelled'].includes(remediation.status)) { this.#terminalRemediation(runId, definition.id, targetId, decision.state, remediation.status); return; }
    this.#append('stage.waiting', { runId, stageId: definition.id }, { attemptsUsed: decision.state.attemptsUsed, remediationCyclesUsed: decision.state.remediationCyclesUsed, remediationStageId: targetId });
    this.#states.set(targetId, { ...remediation, status: 'pending', remediationReturnTo: definition.id });
    this.#append('stage.scheduled', { runId, stageId: targetId }, { reason: 'remediation', remediationReturnTo: definition.id }); this.#force(targetId);
  }

  #terminalRemediation(runId: string, stageId: string, targetId: string, state: StageRuntimeState, targetStatus: StageRuntimeState['status']): void {
    const blocked = { ...state, status: 'blocked' as const }; this.#states.set(stageId, blocked);
    this.#append('stage.blocked', { runId, stageId }, { attemptsUsed: blocked.attemptsUsed, remediationCyclesUsed: blocked.remediationCyclesUsed, remediationStageId: targetId, reason: 'remediation_target_terminal' });
    this.#recordTerminal(targetStatus === 'failed' ? 'failed' : targetStatus === 'cancelled' ? 'cancelled' : 'blocked');
  }

  #orchestrator(runId: string, { definition, decision }: CompletedStageDecision, afterAttempt: boolean): void {
    const action = decision.action;
    if (action.type !== 'request_orchestrator' && action.type !== 'pause_for_orchestrator') return;
    const wait = { schemaVersion: 'wait-request.v2' as const, waitId: `wait:${crypto.randomUUID()}`, kind: 'orchestrator' as const,
      signalType: 'core.orchestrator.resume', authorizedIssuer: { type: 'orchestrator' as const, id: this.#issuer }, expiresAt: null,
      ...(afterAttempt && action.type === 'request_orchestrator' ? { request: { afterAttempt: action.afterAttempt } }
        : action.type === 'pause_for_orchestrator' && action.wait.request ? { request: action.wait.request } : {}) };
    this.#states.set(definition.id, { ...decision.state, wait });
    this.#append('orchestrator.required', { runId, stageId: definition.id }, { ...(action.type === 'request_orchestrator' ? { afterAttempt: action.afterAttempt } : {}),
      attemptsUsed: decision.state.attemptsUsed, remediationCyclesUsed: decision.state.remediationCyclesUsed, wait }); this.#paused = true;
  }

  #wait(runId: string, { definition, decision }: CompletedStageDecision): void {
    const action = decision.action;
    if (action.type !== 'persist_wait' && action.type !== 'cooldown') return;
    this.#append('stage.waiting', { runId, stageId: definition.id }, { attemptsUsed: decision.state.attemptsUsed,
      remediationCyclesUsed: decision.state.remediationCyclesUsed, ...(action.type === 'persist_wait' ? { wait: action.wait } : { retryAt: action.retryAt }) });
    this.#paused = true;
  }

  #stop(runId: string, { definition, decision }: CompletedStageDecision): void {
    const status: TerminalStatus = decision.state.status === 'blocked' ? 'blocked' : decision.state.status === 'cancelled' ? 'cancelled' : 'failed';
    this.#append(`stage.${status}` as LifecycleEvent['type'], { runId, stageId: definition.id }, { stageType: definition.type,
      ...(typeof definition.config.agentRole === 'string' ? { agentRole: definition.config.agentRole } : {}), outcome: decision.result.outcome,
      reason: decision.result.reason, attemptsUsed: decision.state.attemptsUsed, remediationCyclesUsed: decision.state.remediationCyclesUsed });
    this.#recordTerminal(status);
  }

  #complete(runId: string, { definition, decision }: CompletedStageDecision): void {
    this.#append('stage.succeeded', { runId, stageId: definition.id }, { stageType: definition.type,
      ...(typeof definition.config.agentRole === 'string' ? { agentRole: definition.config.agentRole } : {}), outcome: decision.result.outcome,
      attemptsUsed: decision.state.attemptsUsed, remediationCyclesUsed: decision.state.remediationCyclesUsed,
      ...(decision.state.facts ? { facts: decision.state.facts } : {}), ...(decision.state.remediationReturnTo ? { remediationReturnTo: decision.state.remediationReturnTo } : {}) });
    if (decision.state.remediationReturnTo) this.#completeRemediation(runId, definition.id, decision.state);
  }

  #completeRemediation(runId: string, stageId: string, state: StageRuntimeState): void {
    const returnTo = state.remediationReturnTo!; const requester = this.#states.get(returnTo);
    if (!requester) throw new Error(`GRAPH_REMEDIATION_RETURN_MISSING:${returnTo}`);
    const { remediationReturnTo: _returnTo, ...withoutReturn } = state; const { remediationTarget: _target, ...requesterWithoutTarget } = requester;
    this.#states.set(stageId, withoutReturn); this.#states.set(returnTo, { ...requesterWithoutTarget, status: 'pending' });
    this.#append('stage.scheduled', { runId, stageId: returnTo }, { reason: 'remediation_completed', remediationStageId: stageId }); this.#force(returnTo);
  }

  #recordTerminal(status: TerminalStatus): void {
    const priority = { cancelled: 1, blocked: 2, failed: 3 } as const;
    if (!this.#terminal || priority[status] > priority[this.#terminal]) this.#terminal = status;
  }
}
