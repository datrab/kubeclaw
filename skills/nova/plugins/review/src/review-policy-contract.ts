import {
  REVIEW_CATEGORIES,
  REVIEW_PRIORITIES,
  type ReviewCategory,
  type ReviewPriority,
} from './echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import {
  REQUIRED_BLOCKING_CATEGORIES,
  REQUIRED_BLOCKING_PRIORITIES,
} from './review-invariants.ts';

export const REVIEW_POLICY_SCHEMA_VERSION = 'review-policy.v2' as const;
export const SEMANTIC_VERIFIER_MODES = ['disabled', 'p0-only', 'all-blockers'] as const;
export const INSUFFICIENT_FINDING_ACTIONS = ['reject', 'follow_up', 'orchestrator_required'] as const;
export const UNVERIFIED_REQUIREMENT_ACTIONS = ['blocked', 'orchestrator_required'] as const;
export const OUTSIDE_SCOPE_ACTIONS = ['follow_up', 'orchestrator_required'] as const;
export const UNKNOWN_SCOPE_ACTIONS = ['blocked', 'follow_up', 'orchestrator_required'] as const;
export const SIMPLIFICATION_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export const SIMPLIFICATION_RULE_IDS = [
  'SIM001', 'SIM002', 'SIM003', 'SIM004', 'SIM005', 'SIM006', 'SIM007', 'SIM008',
] as const;
export const SIMPLIFICATION_REGISTRY_VERSION = 'simplification-rules.v1' as const;

export type SemanticVerifierMode = typeof SEMANTIC_VERIFIER_MODES[number];
export type InsufficientFindingAction = typeof INSUFFICIENT_FINDING_ACTIONS[number];
export type UnverifiedRequirementAction = typeof UNVERIFIED_REQUIREMENT_ACTIONS[number];
export type OutsideScopeAction = typeof OUTSIDE_SCOPE_ACTIONS[number];
export type UnknownScopeAction = typeof UNKNOWN_SCOPE_ACTIONS[number];
export type SimplificationConfidence = typeof SIMPLIFICATION_CONFIDENCE_LEVELS[number];
export type SimplificationRuleId = typeof SIMPLIFICATION_RULE_IDS[number];

export interface ReviewBlockingPolicy {
  readonly priorities: readonly ReviewPriority[];
  readonly categories: readonly ReviewCategory[];
  readonly requireIntroducedByDiff: boolean;
  readonly requireDirectEvidence: boolean;
}

export interface ReviewLimitPolicy {
  readonly maxProposals: number;
  readonly maxRootCauses: number;
  readonly maxInstancesPerCluster: number;
  readonly maxBundleBytes: number;
  readonly maxContextFiles: number;
  readonly maxInitialContextFiles: number;
  readonly maxContextFileBytes: number;
  readonly maxContextBytes: number;
  readonly maxInitialContextBytes: number;
  readonly maxDependencyDepth: number;
  readonly maxExpansionFiles: number;
  readonly maxAdvisories: number;
}

export interface ReviewScopePolicy {
  readonly outsideScope: OutsideScopeAction;
  readonly unknownScope: UnknownScopeAction;
  readonly retainPreExisting: boolean;
}

export interface ReviewVerificationPolicy {
  readonly semanticVerifier: SemanticVerifierMode;
  readonly insufficientFindingEvidence: InsufficientFindingAction;
  readonly unverifiedRequirement: UnverifiedRequirementAction;
}

export interface ReviewSimplificationPolicy {
  readonly enabled: boolean;
  readonly registryVersion: typeof SIMPLIFICATION_REGISTRY_VERSION;
  readonly enabledRules: readonly SimplificationRuleId[];
  readonly maxRecommendations: number;
  readonly minimumConfidence: SimplificationConfidence;
}

export interface ReviewRankingPolicy {
  readonly priorityWeights: Readonly<Record<ReviewPriority, number>>;
  readonly categoryWeights: Readonly<Record<ReviewCategory, number>>;
  readonly introducedByDiffBonus: number;
  readonly directEvidenceBonus: number;
}

