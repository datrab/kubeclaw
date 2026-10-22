const integer=(minimum:number,maximum:number)=>({type:'integer',minimum,maximum});
const budget={type:'object',additionalProperties:false,required:['maxFiles','maxBytes','maxTokens'],properties:{maxFiles:integer(1,10000),maxBytes:integer(1,100000000),maxTokens:integer(1,100000000)}};
const boundary={...budget,required:[...budget.required,'maxRelations','maxSlices'],properties:{...budget.properties,maxRelations:integer(1,100000),maxSlices:integer(1,10000)}};
const properties={componentBudget:budget,boundaryBudget:boundary,
 ...Object.fromEntries(['maxPrimaryJobs','maxContextExpansionJobs','maxVerificationJobs'].map(k=>[k,integer(1,10000)])),
 ...Object.fromEntries(['maxInputTokensPerJob','maxContextTokensPerJob','maxPromptBytesPerJob'].map(k=>[k,integer(1,100000000)])),
 ...Object.fromEntries(['maxInitialInputTokens','maxContextExpansionInputTokens','maxVerificationInputTokens','maxTotalInputTokens'].map(k=>[k,integer(1,1000000000)])),
 maxEstimatedCostUsd:{type:'number',exclusiveMinimum:0,maximum:1000000},maxWallTimeSeconds:integer(1,604800),estimatedSecondsPerJob:integer(1,86400),
 inputUsdPerMillionTokens:{type:'number',exclusiveMinimum:0,maximum:10000},outputUsdPerMillionTokens:{type:'number',exclusiveMinimum:0,maximum:10000},
 concurrency:integer(1,32),maxRetries:integer(0,10),maxRetryAttemptsPerPhase:integer(0,10000),
 enabledLenses:{type:'array',uniqueItems:true,items:{enum:['architecture','contracts','security','lifecycle','resilience','deployment','simplification']}}};
export const repositoryGradeSchema={type:'object',additionalProperties:false,required:Object.keys(properties),properties};
export function ownedPolicyProfilesSchema(policyRef:string) {
 const profiles={type:'object',additionalProperties:false,required:['gate','lean','audit'],properties:Object.fromEntries(['gate','lean','audit'].map(name=>[name,{allOf:[{$ref:policyRef},{type:'object',properties:{profile:{const:name}}}]}]))};
 const v1={type:'object',additionalProperties:false,required:['schemaVersion','profiles'],properties:{schemaVersion:{const:'review-owned-decision-profiles.v1'},profiles}};
 const v2={...v1,required:[...v1.required,'repositoryGrades'],properties:{...v1.properties,schemaVersion:{const:'review-owned-decision-profiles.v2'},repositoryGrades:{type:'object',additionalProperties:false,required:['fast','standard','deep'],properties:{fast:repositoryGradeSchema,standard:repositoryGradeSchema,deep:repositoryGradeSchema}}}};
 const v3={...v2,required:[...v2.required,'promptTokenBoundaryReserve'],properties:{...v2.properties,schemaVersion:{const:'review-owned-decision-profiles.v3'},promptTokenBoundaryReserve:integer(0,1000000)}};
 const v4={...v3,required:[...v3.required,'cacheReadConcurrency'],properties:{...v3.properties,schemaVersion:{const:'review-owned-decision-profiles.v4'},cacheReadConcurrency:integer(1,1024)}};
 const v5={...v4,required:[...v4.required,'revalidation'],properties:{...v4.properties,schemaVersion:{const:'review-owned-decision-profiles.v5'},revalidation:{type:'object',additionalProperties:false,required:['maximumBaselineBytes','maximumBaselineRelations'],properties:{maximumBaselineBytes:integer(1,134217728),maximumBaselineRelations:integer(1,100000)}}}};
 return {oneOf:[v1,v2,v3,v4,v5]};
}
