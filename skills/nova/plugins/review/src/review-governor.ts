import { canonicalJson, sha256Text, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { readChangedLineRanges, type FrozenReviewRevision } from './review-repository.ts';
import type { ReviewStageInput } from './review-stage-input.ts';
import { compareCodeUnits } from './review-ordering.ts';

export const REVIEW_GOVERNOR_SCHEMA_VERSION = 'review-governor.v1' as const;
export const REVIEW_GOVERNOR_DECISIONS = [
  'within_scope', 'cycle_exhausted', 'file_growth', 'non_test_loc_growth', 'ownership_crossing', 'invalid_state',
] as const;
export class ReviewGovernorIntegrityError extends Error {}
export type ReviewGovernorDecision = typeof REVIEW_GOVERNOR_DECISIONS[number];

export interface ReviewGovernorBaseline {
  readonly base: string;
  readonly head: string;
  readonly changedManifestDigest: `sha256:${string}`;
  readonly policyDigest: `sha256:${string}`;
  readonly allowedPrefixes: readonly string[];
  readonly ownershipPrefixes: readonly string[];
  readonly changedFileCount: number;
  readonly nonTestLoc: number;
  readonly ownerKeys: readonly string[];
}

export interface ReviewGovernorCurrent {
  readonly head: string;
  readonly changedManifestDigest: `sha256:${string}`;
  readonly remediationCyclesUsed: number;
  readonly changedFileCount: number;
  readonly nonTestLoc: number;
  readonly ownerKeys: readonly string[];
  readonly outsideOwnershipPaths: readonly string[];
  readonly fileLimit: number;
  readonly nonTestLocLimit: number;
}

export interface ReviewGovernorSnapshot {
  readonly schemaVersion: typeof REVIEW_GOVERNOR_SCHEMA_VERSION;
  readonly baselineId: `sha256:${string}`;
  readonly baseline: ReviewGovernorBaseline;
  readonly current: ReviewGovernorCurrent;
  readonly decision: ReviewGovernorDecision;
}

function isTestPath(path: string): boolean {
  const segments = path.split('/');
  const file = segments.at(-1) ?? '';
  return segments.some((segment) => ['test', 'tests', '__tests__'].includes(segment))
    || file.includes('.test.') || file.includes('.spec.');
}

function within(path: string, prefix: string): boolean {
  return prefix === '.' || path === prefix || path.startsWith(`${prefix}/`);
}

function owner(path: string, prefixes: readonly string[]): string | undefined {
  return [...prefixes].filter((prefix) => within(path, prefix))
    .sort((left, right) => right.length - left.length || compareCodeUnits(left, right))[0];
}

function safeLimit(baseline: number, multiplier: number, allowance: number): number {
  return Math.max(baseline * multiplier, baseline + allowance);
}

function decision(
  baseline: ReviewGovernorBaseline, current: Omit<ReviewGovernorCurrent, 'fileLimit' | 'nonTestLocLimit'>,
  policy: ResolvedReviewPolicy,
): ReviewGovernorSnapshot['decision'] {
  const governor = policy.policy.governor;
  if (current.outsideOwnershipPaths.length > 0
    || current.ownerKeys.some((key) => !baseline.ownerKeys.includes(key))) return 'ownership_crossing';
  if (current.changedFileCount > safeLimit(
    baseline.changedFileCount, governor.fileGrowthMultiplier, governor.absoluteFileAllowance,
  )) return 'file_growth';
  if (current.nonTestLoc > safeLimit(
    baseline.nonTestLoc, governor.nonTestLocGrowthMultiplier, governor.absoluteNonTestLocAllowance,
  )) return 'non_test_loc_growth';
  if (current.remediationCyclesUsed >= governor.maxRepairCycles) return 'cycle_exhausted';
  return 'within_scope';
}

async function metrics(
  input: ReviewStageInput, snapshot: ReviewBundleSnapshot, revision: FrozenReviewRevision,
  context: PluginInvocationContext,
): Promise<Omit<ReviewGovernorCurrent, 'remediationCyclesUsed' | 'fileLimit' | 'nonTestLocLimit'>> {
  const paths = snapshot.bundle.scope.changedPaths.map(({ path }) => path).sort();
  const nonTestPaths = snapshot.bundle.scope.changedPaths
    .filter(({ path, status }) => status !== 'deleted' && !isTestPath(path)).map(({ path }) => path).sort();
  const ranges = await readChangedLineRanges(input.revisions.base, revision, nonTestPaths, context);
  const nonTestLoc = [...ranges.values()].flat().reduce((total, range) => total + range.end - range.start + 1, 0);
  const ownership = paths.map((path) => [path, owner(path, input.scope.ownershipPrefixes)] as const);
  return {
    head: snapshot.bundle.revisions.head,
    changedManifestDigest: snapshot.bundle.revisions.changedManifestDigest,
    changedFileCount: paths.length,
    nonTestLoc,
    ownerKeys: [...new Set(ownership.flatMap(([, key]) => key === undefined ? [] : [key]))].sort(),
    outsideOwnershipPaths: ownership.flatMap(([path, key]) => key === undefined ? [path] : []).sort(),
  };
}

function requiredLifecycle(context: PluginInvocationContext) {
  const lifecycle = context.contract.stageLifecycle;
  if (!lifecycle) throw new ReviewGovernorIntegrityError('review governor requires certified lifecycle state');
  return lifecycle;
}

export async function buildReviewGovernorSnapshot(values: {
  readonly input: ReviewStageInput;
  readonly snapshot: ReviewBundleSnapshot;
  readonly revision: FrozenReviewRevision;
  readonly policy: ResolvedReviewPolicy;
  readonly context: PluginInvocationContext;
  readonly baseline?: ReviewGovernorBaseline;
}): Promise<ReviewGovernorSnapshot> {
  const lifecycle = requiredLifecycle(values.context);
  const measured = await metrics(values.input, values.snapshot, values.revision, values.context);
  const baseline = values.baseline ?? Object.freeze({
    base: values.snapshot.bundle.revisions.base,
    head: measured.head,
    changedManifestDigest: measured.changedManifestDigest,
    policyDigest: values.policy.digest,
    allowedPrefixes: [...values.input.scope.allowedPrefixes].sort(),
    ownershipPrefixes: [...values.input.scope.ownershipPrefixes].sort(),
    changedFileCount: measured.changedFileCount,
    nonTestLoc: measured.nonTestLoc,
    ownerKeys: measured.ownerKeys,
  });
  if (baseline.base !== values.snapshot.bundle.revisions.base || baseline.policyDigest !== values.policy.digest
    || canonicalJson(baseline.allowedPrefixes) !== canonicalJson([...values.input.scope.allowedPrefixes].sort())
    || canonicalJson(baseline.ownershipPrefixes) !== canonicalJson([...values.input.scope.ownershipPrefixes].sort())) {
    throw new ReviewGovernorIntegrityError('review governor baseline does not match the current frozen authority');
  }
  const currentWithoutLimits = { ...measured, remediationCyclesUsed: lifecycle.remediationCyclesUsed };
  const current = Object.freeze({
    ...currentWithoutLimits,
    fileLimit: safeLimit(baseline.changedFileCount, values.policy.policy.governor.fileGrowthMultiplier,
      values.policy.policy.governor.absoluteFileAllowance),
    nonTestLocLimit: safeLimit(baseline.nonTestLoc, values.policy.policy.governor.nonTestLocGrowthMultiplier,
      values.policy.policy.governor.absoluteNonTestLocAllowance),
  });
  return Object.freeze({
    schemaVersion: REVIEW_GOVERNOR_SCHEMA_VERSION,
    baselineId: sha256Text(canonicalJson({ schemaVersion: REVIEW_GOVERNOR_SCHEMA_VERSION, baseline })),
    baseline, current, decision: decision(baseline, currentWithoutLimits, values.policy),
  });
}

export function buildInvalidReviewGovernorSnapshot(values: {
  readonly input: ReviewStageInput;
  readonly snapshot: ReviewBundleSnapshot;
  readonly policy: ResolvedReviewPolicy;
  readonly context: PluginInvocationContext;
}): ReviewGovernorSnapshot {
  const lifecycle = values.context.contract.stageLifecycle;
  const paths = values.snapshot.bundle.scope.changedPaths.map(({ path }) => path).sort();
  const owners = paths.map((path) => owner(path, values.input.scope.ownershipPrefixes));
  const ownerKeys = [...new Set(owners.flatMap((key) => key === undefined ? [] : [key]))].sort();
  const baseline = Object.freeze({
    base: values.snapshot.bundle.revisions.base, head: values.snapshot.bundle.revisions.head,
    changedManifestDigest: values.snapshot.bundle.revisions.changedManifestDigest,
    policyDigest: values.policy.digest, allowedPrefixes: [...values.input.scope.allowedPrefixes].sort(),
    ownershipPrefixes: [...values.input.scope.ownershipPrefixes].sort(), changedFileCount: paths.length,
    nonTestLoc: 0, ownerKeys,
  });
  return Object.freeze({
    schemaVersion: REVIEW_GOVERNOR_SCHEMA_VERSION,
    baselineId: sha256Text(canonicalJson({ schemaVersion: REVIEW_GOVERNOR_SCHEMA_VERSION, baseline })),
    baseline,
    current: Object.freeze({
      head: values.snapshot.bundle.revisions.head,
      changedManifestDigest: values.snapshot.bundle.revisions.changedManifestDigest,
      remediationCyclesUsed: lifecycle?.remediationCyclesUsed ?? 0,
      changedFileCount: paths.length, nonTestLoc: 0, ownerKeys,
      outsideOwnershipPaths: paths.filter((path) => owner(path, values.input.scope.ownershipPrefixes) === undefined),
      fileLimit: paths.length, nonTestLocLimit: 0,
    }),
    decision: 'invalid_state',
  });
}
