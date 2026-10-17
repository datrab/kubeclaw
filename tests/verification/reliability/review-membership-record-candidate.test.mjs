import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING,portableJson,canonicalJson,sha256Bytes,sha256Text} from '@kubeclaw/plugin-sdk';
import {inspectReviewMembershipRecordCandidate,inspectReviewTaskInputShapeCandidate,inspectReviewLiteralTaskParserCandidate,inspectReviewTaskContextReasonsCandidate,inspectReviewTaskDescriptorsCandidate,inspectReviewTaskDescriptorUniquenessCandidate,inspectReviewTaskDeclaredContextScopeCandidate,inspectReviewTaskDeclaredReasonScopeCandidate} from '../../../skills/nova/project/review-policy-closure-candidate.ts';
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
  return {objects,store,raw,binding,context,seal,author,profile};
}

function membershipFixture() {
  const f=fixture(),projection=f.binding.consumerProjections[0];
  const membership={schemaVersion:'config-membership.v1',runId:f.context.runId,taskGraph:f.store({local:'opaque graph bytes, NOT authenticated task graph'}),groups:[{
    groupId:f.context.groupId,kind:'implementation',stages:[{stageId:projection.stageId,stageType:'kubeclaw.decision.review',owner:projection.owner,registration:projection.registration,instance:projection.instance,
      taskInput:projection.taskInput,partition:f.store({local:'opaque partition, NOT field authorization'})}],standaloneIntent:null,repairRelations:[]}]};
  const seal=()=>{const {digest,...unsigned}=membership;membership.digest=sha256Bytes(Buffer.from(portableJson(unsigned)));f.binding.membership=f.store(membership);return f.seal();};
  return {...f,membership,seal};
}
const inspect=f=>inspectReviewMembershipRecordCandidate(f.seal(),f.objects,f.context);
test('strict supplied membership references join selected binding without original graph/instance authority',()=>{
 const f=membershipFixture(),result=inspect(f);
 assert.equal(result.membershipReferencesCoherent,true);assert.notEqual(result.membershipObjectSha256,result.membershipInternalDigest);
 for(const key of ['membershipAuthorizationVerified','originalTaskGraphVerified','partitionSemanticsVerified','stageInstanceAuthorizationVerified','activationAllowed','originalAuthorizationVerified'])assert.equal(result[key],false);
 assert.equal(isResolvedReviewPolicy(result),false);
});
test('run/group/stage/owner/instance/task joins and repair group reject mutations then restore',()=>{
 const mutations=[
 f=>{f.membership.runId='foreign';},f=>{f.membership.groups[0].groupId='foreign';},
 f=>{f.membership.groups.push({...structuredClone(f.membership.groups[0]),stages:[]});},
 f=>{f.membership.groups[0].stages.push({...structuredClone(f.membership.groups[0].stages[0]),instance:'foreign'});},
 f=>{f.membership.groups[0].stages[0].stageId='different';},
 ...['owner','registration','instance'].map(key=>f=>{f.membership.groups[0].stages[0][key]='foreign';}),
 f=>{f.membership.groups[0].stages[0].taskInput=f.store({different:'task'});},
 f=>{f.membership.groups[0].repairRelations=[{sourceStage:'missing',targetStage:'review-api',originalGroupId:f.context.groupId}];},
 f=>{f.membership.groups[0].repairRelations=[{sourceStage:'review-api',targetStage:'review-api',originalGroupId:'foreign'}];},
 f=>{f.membership.currentOwner='B';}
 ];
 for(const mutate of mutations){const f=membershipFixture();mutate(f);assert.throws(()=>inspect(f));assert.equal(inspect(membershipFixture()).activationAllowed,false);}
});
test('membership own digest and referenced graph/partition bytes cannot be bypassed by outer rehash',()=>{
 const f=membershipFixture();f.seal();f.membership.runId='changed';f.binding.membership=f.store(f.membership);
 assert.throws(()=>inspectReviewMembershipRecordCandidate(fixtureReference(f),f.objects,f.context),/MEMBERSHIP_INTERNAL_DIGEST/);
 for(const select of [f=>f.membership.taskGraph,f=>f.membership.groups[0].stages[0].partition]){
  const f=membershipFixture();f.objects.delete(select(f).digest);assert.throws(()=>inspect(f),/OBJECT_MISSING/);
  assert.equal(inspect(membershipFixture()).membershipReferencesCoherent,true);
 }
});
function fixtureReference(f){const {digest,...unsigned}=f.binding;f.binding.digest=sha256Bytes(Buffer.from(portableJson(unsigned)));return f.store(f.binding);}


