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
    || !['profiles,schemaVersion','profiles,repositoryGrades,schemaVersion','profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion','cacheReadConcurrency,profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion','cacheReadConcurrency,profiles,promptTokenBoundaryReserve,repositoryGrades,revalidation,schemaVersion'].includes(Object.keys(owned).sort().join(','))) throw new Error('REVIEW_OWNED_POLICY_INVALID');
  const value=owned as Record<string,unknown>;
  if(!['review-owned-decision-profiles.v1','review-owned-decision-profiles.v2','review-owned-decision-profiles.v3','review-owned-decision-profiles.v4','review-owned-decision-profiles.v5'].includes(String(value.schemaVersion)) || !value.profiles || typeof value.profiles!=='object' || Array.isArray(value.profiles)
    || Object.keys(value.profiles).sort().join(',')!=='audit,gate,lean')throw new Error('REVIEW_OWNED_POLICY_INVALID');
  const reserveVersion=['review-owned-decision-profiles.v3','review-owned-decision-profiles.v4','review-owned-decision-profiles.v5'].includes(String(value.schemaVersion));
  const v5=value.schemaVersion==='review-owned-decision-profiles.v5';
  const v4=v5 || value.schemaVersion==='review-owned-decision-profiles.v4';
  const keys=v5?'cacheReadConcurrency,profiles,promptTokenBoundaryReserve,repositoryGrades,revalidation,schemaVersion':v4?'cacheReadConcurrency,profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion':'profiles,promptTokenBoundaryReserve,repositoryGrades,schemaVersion';
  if(reserveVersion && (Object.keys(value).sort().join(',')!==keys || !Number.isSafeInteger(value.promptTokenBoundaryReserve) || Number(value.promptTokenBoundaryReserve)<0 || Number(value.promptTokenBoundaryReserve)>1_000_000))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(!reserveVersion && Object.hasOwn(value,'promptTokenBoundaryReserve'))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(v4 && (!Number.isSafeInteger(value.cacheReadConcurrency) || Number(value.cacheReadConcurrency)<1 || Number(value.cacheReadConcurrency)>1024))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(!v4 && Object.hasOwn(value,'cacheReadConcurrency'))throw new Error('REVIEW_OWNED_POLICY_INVALID');
  if(v5) validateRevalidationLimits(value.revalidation);
  if(!v5 && Object.hasOwn(value,'revalidation'))throw new Error('REVIEW_OWNED_POLICY_INVALID');
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
  return ['review-owned-decision-profiles.v4','review-owned-decision-profiles.v5'].includes(String(owned?.schemaVersion)) ? Number(owned!.cacheReadConcurrency) : 16;
}

export interface ReviewRevalidationLimits {
  readonly maximumBaselineBytes: number;
  readonly maximumBaselineRelations: number;
}
function validateRevalidationLimits(raw: unknown): ReviewRevalidationLimits {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('REVIEW_REVALIDATION_LIMITS_INVALID');
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'maximumBaselineBytes,maximumBaselineRelations'
    || !Number.isSafeInteger(value.maximumBaselineBytes) || Number(value.maximumBaselineBytes) < 1 || Number(value.maximumBaselineBytes) > 134217728
    || !Number.isSafeInteger(value.maximumBaselineRelations) || Number(value.maximumBaselineRelations) < 1 || Number(value.maximumBaselineRelations) > 100000) {
    throw new Error('REVIEW_REVALIDATION_LIMITS_INVALID');
  }
  return Object.freeze({ maximumBaselineBytes: Number(value.maximumBaselineBytes), maximumBaselineRelations: Number(value.maximumBaselineRelations) });
}
/** Retained v1-v4 owners keep their original codec, never the live v5 author. */
export function selectedReviewRevalidationLimits(config: Readonly<Record<string, unknown>>): ReviewRevalidationLimits {
  const owned = config.ownedPolicyProfiles as Record<string, unknown> | undefined;
  if (owned !== undefined) getReviewPolicyProfile('gate', owned);
  return owned?.schemaVersion === 'review-owned-decision-profiles.v5'
    ? validateRevalidationLimits(owned.revalidation)
    : Object.freeze({ maximumBaselineBytes: 134217728, maximumBaselineRelations: 100000 });
}
