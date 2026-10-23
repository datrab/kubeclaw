import {portableJson} from '@kubeclaw/plugin-sdk';
import {parseReviewPolicy} from './review-policy-parser.ts';
import {REVIEW_POLICY_SCHEMA_VERSION,SIMPLIFICATION_REGISTRY_VERSION} from './review-policy-contract.ts';

/** Local projection from approved Batch07 OWNER-BRIDGE, NOT an owned-profile
 * resolver or authenticated source/caller/R admission. No file/Latest lookup,
 * inline-policy fallback, WeakMap proof, dispatch or historical migration.
 */
export function projectReviewPolicyAuthorCandidate(value:unknown) {
  // Original SDK JSON domain, copied before projection; caller values are not
  // modified/frozen. Matching local bytes never establishes source authority.
  const author=JSON.parse(portableJson(value)) as Record<string,any>;
  if(!author||typeof author!=='object'||Array.isArray(author)
    ||author.authorSchemaVersion!=='review-policy-author.v1'
    ||author.wireSchemaVersion!==REVIEW_POLICY_SCHEMA_VERSION
    ||author.simplificationRegistryVersion!==SIMPLIFICATION_REGISTRY_VERSION) {
    throw new Error('CONFIG_REVIEW_POLICY_VERSION');
  }
  // The wire header is generated below. Do not silently overwrite a forbidden
  // authored field before the original strict parser can see it.
  if(Object.hasOwn(author,'schemaVersion'))throw new Error('CONFIG_UNUSED_POLICY:/schemaVersion');
  const branch=author.simplification;
  if(!branch||typeof branch!=='object'||Array.isArray(branch))throw new Error('CONFIG_REVIEW_POLICY_SIMPLIFICATION_REQUIRED');
  let simplification:unknown;
  if(branch.mode==='disabled') {
    if(Object.keys(branch).some(key=>key!=='mode'))throw new Error('CONFIG_UNUSED_POLICY:/simplification');
    // Exact version-pinned INACTIVE v2 protocol tuple from OWNER-BRIDGE.
    // Not a configurable fallback or normalization of historical policies.
    simplification={enabled:false,registryVersion:SIMPLIFICATION_REGISTRY_VERSION,
      enabledRules:[],maxRecommendations:0,minimumConfidence:'high'};
  } else if(branch.mode==='enabled') {
    const keys=['mode','enabledRules','maxRecommendations','minimumConfidence'];
    if(Object.keys(branch).some(key=>!keys.includes(key)))throw new Error('CONFIG_UNUSED_POLICY:/simplification');
    if(keys.some(key=>!Object.hasOwn(branch,key)))throw new Error('CONFIG_REVIEW_POLICY_SIMPLIFICATION_REQUIRED');
    simplification={enabled:true,registryVersion:SIMPLIFICATION_REGISTRY_VERSION,enabledRules:branch.enabledRules,
      maxRecommendations:branch.maxRecommendations,minimumConfidence:branch.minimumConfidence};
  } else throw new Error('CONFIG_REVIEW_POLICY_SIMPLIFICATION_REQUIRED');
  const {authorSchemaVersion,wireSchemaVersion,simplificationRegistryVersion,...rest}=author;
  const parsed=parseReviewPolicy({...rest,schemaVersion:wireSchemaVersion,simplification});
  if(!parsed.ok)throw new Error(`CONFIG_REVIEW_POLICY_INVALID:${parsed.error}`);
  return Object.freeze({policy:parsed.value,sourceAuthorizationVerified:false as const,originalRunAuthorizationVerified:false as const,
    callerAuthorizationVerified:false as const,originalAuthorizationVerified:false as const,activationAllowed:false as const});
}
