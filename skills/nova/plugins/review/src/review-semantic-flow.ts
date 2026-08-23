import type { PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import type { ParsedEchoReviewOutput } from './echo-review-parser.ts';
import type { ParsedEchoReviewVerificationOutput } from './echo-review-verification-parser.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { preflightEchoReviewProposals, type ReviewProposalPreflight } from './review-proposal-preflight.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { readChangedLineRanges, type FrozenReviewRevision } from './review-repository.ts';
import { buildVerifiedReviewFindings } from './review-verified-findings.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import { reconcileReviewVerification, type ReconciledReviewVerification } from './review-verification-reconciliation.ts';
import { mapReviewVerificationVerdicts, type ReviewVerdictPolicyMapping } from './review-verdict-policy.ts';
import { dispatchSemanticVerification } from './review-verifier.ts';
import { ReviewVerificationRequestLimitError } from './review-verifier.ts';

export interface ReviewSemanticFlowResult {
  readonly preflight?: ReviewProposalPreflight;
  readonly reconciliation?: ReconciledReviewVerification;
  readonly findings: readonly VerifiedReviewFinding[];
  readonly verdictMapping?: ReviewVerdictPolicyMapping;
}
export class ReviewSemanticFlowIntegrityError extends Error {
  readonly state: ReviewSemanticFlowResult;
  readonly kind: 'integrity' | 'limit';
  constructor(message: string, state: ReviewSemanticFlowResult, kind: 'integrity' | 'limit' = 'integrity') {
    super(message); this.state = state; this.kind = kind;
  }
}

export interface ReviewSemanticFlowInput {
  readonly agent: string;
  readonly snapshot: ReviewBundleSnapshot;
  readonly echo: ParsedEchoReviewOutput;
  readonly revision: FrozenReviewRevision;
  readonly policy: ResolvedReviewPolicy;
  readonly context: PluginInvocationContext;
}

function changedLineProofPaths(snapshot: ReviewBundleSnapshot, output: Extract<ParsedEchoReviewOutput, { readonly ok: true }>['value']) {
  const changed = new Map(snapshot.bundle.scope.changedPaths.map((entry) => [entry.path, entry.status]));
  return [...new Set(output.proposedFindings.flatMap(({ locations }) => locations)
    .filter(({ path, lineHint }) => lineHint !== undefined
      && changed.has(path) && !['added', 'deleted'].includes(changed.get(path) ?? ''))
    .map(({ path }) => path))].sort();
}

async function proposalPreflight(
  snapshot: ReviewBundleSnapshot,
  echo: ParsedEchoReviewOutput,
  revision: FrozenReviewRevision,
  policy: ResolvedReviewPolicy,
  context: PluginInvocationContext,
): Promise<ReviewProposalPreflight | undefined> {
  if (!echo.ok || echo.value.proposedFindings.length === 0) return undefined;
  const overLimit = echo.value.proposedFindings.length > policy.policy.limits.maxProposals;
  const ranges = overLimit ? new Map() : await readChangedLineRanges(
    snapshot.bundle.revisions.base, revision, changedLineProofPaths(snapshot, echo.value), context,
  );
  return preflightEchoReviewProposals(snapshot.bundle, echo.value, policy, ranges);
}

async function verifierOutput(
  agent: string,
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight | undefined,
  policy: ResolvedReviewPolicy,
  context: PluginInvocationContext,
): Promise<ParsedEchoReviewVerificationOutput | undefined> {
  return preflight
    ? dispatchSemanticVerification(agent, snapshot, preflight, policy, context)
    : undefined;
}

async function verifierOutputWithState(
  agent: string, snapshot: ReviewBundleSnapshot, preflight: ReviewProposalPreflight | undefined,
  policy: ResolvedReviewPolicy, context: PluginInvocationContext,
): Promise<ParsedEchoReviewVerificationOutput | undefined> {
  try { return await verifierOutput(agent, snapshot, preflight, policy, context); } catch (error) {
    if (!(error instanceof ReviewVerificationRequestLimitError)) throw error;
    throw new ReviewSemanticFlowIntegrityError(
      error instanceof Error ? error.message : String(error),
      { ...(preflight === undefined ? {} : { preflight }), findings: [] },
      'limit',
    );
  }
}

function reconcileIfReady(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight | undefined,
  policy: ResolvedReviewPolicy,
  verification: ParsedEchoReviewVerificationOutput | undefined,
): ReconciledReviewVerification | undefined {
  if (!preflight || preflight.eligibleProposalIds.length === 0) return undefined;
  if (preflight.integrityIssues.length > 0 || preflight.limitViolations.length > 0) return undefined;
  return reconcileReviewVerification(snapshot, preflight, policy, verification);
}

export async function runReviewSemanticFlow(values: ReviewSemanticFlowInput): Promise<ReviewSemanticFlowResult> {
  const { agent, snapshot, echo, revision, policy, context } = values;
  const preflight = await proposalPreflight(snapshot, echo, revision, policy, context);
  const verification = await verifierOutputWithState(agent, snapshot, preflight, policy, context);
  const reconciliation = reconcileIfReady(snapshot, preflight, policy, verification);
  if (!preflight || !reconciliation) return { findings: [], ...(preflight ? { preflight } : {}) };
  let verdictMapping: ReviewVerdictPolicyMapping;
  try {
    verdictMapping = mapReviewVerificationVerdicts(snapshot, preflight, reconciliation, policy);
  } catch (error) {
    throw new ReviewSemanticFlowIntegrityError(
      error instanceof Error ? error.message : String(error), { preflight, reconciliation, findings: [] },
    );
  }
  let findings: readonly VerifiedReviewFinding[];
  try {
    findings = buildVerifiedReviewFindings(snapshot, preflight, reconciliation, policy);
  } catch (error) {
    throw new ReviewSemanticFlowIntegrityError(
      error instanceof Error ? error.message : String(error),
      { preflight, reconciliation, verdictMapping, findings: [] },
    );
  }
  return { preflight, reconciliation, findings, verdictMapping };
}
