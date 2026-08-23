import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

export function makeReviewGovernor(
  digest = `sha256:${'a'.repeat(64)}`, decision = 'within_scope', policyDigest = digest,
) {
  const baseline = {
    base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: digest, policyDigest,
    allowedPrefixes: ['src'], ownershipPrefixes: ['src'], changedFileCount: 1, nonTestLoc: 1, ownerKeys: ['src'],
  };
  return {
    schemaVersion: 'review-governor.v1',
    baselineId: sha256Text(canonicalJson({ schemaVersion: 'review-governor.v1', baseline })), decision, baseline,
    current: {
      head: '2'.repeat(40), changedManifestDigest: digest, remediationCyclesUsed: 0,
      changedFileCount: 1, nonTestLoc: 1, ownerKeys: ['src'], outsideOwnershipPaths: [], fileLimit: 3, nonTestLocLimit: 101,
    },
  };
}
