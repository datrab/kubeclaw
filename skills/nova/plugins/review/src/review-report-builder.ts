import { canonicalJson, portableJson, sha256Text, type StageResult } from '@kubeclaw/plugin-sdk';

import type { ParsedEchoReviewOutput } from './echo-review-parser.ts';
import type { ProposedFinding } from './echo-review-contract.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { PORTABLE_REVIEW_BUNDLE_VERSION, PORTABLE_REVIEW_REPORT_VERSION } from './review-semantics.ts';
import { classifyVerifiedReviewFinding } from './review-reducer.ts';
import type { ReviewFindingGovernance } from './review-finding-governance.ts';
import type { ReviewGovernorSnapshot } from './review-governor.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';
import { compareCodeUnits } from './review-ordering.ts';
import {
  REVIEW_REPORT_DISPOSITIONS,
  REVIEW_REPORT_SCHEMA_VERSION,
  isReviewReport,
  type ReviewReport,
  type ReviewReportDisposition,
  type ReviewReportItem,
} from './review-report-contract.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import type { ReviewVerdictPolicyMapping } from './review-verdict-policy.ts';
import type { ReconciledReviewVerification } from './review-verification-reconciliation.ts';

type ReportItemValue = Omit<ReviewReportItem, 'itemId'>;

export interface BuildReviewReportInput {
  readonly attemptId: string;
  readonly snapshot: ReviewBundleSnapshot;
  readonly policy: ResolvedReviewPolicy;
  readonly parsed: ParsedEchoReviewOutput;
  readonly result: StageResult;
  readonly preflight?: ReviewProposalPreflight;
  readonly reconciliation?: ReconciledReviewVerification;
  readonly verdictMapping?: ReviewVerdictPolicyMapping;
  readonly findings: readonly VerifiedReviewFinding[];
  readonly governance?: ReviewFindingGovernance;
  readonly governor: ReviewGovernorSnapshot;
}

interface ClassifiedItem { readonly itemId: `sha256:${string}`; readonly value: ReportItemValue }

function itemId(origin: string, sourceId: string): `sha256:${string}` {
  return sha256Text(canonicalJson({ version: 'review-report-item.v1', origin, sourceId }));
}

function rootCauseByFinding(governance: ReviewFindingGovernance | undefined): ReadonlyMap<string, `sha256:${string}`> {
  return new Map(governance?.clusters.flatMap((cluster) => (
    cluster.findings.map(({ fingerprint }) => [fingerprint, cluster.clusterId] as const)
  )) ?? []);
}

function verifiedItems(input: BuildReviewReportInput): ClassifiedItem[] {
  const roots = rootCauseByFinding(input.governance);
  return input.findings.map((finding) => {
    const action = classifyVerifiedReviewFinding(finding, input.policy.policy);
    const disposition: ReviewReportDisposition = action === 'block' ? 'blocker'
      : action === 'ignore' ? 'ignored' : 'follow_up';
    const reason = action === 'block' ? 'Independently confirmed blocker.'
      : action === 'orchestrator_required' ? 'Confirmed finding requires a broader scope or policy decision.'
        : action === 'follow_up' ? 'Confirmed finding is retained outside the blocking gate.'
          : 'Confirmed finding is excluded by the resolved policy.';
    const rootCauseId = roots.get(finding.fingerprint);
    const governorClass = action !== 'block' ? 'follow_up'
      : input.governor.decision === 'within_scope' ? 'in_scope_blocker' : 'scope_break';
    return {
      itemId: itemId('verified_finding', finding.fingerprint),
      value: {
        disposition, origin: 'verified_finding', priority: finding.priority, category: finding.category,
        message: finding.message, recommendedFix: finding.recommendedFix, reason,
        findingFingerprint: finding.fingerprint as `sha256:${string}`,
        ...(rootCauseId === undefined ? {} : { rootCauseId }),
        governorClass,
      },
    };
  });
}

function mappedProposalDisposition(
  proposalId: string, finding: ProposedFinding, input: BuildReviewReportInput,
): { readonly disposition: ReviewReportDisposition; readonly reason: string } | undefined {
  const mapping = input.verdictMapping;
  if (mapping?.rejectedProposalIds.includes(proposalId as `sha256:${string}`)) {
    return { disposition: 'ignored', reason: 'The independent verifier rejected this proposal.' };
  }
  if (mapping?.ignoredInsufficientProposalIds.includes(proposalId as `sha256:${string}`)) {
    return { disposition: 'ignored', reason: 'The resolved policy rejects insufficient evidence.' };
  }
  if (mapping?.followUpProposalIds.includes(proposalId as `sha256:${string}`)
    || mapping?.orchestratorProposalIds.includes(proposalId as `sha256:${string}`)) {
    return { disposition: 'follow_up', reason: 'The proposal remains uncertain and cannot start repair.' };
  }
  return undefined;
}

