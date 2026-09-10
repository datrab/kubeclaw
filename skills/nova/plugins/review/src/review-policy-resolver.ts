import { portableJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { assertReviewSemanticEncoding, reviewSemanticJson, REVIEW_SEMANTIC_ENCODING,
  PORTABLE_REVIEW_BUNDLE_VERSION, type ReviewSemanticEncoding } from './review-semantics.ts';

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

interface PolicyProof {
  readonly encoding: ReviewSemanticEncoding | undefined;
  readonly candidates: readonly (readonly [ReviewPolicySourceKind, ReviewPolicy])[];
}
const RESOLVER_OWNED_POLICIES = new WeakMap<object, PolicyProof>();

export function digestReviewPolicy(value: ReviewPolicy, encoding?: ReviewSemanticEncoding): `sha256:${string}` {
  portableJson(value);
  return sha256Text(reviewSemanticJson(value, encoding));
}

function validated(value: unknown, kind: ReviewPolicySourceKind): ReviewPolicy {
  portableJson(value);
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

export function resolveReviewPolicy(input: ResolveReviewPolicyInput, encoding?: ReviewSemanticEncoding): ResolvedReviewPolicy {
  assertReviewSemanticEncoding(encoding);
  portableJson(input);
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
    digest: digestReviewPolicy(policy, encoding),
    selectedSource,
    sources: candidates.map(([kind, sourcePolicy]) => ({
      kind, digest: digestReviewPolicy(sourcePolicy, encoding),
    })),
  });
  RESOLVER_OWNED_POLICIES.set(resolved, deepFreeze({ encoding, candidates }));
  return resolved;
}

export function isResolvedReviewPolicy(value: unknown): value is ResolvedReviewPolicy {
  return Boolean(value && typeof value === 'object' && RESOLVER_OWNED_POLICIES.has(value));
}

/** Verification requires an independent expected owner mode; no public marker is authority. */
export function isVerifiedReviewPolicy(value: unknown, encoding?: ReviewSemanticEncoding): value is ResolvedReviewPolicy {
  assertReviewSemanticEncoding(encoding);
  if (!isResolvedReviewPolicy(value)) return false;
  const proof = RESOLVER_OWNED_POLICIES.get(value);
  if (!proof || proof.encoding !== encoding || !Object.isFrozen(value) || !Object.isFrozen(value.policy)) return false;
  const selected = proof.candidates.at(-1);
  return selected?.[0] === value.selectedSource && selected[1] === value.policy
    && digestReviewPolicy(value.policy, encoding) === value.digest
    && value.sources.length === proof.candidates.length
    && proof.candidates.every(([kind, policy], index) => value.sources[index]?.kind === kind
      && value.sources[index]?.digest === digestReviewPolicy(policy, encoding));
}

export function assertVerifiedReviewPolicy(value: unknown, encoding?: ReviewSemanticEncoding): asserts value is ResolvedReviewPolicy {
  if (!isVerifiedReviewPolicy(value, encoding)) throw new Error('REVIEW_POLICY_OWNER_MODE_MISMATCH');
}

/** Persisted bundle version is a reader contract, never an authorization to create a new policy. */
export function assertReviewPolicyBundle(policy: ResolvedReviewPolicy, bundle: unknown): ReviewSemanticEncoding | undefined {
  portableJson(bundle);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('REVIEW_BUNDLE_VERSION_INVALID');
  const record = bundle as Record<string, unknown>;
  const version = record.schemaVersion;
  if (Object.hasOwn(record, 'schemaVersion') && version !== 'review-bundle.v1' && version !== PORTABLE_REVIEW_BUNDLE_VERSION) {
    throw new Error('REVIEW_BUNDLE_VERSION_INVALID');
  }
  const encoding = version === PORTABLE_REVIEW_BUNDLE_VERSION ? REVIEW_SEMANTIC_ENCODING : undefined;
  assertVerifiedReviewPolicy(policy, encoding);
  if ((encoding !== undefined || Object.hasOwn(record, 'policyDigest')) && record.policyDigest !== policy.digest) {
    throw new Error('REVIEW_BUNDLE_POLICY_DIGEST_MISMATCH');
  }
  return encoding;
}