export interface ReviewFollowUpPolicy {
  readonly retainedPriorities: readonly ReviewPriority[];
  readonly maxItems: number;
}

export interface ReviewGovernorPolicy {
  readonly maxRepairCycles: number;
  readonly fileGrowthMultiplier: number;
  readonly nonTestLocGrowthMultiplier: number;
  readonly absoluteFileAllowance: number;
  readonly absoluteNonTestLocAllowance: number;
}

export interface ReviewPolicy {
  readonly schemaVersion: typeof REVIEW_POLICY_SCHEMA_VERSION;
  readonly profile: string;
  readonly blocking: ReviewBlockingPolicy;
  readonly limits: ReviewLimitPolicy;
  readonly scope: ReviewScopePolicy;
  readonly verification: ReviewVerificationPolicy;
  readonly simplification: ReviewSimplificationPolicy;
  readonly ranking: ReviewRankingPolicy;
  readonly followUp: ReviewFollowUpPolicy;
  readonly governor: ReviewGovernorPolicy;
}

const exactText = (maxLength: number) => ({
  type: 'string', minLength: 1, maxLength,
  pattern: '^\\S(?:[\\s\\S]*\\S)?(?![\\s\\S])',
} as const);
const stableId = {
  ...exactText(REVIEW_HARD_LIMITS.identifierCharacters),
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\\s\\S])',
} as const;
const integer = (minimum: number, maximum: number) => ({
  type: 'integer', minimum, maximum,
} as const);
const enumArray = <T extends readonly string[]>(
  values: T,
  maxItems: number,
  minItems = 1,
) => ({
  type: 'array', minItems, maxItems, uniqueItems: true,
  items: { enum: values },
} as const);
const closedObject = <T extends Readonly<Record<string, unknown>>>(properties: T) => ({
  type: 'object', additionalProperties: false,
  required: Object.keys(properties),
  properties,
} as const);
const priorityWeights = closedObject(Object.fromEntries(
  REVIEW_PRIORITIES.map((priority) => [
    priority, integer(0, REVIEW_HARD_LIMITS.rankingWeight),
  ]),
));
const categoryWeights = closedObject(Object.fromEntries(
  REVIEW_CATEGORIES.map((category) => [
    category, integer(0, REVIEW_HARD_LIMITS.rankingWeight),
  ]),
));