test('unselected groups retain full task/partition/intent byte and schema checks',()=>{
 const make=()=>{
  const f=membershipFixture();
  const schema=f.store({type:'object',additionalProperties:false,required:['original'],properties:{original:{const:'unselected'}}});
  const content=f.store({original:'unselected'},schema.digest);
  f.membership.groups.push({groupId:'module:other',kind:'explicit',stages:[{
   stageId:'other-stage',stageType:'opaque-original-type',owner:'other-owner',registration:'other-registration',instance:'other-instance',
   taskInput:content,partition:content}],standaloneIntent:content,repairRelations:[]});
  return f;
 };
 for(const field of ['taskInput','partition','standaloneIntent']) {
  const f=make(),group=f.membership.groups[1];
  const owner=field==='standaloneIntent'?group:group.stages[0];
  const original=owner[field];
  // Rehashing membership and binding must not hide invalid referenced payloads.
  owner[field]=f.store({original:'changed'},original.schemaDigest);
  assert.throws(()=>inspect(f));
  owner[field]=original;assert.equal(inspect(f).membershipReferencesCoherent,true);
  f.objects.delete(original.schemaDigest);assert.throws(()=>inspect(f),/OBJECT_MISSING/);
 }
});

test('graph and partition physical UTF8 sizes and canonical bytes survive outer resealing',()=>{
 for(const select of [f=>[f.membership,'taskGraph'],f=>[f.membership.groups[0].stages[0],'partition']]) {
  const f=membershipFixture(),[owner,key]=select(f);
  const value={original:'Prüfe 😀'},reference=f.store(value),bytes=f.objects.get(reference.digest);
  owner[key]=reference;assert.equal(inspect(f).membershipReferencesCoherent,true);
  reference.bytes=bytes.toString().length;assert.throws(()=>inspect(f),/PHYSICAL_BYTES/);
  reference.bytes=bytes.length;assert.equal(inspect(f).membershipReferencesCoherent,true);
  owner[key]=f.raw(Buffer.from(JSON.stringify(value,null,2)));
  assert.throws(()=>inspect(f),/CANONICAL_BYTES/);
  owner[key]=reference;assert.equal(inspect(f).partitionSemanticsVerified,false);
 }
});

test('opaque raw graph and partition references never become graph or partition authorization',()=>{
 const f=membershipFixture();
 f.membership.taskGraph=f.raw(Buffer.from([0,255,1]),'raw-bytes-v1');
 f.membership.groups[0].stages[0].partition=f.raw(Buffer.from([255,0]),'raw-bytes-v1');
 const result=inspect(f);
 assert.equal(result.membershipReferencesCoherent,true);
 for(const key of ['originalTaskGraphVerified','partitionSemanticsVerified','stageInstanceAuthorizationVerified','membershipAuthorizationVerified','activationAllowed'])assert.equal(result[key],false);
 assert.equal(isResolvedReviewPolicy(result),false);
});


test('selected Review receiving rejects foreign registered stage types despite rehashed owner/profile labels',()=>{
 const f=membershipFixture(),member=f.membership.groups[0].stages[0];
 for(const foreign of ['kubeclaw.audit.repository-review','kubeclaw.audit.repository-review-revalidation','kubeclaw.action.implement','opaque-original-type']) {
  member.stageType=foreign;
  assert.throws(()=>inspect(f),/MEMBERSHIP_REVIEW_STAGE_TYPE/);
  member.stageType='kubeclaw.decision.review';
  const restored=inspect(f);assert.equal(restored.membershipReferencesCoherent,true);
  assert.equal(restored.stageInstanceAuthorizationVerified,false);assert.equal(restored.activationAllowed,false);
 }
});

