import { canonicalJson, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import {
  parseEchoReviewVerificationDispatchResponse,
  type ParsedEchoReviewVerificationOutput,
} from './echo-review-verification-parser.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { buildVerificationDispatchRequest } from './verification-protocol.ts';

export class ReviewVerificationRequestLimitError extends Error {}

export async function dispatchSemanticVerification(
  agent: string,
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
  context: PluginInvocationContext,
): Promise<ParsedEchoReviewVerificationOutput | undefined> {
  if (preflight.eligibleProposalIds.length === 0
    || preflight.integrityIssues.length > 0
    || preflight.limitViolations.length > 0) return undefined;
  const attempt = context.contract.lease.attempt;
  const request = buildVerificationDispatchRequest(agent, attempt, snapshot, preflight, policy);
  const bytes = Buffer.byteLength(canonicalJson(request), 'utf8');
  if (bytes > REVIEW_HARD_LIMITS.verificationRequestBytes) {
    throw new ReviewVerificationRequestLimitError(`semantic verifier request is ${bytes} bytes`);
  }
  const response = await context.invoke('runtime.dispatch', {
    operation: 'dispatch',
    resource: { type: 'runtime.agent', canonicalId: agent },
    payload: withRuntimeDispatchProfile(request, context.contract.runtimeDispatchProfile),
  });
  return parseEchoReviewVerificationDispatchResponse(response);
}
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