const reviewPolicyProperties = {
  schemaVersion: { const: REVIEW_POLICY_SCHEMA_VERSION },
  profile: stableId,
  blocking: closedObject({
    priorities: {
      ...enumArray(REVIEW_PRIORITIES, REVIEW_PRIORITIES.length),
      allOf: REQUIRED_BLOCKING_PRIORITIES.map((priority) => ({ contains: { const: priority } })),
    },
    categories: {
      ...enumArray(REVIEW_CATEGORIES, REVIEW_CATEGORIES.length),
      allOf: REQUIRED_BLOCKING_CATEGORIES.map((category) => ({ contains: { const: category } })),
    },
    requireIntroducedByDiff: { type: 'boolean' },
    requireDirectEvidence: { type: 'boolean' },
  }),
  limits: closedObject({
    maxProposals: integer(1, REVIEW_HARD_LIMITS.proposedFindings),
    maxRootCauses: integer(1, REVIEW_HARD_LIMITS.rootCauses),
    maxInstancesPerCluster: integer(1, REVIEW_HARD_LIMITS.instancesPerCluster),
    maxBundleBytes: integer(1024, REVIEW_HARD_LIMITS.bundleBytes),
    maxContextFiles: integer(1, REVIEW_HARD_LIMITS.contextFiles),
    maxInitialContextFiles: integer(1, REVIEW_HARD_LIMITS.contextFiles),
    maxContextFileBytes: integer(1, REVIEW_HARD_LIMITS.contextFileBytes),
    maxContextBytes: integer(1, REVIEW_HARD_LIMITS.bundleBytes),
    maxInitialContextBytes: integer(1, REVIEW_HARD_LIMITS.bundleBytes),
    maxDependencyDepth: integer(0, REVIEW_HARD_LIMITS.contextDependencyDepth),
    maxExpansionFiles: integer(1, REVIEW_HARD_LIMITS.contextExpansionPaths),
    maxAdvisories: integer(0, REVIEW_HARD_LIMITS.advisories),
  }),
  scope: closedObject({
    outsideScope: { enum: OUTSIDE_SCOPE_ACTIONS },
    unknownScope: { enum: UNKNOWN_SCOPE_ACTIONS },
    retainPreExisting: { type: 'boolean' },
  }),
  verification: closedObject({
    semanticVerifier: { enum: SEMANTIC_VERIFIER_MODES },
    insufficientFindingEvidence: { enum: INSUFFICIENT_FINDING_ACTIONS },
    unverifiedRequirement: { enum: UNVERIFIED_REQUIREMENT_ACTIONS },
  }),
  simplification: closedObject({
    enabled: { type: 'boolean' },
    registryVersion: { const: SIMPLIFICATION_REGISTRY_VERSION },
    enabledRules: {
      type: 'array', maxItems: REVIEW_HARD_LIMITS.simplificationRules, uniqueItems: true,
      items: { enum: SIMPLIFICATION_RULE_IDS },
    },
    maxRecommendations: integer(0, REVIEW_HARD_LIMITS.simplificationRecommendations),
    minimumConfidence: { enum: SIMPLIFICATION_CONFIDENCE_LEVELS },
  }),
  ranking: closedObject({
    priorityWeights,
    categoryWeights,
    introducedByDiffBonus: integer(0, REVIEW_HARD_LIMITS.rankingWeight),
    directEvidenceBonus: integer(0, REVIEW_HARD_LIMITS.rankingWeight),
  }),
  followUp: closedObject({
    retainedPriorities: enumArray(REVIEW_PRIORITIES, REVIEW_PRIORITIES.length, 0),
    maxItems: integer(0, REVIEW_HARD_LIMITS.followUps),
  }),
  governor: closedObject({
    maxRepairCycles: integer(0, REVIEW_HARD_LIMITS.governorRepairCycles),
    fileGrowthMultiplier: integer(1, REVIEW_HARD_LIMITS.governorMultiplier),
    nonTestLocGrowthMultiplier: integer(1, REVIEW_HARD_LIMITS.governorMultiplier),
    absoluteFileAllowance: integer(0, REVIEW_HARD_LIMITS.governorFileAllowance),
    absoluteNonTestLocAllowance: integer(0, REVIEW_HARD_LIMITS.governorLocAllowance),
  }),
} as const;

export const reviewPolicySchema = {
  ...closedObject(reviewPolicyProperties),
  allOf: [{
    if: {
      anyOf: [
        { type: 'object', properties: { scope: { type: 'object', properties: { outsideScope: { const: 'follow_up' } } } } },
        { type: 'object', properties: { scope: { type: 'object', properties: { unknownScope: { const: 'follow_up' } } } } },
        { type: 'object', properties: { verification: { type: 'object', properties: { insufficientFindingEvidence: { const: 'follow_up' } } } } },
      ],
    },
    then: {
      type: 'object',
      properties: {
        followUp: {
          type: 'object',
          properties: {
            retainedPriorities: { type: 'array', minItems: 1 },
            maxItems: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
  }, {
    if: { type: 'object', properties: { simplification: { type: 'object', properties: { enabled: { const: true } } } } },
    then: {
      type: 'object',
      properties: {
        simplification: {
          type: 'object',
          properties: {
            enabledRules: { type: 'array', minItems: 1 },
            maxRecommendations: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    else: {
      type: 'object',
      properties: {
        simplification: {
          type: 'object',
          properties: {
            enabledRules: { type: 'array', maxItems: 0 },
            maxRecommendations: { const: 0 },
          },
        },
      },
    },
  }],
} as const;