function taskShapeFixture() {
 const f=membershipFixture();
 const schema=f.store(JSON.parse(fs.readFileSync('skills/nova/plugins/review/schemas/input.schema.json','utf8')));
 const task={task:{id:'task:review',statement:'Review exact original changes'},revisions:{sourceStageId:'implement-api'},
  scope:{allowedPrefixes:['src']},requirements:[{id:'req:1',statement:'Preserve contract'}],
  evidence:[{kind:'original',digest:'sha256:'+'0'.repeat(64),content:{unverified:true}}],contextCandidates:[]};
 const setTask=(value,schemaDigest=schema.digest,encoding=PORTABLE_JSON_ENCODING)=>{
  const ref=f.raw(Buffer.from(portableJson(value)),encoding,schemaDigest);
  f.binding.consumerProjections[0].taskInput=ref;f.membership.groups[0].stages[0].taskInput=ref;
 };
 setTask(task);return {...f,task,schema,setTask};
}
const inspectTask=f=>inspectReviewTaskInputShapeCandidate(f.seal(),f.objects,f.context);
test('original Review task schema joins exact task bytes without revision or evidence authorization',()=>{
 const f=taskShapeFixture(),result=inspectTask(f);
 assert.equal(result.taskInputShapeVerified,true);assert.equal(result.taskInputSchemaSha256,f.schema.digest);
 for(const key of ['taskInputSemanticsVerified','originalRevisionsVerified','taskAuthorizationVerified','activationAllowed'])assert.equal(result[key],false);
 assert.equal(isResolvedReviewPolicy(result),false);
 // A sourceStageId is intentionally not resolved, and evidence hashes are not authenticated here.
 assert.equal(f.task.revisions.sourceStageId,'implement-api');
});
test('resealed task descriptors cannot replace the original registered task schema or encoding',()=>{
 const f=taskShapeFixture();
 for(const digest of [null,f.store({type:'object'}).digest]) {
  f.setTask(f.task,digest);assert.throws(()=>inspectTask(f),/TASK_INPUT_SCHEMA_LINK/);
  f.setTask(f.task);assert.equal(inspectTask(f).taskInputShapeVerified,true);
 }
 f.setTask(f.task,f.schema.digest,'raw-bytes-v1');assert.throws(()=>inspectTask(f),/TASK_INPUT_ENCODING/);
 f.setTask(f.task);assert.equal(inspectTask(f).taskInputShapeVerified,true);
});
test('task schema violations reject after both membership and binding are resealed, then restore',()=>{
 const mutations=[value=>{delete value.requirements;},value=>{value.policy={};},
  value=>{value.revisions={base:'not-a-git-object'};},value=>{value.task.id='bad id';},
  value=>{value.scope.allowedPrefixes=[];},value=>{value.evidence[0].digest='foreign';}];
 for(const mutate of mutations) {
  const f=taskShapeFixture(),changed=structuredClone(f.task);mutate(changed);f.setTask(changed);
  assert.throws(()=>inspectTask(f));f.setTask(f.task);assert.equal(inspectTask(f).taskInputShapeVerified,true);
 }
});


function literalTaskFixture() {
 const f=taskShapeFixture();f.task.revisions={base:'a'.repeat(40)};
 f.task.evidence=[{kind:'original',digest:sha256Text(portableJson({note:'Prüfe 😀'})),content:{note:'Prüfe 😀'},encoding:PORTABLE_JSON_ENCODING}];
 f.setTask(f.task);return f;
}
const inspectLiteral=f=>inspectReviewLiteralTaskParserCandidate(f.seal(),f.objects,f.context);
test('literal-base task uses unchanged original parser and preserves every authority denial',()=>{
 const f=literalTaskFixture(),result=inspectLiteral(f);
 assert.equal(result.localTaskParserVerified,true);
 for(const key of ['taskInputSemanticsVerified','originalRevisionsVerified','taskAuthorizationVerified','activationAllowed','originalAuthorizationVerified'])assert.equal(result[key],false);
 assert.equal(isResolvedReviewPolicy(result),false);
 // Historical untagged encoding uses the original parser too, not portable reinterpretation.
 f.task.evidence=[{kind:'original',content:{note:'ascii'},digest:sha256Text('{"note":"ascii"}')}];
 f.setTask(f.task);assert.equal(inspectLiteral(f).localTaskParserVerified,true);
});
test('original parser rejects schema-valid content mutants with restored-positive controls',()=>{
 const mutations=[
  value=>{value.evidence[0].content.note='changed';},
  value=>{value.requirements.push(structuredClone(value.requirements[0]));},
  value=>{value.evidence.push(structuredClone(value.evidence[0]));},
  value=>{value.scope.allowedPrefixes=['../escape'];},
  value=>{value.scope.ownershipPrefixes=['outside'];},
  value=>{value.task.statement=' padded ';},
 ];
 for(const mutate of mutations){
  const f=literalTaskFixture(),changed=structuredClone(f.task);mutate(changed);f.setTask(changed);
  assert.equal(inspectTask(f).taskInputShapeVerified,true);
  assert.throws(()=>inspectLiteral(f),/TASK_ORIGINAL_PARSER/);
  f.setTask(f.task);assert.equal(inspectLiteral(f).localTaskParserVerified,true);
 }
});
test('source-stage revisions require genuine runtime resolution, even with supplied base',()=>{
 for(const revisions of [{sourceStageId:'implement-api'},{sourceStageId:'implement-api',base:'b'.repeat(40)}]){
  const f=literalTaskFixture();f.task.revisions=revisions;f.setTask(f.task);
  assert.equal(inspectTask(f).taskInputShapeVerified,true);
  assert.throws(()=>inspectLiteral(f),/TASK_SOURCE_REVISIONS_UNRESOLVED/);
  f.task.revisions={base:'a'.repeat(40)};f.setTask(f.task);
  assert.equal(inspectLiteral(f).originalRevisionsVerified,false);
 }
});

