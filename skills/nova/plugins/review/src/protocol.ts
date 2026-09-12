import { portableJson } from '@kubeclaw/plugin-sdk';
import { echoReviewOutputSchema } from './echo-review-contract.ts';
import { assertReviewPolicyBundle, type ResolvedReviewPolicy } from './review-policy-resolver.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { REVIEWED_SOURCE_EVIDENCE_KIND } from './review-evidence-authority.ts';

export interface ReviewDispatchRequest {
  readonly [key: string]: unknown;
  readonly protocol: 'kubeclaw.echo-review.v1';
  readonly agent: string;
  readonly task: string;
  readonly review: {
    readonly bundle: ReviewBundleSnapshot['bundle'];
    readonly bundleDigest: string;
    readonly policy: { readonly profile: string; readonly digest: string };
  };
  readonly outputContract: Readonly<Record<string, unknown>>;
}

function reviewJson(value: unknown): string { return JSON.stringify(value, null, 2); }

export function buildReviewTask(
  snapshot: ReviewBundleSnapshot,
  helperPrompt: unknown,
  resolved: ResolvedReviewPolicy,
): string {
  portableJson(snapshot);
  assertReviewPolicyBundle(resolved, snapshot.bundle);
  const guidance = typeof helperPrompt === 'string' && helperPrompt.trim()
    ? helperPrompt.trim() : 'No additional reviewer guidance was supplied.';
  return [
    '# KubeClaw Echo review protocol v1', '',
    'Assess the declared requirements using only the supplied immutable review bundle.',
    'Return observations and proposed findings. Do not return PASS, FAIL, or a pipeline outcome.',
    'You may request one bounded context expansion only when a declared requirement is unverified.', '',
    'This may be one deterministic slice of a larger change. Review only supplied source. Do not infer a defect in an absent file.',
    '## Bundle digest', snapshot.digest, '',
    '## Review bundle', reviewJson(snapshot.bundle), '',
    '## Resolved review policy', reviewJson({
      profile: resolved.policy.profile, digest: resolved.digest,
      blocking: resolved.policy.blocking, simplification: resolved.policy.simplification,
    }), '',
    '## Additional guidance', guidance, '',
    '## Required output',
    'Return raw JSON matching the attached outputContract exactly.',
    'Assess every requirement ID exactly once and cite only supplied evidence references.',
    `Reviewed source files are trusted evidence. Cite them as {"kind":"${REVIEWED_SOURCE_EVIDENCE_KIND}","digest":"<the context item digest>"}.`,
    'Copy every source digest exactly from a supplied context item. Never invent a digest or cite a source path that is absent from this bundle.',
    'A finding location must name only the changed or supplied context file that directly proves the defect. Do not add an absent supporting file as another location.',
    'Use the cited source path and a precise lineHint in each related finding location.',
    'For an introduced finding, include the primary changed line that causes the defect. Do not replace it with nearby pre-existing declarations.',
    'Focus on introduced bugs, security failures, broken contracts, invalid lifecycle behavior, concurrency defects, persistence or recovery defects, and risks of data loss.',
    'Do not report formatting, naming preferences, stylistic form, or subjective code-shape opinions. Static lint owns those concerns.',
    'Use P0 only for a directly evidenced, release-blocking defect with serious correctness, security, contract, lifecycle, persistence, concurrency, or data-loss impact. Use P1 for important but non-critical bugs.',
    'A Simplification proposal must cite supplied candidate IDs and the candidate manifest evidence.',
    'Unknown fields are forbidden. The review plugin, not Echo, decides the stage outcome.',
  ].join('\n');
}

export function buildReviewDispatchRequest(
  agent: string,
  snapshot: ReviewBundleSnapshot,
  helperPrompt: unknown,
  resolved: ResolvedReviewPolicy,
): ReviewDispatchRequest {
  return {
    protocol: 'kubeclaw.echo-review.v1', agent,
    task: buildReviewTask(snapshot, helperPrompt, resolved),
    review: {
      bundle: snapshot.bundle, bundleDigest: snapshot.digest,
      policy: { profile: resolved.policy.profile, digest: resolved.digest },
    },
    outputContract: echoReviewOutputSchema,
  };
}
