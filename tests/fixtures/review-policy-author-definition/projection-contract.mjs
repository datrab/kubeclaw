// C0 target-definition executable projection ONLY. Not production code or a live resolver.
// Full authored branches are validated before this function by the proposal schema.
export function projectOwnedReviewPolicy(author) {
  if(author.authorSchemaVersion!=='review-policy-author.v1'||author.wireSchemaVersion!=='review-policy.v2'||author.simplificationRegistryVersion!=='simplification-rules.v1')throw Error('CONFIG_REVIEW_POLICY_VERSION');
  const branches=author.simplification;
  let simplification;
  if(branches.mode==='disabled'){
    if(Object.keys(branches).some(k=>k!=='mode'))throw Error('CONFIG_UNUSED_POLICY:/simplification');
    // Version-pinned legacy inactive projection, never configurable fallback:
    // disabled v2 parser requires these keys; no reader applies confidence/rules while disabled.
    simplification={enabled:false,registryVersion:author.simplificationRegistryVersion,enabledRules:[],maxRecommendations:0,minimumConfidence:'high'};
  }else if(branches.mode==='enabled'){
    for(const key of ['enabledRules','maxRecommendations','minimumConfidence'])if(!Object.hasOwn(branches,key))throw Error('CONFIG_PROFILE_MISSING:/simplification/'+key);
    if(Object.keys(branches).some(k=>!['mode','enabledRules','maxRecommendations','minimumConfidence'].includes(k)))throw Error('CONFIG_UNUSED_POLICY:/simplification');
    simplification={enabled:true,registryVersion:author.simplificationRegistryVersion,enabledRules:branches.enabledRules,maxRecommendations:branches.maxRecommendations,minimumConfidence:branches.minimumConfidence};
  }else throw Error('CONFIG_PROFILE_MISSING:/simplification/mode');
  const {authorSchemaVersion,wireSchemaVersion,simplificationRegistryVersion,...rest}=author;
  return {...rest,schemaVersion:wireSchemaVersion,simplification};
}
