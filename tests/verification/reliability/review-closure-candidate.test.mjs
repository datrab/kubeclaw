import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING,portableJson,sha256Bytes} from '@kubeclaw/plugin-sdk';
import {inspectReviewPolicyClosureCandidate} from '../../../skills/nova/project/review-policy-closure-candidate.ts';
import {projectReviewPolicyAuthorCandidate} from '../../../skills/nova/plugins/review/src/review-policy-author-candidate.ts';
import {digestReviewPolicy,isResolvedReviewPolicy,REVIEW_POLICY_SOURCE_KINDS} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {REVIEW_SEMANTIC_ENCODING} from '../../../skills/nova/plugins/review/src/review-semantics.ts';

const base='docs/review/evidence/config-acceptance/c0-completion-20261013/';
const authors=JSON.parse(fs.readFileSync(base+'runtime/batch-07-review-policy-profiles/owned-policy-author-controls.json','utf8'));
function fixture(name='gate',encoding=undefined) {
  const objects=new Map();
  const storeRaw=(bytes,schemaDigest=null)=>{const raw=Buffer.from(bytes),digest=sha256Bytes(raw);objects.set(digest,raw);return {digest,bytes:raw.length,encoding:PORTABLE_JSON_ENCODING,schemaDigest};};
  const store=(value,schemaDigest=null)=>storeRaw(Buffer.from(portableJson(value)),schemaDigest);
  const authorSchema=store(JSON.parse(fs.readFileSync('skills/nova/project/review-policy-author-candidate.schema.json','utf8')));
  const effectiveSchema=store(JSON.parse(fs.readFileSync('skills/nova/plugins/review/schemas/review-policy.v2.schema.json','utf8')));
  const content=store(authors[name],authorSchema.digest),policy=projectReviewPolicyAuthorCandidate(authors[name]).policy;
  const taskSchema=store({type:'object',additionalProperties:false,required:['task'],properties:{task:{type:'string'}}});
  const executionSchema=store({type:'object',additionalProperties:false,required:['agent'],properties:{agent:{type:'string'}}});
  // Local object vectors ONLY, not authentic source/task/model/execution receipts.
  const profile={owner:'kubeclaw.review',registration:'review',instance:'default',profile:name,scope:'M',content,
    validationSchema:{owner:'kubeclaw.review',registration:'review',schemaObject:authorSchema}};
  const projection={stageId:'review-api',owner:profile.owner,registration:profile.registration,instance:profile.instance,profile:structuredClone(profile),
    taskInput:store({task:'Prüfe 😀'},taskSchema.digest),effectiveConfig:store(policy,effectiveSchema.digest),effectiveExecution:store({agent:'architect'},executionSchema.digest)};
  const context={stageId:'review-api',instance:'default',profile:name,reviewSemanticEncoding:encoding};
  return {objects,store,storeRaw,profile,projection,context,policy};
}
const inspect=f=>inspectReviewPolicyClosureCandidate(f.profile,f.projection,f.objects,f.context);

test('schema copies are exact approved definitions, not widened SDK wire contracts',()=>{
  assert.deepEqual(fs.readFileSync('skills/nova/project/binding-target-candidate.schema.json'),fs.readFileSync(base+'binding/codec-correction-04/target-contracts.schema.json'));
  assert.deepEqual(fs.readFileSync('skills/nova/project/review-policy-author-candidate.schema.json'),fs.readFileSync(base+'runtime/batch-07-review-policy-profiles/owned-policy-author.schema.json'));
});

test('all original policy profiles match exact captured schema/bytes while review semantic modes remain independent and nonauthorizing',()=>{
  for(const name of ['gate','lean','audit'])for(const encoding of [undefined,REVIEW_SEMANTIC_ENCODING]) {
    const f=fixture(name,encoding),before=structuredClone({profile:f.profile,projection:f.projection}),candidate=inspect(f);
    assert.deepEqual(candidate.policy,f.policy);assert.equal(candidate.reviewPolicyDigest,digestReviewPolicy(f.policy,encoding));
    assert.equal(candidate.reviewSemanticEncoding,encoding);assert.equal(candidate.objectIdentitiesVerified,true);
    assert.equal(candidate.effectiveConfigSha256,f.projection.effectiveConfig.digest);
    for(const key of ['sourceAuthorizationVerified','originalRunAuthorizationVerified','callerAuthorizationVerified','originalAuthorizationVerified','activationAllowed','parentBindingAuthorizationVerified','taskAuthorizationVerified','executionAuthorizationVerified'])assert.equal(candidate[key],false);
    assert.equal(isResolvedReviewPolicy(candidate),false);assert.equal(isResolvedReviewPolicy(candidate.policy),false);
    assert.deepEqual({profile:f.profile,projection:f.projection},before);
  }
  assert.deepEqual(REVIEW_POLICY_SOURCE_KINDS,['built_in','settings_file','run_override']);
});

test('exact scope/schema/digest/codec/missing-object mutations reject with restored positive',()=>{
  const mutations=[
    f=>{f.profile.scope='R';}, f=>{f.profile.instance='foreign';},f=>{f.projection.stageId='review-ui';},
    f=>{f.projection.profile.profile='audit';},f=>{f.profile.validationSchema.owner='foreign';},
    f=>{f.profile.authenticated=true;},f=>{f.projection.effectiveConfig.encoding='json-utf16-v1';},
    f=>{f.projection.effectiveConfig.schemaDigest=null;},f=>{f.projection.effectiveConfig.bytes+=1;},
    f=>{f.objects.delete(f.projection.taskInput.digest);},f=>{f.objects.delete(f.projection.effectiveExecution.schemaDigest);},
    f=>{f.objects.set(f.projection.effectiveConfig.digest,Buffer.from('{}'));},
    f=>{f.projection.effectiveConfig=f.store(projectReviewPolicyAuthorCandidate(authors.lean).policy,f.projection.effectiveConfig.schemaDigest);},
    f=>{f.projection.effectiveConfig=f.storeRaw(Buffer.from(JSON.stringify(f.policy,null,2)),f.projection.effectiveConfig.schemaDigest);},
    f=>{delete f.context.reviewSemanticEncoding;}, f=>{f.context.reviewSemanticEncoding=PORTABLE_JSON_ENCODING;},
  ];
  for(const mutate of mutations) {const f=fixture();mutate(f);assert.throws(()=>inspect(f));assert.equal(inspect(fixture()).activationAllowed,false);}
});

test('UTF8 physical length, duplicate JSON and schema substitution cannot masquerade as the pinned canonical author',()=>{
  const f=fixture(),reference=f.projection.taskInput,bytes=f.objects.get(reference.digest);
  assert.ok(bytes.length>bytes.toString().length);
  reference.bytes=bytes.toString().length;assert.throws(()=>inspect(f),/PHYSICAL_BYTES/);
  const duplicate=fixture(),text=duplicate.objects.get(duplicate.profile.content.digest).toString();
  duplicate.profile.content=duplicate.storeRaw(Buffer.from('{"profile":"gate",'+text.slice(1)),duplicate.profile.content.schemaDigest);
  duplicate.projection.profile=structuredClone(duplicate.profile);assert.throws(()=>inspect(duplicate),/CANONICAL_BYTES/);
  const substituted=fixture(),schema=substituted.store({type:'object'});
  substituted.profile.validationSchema.schemaObject=schema;substituted.profile.content.schemaDigest=schema.digest;
  substituted.projection.profile=structuredClone(substituted.profile);assert.throws(()=>inspect(substituted),/AUTHOR_SCHEMA_IDENTITY/);
  assert.equal(inspect(fixture()).objectIdentitiesVerified,true);
});
