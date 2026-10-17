import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING,portableJson,sha256Bytes} from '@kubeclaw/plugin-sdk';
import {inspectReviewBindingRecordCandidate} from '../../../skills/nova/project/review-policy-closure-candidate.ts';
import {projectReviewPolicyAuthorCandidate} from '../../../skills/nova/plugins/review/src/review-policy-author-candidate.ts';
import {isResolvedReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';

function fixture() {
  const objects=new Map();
  const raw=(bytes,encoding=PORTABLE_JSON_ENCODING,schemaDigest=null)=>{const value=Buffer.from(bytes),digest=sha256Bytes(value);objects.set(digest,value);return {digest,bytes:value.length,encoding,schemaDigest};};
  const store=(value,schemaDigest=null)=>raw(Buffer.from(portableJson(value)),PORTABLE_JSON_ENCODING,schemaDigest);
  const author=JSON.parse(fs.readFileSync('docs/review/evidence/config-acceptance/c0-completion-20261013/runtime/batch-07-review-policy-profiles/owned-policy-author-controls.json','utf8')).gate;
  const authorSchema=store(JSON.parse(fs.readFileSync('skills/nova/project/review-policy-author-candidate.schema.json','utf8')));
  const effectiveSchema=store(JSON.parse(fs.readFileSync('skills/nova/plugins/review/schemas/review-policy.v2.schema.json','utf8')));
  const profile={owner:'kubeclaw.review',registration:'review',instance:'default',profile:'gate',scope:'M',content:store(author,authorSchema.digest),
    validationSchema:{owner:'kubeclaw.review',registration:'review',schemaObject:authorSchema}};
  const projection={stageId:'review-api',owner:profile.owner,registration:profile.registration,instance:profile.instance,profile:structuredClone(profile),
    taskInput:store({task:'original task vector'}),effectiveConfig:store(projectReviewPolicyAuthorCandidate(author).policy,effectiveSchema.digest),effectiveExecution:store({agent:'architect'})};
  // Opaque placeholder REFERENCES are not foundation/grant/reservation proofs.
  // Positive checks below establish only the supplied record's local integrity.
  const unverified=store({scope:'unverified reference vector,NOT authority'});
  const codePath='skills/nova/plugins/review/src/review-policy-author-candidate.ts';
  const binding={schemaVersion:'config-module-binding.v1',runId:'run:shape-control',groupId:'module:api',foundation:unverified,membership:unverified,generation:unverified,
    profiles:[profile],consumerProjections:[projection],dependencies:[{kind:'code',originalIdentity:codePath,content:raw(fs.readFileSync(codePath),'raw-bytes-v1')}],secretReferences:[],
    reservationReceipt:unverified,budgetLedgerAuthority:unverified,observerPolicy:unverified,mode:'live-modules'};
  const context={runId:binding.runId,groupId:binding.groupId,stageId:'review-api',instance:'default',profile:'gate',reviewSemanticEncoding:undefined};
  const seal=()=>{const {digest,...unsigned}=binding;binding.digest=sha256Bytes(Buffer.from(portableJson(unsigned)));return store(binding);};
  return {objects,store,raw,binding,context,seal};
}
const inspect=(f,reference=f.seal())=>inspectReviewBindingRecordCandidate(reference,f.objects,f.context);

test('approved binding internal digest excludes itself while outer object hashes full bytes; real code bytes confer no software authority',()=>{
  const f=fixture(),reference=f.seal(),before=structuredClone(f.binding),candidate=inspect(f,reference);
  assert.notEqual(reference.digest,f.binding.digest);
  assert.equal(candidate.bindingObjectSha256,reference.digest);assert.equal(candidate.bindingInternalDigest,f.binding.digest);
  assert.equal(candidate.bindingRecordDigestVerified,true);
  assert.deepEqual(candidate.codeDependencies,[{originalIdentity:f.binding.dependencies[0].originalIdentity,contentSha256:f.binding.dependencies[0].content.digest}]);
  assert.deepEqual(f.binding,before);
  for(const key of ['softwarePinningVerified','foundationAuthorizationVerified','membershipAuthorizationVerified','parentBindingAuthorizationVerified','sourceAuthorizationVerified','originalAuthorizationVerified','activationAllowed'])assert.equal(candidate[key],false);
  assert.equal(isResolvedReviewPolicy(candidate),false);
});

test('rehashing the outer object cannot hide stale inner digest or use inner digest as an enclosing reference',()=>{
  const f=fixture(),reference=f.seal();f.binding.groupId='module:other';
  const outer=f.store(f.binding);assert.throws(()=>inspect(f,outer),/BINDING_INTERNAL_DIGEST/);
  const g=fixture(),good=g.seal(),alias={...good,digest:g.binding.digest};g.objects.set(alias.digest,g.objects.get(good.digest));
  assert.throws(()=>inspect(g,alias),/OBJECT_DIGEST/);
  assert.equal(inspect(fixture()).bindingRecordDigestVerified,true);
});

test('duplicate/dangling/scope/unknown-wire/missing-code mutations reject then restore',()=>{
  const mutations=[
    f=>{f.binding.profiles.push({...structuredClone(f.binding.profiles[0]),content:f.store({different:'bytes'})});},
    f=>{f.binding.consumerProjections.push({...structuredClone(f.binding.consumerProjections[0]),taskInput:f.store({different:'task'})});},
    f=>{f.binding.dependencies.push({...structuredClone(f.binding.dependencies[0]),content:f.raw(Buffer.from('changed'),'raw-bytes-v1')});},
    f=>{f.binding.consumerProjections[0].profile.profile='foreign';},
    f=>{f.binding.consumerProjections[0].owner='foreign';},
    f=>{f.binding.groupId='module:foreign';},
    f=>{f.binding.projectionImplementation=f.binding.dependencies[0].content;},
    f=>{f.binding.dependencies[0].kind='projection-implementation';},
    f=>{f.objects.delete(f.binding.dependencies[0].content.digest);},
    f=>{f.objects.set(f.binding.dependencies[0].content.digest,Buffer.from('current B is not original A'));},
    f=>{f.objects.delete(f.binding.foundation.digest);},
  ];
  for(const mutate of mutations) {const f=fixture();mutate(f);assert.throws(()=>inspect(f));assert.equal(inspect(fixture()).activationAllowed,false);}
});
