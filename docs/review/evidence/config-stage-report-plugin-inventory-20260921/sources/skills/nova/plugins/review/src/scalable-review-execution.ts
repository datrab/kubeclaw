import { runtimeDispatchProfileFields } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewDispatchResponse } from './echo-review-parser.ts';
import { assertReviewDeadline, invokeBeforeReviewDeadline,
  resolveReviewExecutionSettings, type ReviewExecutionSettings, type ReviewDispatchInvocationContext } from './review-execution-settings.ts';
import { buildScalableReviewDispatchPayload,
  type ScalableReviewJob, type ScalableReviewJobResult } from './scalable-review-jobs.ts';
import { preflightScalableReviewResults } from './scalable-review-verification.ts';
import { assertReviewRuntimeIdentity, parseReviewRuntimeAttestation,
  type ReviewRuntimeIdentity } from './review-runtime-attestation.ts';

interface ReviewDispatchContext {
  readonly agent: string; readonly context: ReviewDispatchInvocationContext; readonly maxRetries: number;
  readonly deadlineEpochMs: number | undefined;
  readonly beforeDispatch: ReviewExecutionSettings['beforeDispatch'] | undefined;
  readonly beforeRetry: ReviewExecutionSettings['beforeRetry'] | undefined;
  readonly expectedRuntime: ReviewRuntimeIdentity;
}

function completeReviewResponse(value: ScalableReviewJob, parsed: ScalableReviewJobResult['parsed']): boolean {
  const preflight = preflightScalableReviewResults(
    [value], [{ jobId: value.id, jobDigest: value.digest, parsed }],
  );
  return preflight.incompleteJobs.length === 0 && preflight.integrityIssues.length === 0;
}

async function dispatchReviewJob(value: ScalableReviewJob, runtime: ReviewDispatchContext): Promise<ScalableReviewJobResult> {
  const { agent, context, maxRetries, deadlineEpochMs, beforeDispatch, beforeRetry } = runtime;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) beforeRetry?.();
    assertReviewDeadline(deadlineEpochMs, 'scalable review');
    try {
      const basePayload = buildScalableReviewDispatchPayload(value);
      const prepared = beforeDispatch?.(basePayload) ?? basePayload;
      const payload = Object.freeze({ ...prepared, runtimeDispatchAttempt: attempt });
      const response = await invokeBeforeReviewDeadline(() => context.invoke('runtime.dispatch', withRuntimeDispatchProfile({
        operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent }, payload,
      }, runtimeDispatchProfileFields(context.contract ?? {}).runtimeDispatchProfile)), deadlineEpochMs, 'scalable review');
      const attestation = parseReviewRuntimeAttestation(response.runtimeEvidence);
      assertReviewRuntimeIdentity(attestation, runtime.expectedRuntime);
      const parsed = parseEchoReviewDispatchResponse(response);
      const requestedContext = parsed.ok && parsed.value.contextRequest !== undefined;
      if (requestedContext || completeReviewResponse(value, parsed) || attempt === maxRetries) {
        return Object.freeze({ jobId: value.id, jobDigest: value.digest, parsed, runtime: attestation });
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('EFFECT_OUTCOME_UNRESOLVED:')) throw error;
      if (attempt === maxRetries) throw error;
    }
  }
  throw new Error(`scalable review retry state is invalid: ${value.id}`);
}

// eslint-disable-next-line max-params -- The optional checkpoint callback is separate from immutable execution settings.
export async function executeScalableReviewJobs(
  jobs: readonly ScalableReviewJob[], agent: string, context: ReviewDispatchInvocationContext,
  execution: number | ReviewExecutionSettings = 4, expectedRuntime?: ReviewRuntimeIdentity,
  checkpoint?: (result: ScalableReviewJobResult) => Promise<void>,
): Promise<readonly ScalableReviewJobResult[]> {
  const { concurrency, maxRetries, deadlineEpochMs, beforeDispatch, beforeRetry }
    = resolveReviewExecutionSettings(execution, 'scalable review');
  const runtime = { agent, context, maxRetries, deadlineEpochMs, beforeDispatch, beforeRetry,
    expectedRuntime: expectedRuntime ?? { targetId: agent, runtime: 'subagent', agentId: 'codex',
      model: 'gpt-5.6-terra', thinking: 'high' } };
  const output = new Map<string, ScalableReviewJobResult>();
  for (let offset = 0; offset < jobs.length; offset += concurrency) {
    assertReviewDeadline(deadlineEpochMs, 'scalable review');
    const batch = jobs.slice(offset, offset + concurrency);
    const values = await Promise.all(batch.map(async (value) => {
      const result = await dispatchReviewJob(value, runtime);
      await checkpoint?.(result);
      return result;
    }));
    for (const value of values) output.set(value.jobId, value);
  }
  return Object.freeze(jobs.map(({ id }) => output.get(id) as ScalableReviewJobResult));
}
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
