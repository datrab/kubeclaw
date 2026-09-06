import type {
  StageDefinition,
  StageResult,
  WaitRequest,
} from '@kubeclaw/plugin-sdk';

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
  readonly continuationGuidance?: Readonly<Record<string, unknown>>;
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

type AttemptedState = Omit<StageRuntimeState, 'wait' | 'retryAt'>;
type ResultHandler = (definition: StageDefinition, current: StageRuntimeState, attempted: AttemptedState, result: StageResult) => LifecycleDecision;

function stopWhenExhausted(definition: StageDefinition, attempted: AttemptedState): LifecycleDecision | undefined {
  return attempted.attemptsUsed >= definition.execution.maxAttempts
    ? { state: { ...attempted, status: 'blocked' }, action: { type: 'stop' } }
    : undefined;
}

const pass: ResultHandler = (_definition, _current, attempted, result) => ({
  state: { ...attempted, status: 'succeeded', ...(result.outcome === 'passed' && result.facts ? { facts: frozenFacts(result.facts) } : {}) },
  action: { type: 'complete' },
});

const retry: ResultHandler = (definition, _current, attempted) => stopWhenExhausted(definition, attempted) ?? (
  definition.execution.orchestratorAfterAttempt === attempted.attemptsUsed
    ? { state: { ...attempted, status: 'waiting' }, action: { type: 'request_orchestrator', afterAttempt: attempted.attemptsUsed } }
    : { state: { ...attempted, status: 'retrying' }, action: { type: 'schedule_attempt' } }
);

const requestFix: ResultHandler = (definition, current, attempted) => {
  const remediationCyclesUsed = current.remediationCyclesUsed + 1;
  const target = definition.on?.request_fix;
  if (!target) throw new Error(`STAGE_REMEDIATION_UNDECLARED:${definition.id}`);
  const exhausted = attempted.attemptsUsed >= definition.execution.maxAttempts
    || remediationCyclesUsed > definition.execution.maxRemediationCycles;
  if (exhausted) return { state: { ...attempted, remediationCyclesUsed, status: 'blocked' }, action: { type: 'stop' } };
  return { state: { ...attempted, remediationCyclesUsed, status: 'waiting', remediationTarget: target }, action: { type: 'schedule_remediation', stageId: target } };
};

const wait: ResultHandler = (definition, _current, attempted, result) => stopWhenExhausted(definition, attempted) ?? (
  result.outcome === 'wait'
    ? { state: { ...attempted, status: 'waiting', wait: result.wait }, action: { type: 'persist_wait', wait: result.wait } }
    : result.outcome === 'orchestrator_required'
      ? { state: { ...attempted, status: 'waiting', wait: result.wait }, action: { type: 'pause_for_orchestrator', wait: result.wait } }
      : { state: { ...attempted, status: 'waiting', retryAt: result.outcome === 'rate_limited' ? result.retryAt : '' }, action: { type: 'cooldown', retryAt: result.outcome === 'rate_limited' ? result.retryAt : '' } }
);

const stopped = (status: 'blocked' | 'failed' | 'cancelled'): ResultHandler => (_definition, _current, attempted) => ({ state: { ...attempted, status }, action: { type: 'stop' } });

const handlers: Record<StageResult['outcome'], ResultHandler> = {
  passed: pass, retry, request_fix: requestFix, wait, orchestrator_required: wait, rate_limited: wait,
  blocked: stopped('blocked'), failed: stopped('failed'), timed_out: stopped('failed'), cancelled: stopped('cancelled'),
};

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
  return handlers[result.outcome](definition, current, attempted, result);
}
