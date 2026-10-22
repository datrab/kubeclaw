import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadCoreRuntimePolicy,captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedStageConfiguration} from '../../../skills/nova/core/execution/stage-configuration.ts';
import {resolveRepositoryReviewProfile,parseRepositoryReviewInput,selectedRepositoryGrades} from '../../../skills/nova/plugins/review/src/repository-review-profile.ts';
import {resolveRepositoryReviewProfile as legacy,parseRepositoryReviewInput as parseLegacyInput} from '../../../skills/nova/plugins/review/src/legacy-repository-review-profile.ts';
import {targetsFrom} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-config.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
const core=()=>loadCoreRuntimePolicy({file:fs.realpathSync('config/nova/core.config.json'),profile:'standard'});
const target={endpoint:'http://127.0.0.1:1234',tokenSecret:'test',runtime:'subagent',agentId:'codex',agentRole:'review',model:'test-model',thinking:'high',cwd:'/tmp',repositoryRoot:'/tmp',resultPathPrefix:'results',timingProfile:'standard',tokenizerEncoding:'o200k_base',maxInputTokens:120000,maxOutputTokens:6000,maxContextTokens:128000,maxPromptBytes:900000};
function binding(policy=core()) {const raw={targets:{echo:target}};const configuration=selectedAdapterConfigurations({'kubeclaw.runtime-dispatch:openclaw':raw},policy)['kubeclaw.runtime-dispatch:openclaw'];return {provider:'kubeclaw.runtime-dispatch:openclaw',configuration};}
const config={agent:'echo',reviewerModel:'test-model'};
test('every selected grade preserves original values; runtime-owned tokenizer/output never become review authors',()=>{
 const policy=core(),b=binding(policy),actual=targetsFrom(b.configuration).get('echo');
 for(const type of ['kubeclaw.audit.repository-review','kubeclaw.audit.repository-review-revalidation']){
  const stage=selectedStageConfiguration(type,config,undefined,undefined,policy.reviewPolicyCapture,b);
  assert.equal(stage.repositoryRuntimeTarget.tokenizerEncoding,actual.tokenizerEncoding);
  assert.equal(stage.repositoryRuntimeTarget.maxOutputTokens,actual.maxOutputTokens);
  for(const grade of ['fast','standard','deep']) {
   const original=structuredClone(stage);original.ownedPolicyProfiles.schemaVersion='review-owned-decision-profiles.v2';delete original.ownedPolicyProfiles.revalidation;delete original.ownedPolicyProfiles.cacheReadConcurrency;delete original.ownedPolicyProfiles.promptTokenBoundaryReserve;
   assert.deepEqual(parseRepositoryReviewInput({grade},selectedRepositoryGrades(original)),legacy({grade}));
   const current=parseRepositoryReviewInput({grade},selectedRepositoryGrades(stage));
   assert.equal(current.schemaVersion,'repository-review-profile.v2');assert.equal(current.promptTokenBoundaryReserve,64);
   const {digest,schemaVersion,promptTokenBoundaryReserve,...rest}=current;const {digest:oldDigest,schemaVersion:oldVersion,...oldRest}=legacy({grade});assert.deepEqual(rest,oldRest);assert.notEqual(digest,oldDigest);
  }
  for(const overrides of [undefined,null,{},{maxPrimaryJobs:75},{maxInputTokens:8000000}])assert.throws(()=>parseRepositoryReviewInput({grade:'fast',overrides},selectedRepositoryGrades(stage)),/COMPETING_AUTHOR/);
 }
 const forbidden=structuredClone(policy);forbidden.reviewPolicyCapture.settings.repositoryGrades.fast.maxOutputTokensPerJob=6000;assert.throws(()=>captureCoreRuntimePolicy(forbidden),/CAPTURE_INVALID/);
 assert.throws(()=>selectedStageConfiguration('kubeclaw.audit.repository-review',config,undefined,undefined,policy.reviewPolicyCapture),/TARGET_UNSUPPORTED/);
 assert.throws(()=>selectedStageConfiguration('kubeclaw.audit.repository-review',{...config,reviewerModel:'wrong'},undefined,undefined,policy.reviewPolicyCapture,b),/IDENTITY_MISMATCH/);
 const spaced=structuredClone(b);spaced.configuration.targets.echo.model=' test-model ';spaced.configuration.targets.echo.thinking=' high ';
 assert.doesNotThrow(()=>selectedStageConfiguration('kubeclaw.audit.repository-review',config,undefined,undefined,policy.reviewPolicyCapture,spaced));
 assert.equal(targetsFrom(spaced.configuration).get('echo').model,'test-model');
 assert.doesNotThrow(()=>selectedStageConfiguration('kubeclaw.audit.repository-review',{agent:' echo ',reviewerModel:' test-model ',reviewerThinking:' high ',reviewerAgentId:' codex '},undefined,undefined,policy.reviewPolicyCapture,spaced));
 const missing=structuredClone(b);for(const key of ['tokenizerEncoding','maxInputTokens','maxOutputTokens','maxContextTokens','maxPromptBytes'])delete missing.configuration.targets.echo[key];
 const projected=selectedStageConfiguration('kubeclaw.audit.repository-review',config,undefined,undefined,policy.reviewPolicyCapture,missing).repositoryRuntimeTarget;
 const activated=targetsFrom(missing.configuration).get('echo');for(const [key,value] of Object.entries(projected))assert.equal(value,activated[key]);
});
test('A/B quotas have one complete author, original capture survives current mutation and target owner drives output/tokenizer',()=>{
 const a=core(),b=structuredClone(a);b.reviewPolicyCapture.settings.repositoryGrades.fast.maxPrimaryJobs=12;
 const selected=policy=>selectedRepositoryGrades(selectedStageConfiguration('kubeclaw.audit.repository-review',config,undefined,undefined,policy.reviewPolicyCapture,binding(policy)));
 assert.equal(parseRepositoryReviewInput({grade:'fast'},selected(a)).maxPrimaryJobs,75);
 assert.equal(parseRepositoryReviewInput({grade:'fast'},selected(b)).maxPrimaryJobs,12);
 const owned=a.reviewPolicyCapture.settings.repositoryGrades;
 const targetB={tokenizerEncoding:'cl100k_base',maxOutputTokens:7000,maxInputTokens:120000,maxContextTokens:128000,maxPromptBytes:900000};
 const resolved=resolveRepositoryReviewProfile({grade:'fast'},{grades:owned,target:targetB});assert.equal(resolved.tokenizerEncoding,'cl100k_base');assert.equal(resolved.maxOutputTokensPerJob,7000);
 const tooSmall={...targetB,maxContextTokens:127000};assert.throws(()=>resolveRepositoryReviewProfile({grade:'fast'},{grades:owned,target:tooSmall}),/exceeds the review runtime target/);
 const bad=structuredClone(owned);bad.deep.maxRetries=-1;assert.throws(()=>resolveRepositoryReviewProfile({grade:'fast'},{grades:bad,target:targetB}),/GRADES_INVALID/);
});
test('retained activation restores original targets before timing projection; current target is never merged',()=>{
 const policy=core(),original=binding(policy);
 const received=selectedAdapterConfigurations({'kubeclaw.runtime-dispatch:openclaw':{targets:{different:{model:'current'}}}},policy,{echo:'standard'},undefined,undefined,undefined,original);
 assert.deepEqual(received['kubeclaw.runtime-dispatch:openclaw'],original.configuration);
});

test('retained review input uses original v1 parser for all scopes and explicit overrides',()=>{
 for(const grade of ['fast','standard','deep'])for(const input of [
  {grade}, {grade,overrides:undefined}, {grade,allowedPrefixes:['skills/nova']},
  {grade,mode:'resume',scope:{kind:'path',prefixes:['skills/nova']}},
  {grade,overrides:{maxPrimaryJobs:12}},
 ])assert.deepEqual(parseRepositoryReviewInput(input),parseLegacyInput(input));
 for(const input of [null,[],{}, {grade:'unknown'},{grade:'fast',unknown:true}]) {
  let expected;try{parseLegacyInput(input);}catch(error){expected=error;}
  if(expected)assert.throws(()=>parseRepositoryReviewInput(input),{message:expected.message});
  else assert.deepEqual(parseRepositoryReviewInput(input),parseLegacyInput(input));
 }
});
