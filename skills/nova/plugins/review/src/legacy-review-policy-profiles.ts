import { SIMPLIFICATION_RULE_IDS, type ReviewPolicy } from './review-policy-contract.ts';
import { parseReviewPolicy } from './review-policy-parser.ts';

export const REVIEW_POLICY_PROFILE_IDS = ['gate', 'lean', 'audit'] as const;
export type ReviewPolicyProfileId = typeof REVIEW_POLICY_PROFILE_IDS[number];

const priorityWeights = { P0: 1000, P1: 500, P2: 100, P3: 10 } as const;
const categoryWeights = {
  correctness: 1000,
  security: 1000,
  contract: 900,
  architecture: 100,
  simplification: 10,
} as const;

function checked(value: unknown): ReviewPolicy {
  const parsed = parseReviewPolicy(value);
  if (!parsed.ok) throw new Error(`built-in review policy is invalid: ${parsed.error}`);
  return parsed.value;
}

const gate = checked({
  schemaVersion: 'review-policy.v2',
  profile: 'gate',
  blocking: {
    priorities: ['P0'],
    categories: ['correctness', 'security', 'contract'],
    requireIntroducedByDiff: true,
    requireDirectEvidence: true,
  },
  limits: {
    maxProposals: 64, maxRootCauses: 5, maxInstancesPerCluster: 100,
    maxBundleBytes: 4 * 1024 * 1024,
    maxContextFiles: 48, maxInitialContextFiles: 40, maxContextFileBytes: 512 * 1024,
    maxContextBytes: 3 * 1024 * 1024, maxInitialContextBytes: 2 * 1024 * 1024,
    maxDependencyDepth: 2, maxExpansionFiles: 8,
    maxAdvisories: 0,
  },
  scope: {
    outsideScope: 'orchestrator_required', unknownScope: 'blocked',
    retainPreExisting: false,
  },
  verification: {
    semanticVerifier: 'p0-only', insufficientFindingEvidence: 'orchestrator_required',
    unverifiedRequirement: 'blocked',
  },
  simplification: {
    enabled: false, registryVersion: 'simplification-rules.v1', enabledRules: [],
    maxRecommendations: 0, minimumConfidence: 'high',
  },
  ranking: {
    priorityWeights, categoryWeights, introducedByDiffBonus: 100,
    directEvidenceBonus: 100,
  },
  followUp: { retainedPriorities: ['P1', 'P2', 'P3'], maxItems: 100 },
  governor: { maxRepairCycles: 2, fileGrowthMultiplier: 2, nonTestLocGrowthMultiplier: 2, absoluteFileAllowance: 2, absoluteNonTestLocAllowance: 100 },
});

const lean = checked({
  schemaVersion: 'review-policy.v2',
  profile: 'lean',
  blocking: {
    priorities: ['P0'],
    categories: ['correctness', 'security', 'contract'],
    requireIntroducedByDiff: true,
    requireDirectEvidence: true,
  },
  limits: {
    maxProposals: 64, maxRootCauses: 5, maxInstancesPerCluster: 100,
    maxBundleBytes: 6 * 1024 * 1024,
    maxContextFiles: 64, maxInitialContextFiles: 52, maxContextFileBytes: 768 * 1024,
    maxContextBytes: 5 * 1024 * 1024, maxInitialContextBytes: 4 * 1024 * 1024,
    maxDependencyDepth: 2, maxExpansionFiles: 12,
    maxAdvisories: 3,
  },
  scope: { outsideScope: 'follow_up', unknownScope: 'blocked', retainPreExisting: false },
  verification: {
    semanticVerifier: 'p0-only', insufficientFindingEvidence: 'follow_up',
    unverifiedRequirement: 'blocked',
  },
  simplification: {
    enabled: true, registryVersion: 'simplification-rules.v1',
    enabledRules: SIMPLIFICATION_RULE_IDS, maxRecommendations: 3, minimumConfidence: 'high',
  },
  ranking: {
    priorityWeights, categoryWeights, introducedByDiffBonus: 100,
    directEvidenceBonus: 100,
  },
  followUp: { retainedPriorities: ['P1', 'P2', 'P3'], maxItems: 100 },
  governor: { maxRepairCycles: 2, fileGrowthMultiplier: 2, nonTestLocGrowthMultiplier: 2, absoluteFileAllowance: 2, absoluteNonTestLocAllowance: 100 },
});

const audit = checked({
  schemaVersion: 'review-policy.v2',
  profile: 'audit',
  blocking: {
    priorities: ['P0'],
    categories: ['correctness', 'security', 'contract'],
    requireIntroducedByDiff: true,
    requireDirectEvidence: true,
  },
  limits: {
    maxProposals: 128, maxRootCauses: 20, maxInstancesPerCluster: 1000,
    maxBundleBytes: 16 * 1024 * 1024,
    maxContextFiles: 256, maxInitialContextFiles: 240, maxContextFileBytes: 2 * 1024 * 1024,
    maxContextBytes: 14 * 1024 * 1024, maxInitialContextBytes: 12 * 1024 * 1024,
    maxDependencyDepth: 8, maxExpansionFiles: 16,
    maxAdvisories: 100,
  },
  scope: { outsideScope: 'follow_up', unknownScope: 'follow_up', retainPreExisting: true },
  verification: {
    semanticVerifier: 'all-blockers', insufficientFindingEvidence: 'follow_up',
    unverifiedRequirement: 'orchestrator_required',
  },
  simplification: {
    enabled: true, registryVersion: 'simplification-rules.v1',
    enabledRules: SIMPLIFICATION_RULE_IDS, maxRecommendations: 10, minimumConfidence: 'medium',
  },
  ranking: {
    priorityWeights, categoryWeights, introducedByDiffBonus: 100,
    directEvidenceBonus: 100,
  },
  followUp: { retainedPriorities: ['P0', 'P1', 'P2', 'P3'], maxItems: 1000 },
  governor: { maxRepairCycles: 2, fileGrowthMultiplier: 2, nonTestLocGrowthMultiplier: 2, absoluteFileAllowance: 2, absoluteNonTestLocAllowance: 100 },
});

export const REVIEW_POLICY_PROFILES: Readonly<Record<ReviewPolicyProfileId, ReviewPolicy>> =
  Object.freeze({ gate, lean, audit });

export function getReviewPolicyProfile(profile: string): ReviewPolicy {
  if (!REVIEW_POLICY_PROFILE_IDS.includes(profile as ReviewPolicyProfileId)) {
    throw new Error(`unknown review policy profile: ${profile}`);
  }
  return REVIEW_POLICY_PROFILES[profile as ReviewPolicyProfileId];
}
