import {
  INSUFFICIENT_FINDING_ACTIONS,
  OUTSIDE_SCOPE_ACTIONS,
  SIMPLIFICATION_CONFIDENCE_LEVELS,
  SIMPLIFICATION_REGISTRY_VERSION,
  SIMPLIFICATION_RULE_IDS,
  REVIEW_POLICY_SCHEMA_VERSION,
  SEMANTIC_VERIFIER_MODES,
  UNKNOWN_SCOPE_ACTIONS,
  UNVERIFIED_REQUIREMENT_ACTIONS,
  reviewPolicySchema,
  type ReviewPolicy,
} from './review-policy-contract.ts';
import { REVIEW_CATEGORIES, REVIEW_PRIORITIES } from './echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import {
  REQUIRED_BLOCKING_CATEGORIES,
  REQUIRED_BLOCKING_PRIORITIES,
} from './review-invariants.ts';

export type ParsedReviewPolicy =
  | { readonly ok: true; readonly value: ReviewPolicy }
  | { readonly ok: false; readonly error: string };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function section(
  parent: Readonly<Record<string, unknown>>,
  key: keyof typeof reviewPolicySchema.properties,
): Readonly<Record<string, unknown>> {
  const value = record(parent[key], key);
  const schema = reviewPolicySchema.properties[key];
  if (!('properties' in schema)) throw new Error(`${key} has no object schema`);
  const expected = Object.keys(schema.properties);
  const actual = Object.keys(value);
  const missing = expected.filter((field) => !Object.hasOwn(value, field));
  const unknown = actual.filter((field) => !expected.includes(field));
  if (missing.length > 0) throw new Error(`${key} is missing field(s): ${missing.join(', ')}`);
  if (unknown.length > 0) throw new Error(`${key} has unknown field(s): ${unknown.join(', ')}`);
  return value;
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || Array.from(value).length > REVIEW_HARD_LIMITS.identifierCharacters
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) throw new Error(`${label} must be a stable identifier`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return Number(value);
}

