import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewBundleScope } from './review-bundle-contract.ts';
import type { ReviewLimitPolicy } from './review-policy-contract.ts';
import {
  isResolvedReviewPolicy,
  type ResolvedReviewPolicy,
} from './review-policy-resolver.ts';

export interface ReviewContextAuthority {
  readonly limits: ReviewLimitPolicy;
  readonly limitDigest: `sha256:${string}`;
  readonly policyDigest: `sha256:${string}`;
  readonly scopeDigest: `sha256:${string}`;
}

interface SelectionAuthorityRef extends Omit<ReviewContextAuthority, 'limits'> {
  readonly expansionRound: 0 | 1;
}

export function resolveReviewContextAuthority(
  scope: ReviewBundleScope,
  resolvedPolicy: ResolvedReviewPolicy,
): ReviewContextAuthority {
  if (!isResolvedReviewPolicy(resolvedPolicy)) throw new Error('resolved review policy is not trusted');
  return Object.freeze({
    limits: resolvedPolicy.policy.limits,
    limitDigest: sha256Text(canonicalJson(resolvedPolicy.policy.limits)),
    policyDigest: resolvedPolicy.digest,
    scopeDigest: sha256Text(canonicalJson(scope)),
  });
}

export function createReviewContextAuthorityController() {
  const owned = new WeakSet<object>();
  const consumed = new WeakSet<object>();
  return Object.freeze({
    certify<T extends object>(selection: T): T {
      owned.add(selection);
      return selection;
    },
    assertExpansion(initial: SelectionAuthorityRef, authority: ReviewContextAuthority): void {
      if (!owned.has(initial) || initial.expansionRound !== 0) {
        throw new Error('context expansion requires an owned initial selection');
      }
      if (consumed.has(initial)) throw new Error('initial context selection was already consumed');
      if (authority.policyDigest !== initial.policyDigest) throw new Error('resolved review policy changed after initial selection');
      if (authority.scopeDigest !== initial.scopeDigest) throw new Error('review scope changed after initial selection');
      if (authority.limitDigest !== initial.limitDigest) throw new Error('review context limits changed after initial selection');
    },
    consume(initial: object): void { consumed.add(initial); },
  });
}