function boundedTaskFixture() {
 const f=literalTaskFixture(),projection=f.binding.consumerProjections[0];
 Object.assign(f.author.limits,{maxBundleBytes:65536,maxContextBytes:65536,maxContextFileBytes:32768,maxInitialContextBytes:32768});
 f.profile.content=f.store(f.author,f.profile.content.schemaDigest);
 projection.profile=structuredClone(f.profile);
 projection.effectiveConfig=f.store(projectReviewPolicyAuthorCandidate(f.author).policy,projection.effectiveConfig.schemaDigest);
 return f;
}
test('original input preflight enforces bound policy at exact UTF8 byte boundary then restores',()=>{
 const f=boundedTaskFixture(),limit=f.author.limits.maxBundleBytes;
 f.task.contextCandidates=[{path:'src/a',reasons:[{payload:''}],dependencyDepth:1}];
 const overhead=Buffer.byteLength(canonicalJson(f.task),'utf8');
 f.task.contextCandidates[0].reasons[0].payload='x'.repeat(limit-overhead);f.setTask(f.task);
 assert.equal(Buffer.byteLength(canonicalJson(f.task),'utf8'),limit);
 assert.equal(inspectLiteral(f).localTaskPreflightVerified,true);
 // Same JS character count, two extra physical bytes; do not use string.length.
 f.task.contextCandidates[0].reasons[0].payload='€'+f.task.contextCandidates[0].reasons[0].payload.slice(1);f.setTask(f.task);
 assert.equal(inspectTask(f).taskInputShapeVerified,true);
 assert.throws(()=>inspectLiteral(f),/TASK_ORIGINAL_PREFLIGHT:size_exceeded/);
 f.task.contextCandidates[0].reasons[0].payload='x'+f.task.contextCandidates[0].reasons[0].payload.slice(1);f.setTask(f.task);
 const restored=inspectLiteral(f);
 assert.equal(restored.localTaskPreflightVerified,true);assert.equal(restored.activationAllowed,false);
 assert.equal(restored.taskInputSemanticsVerified,false);assert.equal(isResolvedReviewPolicy(restored),false);
});
test('original preflight rejects deeply nested and wide opaque context despite task-schema success',()=>{
 for(const value of [Array(10001).fill(null),Array.from({length:34}).reduce(value=>({child:value}),null)]) {
  const f=boundedTaskFixture();f.task.contextCandidates=[{path:'src/a',reasons:[{payload:value}],dependencyDepth:1}];f.setTask(f.task);
  assert.equal(inspectTask(f).taskInputShapeVerified,true);
  assert.throws(()=>inspectLiteral(f),/TASK_ORIGINAL_PREFLIGHT:invalid_json/);
  f.task.contextCandidates=[];f.setTask(f.task);assert.equal(inspectLiteral(f).localTaskPreflightVerified,true);
 }
});

