export function makeReviewPolicy(profile = 'gate', maxProposals = 20) {
  return {
    schemaVersion: 'review-policy.v2',
    profile,
    blocking: {
      priorities: ['P0'],
      categories: ['correctness', 'security', 'contract'],
      requireIntroducedByDiff: true,
      requireDirectEvidence: true,
    },
    limits: {
      maxProposals,
      maxRootCauses: 5,
      maxInstancesPerCluster: 100,
      maxBundleBytes: 1_048_576,
      maxContextFiles: 16,
      maxInitialContextFiles: 12,
      maxContextFileBytes: 131_072,
      maxContextBytes: 786_432,
      maxInitialContextBytes: 524_288,
      maxDependencyDepth: 2,
      maxExpansionFiles: 4,
      maxAdvisories: 10,
    },
    scope: {
      outsideScope: 'follow_up',
      unknownScope: 'orchestrator_required',
      retainPreExisting: true,
    },
    verification: {
      semanticVerifier: 'p0-only',
      insufficientFindingEvidence: 'reject',
      unverifiedRequirement: 'blocked',
    },
    simplification: {
      enabled: true,
      registryVersion: 'simplification-rules.v1',
      enabledRules: ['SIM001'],
      maxRecommendations: 3,
      minimumConfidence: 'high',
    },
    ranking: {
      priorityWeights: { P0: 1000, P1: 500, P2: 100, P3: 10 },
      categoryWeights: {
        correctness: 1000,
        security: 1000,
        contract: 900,
        architecture: 100,
        simplification: 10,
      },
      introducedByDiffBonus: 100,
      directEvidenceBonus: 100,
    },
    followUp: {
      retainedPriorities: ['P1', 'P2', 'P3'],
      maxItems: 100,
    },
    governor: {
      maxRepairCycles: 2,
      fileGrowthMultiplier: 2,
      nonTestLocGrowthMultiplier: 2,
      absoluteFileAllowance: 2,
      absoluteNonTestLocAllowance: 100,
    },
  };
}