function selection<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function selections<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  minimum: number,
): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > allowed.length) {
    throw new Error(`${label} must contain ${minimum}-${allowed.length} items`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error(`${label} must not contain sparse entries`);
  }
  const parsed = value.map((entry) => selection(entry, allowed, label));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contains duplicates`);
  return parsed;
}

function weights<T extends string>(
  value: unknown,
  keys: readonly T[],
  label: string,
): Readonly<Record<T, number>> {
  const input = record(value, label);
  const actual = Object.keys(input);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
    throw new Error(`${label} must define every canonical key exactly once`);
  }
  if (actual.some((key) => !keys.includes(key as T))) throw new Error(`${label} has unknown keys`);
  return Object.fromEntries(keys.map((key) => [
    key,
    integer(input[key], `${label}.${key}`, 0, REVIEW_HARD_LIMITS.rankingWeight),
  ])) as Readonly<Record<T, number>>;
}

function requireMinimum<T extends string>(actual: readonly T[], required: readonly T[], label: string): void {
  const missing = required.filter((entry) => !actual.includes(entry));
  if (missing.length > 0) throw new Error(`${label} cannot omit required value(s): ${missing.join(', ')}`);
}

function parseBlocking(input: Readonly<Record<string, unknown>>): ReviewPolicy['blocking'] {
  const blocking = section(input, 'blocking');
  const priorities = selections(blocking.priorities, REVIEW_PRIORITIES, 'blocking.priorities', 1);
  const categories = selections(blocking.categories, REVIEW_CATEGORIES, 'blocking.categories', 1);
  requireMinimum(priorities, REQUIRED_BLOCKING_PRIORITIES, 'blocking.priorities');
  requireMinimum(categories, REQUIRED_BLOCKING_CATEGORIES, 'blocking.categories');
  return {
    priorities, categories,
    requireIntroducedByDiff: boolean(blocking.requireIntroducedByDiff, 'blocking.requireIntroducedByDiff'),
    requireDirectEvidence: boolean(blocking.requireDirectEvidence, 'blocking.requireDirectEvidence'),
  };
}

function parseLimits(input: Readonly<Record<string, unknown>>): ReviewPolicy['limits'] {
  const limits = section(input, 'limits');
  return {
    maxProposals: integer(limits.maxProposals, 'limits.maxProposals', 1, REVIEW_HARD_LIMITS.proposedFindings),
    maxRootCauses: integer(limits.maxRootCauses, 'limits.maxRootCauses', 1, REVIEW_HARD_LIMITS.rootCauses),
    maxInstancesPerCluster: integer(limits.maxInstancesPerCluster, 'limits.maxInstancesPerCluster', 1, REVIEW_HARD_LIMITS.instancesPerCluster),
    maxBundleBytes: integer(limits.maxBundleBytes, 'limits.maxBundleBytes', 1024, REVIEW_HARD_LIMITS.bundleBytes),
    maxContextFiles: integer(limits.maxContextFiles, 'limits.maxContextFiles', 1, REVIEW_HARD_LIMITS.contextFiles),
    maxInitialContextFiles: integer(limits.maxInitialContextFiles, 'limits.maxInitialContextFiles', 1, REVIEW_HARD_LIMITS.contextFiles),
    maxContextFileBytes: integer(limits.maxContextFileBytes, 'limits.maxContextFileBytes', 1, REVIEW_HARD_LIMITS.contextFileBytes),
    maxContextBytes: integer(limits.maxContextBytes, 'limits.maxContextBytes', 1, REVIEW_HARD_LIMITS.bundleBytes),
    maxInitialContextBytes: integer(limits.maxInitialContextBytes, 'limits.maxInitialContextBytes', 1, REVIEW_HARD_LIMITS.bundleBytes),
    maxDependencyDepth: integer(limits.maxDependencyDepth, 'limits.maxDependencyDepth', 0, REVIEW_HARD_LIMITS.contextDependencyDepth),
    maxExpansionFiles: integer(limits.maxExpansionFiles, 'limits.maxExpansionFiles', 1, REVIEW_HARD_LIMITS.contextExpansionPaths),
    maxAdvisories: integer(limits.maxAdvisories, 'limits.maxAdvisories', 0, REVIEW_HARD_LIMITS.advisories),
  };
}

function parseScope(input: Readonly<Record<string, unknown>>): ReviewPolicy['scope'] {
  const value = section(input, 'scope');
  return { outsideScope: selection(value.outsideScope, OUTSIDE_SCOPE_ACTIONS, 'scope.outsideScope'),
    unknownScope: selection(value.unknownScope, UNKNOWN_SCOPE_ACTIONS, 'scope.unknownScope'),
    retainPreExisting: boolean(value.retainPreExisting, 'scope.retainPreExisting') };
}

function parseVerification(input: Readonly<Record<string, unknown>>): ReviewPolicy['verification'] {
  const value = section(input, 'verification');
  return { semanticVerifier: selection(value.semanticVerifier, SEMANTIC_VERIFIER_MODES, 'verification.semanticVerifier'),
    insufficientFindingEvidence: selection(value.insufficientFindingEvidence, INSUFFICIENT_FINDING_ACTIONS, 'verification.insufficientFindingEvidence'),
    unverifiedRequirement: selection(value.unverifiedRequirement, UNVERIFIED_REQUIREMENT_ACTIONS, 'verification.unverifiedRequirement') };
}

function parseSimplification(input: Readonly<Record<string, unknown>>): ReviewPolicy['simplification'] {
  const value = section(input, 'simplification');
  return { enabled: boolean(value.enabled, 'simplification.enabled'),
    registryVersion: selection(value.registryVersion, [SIMPLIFICATION_REGISTRY_VERSION], 'simplification.registryVersion'),
    enabledRules: selections(value.enabledRules, SIMPLIFICATION_RULE_IDS, 'simplification.enabledRules', 0),
    maxRecommendations: integer(value.maxRecommendations, 'simplification.maxRecommendations', 0, REVIEW_HARD_LIMITS.simplificationRecommendations),
    minimumConfidence: selection(value.minimumConfidence, SIMPLIFICATION_CONFIDENCE_LEVELS, 'simplification.minimumConfidence') };
}

function parseRanking(input: Readonly<Record<string, unknown>>): ReviewPolicy['ranking'] {
  const value = section(input, 'ranking');
  return { priorityWeights: weights(value.priorityWeights, REVIEW_PRIORITIES, 'ranking.priorityWeights'),
    categoryWeights: weights(value.categoryWeights, REVIEW_CATEGORIES, 'ranking.categoryWeights'),
    introducedByDiffBonus: integer(value.introducedByDiffBonus, 'ranking.introducedByDiffBonus', 0, REVIEW_HARD_LIMITS.rankingWeight),
    directEvidenceBonus: integer(value.directEvidenceBonus, 'ranking.directEvidenceBonus', 0, REVIEW_HARD_LIMITS.rankingWeight) };
}

function parseFollowUp(input: Readonly<Record<string, unknown>>): ReviewPolicy['followUp'] {
  const value = section(input, 'followUp');
  return { retainedPriorities: selections(value.retainedPriorities, REVIEW_PRIORITIES, 'followUp.retainedPriorities', 0),
    maxItems: integer(value.maxItems, 'followUp.maxItems', 0, REVIEW_HARD_LIMITS.followUps) };
}

function parseGovernor(input: Readonly<Record<string, unknown>>): ReviewPolicy['governor'] {
  const value = section(input, 'governor');
  return { maxRepairCycles: integer(value.maxRepairCycles, 'governor.maxRepairCycles', 0, REVIEW_HARD_LIMITS.governorRepairCycles),
    fileGrowthMultiplier: integer(value.fileGrowthMultiplier, 'governor.fileGrowthMultiplier', 1, REVIEW_HARD_LIMITS.governorMultiplier),
    nonTestLocGrowthMultiplier: integer(value.nonTestLocGrowthMultiplier, 'governor.nonTestLocGrowthMultiplier', 1, REVIEW_HARD_LIMITS.governorMultiplier),
    absoluteFileAllowance: integer(value.absoluteFileAllowance, 'governor.absoluteFileAllowance', 0, REVIEW_HARD_LIMITS.governorFileAllowance),
    absoluteNonTestLocAllowance: integer(value.absoluteNonTestLocAllowance, 'governor.absoluteNonTestLocAllowance', 0, REVIEW_HARD_LIMITS.governorLocAllowance) };
}

function parseSections(input: Readonly<Record<string, unknown>>): ReviewPolicy {
  return {
    schemaVersion: REVIEW_POLICY_SCHEMA_VERSION,
    profile: text(input.profile, 'profile'),
    blocking: parseBlocking(input),
    limits: parseLimits(input),
    scope: parseScope(input), verification: parseVerification(input),
    simplification: parseSimplification(input), ranking: parseRanking(input),
    followUp: parseFollowUp(input), governor: parseGovernor(input),
  };
}

function validateFollowUp(policy: ReviewPolicy): void {
  const usesFollowUp = [
    policy.scope.outsideScope,
    policy.scope.unknownScope,
    policy.verification.insufficientFindingEvidence,
  ].includes('follow_up');
  if (usesFollowUp && Math.min(policy.followUp.retainedPriorities.length, policy.followUp.maxItems) === 0) {
    throw new Error('follow_up actions require retained priorities and positive capacity');
  }
}

function validateSimplification(policy: ReviewPolicy): void {
  const hasCapacity = Math.min(
    policy.simplification.enabledRules.length,
    policy.simplification.maxRecommendations,
  ) > 0;
  const configured = policy.simplification.enabledRules.length + policy.simplification.maxRecommendations > 0;
  if (policy.simplification.enabled && !hasCapacity) {
    throw new Error('enabled Simplification policy requires rules and positive recommendation capacity');
  }
  if (!policy.simplification.enabled && configured) {
    throw new Error('disabled Simplification policy requires no rules and zero recommendations');
  }
}

function validateContextLimits(policy: ReviewPolicy): void {
  if (policy.limits.maxContextBytes > policy.limits.maxBundleBytes) {
    throw new Error('limits.maxContextBytes cannot exceed limits.maxBundleBytes');
  }
  if (policy.limits.maxContextFileBytes > policy.limits.maxContextBytes) {
    throw new Error('limits.maxContextFileBytes cannot exceed limits.maxContextBytes');
  }
  if (policy.limits.maxInitialContextFiles >= policy.limits.maxContextFiles) {
    throw new Error('limits.maxInitialContextFiles must leave total file capacity for expansion');
  }
  if (policy.limits.maxInitialContextBytes >= policy.limits.maxContextBytes) {
    throw new Error('limits.maxInitialContextBytes must leave total byte capacity for expansion');
  }
}

function parse(value: unknown): ReviewPolicy {
  const input = record(value, 'review policy');
  const expected = Object.keys(reviewPolicySchema.properties);
  const actual = Object.keys(input);
  const missing = expected.filter((field) => !Object.hasOwn(input, field));
  const unknown = actual.filter((field) => !expected.includes(field));
  if (missing.length > 0) throw new Error(`review policy is missing field(s): ${missing.join(', ')}`);
  if (unknown.length > 0) throw new Error(`review policy has unknown field(s): ${unknown.join(', ')}`);
  if (input.schemaVersion !== REVIEW_POLICY_SCHEMA_VERSION) throw new Error('review policy schemaVersion is invalid');
  const policy = parseSections(input);
  validateFollowUp(policy);
  validateSimplification(policy);
  validateContextLimits(policy);
  return deepFreeze(policy);
}

export function parseReviewPolicy(value: unknown): ParsedReviewPolicy {
  try { return { ok: true, value: parse(value) }; } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