const inspectReasons=f=>inspectReviewTaskContextReasonsCandidate(f.seal(),f.objects,f.context);
test('original context reason grammar validates local content without repository or selection authority',()=>{
 const f=literalTaskFixture();f.task.contextCandidates=[{path:'src/context',dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'src/original'}]}];f.setTask(f.task);
 const result=inspectReasons(f);assert.equal(result.localContextReasonsVerified,true);
 for(const key of ['contextDescriptorProvenanceVerified','repositoryScopeVerified','taskInputSemanticsVerified','originalRevisionsVerified','activationAllowed'])assert.equal(result[key],false);
 assert.equal(isResolvedReviewPolicy(result),false);
});
test('schema-valid opaque reason mutants reject through original grammar then restore',()=>{
 for(const reason of [{kind:'invented'},{kind:'context_expansion',sourcePath:'src/original'},
   {kind:'direct_import'},{kind:'changed',sourcePath:'src/original'},
   {kind:'direct_import',sourcePath:'../escape'},{kind:'direct_import',sourcePath:'src/original',authority:true}]) {
  const f=literalTaskFixture();f.task.contextCandidates=[{path:'src/context',dependencyDepth:1,reasons:[reason]}];f.setTask(f.task);
  assert.equal(inspectLiteral(f).localTaskParserVerified,true);assert.throws(()=>inspectReasons(f));
  f.task.contextCandidates[0].reasons=[{kind:'direct_import',sourcePath:'src/original'}];f.setTask(f.task);
  assert.equal(inspectReasons(f).localContextReasonsVerified,true);
 }
});
test('reason grammar does not assert changed path provenance or silently select context',()=>{
 const f=literalTaskFixture();f.task.contextCandidates=[{path:'outside/context',dependencyDepth:1,reasons:[{kind:'changed'}]}];f.setTask(f.task);
 const result=inspectReasons(f);assert.equal(result.localContextReasonsVerified,true);
 assert.equal(result.repositoryScopeVerified,false);assert.equal(result.contextDescriptorProvenanceVerified,false);
 assert.equal(result.activationAllowed,false);
});

const inspectDescriptors=f=>inspectReviewTaskDescriptorsCandidate(f.seal(),f.objects,f.context);
test('original descriptor grammar rejects schema-valid unsafe paths and restores without scope claims',()=>{
 for(const path of ['../escape','/absolute','src//empty','src/./relative','src\\foreign','src:foreign']) {
  const f=literalTaskFixture();f.task.contextCandidates=[{path,dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'src/original'}]}];f.setTask(f.task);
  assert.equal(inspectReasons(f).localContextReasonsVerified,true);
  assert.throws(()=>inspectDescriptors(f));
  f.task.contextCandidates[0].path='src/context';f.setTask(f.task);
  const result=inspectDescriptors(f);assert.equal(result.localContextDescriptorGrammarVerified,true);
  for(const key of ['repositoryScopeVerified','contextDescriptorProvenanceVerified','activationAllowed','taskInputSemanticsVerified'])assert.equal(result[key],false);
  assert.equal(isResolvedReviewPolicy(result),false);
 }
});
test('descriptor grammar deliberately does not claim relational provenance or path uniqueness',()=>{
 const f=literalTaskFixture();const descriptor={path:'outside/context',dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'absent/original'}]};
 f.task.contextCandidates=[descriptor,structuredClone(descriptor)];f.setTask(f.task);
 const result=inspectDescriptors(f);assert.equal(result.localContextDescriptorGrammarVerified,true);
 assert.equal(result.contextDescriptorProvenanceVerified,false);assert.equal(result.repositoryScopeVerified,false);
 assert.equal(result.activationAllowed,false);
});


const inspectUniqueDescriptors=f=>inspectReviewTaskDescriptorUniquenessCandidate(f.seal(),f.objects,f.context);
test('duplicate supplied context paths reject despite distinct reasons or depths and resealed references',()=>{
 for(const alter of [value=>value,value=>({...value,dependencyDepth:2}),
   value=>({...value,reasons:[{kind:'dependency',sourcePath:'src/other'}]})]) {
  const f=literalTaskFixture(),descriptor={path:'src/context',dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'src/original'}]};
  f.task.contextCandidates=[descriptor,alter(structuredClone(descriptor))];f.setTask(f.task);
  assert.equal(inspectDescriptors(f).localContextDescriptorGrammarVerified,true);
  assert.throws(()=>inspectUniqueDescriptors(f),/context candidate paths contains duplicates/);
  f.task.contextCandidates[1].path='src/other-context';f.setTask(f.task);
  const result=inspectUniqueDescriptors(f);assert.equal(result.localSuppliedContextPathsUnique,true);
  for(const key of ['changedPathCollisionsVerified','contextDescriptorProvenanceVerified','repositoryScopeVerified','taskInputSemanticsVerified','activationAllowed'])assert.equal(result[key],false);
  assert.equal(isResolvedReviewPolicy(result),false);
 }
});
test('supplied uniqueness permits empty or case-distinct paths without inventing repository semantics',()=>{
 for(const paths of [[],['src/Context','src/context'],['outside/context']]) {
  const f=literalTaskFixture();f.task.contextCandidates=paths.map(path=>({path,dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'absent/source'}]}));f.setTask(f.task);
  const result=inspectUniqueDescriptors(f);assert.equal(result.localSuppliedContextPathsUnique,true);
  assert.equal(result.changedPathCollisionsVerified,false);assert.equal(result.repositoryScopeVerified,false);
  assert.equal(result.activationAllowed,false);assert.equal(isResolvedReviewPolicy(result),false);
 }
});