function proposalDisposition(
  proposalId: string, finding: ProposedFinding, input: BuildReviewReportInput,
): { readonly disposition: ReviewReportDisposition; readonly reason: string } {
  const mapped = mappedProposalDisposition(proposalId, finding, input);
  if (mapped) return mapped;
  if (finding.simplification && input.policy.policy.simplification.enabled
    && input.policy.policy.limits.maxAdvisories > 0 && input.policy.policy.simplification.maxRecommendations > 0) {
    return { disposition: 'advisory', reason: 'Echo assessed deterministic Simplification candidates as a simplification.' };
  }
  if (input.policy.policy.followUp.retainedPriorities.includes(finding.priority)) {
    return { disposition: 'follow_up', reason: 'The proposal is retained outside the blocking gate.' };
  }
  return { disposition: 'ignored', reason: 'The proposal is excluded by the resolved policy.' };
}

function proposalItems(input: BuildReviewReportInput): ClassifiedItem[] {
  if (!input.parsed.ok || !input.preflight) return [];
  return Object.entries(input.preflight.proposals).flatMap(([proposalId, proposal]) => {
    const confirmed = input.reconciliation?.confirmedProposalIds.includes(proposalId as `sha256:${string}`);
    if (confirmed && input.findings.length > 0) return [];
    const classified = proposalDisposition(proposalId, proposal.finding, input);
    const finding = proposal.finding;
    return [{
      itemId: itemId('echo_proposal', proposalId),
      value: {
        disposition: confirmed ? 'follow_up' : classified.disposition,
        origin: 'echo_proposal', priority: finding.priority,
        category: finding.category, message: finding.claim, recommendedFix: finding.recommendedFix,
        reason: confirmed
          ? 'The verifier confirmed this proposal, but a normalized verified finding was unavailable.'
          : classified.reason,
        proposalId: proposalId as `sha256:${string}`,
        ...(finding.simplification === undefined ? {} : { candidateIds: [...finding.simplification.candidateIds].sort() }),
      },
    }];
  });
}

function advisoryScore(item: ClassifiedItem, input: BuildReviewReportInput): number {
  if (item.value.disposition !== 'advisory' || !item.value.proposalId || !input.preflight) return 0;
  const reduction = input.preflight.proposals[item.value.proposalId]?.finding.simplification?.estimatedNetLocReduction ?? 0;
  return reduction;
}

function boundedItems(
  items: readonly ClassifiedItem[], input: BuildReviewReportInput,
): { readonly included: readonly ClassifiedItem[]; readonly omitted: Readonly<Record<ReviewReportDisposition, number>> } {
  const grouped = new Map(REVIEW_REPORT_DISPOSITIONS.map((disposition) => [
    disposition, items.filter(({ value }) => value.disposition === disposition),
  ]));
  const advisoryLimit = Math.min(
    input.policy.policy.limits.maxAdvisories, input.policy.policy.simplification.maxRecommendations,
  );
  const limits: Readonly<Record<ReviewReportDisposition, number>> = {
    blocker: Number.MAX_SAFE_INTEGER,
    advisory: advisoryLimit,
    follow_up: input.policy.policy.followUp.maxItems,
    ignored: Number.MAX_SAFE_INTEGER,
  };
  const included: ClassifiedItem[] = [];
  const omitted = {} as Record<ReviewReportDisposition, number>;
  for (const disposition of REVIEW_REPORT_DISPOSITIONS) {
    const ordered = [...(grouped.get(disposition) ?? [])].sort((left, right) => {
      const score = disposition === 'advisory' ? advisoryScore(right, input) - advisoryScore(left, input) : 0;
      return score || compareCodeUnits(left.itemId, right.itemId);
    });
    const selected = ordered.slice(0, limits[disposition]);
    included.push(...selected);
    omitted[disposition] = ordered.length - selected.length;
  }
  return { included: included.sort((a, b) => compareCodeUnits(a.itemId, b.itemId)), omitted };
}

export function buildReviewReport(input: BuildReviewReportInput): ReviewReport {
  // Snapshot data is JSON; the surrounding input contains method-bearing owner
  // objects and is deliberately not treated as an arbitrary JSON document.
  portableJson(input.snapshot);
  const bundleVersion = input.snapshot.bundle.schemaVersion;
  if (Object.hasOwn(input.snapshot.bundle, 'schemaVersion') && bundleVersion !== 'review-bundle.v1'
    && bundleVersion !== PORTABLE_REVIEW_BUNDLE_VERSION) throw new Error('REVIEW_BUNDLE_VERSION_INVALID');
  if (!['passed', 'request_fix', 'blocked', 'orchestrator_required'].includes(input.result.outcome)) {
    throw new Error(`review report cannot represent stage outcome ${input.result.outcome}`);
  }
  const bounded = boundedItems([...verifiedItems(input), ...proposalItems(input)], input);
  const items = Object.fromEntries(bounded.included.map(({ itemId: id, value }) => [id, value]));
  const report = Object.freeze({
    schemaVersion: bundleVersion === PORTABLE_REVIEW_BUNDLE_VERSION
      ? PORTABLE_REVIEW_REPORT_VERSION : REVIEW_REPORT_SCHEMA_VERSION,
    attemptId: input.attemptId,
    taskId: input.snapshot.bundle.task.id,
    profile: input.policy.policy.profile,
    policyDigest: input.policy.digest,
    bundleDigest: input.snapshot.digest,
    revision: input.snapshot.bundle.revisions,
    governor: input.governor,
    outcome: input.result.outcome as ReviewReport['outcome'],
    omitted: bounded.omitted,
    items,
  });
  if (!isReviewReport(report)) throw new Error('built review report is invalid');
  return report;
}
