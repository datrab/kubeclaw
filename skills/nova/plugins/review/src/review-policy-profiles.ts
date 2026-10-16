import type {ReviewPolicy} from './review-policy-contract.ts';
import {parseReviewPolicy} from './review-policy-parser.ts';
import {getReviewPolicyProfile as legacyProfile} from './legacy-review-policy-profiles.ts';
export {REVIEW_POLICY_PROFILE_IDS, REVIEW_POLICY_PROFILES} from './legacy-review-policy-profiles.ts';
export type {ReviewPolicyProfileId} from './legacy-review-policy-profiles.ts';

/** Original callers keep their pinned builtin generation. The selected path
 * receives the complete original owner snapshot and never reads a live file. */
export function getReviewPolicyProfile(profile: string, owned?: unknown): ReviewPolicy {
  if (owned === undefined) return legacyProfile(profile);
  if (!owned || typeof owned !== 'object' || Array.isArray(owned)
    || Object.keys(owned).sort().join(',') !== 'profiles,schemaVersion') throw new Error('REVIEW_OWNED_POLICY_INVALID');
  const value=owned as Record<string,unknown>;
  if(value.schemaVersion!=='review-owned-decision-profiles.v1' || !value.profiles || typeof value.profiles!=='object' || Array.isArray(value.profiles)
    || Object.keys(value.profiles).sort().join(',')!=='audit,gate,lean')throw new Error('REVIEW_OWNED_POLICY_INVALID');
  const profiles=value.profiles as Record<string,unknown>;
  const parsed=new Map<string,ReviewPolicy>();
  for(const name of ['gate','lean','audit']) {
    const result=parseReviewPolicy(profiles[name]);
    if(!result.ok || result.value.profile!==name)throw new Error(`REVIEW_OWNED_POLICY_INVALID:${name}`);
    parsed.set(name,result.value);
  }
  if(!parsed.has(profile))throw new Error(`unknown review policy profile: ${profile}`);
  return parsed.get(profile)!;
}
