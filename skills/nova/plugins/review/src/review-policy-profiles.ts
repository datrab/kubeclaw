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
    || !['profiles,schemaVersion','profiles,repositoryGrades,schemaVersion','profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion','cacheReadConcurrency,profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion'].includes(Object.keys(owned).sort().join(','))) throw new Error('REVIEW_OWNED_POLICY_INVALID');
  const value=owned as Record<string,unknown>;
  if(!['review-owned-decision-profiles.v1','review-owned-decision-profiles.v2','review-owned-decision-profiles.v3','review-owned-decision-profiles.v4'].includes(String(value.schemaVersion)) || !value.profiles || typeof value.profiles!=='object' || Array.isArray(value.profiles)
    || Object.keys(value.profiles).sort().join(',')!=='audit,gate,lean')throw new Error('REVIEW_OWNED_POLICY_INVALID');
  const reserveVersion=['review-owned-decision-profiles.v3','review-owned-decision-profiles.v4'].includes(String(value.schemaVersion));
  const v4=value.schemaVersion==='review-owned-decision-profiles.v4';
  const keys=v4?'cacheReadConcurrency,profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion':'profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion';
  if(reserveVersion && (Object.keys(value).sort().join(',')!==keys || !Number.isSafeInteger(value.promptTokenBoundaryReserve) || Number(value.promptTokenBoundaryReserve)<0 || Number(value.promptTokenBoundaryReserve)>1_000_000))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(!reserveVersion && Object.hasOwn(value,'promptTokenBoundaryReserve'))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(v4 && (!Number.isSafeInteger(value.cacheReadConcurrency) || Number(value.cacheReadConcurrency)<1 || Number(value.cacheReadConcurrency)>1024))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(!v4 && Object.hasOwn(value,'cacheReadConcurrency'))throw new Error('REVIEW_OWNED_POLICY_INVALID');
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

/** Historical captures keep the original operational limit, never the current author. */
export function selectedReviewCacheReadConcurrency(config: Readonly<Record<string, unknown>>): number {
  const owned = config.ownedPolicyProfiles as Record<string, unknown> | undefined;
  if (owned !== undefined) getReviewPolicyProfile('gate', owned);
  return owned?.schemaVersion === 'review-owned-decision-profiles.v4' ? Number(owned.cacheReadConcurrency) : 16;
}
