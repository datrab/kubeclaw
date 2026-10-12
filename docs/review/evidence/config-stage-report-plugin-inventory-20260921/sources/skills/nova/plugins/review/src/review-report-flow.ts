import type { PluginInvocationContext, StageResult, WaitRequest } from '@kubeclaw/plugin-sdk';

import type { ParsedEchoReviewOutput } from './echo-review-parser.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { buildReviewReport } from './review-report-builder.ts';
import { attachReviewReport, storeReviewReport, storeReviewBundle } from './review-report-storage.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { reduceReviewDecision } from './review-reducer.ts';
import type { ReviewSemanticFlowResult } from './review-semantic-flow.ts';
import type { ReviewGovernorSnapshot } from './review-governor.ts';
import { applyReviewGovernor } from './review-governor-decision.ts';
import { verifyEchoReviewForReduction } from './review-stage-verification.ts';
import { blockedReviewStage } from './review-stage-result.ts';
import type { ReportArtifactEncoding } from './review-report-encoding.ts';

export interface FinalizeReviewInput {
  readonly reportArtifactEncoding?: ReportArtifactEncoding;
  readonly semantic: ReviewSemanticFlowResult;
  readonly parsed: ParsedEchoReviewOutput;
  readonly snapshot: ReviewBundleSnapshot;
  readonly policy: ResolvedReviewPolicy;
  readonly wait?: WaitRequest;
  readonly context: PluginInvocationContext;
  readonly governor: ReviewGovernorSnapshot;
}

interface PersistReviewOutcomeInput extends FinalizeReviewInput {
  readonly result: StageResult;
  readonly governance?: ReturnType<typeof verifyEchoReviewForReduction>['governance'];
}

function reduction(values: FinalizeReviewInput) {
  const { semantic, parsed, snapshot, policy, wait, context } = values;
  const { preflight, reconciliation, findings, verdictMapping } = semantic;
  const attemptId = context.contract.lease?.attempt?.attemptId;
  return verifyEchoReviewForReduction({
    snapshot, parsed, policy,
    ...(preflight === undefined ? {} : { preflight }),
    ...(reconciliation === undefined ? {} : { reconciliation }),
    ...(wait === undefined ? {} : { orchestratorWait: wait }), findings,
    ...(verdictMapping === undefined ? {} : { verdictMapping }),
    ...(attemptId === undefined ? {} : { verifierAttemptId: attemptId }),
  });
}

export async function persistReviewOutcome(values: PersistReviewOutcomeInput): Promise<StageResult> {
  const { semantic, parsed, snapshot, policy, context, result, governance } = values;
  const attemptId = context.contract.lease?.attempt?.attemptId;
  if (!attemptId) return blockedReviewStage('kubeclaw.review.report_identity_missing', 'Review report requires an attempt identity.');
  try {
    const governedResult = applyReviewGovernor(result, values.governor, values.wait);
    const report = buildReviewReport({
      attemptId, snapshot, policy, parsed, result: governedResult,
      ...(semantic.preflight === undefined ? {} : { preflight: semantic.preflight }),
      ...(semantic.reconciliation === undefined ? {} : { reconciliation: semantic.reconciliation }),
      ...(semantic.verdictMapping === undefined ? {} : { verdictMapping: semantic.verdictMapping }),
      findings: semantic.findings, governor: values.governor,
      ...(governance === undefined ? {} : { governance }),
    });
    const bundle = snapshot.bundle.evidence.some(item => item.kind === 'gate-coverage') ? await storeReviewBundle(snapshot, context) : undefined;
    const resultWithBundle = bundle ? { ...governedResult, artifacts: [...governedResult.artifacts, bundle] } : governedResult;
    return attachReviewReport(resultWithBundle, report, await storeReviewReport(report, context, values.reportArtifactEncoding));
  } catch (error) {
    return blockedReviewStage(
      'kubeclaw.review.report_write_failed',
      `Required review report persistence failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function finalizeReview(values: FinalizeReviewInput): Promise<StageResult> {
  const reduced = reduction(values);
  const result = reduceReviewDecision(reduced);
  return persistReviewOutcome({
    ...values, result,
    ...(reduced.governance === undefined ? {} : { governance: reduced.governance }),
  });
}
