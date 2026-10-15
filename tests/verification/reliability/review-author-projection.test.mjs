import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {portableJson} from '@kubeclaw/plugin-sdk';
import {projectReviewPolicyAuthorCandidate} from '../../../skills/nova/plugins/review/src/review-policy-author-candidate.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {parseReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-parser.ts';
import {isResolvedReviewPolicy,isVerifiedReviewPolicy,REVIEW_POLICY_SOURCE_KINDS} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {validateReferencedSchema} from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import {projectOwnedReviewPolicy} from '../../../docs/review/evidence/config-acceptance/c0-completion-20261013/runtime/batch-07-review-policy-profiles/projection-contract.mjs';

const base='docs/review/evidence/config-acceptance/c0-completion-20261013/runtime/batch-07-review-policy-profiles/';
const authors=JSON.parse(fs.readFileSync(base+'owned-policy-author-controls.json','utf8'));
const schema=validateReferencedSchema(fs.readFileSync(base+'owned-policy-author.schema.json','utf8'),'approved-review-author');

test('all three complete approved review authors project to exact original policies without resolver/source authority',()=>{
  for(const [name,value]of Object.entries(authors)) {
    schema.validate(value);const before=structuredClone(value),candidate=projectReviewPolicyAuthorCandidate(value);
    assert.equal(portableJson(candidate.policy),portableJson(getReviewPolicyProfile(name)));
    assert.equal(portableJson(candidate.policy),portableJson(projectOwnedReviewPolicy(value)));
    assert.equal(Object.isFrozen(candidate.policy.blocking),true);assert.deepEqual(value,before);assert.equal(Object.isFrozen(value),false);
    for(const key of ['sourceAuthorizationVerified','originalRunAuthorizationVerified','callerAuthorizationVerified','originalAuthorizationVerified','activationAllowed'])assert.equal(candidate[key],false);
    assert.equal(isResolvedReviewPolicy(candidate),false);assert.equal(isVerifiedReviewPolicy(candidate),false);
    assert.equal(isResolvedReviewPolicy(candidate.policy),false);
  }
  assert.deepEqual(REVIEW_POLICY_SOURCE_KINDS,['built_in','settings_file','run_override']);
});

test('tagged inactive branch rejects all user settings; enabled branch and headers require full explicit values',()=>{
  const invalid=[];
  for(const name of ['authorSchemaVersion','wireSchemaVersion','simplificationRegistryVersion','limits']) {
    const value=structuredClone(authors.gate);delete value[name];invalid.push(value);
  }
  for(const key of ['minimumConfidence','enabledRules','maxRecommendations','registryVersion','enabled']) {
    invalid.push({...structuredClone(authors.gate),simplification:{mode:'disabled',[key]:'unused'}});
  }
  for(const key of ['enabledRules','maxRecommendations','minimumConfidence']) {
    const value=structuredClone(authors.audit);delete value.simplification[key];invalid.push(value);
  }
  invalid.push({...authors.gate,wireSchemaVersion:'future'}, {...authors.gate,extra:true},
    ...['review-policy.v2','future',null].map(schemaVersion=>({...authors.gate,schemaVersion})),
    {...authors.gate,simplification:{mode:'unknown'}},{...authors.audit,simplification:{...authors.audit.simplification,enabledRules:[]}},
    {...authors.audit,simplification:{...authors.audit.simplification,maxRecommendations:0}});
  for(const value of invalid) {
    assert.throws(()=>schema.validate(value));assert.throws(()=>projectReviewPolicyAuthorCandidate(value));
  }
  assert.deepEqual(projectReviewPolicyAuthorCandidate(authors.gate).policy,getReviewPolicyProfile('gate'));
});

test('original semantic floors remain enforced; legacy custom inactive metadata is not silently converted',()=>{
  const invalid=structuredClone(authors.audit);invalid.blocking.priorities=[];
  assert.throws(()=>projectReviewPolicyAuthorCandidate(invalid),/CONFIG_REVIEW_POLICY_INVALID/);
  const context=structuredClone(authors.audit);context.limits.maxInitialContextBytes=context.limits.maxContextBytes;
  assert.throws(()=>projectReviewPolicyAuthorCandidate(context),/CONFIG_REVIEW_POLICY_INVALID/);
  const legacy=structuredClone(getReviewPolicyProfile('gate'));legacy.simplification.minimumConfidence='medium';
  assert.equal(parseReviewPolicy(legacy).ok,true);
  assert.throws(()=>projectReviewPolicyAuthorCandidate(legacy),/CONFIG_REVIEW_POLICY_VERSION/);
  assert.equal(legacy.simplification.minimumConfidence,'medium');
  assert.equal(projectReviewPolicyAuthorCandidate(authors.audit).activationAllowed,false);
});
