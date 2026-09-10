import { CURRENT_REVIEW_CACHE_PROFILE, type ReviewCacheProfile } from './generated/contracts.ts';
import { portableJson } from './values.ts';

const PROFILE_BYTES = portableJson(CURRENT_REVIEW_CACHE_PROFILE);

/** One generated canonical profile; unrelated transport/evidence versions imply nothing. */
export function parseReviewCacheProfile(value: unknown): ReviewCacheProfile {
  if (portableJson(value) !== PROFILE_BYTES) throw new Error('REVIEW_CACHE_PROFILE_INVALID');
  return CURRENT_REVIEW_CACHE_PROFILE;
}

/** Historical absence is explicit; a present undefined/malformed profile is never legacy. */
export function reviewCacheProfileFromContext(contract: object): ReviewCacheProfile | undefined {
  if (!Object.hasOwn(contract, 'reviewCacheProfile')) return undefined;
  portableJson(contract);
  return parseReviewCacheProfile((contract as { reviewCacheProfile: unknown }).reviewCacheProfile);
}
