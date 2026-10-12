import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { REVIEW_CLUSTER_SCHEMA_VERSION } from './review-cluster-contract.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import { isCertifiedVerifiedRootCause } from './review-verified-findings.ts';

export function reviewClusterId(
  repositoryBase: string,
  finding: VerifiedReviewFinding,
): `sha256:${string}` {
  const cause = isCertifiedVerifiedRootCause(finding.rootCause, finding.category, finding.fingerprint)
    ? finding.rootCause : undefined;
  if (!cause?.sharedHint) {
    return sha256Text(canonicalJson({
      version: REVIEW_CLUSTER_SCHEMA_VERSION,
      repositoryBase,
      singletonFinding: finding.fingerprint,
    }));
  }
  return sha256Text(canonicalJson({
    version: REVIEW_CLUSTER_SCHEMA_VERSION,
    repositoryBase,
    category: cause.category,
    sharedHint: cause.sharedHint,
    primaryPath: cause.primaryPath,
    ...(cause.primarySymbol === undefined ? {} : { primarySymbol: cause.primarySymbol }),
    repairClass: cause.repairClass,
  }));
}
