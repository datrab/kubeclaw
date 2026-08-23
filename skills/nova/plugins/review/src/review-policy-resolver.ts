import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewPolicy } from './review-policy-contract.ts';
import { parseReviewPolicy } from './review-policy-parser.ts';

export const REVIEW_POLICY_SOURCE_KINDS = [
  'built_in', 'settings_file', 'run_override',
] as const;
export type ReviewPolicySourceKind = typeof REVIEW_POLICY_SOURCE_KINDS[number];

export interface ReviewPolicySourceProvenance {
  readonly kind: ReviewPolicySourceKind;
  readonly digest: `sha256:${string}`;
}

export interface ResolvedReviewPolicy {
  readonly policy: ReviewPolicy;
  readonly digest: `sha256:${string}`;
  readonly selectedSource: ReviewPolicySourceKind;
  readonly sources: readonly ReviewPolicySourceProvenance[];
}

export interface ResolveReviewPolicyInput {
  readonly builtIn: unknown;
  readonly settingsFile?: unknown;
  readonly runOverride?: {
    readonly authorized: boolean;
    readonly policy: unknown;
  };
}

const RESOLVER_OWNED_POLICIES = new WeakSet<object>();

export function digestReviewPolicy(value: ReviewPolicy): `sha256:${string}` {
  return sha256Text(canonicalJson(value));
}

function validated(value: unknown, kind: ReviewPolicySourceKind): ReviewPolicy {
  const parsed = parseReviewPolicy(value);
  if (!parsed.ok) throw new Error(`${kind} review policy is invalid: ${parsed.error}`);
  return parsed.value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function resolveReviewPolicy(input: ResolveReviewPolicyInput): ResolvedReviewPolicy {
  const candidates: Array<readonly [ReviewPolicySourceKind, ReviewPolicy]> = [
    ['built_in', validated(input.builtIn, 'built_in')],
  ];
  if (input.settingsFile !== undefined) {
    candidates.push(['settings_file', validated(input.settingsFile, 'settings_file')]);
  }
  if (input.runOverride !== undefined) {
    if (input.runOverride.authorized !== true) {
      throw new Error('run_override review policy is not authorized');
    }
    candidates.push(['run_override', validated(input.runOverride.policy, 'run_override')]);
  }
  const selected = candidates.at(-1);
  if (!selected) throw new Error('built_in review policy is required');
  const [selectedSource, policy] = selected;
  const resolved = deepFreeze({
    policy,
    digest: digestReviewPolicy(policy),
    selectedSource,
    sources: candidates.map(([kind, sourcePolicy]) => ({
      kind, digest: digestReviewPolicy(sourcePolicy),
    })),
  });
  RESOLVER_OWNED_POLICIES.add(resolved);
  return resolved;
}

export function isResolvedReviewPolicy(value: unknown): value is ResolvedReviewPolicy {
  return Boolean(value && typeof value === 'object' && RESOLVER_OWNED_POLICIES.has(value));
}
