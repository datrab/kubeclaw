import type {
  StageDefinition,
  StageResult,
  WaitRequest,
} from '../../sdk/src/index.ts';

export type StageStatus =
  | 'pending'
  | 'scheduled'
  | 'running'
  | 'waiting'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface StageRuntimeState {
  readonly stageId: string;
  readonly status: StageStatus;
  readonly attemptNumber: number;
  readonly attemptsUsed: number;
  readonly remediationCyclesUsed: number;
  readonly wait?: WaitRequest;
  readonly remediationReturnTo?: string;
}

export type LifecycleAction =
  | { readonly type: 'complete' }
  | { readonly type: 'schedule_attempt' }
  | { readonly type: 'schedule_remediation'; readonly stageId: string }
  | { readonly type: 'persist_wait'; readonly wait: WaitRequest }
  | { readonly type: 'pause_for_orchestrator'; readonly wait: WaitRequest }
  | { readonly type: 'request_orchestrator'; readonly afterAttempt: number }
  | { readonly type: 'stop' }
  | { readonly type: 'cooldown'; readonly retryAt: string };

export interface LifecycleDecision {
  readonly state: StageRuntimeState;
  readonly action: LifecycleAction;
}

function requiredReason(result: StageResult): void {
  if (result.outcome !== 'passed' && !result.reason) {
    throw new Error(`STAGE_RESULT_REASON_REQUIRED:${result.outcome}`);
  }
}

export function applyStageResult(
  definition: StageDefinition,
  current: StageRuntimeState,
  result: StageResult,
): LifecycleDecision {
  if (current.status !== 'running') throw new Error(`STAGE_RESULT_ILLEGAL_STATE:${current.status}`);
  requiredReason(result);
  switch (result.outcome) {
    case 'passed':
      return { state: { ...current, status: 'succeeded' }, action: { type: 'complete' } };
    case 'retry': {
      const attemptsUsed = current.attemptsUsed + 1;
      if (attemptsUsed >= definition.execution.maxAttempts) {
        return { state: { ...current, attemptsUsed, status: 'blocked' }, action: { type: 'stop' } };
      }
      if (definition.execution.orchestratorAfterAttempt === attemptsUsed) {
        return {
          state: { ...current, attemptsUsed, status: 'waiting' },
          action: { type: 'request_orchestrator', afterAttempt: attemptsUsed },
        };
      }
      return { state: { ...current, attemptsUsed, status: 'retrying' }, action: { type: 'schedule_attempt' } };
    }
    case 'request_fix': {
      const remediationCyclesUsed = current.remediationCyclesUsed + 1;
      const target = definition.on?.request_fix;
      if (!target) throw new Error(`STAGE_REMEDIATION_UNDECLARED:${definition.id}`);
      if (remediationCyclesUsed > definition.execution.maxRemediationCycles) {
        return { state: { ...current, remediationCyclesUsed, status: 'blocked' }, action: { type: 'stop' } };
      }
      return {
        state: { ...current, remediationCyclesUsed, status: 'waiting' },
        action: { type: 'schedule_remediation', stageId: target },
      };
    }
    case 'wait':
      return { state: { ...current, status: 'waiting', wait: result.wait }, action: { type: 'persist_wait', wait: result.wait } };
    case 'orchestrator_required':
      return { state: { ...current, status: 'waiting', wait: result.wait }, action: { type: 'pause_for_orchestrator', wait: result.wait } };
    case 'rate_limited':
      return { state: { ...current, status: 'waiting' }, action: { type: 'cooldown', retryAt: result.retryAt } };
    case 'blocked':
      return { state: { ...current, status: 'blocked' }, action: { type: 'stop' } };
    case 'failed':
    case 'timed_out':
      return { state: { ...current, status: 'failed' }, action: { type: 'stop' } };
    case 'cancelled':
      return { state: { ...current, status: 'cancelled' }, action: { type: 'stop' } };
    default: {
      const exhaustive: never = result;
      throw new Error(`STAGE_RESULT_UNKNOWN:${JSON.stringify(exhaustive)}`);
    }
  }
}