const inspectDeclaredScope=f=>inspectReviewTaskDeclaredContextScopeCandidate(f.seal(),f.objects,f.context);
test('declared prefix containment rejects sibling-prefix confusion then restores without repository authority',()=>{
 for(const path of ['src-other/context','outside/context']) {
  const f=literalTaskFixture();f.task.contextCandidates=[{path,dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'src/original'}]}];f.setTask(f.task);
  assert.equal(inspectUniqueDescriptors(f).localSuppliedContextPathsUnique,true);
  assert.throws(()=>inspectDeclaredScope(f),/outside allowed scope/);
  f.task.contextCandidates[0].path='src/context';f.setTask(f.task);
  const result=inspectDeclaredScope(f);assert.equal(result.localDeclaredContextPathScopeVerified,true);
  for(const key of ['repositoryScopeVerified','contextDescriptorProvenanceVerified','changedPathCollisionsVerified','taskInputSemanticsVerified','activationAllowed'])assert.equal(result[key],false);
  assert.equal(isResolvedReviewPolicy(result),false);
 }
});
test('declared root and exact prefix use original containment without ownership or provenance inference',()=>{
 for(const [prefix,path] of [['.','outside/context'],['src','src'],['src/nested','src/nested/context']]) {
  const f=literalTaskFixture();f.task.scope.allowedPrefixes=[prefix];
  f.task.contextCandidates=[{path,dependencyDepth:1,reasons:[{kind:'direct_import',sourcePath:'absent/source'}]}];f.setTask(f.task);
  const result=inspectDeclaredScope(f);assert.equal(result.localDeclaredContextPathScopeVerified,true);
  assert.equal(result.contextDescriptorProvenanceVerified,false);assert.equal(result.repositoryScopeVerified,false);assert.equal(result.activationAllowed,false);
 }
});

const inspectDeclaredReasonScope=f=>inspectReviewTaskDeclaredReasonScopeCandidate(f.seal(),f.objects,f.context);
test('all relational sources reject sibling/outside prefixes despite in-scope candidate and resealed references',()=>{
 for(const sourcePath of ['src-other/source','outside/source']) {
  const f=literalTaskFixture();f.task.contextCandidates=[{path:'src/context',dependencyDepth:2,reasons:[
   {kind:'direct_import',sourcePath:'src/original'},{kind:'dependency',sourcePath}]}];f.setTask(f.task);
  assert.equal(inspectDeclaredScope(f).localDeclaredContextPathScopeVerified,true);
  assert.throws(()=>inspectDeclaredReasonScope(f),/out-of-scope provenance/);
  f.task.contextCandidates[0].reasons[1].sourcePath='src/missing';f.setTask(f.task);
  const result=inspectDeclaredReasonScope(f);assert.equal(result.localDeclaredReasonSourceScopeVerified,true);
  for(const key of ['repositoryScopeVerified','contextDescriptorProvenanceVerified','taskInputSemanticsVerified','originalRevisionsVerified','activationAllowed'])assert.equal(result[key],false);
  assert.equal(isResolvedReviewPolicy(result),false);
 }
});
test('source containment preserves original root/exact-prefix behavior without proving dependency existence',()=>{
 for(const [prefix,sourcePath] of [['.','outside/missing'],['src','src'],['src/nested','src/nested/missing']]) {
  const f=literalTaskFixture();f.task.scope.allowedPrefixes=[prefix];
  f.task.contextCandidates=[{path:prefix==='.'?'src/context':prefix+'/context',dependencyDepth:1,reasons:[{kind:'dependency',sourcePath}]}];f.setTask(f.task);
  const result=inspectDeclaredReasonScope(f);assert.equal(result.localDeclaredReasonSourceScopeVerified,true);
  assert.equal(result.contextDescriptorProvenanceVerified,false);assert.equal(result.repositoryScopeVerified,false);
  assert.equal(result.activationAllowed,false);assert.equal(isResolvedReviewPolicy(result),false);
 }
});
