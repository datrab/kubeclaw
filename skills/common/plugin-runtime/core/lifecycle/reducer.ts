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
  | 'skipped'
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
  readonly facts?: Readonly<Record<string, string | number | boolean | null>>;
  readonly wait?: WaitRequest;
  readonly retryAt?: string;
  readonly remediationReturnTo?: string;
  readonly remediationTarget?: string;
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

function frozenFacts(
  facts: Readonly<Record<string, string | number | boolean | null>>,
): Readonly<Record<string, string | number | boolean | null>> {
  return Object.freeze({ ...facts });
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
  const {
    wait: _wait,
    retryAt: _retryAt,
    ...activeState
  } = current;
  const attempted = {
    ...activeState,
    attemptNumber: current.attemptNumber + 1,
    attemptsUsed: current.attemptsUsed + 1,
  };
  switch (result.outcome) {
    case 'passed':
      return {
        state: {
          ...attempted,
          status: 'succeeded',
          ...(result.facts ? { facts: frozenFacts(result.facts) } : {}),
        },
        action: { type: 'complete' },
      };
    case 'retry': {
      const attemptsUsed = attempted.attemptsUsed;
      if (attemptsUsed >= definition.execution.maxAttempts) {
        return { state: { ...attempted, status: 'blocked' }, action: { type: 'stop' } };
      }
      if (definition.execution.orchestratorAfterAttempt === attemptsUsed) {
        return {
          state: { ...attempted, status: 'waiting' },
          action: { type: 'request_orchestrator', afterAttempt: attemptsUsed },
        };
      }
      return { state: { ...attempted, status: 'retrying' }, action: { type: 'schedule_attempt' } };
    }
    case 'request_fix': {
      const remediationCyclesUsed = current.remediationCyclesUsed + 1;
      const target = definition.on?.request_fix;
      if (!target) throw new Error(`STAGE_REMEDIATION_UNDECLARED:${definition.id}`);
      if (
        attempted.attemptsUsed >= definition.execution.maxAttempts
        || remediationCyclesUsed > definition.execution.maxRemediationCycles
      ) {
        return {
          state: { ...attempted, remediationCyclesUsed, status: 'blocked' },
          action: { type: 'stop' },
        };
      }
      return {
        state: {
          ...attempted,
          remediationCyclesUsed,
          status: 'waiting',
          remediationTarget: target,
        },
        action: { type: 'schedule_remediation', stageId: target },
      };
    }
    case 'wait':
      if (attempted.attemptsUsed >= definition.execution.maxAttempts) {
        return { state: { ...attempted, status: 'blocked' }, action: { type: 'stop' } };
      }
      return { state: { ...attempted, status: 'waiting', wait: result.wait }, action: { type: 'persist_wait', wait: result.wait } };
    case 'orchestrator_required':
      if (attempted.attemptsUsed >= definition.execution.maxAttempts) {
        return { state: { ...attempted, status: 'blocked' }, action: { type: 'stop' } };
      }
      return { state: { ...attempted, status: 'waiting', wait: result.wait }, action: { type: 'pause_for_orchestrator', wait: result.wait } };
    case 'rate_limited':
      if (attempted.attemptsUsed >= definition.execution.maxAttempts) {
        return { state: { ...attempted, status: 'blocked' }, action: { type: 'stop' } };
      }
      return {
        state: { ...attempted, status: 'waiting', retryAt: result.retryAt },
        action: { type: 'cooldown', retryAt: result.retryAt },
      };
    case 'blocked':
      return { state: { ...attempted, status: 'blocked' }, action: { type: 'stop' } };
    case 'failed':
    case 'timed_out':
      return { state: { ...attempted, status: 'failed' }, action: { type: 'stop' } };
    case 'cancelled':
      return { state: { ...attempted, status: 'cancelled' }, action: { type: 'stop' } };
    default: {
      const exhaustive: never = result;
      throw new Error(`STAGE_RESULT_UNKNOWN:${JSON.stringify(exhaustive)}`);
    }
  }
}
