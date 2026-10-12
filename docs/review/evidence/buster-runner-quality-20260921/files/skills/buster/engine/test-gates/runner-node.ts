import type { AttemptResultV1, ProducedOutputV1, ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { AttemptExecution, NodeExecution, TestPlanRunnerOptions } from './runner-types.ts';
import { finalNodeResult } from './runner-values.ts';

interface NodeOwner {
  readonly options: TestPlanRunnerOptions;
  readonly authorityId: string;
  readonly id: () => string;
  executeAttempt(node: ResolvedPlanNodeV1, attemptNumber: number,
    outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>): Promise<AttemptExecution>;
}

function shouldRetry(execution: AttemptExecution, signal: AbortSignal | undefined,
  attemptNumber: number, maximumAttempts: number): boolean {
  return execution.result.executionState !== 'cancelled' && !signal?.aborted
    && (execution.result.executionState !== 'completed' || execution.result.outcome === 'failed')
    && attemptNumber < maximumAttempts;
}

function retainedFixture(node: ResolvedPlanNodeV1, execution: AttemptExecution): AttemptExecution | null {
  return !execution.cleanupFailed && node.kind === 'fixture'
    && execution.result.executionState === 'completed' && execution.result.outcome === 'passed'
    ? execution : null;
}

export async function executeRunnerNode(owner: NodeOwner, node: ResolvedPlanNodeV1,
  outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>): Promise<NodeExecution> {
  const attempts: AttemptResultV1[] = [];
  let finalExecution: AttemptExecution | null = null;
  const maximumAttempts = node.retryCount + 1;
  for (let attemptNumber = 1; attemptNumber <= maximumAttempts; attemptNumber += 1) {
    const execution = await owner.executeAttempt(node, attemptNumber, outputs);
    attempts.push(execution.result);
    finalExecution = execution;
    const retry = shouldRetry(execution, owner.options.signal, attemptNumber, maximumAttempts);
    if (execution.cleanupFailed || !retry) break;
  }
  if (!finalExecution) throw new Error(`TEST_RUNNER_ATTEMPT_MISSING:${node.id}`);
  const final = finalExecution.result;
  const state = finalExecution.cleanupFailed ? 'errored' : final.executionState;
  const result = finalNodeResult(owner.options.plan, node, attempts, state,
    finalExecution.cleanupFailed ? null : final.outcome, null,
    { authorityId: owner.authorityId, nonce: owner.id() });
  return { result, attempts, outputs: final.outputs, retainedFixture: retainedFixture(node, finalExecution) };
}
