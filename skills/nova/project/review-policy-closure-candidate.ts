import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {PORTABLE_JSON_ENCODING,portableJson,sha256Bytes} from '@kubeclaw/plugin-sdk';
import {validateReferencedSchema} from '@kubeclaw/plugin-foundation/registry/schema';
import {projectReviewPolicyAuthorCandidate} from '../plugins/review/src/review-policy-author-candidate.ts';
import {parseReviewInput,preflightReviewInput} from '../plugins/review/src/review-stage-input.ts';
import {parseReviewContextReason} from '../plugins/review/src/review-context-selection.ts';
import {parseReviewContextDescriptor,assertReviewContextDescriptorAllowedScope,assertReviewContextReasonAllowedScope} from '../plugins/review/src/review-context-candidates.ts';
import {bundleUnique} from '../plugins/review/src/review-bundle-values.ts';
import {digestReviewPolicy} from '../plugins/review/src/review-policy-resolver.ts';
import {assertReviewSemanticEncoding,type ReviewSemanticEncoding} from '../plugins/review/src/review-semantics.ts';

const contract=JSON.parse(fs.readFileSync(new URL('./binding-target-candidate.schema.json',import.meta.url),'utf8'));
const shape=(name:string)=>validateReferencedSchema(JSON.stringify({$schema:contract.$schema,$defs:contract.$defs,$ref:`#/$defs/${name}`}),`local-binding-candidate:${name}`);
const profileShape=shape('profile'),projectionShape=shape('consumerProjection'),objectShape=shape('object');
const bindingShape=shape('binding');
const membershipShape=shape('membership');
const authorSchema=JSON.parse(fs.readFileSync(new URL('./review-policy-author-candidate.schema.json',import.meta.url),'utf8'));
const effectiveSchema=JSON.parse(fs.readFileSync(new URL('../plugins/review/schemas/review-policy.v2.schema.json',import.meta.url),'utf8'));
const authorSchemaBytes=Buffer.from(portableJson(authorSchema)),effectiveSchemaBytes=Buffer.from(portableJson(effectiveSchema));
const authorValidator=validateReferencedSchema(authorSchemaBytes.toString(),'local-review-author');
const effectiveValidator=validateReferencedSchema(effectiveSchemaBytes.toString(),'local-review-effective');
type RecordValue=Record<string,any>;
function requireIdentity(value:unknown,label:string):asserts value {
  if(!value)throw new Error(`REVIEW_CLOSURE_CANDIDATE_INVALID:${label}`);
}
function portableValue(bytes:Buffer):unknown {
  let value:unknown;
  try {value=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('REVIEW_CLOSURE_CANDIDATE_INVALID:JSON');}
  requireIdentity(Buffer.from(portableJson(value)).equals(bytes),'CANONICAL_BYTES');
  return value;
}
function objectReader(objects:ReadonlyMap<string,Uint8Array>) {
  const getBytes=(digest:string):Buffer=>{
    const value=objects.get(digest);requireIdentity(value,'OBJECT_MISSING');
    const bytes=Buffer.from(value);requireIdentity(sha256Bytes(bytes)===digest,'OBJECT_DIGEST');return bytes;
  };
  const readObject=(reference:RecordValue)=>{
    objectShape.validate(reference);
    const bytes=getBytes(reference.digest);requireIdentity(bytes.length===reference.bytes,'PHYSICAL_BYTES');
    const value=reference.encoding===PORTABLE_JSON_ENCODING?portableValue(bytes):undefined;
    if(reference.schemaDigest!==null) {
      const schemaBytes=getBytes(reference.schemaDigest);portableValue(schemaBytes);
      if(reference.encoding===PORTABLE_JSON_ENCODING)validateReferencedSchema(schemaBytes.toString(),'referenced-local-review-object').validate(value);
    }
    return {bytes,value};
  };
  return {getBytes,readObject};
}

export interface ReviewClosureInspectionContext {
  stageId:string;instance:string;profile:string;reviewSemanticEncoding:ReviewSemanticEncoding|undefined;
}

/** LOCAL byte/schema/projection inspection of approved parent reference shapes.
 * Public maps/context/refs are NOT authenticated loader capabilities. No source
 * kind, resolver proof, SDK contract, R/history writer or productive caller changes.
 */
export function inspectReviewPolicyClosureCandidate(profileInput:unknown,projectionInput:unknown,
  objects:ReadonlyMap<string,Uint8Array>,context:ReviewClosureInspectionContext) {
  requireIdentity(context&&Object.hasOwn(context,'reviewSemanticEncoding'),'SEMANTIC_MODE_REQUIRED');
  assertReviewSemanticEncoding(context.reviewSemanticEncoding);
  requireIdentity([context.stageId,context.instance,context.profile].every(value=>typeof value==='string'&&value.length>0),'CONTEXT');
  const profile=JSON.parse(portableJson(profileInput)) as RecordValue;
  const projection=JSON.parse(portableJson(projectionInput)) as RecordValue;
  profileShape.validate(profile);projectionShape.validate(projection);
  requireIdentity(profile.owner==='kubeclaw.review'&&profile.registration==='review'&&profile.scope==='M'
    &&profile.instance===context.instance&&profile.profile===context.profile,'PROFILE_SCOPE');
  requireIdentity(projection.stageId===context.stageId&&projection.owner===profile.owner&&projection.registration===profile.registration
    &&projection.instance===profile.instance&&isDeepStrictEqual(projection.profile,profile),'PROJECTION_SCOPE');
  requireIdentity(profile.validationSchema.owner===profile.owner&&profile.validationSchema.registration===profile.registration,'SCHEMA_OWNER');
  const {getBytes,readObject}=objectReader(objects);
  const schemaObject=profile.validationSchema.schemaObject;
  requireIdentity(schemaObject.encoding===PORTABLE_JSON_ENCODING,'SCHEMA_ENCODING');
  requireIdentity(readObject(schemaObject).bytes.equals(authorSchemaBytes),'AUTHOR_SCHEMA_IDENTITY');
  requireIdentity(profile.content.encoding===PORTABLE_JSON_ENCODING&&profile.content.schemaDigest===schemaObject.digest,'AUTHOR_SCHEMA_LINK');
  const authored=readObject(profile.content);authorValidator.validate(authored.value);
  requireIdentity((authored.value as RecordValue).profile===profile.profile,'AUTHOR_PROFILE');
  const candidate=projectReviewPolicyAuthorCandidate(authored.value);
  const effective=projection.effectiveConfig;
  requireIdentity(effective.encoding===PORTABLE_JSON_ENCODING&&effective.schemaDigest===sha256Bytes(effectiveSchemaBytes),'EFFECTIVE_SCHEMA_LINK');
  requireIdentity(getBytes(effective.schemaDigest).equals(effectiveSchemaBytes),'EFFECTIVE_SCHEMA_IDENTITY');
  const received=readObject(effective);effectiveValidator.validate(received.value);
  requireIdentity(received.bytes.equals(Buffer.from(portableJson(candidate.policy))),'PROJECTION_BYTES');
  // These references must exist with exact bytes/schema linkage, but their
  // actual task/source/model/tool/role permissions are NOT established here.
  readObject(projection.taskInput);readObject(projection.effectiveExecution);
  return Object.freeze({...candidate,stageId:projection.stageId as string,instance:profile.instance as string,profile:profile.profile as string,
    profileContentSha256:profile.content.digest as string,effectiveConfigSha256:effective.digest as string,
    reviewSemanticEncoding:context.reviewSemanticEncoding,reviewPolicyDigest:digestReviewPolicy(candidate.policy,context.reviewSemanticEncoding),
    objectIdentitiesVerified:true as const,parentBindingAuthorizationVerified:false as const,
    taskAuthorizationVerified:false as const,executionAuthorizationVerified:false as const});
}

/** Integrity of ONE supplied approved binding record, not parent admission.
 * Foundation/membership/grants/history/software archive semantics remain open.
 * In particular, opaque code dependency labels do not identify an authenticated
 * original parser/projection/semantic reader and never authorize execution.
 */
export function inspectReviewBindingRecordCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const reference=JSON.parse(portableJson(bindingReference)) as RecordValue;
  const {readObject}=objectReader(objects);objectShape.validate(reference);
  requireIdentity(reference.encoding===PORTABLE_JSON_ENCODING,'BINDING_ENCODING');
  const binding=readObject(reference).value as RecordValue;bindingShape.validate(binding);
  const {digest,...unsigned}=binding;
  requireIdentity(digest===sha256Bytes(Buffer.from(portableJson(unsigned))),'BINDING_INTERNAL_DIGEST');
  requireIdentity(context&&binding.runId===context.runId&&binding.groupId===context.groupId,'BINDING_CONTEXT');
  const unique=(values:string[],label:string)=>requireIdentity(new Set(values).size===values.length,label);
  unique(binding.profiles.map((profile:RecordValue)=>portableJson([profile.owner,profile.registration,profile.instance,profile.profile,profile.scope])),'DUPLICATE_PROFILE');
  unique(binding.consumerProjections.map((projection:RecordValue)=>projection.stageId),'DUPLICATE_STAGE');
  unique(binding.dependencies.map((dependency:RecordValue)=>portableJson([dependency.kind,dependency.originalIdentity])),'DUPLICATE_DEPENDENCY');
  for(const projection of binding.consumerProjections as RecordValue[]) {
    requireIdentity(binding.profiles.some((profile:RecordValue)=>isDeepStrictEqual(profile,projection.profile)),'DANGLING_PROFILE');
    requireIdentity(['owner','registration','instance'].every(key=>projection[key]===projection.profile[key]),'PARENT_PROJECTION_SCOPE');
  }
  // The strict record contains descriptors rather than inline policy payloads.
  // Visit every descriptor actually in this record, not arbitrary map entries
  // or references hidden inside unseen foundation/membership object contents.
  const visit=(value:unknown):void=>{
    if(!value||typeof value!=='object')return;
    if(!Array.isArray(value)&&Object.hasOwn(value,'bytes')&&Object.hasOwn(value,'encoding')&&Object.hasOwn(value,'schemaDigest')) {
      readObject(value as RecordValue);return;
    }
    for(const child of Object.values(value))visit(child);
  };
  visit(binding);
  const projections=binding.consumerProjections.filter((projection:RecordValue)=>projection.stageId===context.stageId);
  requireIdentity(projections.length===1,'SELECTED_PROJECTION');
  const projection=projections[0];
  const candidate=inspectReviewPolicyClosureCandidate(projection.profile,projection,objects,context);
  const codeDependencies=(binding.dependencies as RecordValue[]).filter(row=>row.kind==='code').map(row=>Object.freeze({
    originalIdentity:row.originalIdentity as string,contentSha256:row.content.digest as string}));
  return Object.freeze({...candidate,bindingObjectSha256:reference.digest as string,bindingInternalDigest:digest as string,
    bindingRecordDigestVerified:true as const,codeDependencies:Object.freeze(codeDependencies),
    softwarePinningVerified:false as const,foundationAuthorizationVerified:false as const,membershipAuthorizationVerified:false as const});
}

/** Local supplied membership/reference coherence only. The original producer
 * bridge for task graph, partition and per-stage instance authority is absent.
 * No graph version conversion, group inference or installed capability here.
 */
export function inspectReviewMembershipRecordCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const {readObject}=objectReader(objects);
  const reference=JSON.parse(portableJson(bindingReference)) as RecordValue;
  const binding=readObject(reference).value as RecordValue;
  bindingShape.validate(binding);
  requireIdentity(binding.membership.encoding===PORTABLE_JSON_ENCODING,'MEMBERSHIP_ENCODING');
  const membership=readObject(binding.membership).value as RecordValue;
  membershipShape.validate(membership);
  const {digest,...unsigned}=membership;
  requireIdentity(digest===sha256Bytes(Buffer.from(portableJson(unsigned))),'MEMBERSHIP_INTERNAL_DIGEST');
  requireIdentity(membership.runId===binding.runId&&membership.runId===context.runId,'MEMBERSHIP_RUN');
  const groups=membership.groups as RecordValue[];
  requireIdentity(new Set(groups.map(group=>group.groupId)).size===groups.length,'MEMBERSHIP_DUPLICATE_GROUP');
  const allStages=groups.flatMap(group=>group.stages as RecordValue[]);
  requireIdentity(new Set(allStages.map(stage=>stage.stageId)).size===allStages.length,'MEMBERSHIP_DUPLICATE_STAGE');
  readObject(membership.taskGraph); // Bytes only: not an authenticated graph/version.
  for(const group of groups) {
    if(group.standaloneIntent!==null)readObject(group.standaloneIntent);
    const ids=new Set(group.stages.map((stage:RecordValue)=>stage.stageId));
    for(const stage of group.stages as RecordValue[]) {readObject(stage.taskInput);readObject(stage.partition);}
    for(const relation of group.repairRelations as RecordValue[]) {
      requireIdentity(relation.originalGroupId===group.groupId&&ids.has(relation.sourceStage)&&ids.has(relation.targetStage),'MEMBERSHIP_REPAIR_GROUP');
    }
  }
  const selected=groups.filter(group=>group.groupId===binding.groupId);
  requireIdentity(selected.length===1,'MEMBERSHIP_SELECTED_GROUP');
  for(const projection of binding.consumerProjections as RecordValue[]) {
    const members=selected[0].stages.filter((stage:RecordValue)=>stage.stageId===projection.stageId);
    requireIdentity(members.length===1,'MEMBERSHIP_PROJECTION_STAGE');
    const member=members[0];
    // This inspector selects the actual registered Review stage, not any
    // other stage that happens to reuse its supplied owner/profile labels.
    if(projection.stageId===context.stageId)requireIdentity(member.stageType==='kubeclaw.decision.review','MEMBERSHIP_REVIEW_STAGE_TYPE');
    requireIdentity(['owner','registration','instance'].every(key=>member[key]===projection[key]),'MEMBERSHIP_PROJECTION_OWNER');
    requireIdentity(isDeepStrictEqual(member.taskInput,projection.taskInput),'MEMBERSHIP_TASK_INPUT');
  }
  const candidate=inspectReviewBindingRecordCandidate(reference,objects,context);
  return Object.freeze({...candidate,membershipObjectSha256:binding.membership.digest as string,
    membershipInternalDigest:digest as string,membershipReferencesCoherent:true as const,
    originalTaskGraphVerified:false as const,partitionSemanticsVerified:false as const,stageInstanceAuthorizationVerified:false as const});
}

/** Optional local task shape seam, using the original registered Review input
 * schema. Does not resolve sourceStageId, parse runtime evidence, or authorize
 * tasks/revisions/partitions. The reference-only inspector stays independent.
 */
export function inspectReviewTaskInputShapeCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewMembershipRecordCandidate(bindingReference,objects,context);
  const {readObject,getBytes}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const schema=JSON.parse(fs.readFileSync(new URL('../plugins/review/schemas/input.schema.json',import.meta.url),'utf8'));
  const schemaBytes=Buffer.from(portableJson(schema)),reference=projection.taskInput;
  requireIdentity(reference.encoding===PORTABLE_JSON_ENCODING,'TASK_INPUT_ENCODING');
  requireIdentity(reference.schemaDigest===sha256Bytes(schemaBytes),'TASK_INPUT_SCHEMA_LINK');
  requireIdentity(getBytes(reference.schemaDigest).equals(schemaBytes),'TASK_INPUT_SCHEMA_IDENTITY');
  const task=readObject(reference);
  validateReferencedSchema(schemaBytes.toString(),'original-registered-review-task-input').validate(task.value);
  return Object.freeze({...candidate,taskInputShapeVerified:true as const,taskInputSchemaSha256:reference.schemaDigest as string,
    taskInputSemanticsVerified:false as const,originalRevisionsVerified:false as const});
}

/** Literal-base tasks only: reuse the unchanged original parser without making
 * up resolved source-stage revisions or invoking runtime/store capabilities.
 * Parser success proves local content consistency, never original provenance.
 */
export function inspectReviewLiteralTaskParserCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewTaskInputShapeCandidate(bindingReference,objects,context);
  const {readObject}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const task=readObject(projection.taskInput).value as RecordValue;
  const preflight=preflightReviewInput(task,candidate.policy.limits.maxBundleBytes);
  requireIdentity(preflight==='within_limit',`TASK_ORIGINAL_PREFLIGHT:${preflight}`);
  requireIdentity(!Object.hasOwn(task.revisions,'sourceStageId'),'TASK_SOURCE_REVISIONS_UNRESOLVED');
  const parsed=parseReviewInput(task);
  requireIdentity(parsed.ok,`TASK_ORIGINAL_PARSER:${parsed.ok?'':parsed.error}`);
  return Object.freeze({...candidate,localTaskPreflightVerified:true as const,localTaskParserVerified:true as const,
    taskInputSemanticsVerified:false as const,originalRevisionsVerified:false as const});
}

/** Original context-reason grammar ONLY. Actual changed scope, repository
 * revision, descriptor provenance/hydration and selection still require the
 * original invocation; do not synthesize changed paths to pass those gates.
 */
export function inspectReviewTaskContextReasonsCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewLiteralTaskParserCandidate(bindingReference,objects,context);
  const {readObject}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const task=readObject(projection.taskInput).value as RecordValue;
  for(const [index,descriptor] of task.contextCandidates.entries()) {
    for(const [reasonIndex,reason] of descriptor.reasons.entries()) {
      parseReviewContextReason(reason,`contextCandidates[${index}].reasons[${reasonIndex}]`);
    }
  }
  return Object.freeze({...candidate,localContextReasonsVerified:true as const,
    contextDescriptorProvenanceVerified:false as const,repositoryScopeVerified:false as const});
}

/** Original descriptor grammar ONLY; no invented changed/deleted scope, frozen
 * revision, hydration, selection, or resolved-policy authority is constructed.
 */
export function inspectReviewTaskDescriptorsCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewTaskContextReasonsCandidate(bindingReference,objects,context);
  const {readObject}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const task=readObject(projection.taskInput).value as RecordValue;
  task.contextCandidates.forEach((descriptor:unknown,index:number)=>parseReviewContextDescriptor(descriptor,index));
  return Object.freeze({...candidate,localContextDescriptorGrammarVerified:true as const,
    contextDescriptorProvenanceVerified:false as const,repositoryScopeVerified:false as const});
}

/** Supplied descriptor path uniqueness only, using the original runtime check.
 * Changed-path collisions and provenance still require genuine repository scope;
 * distinct reasons/depths never make two descriptors for one path distinct.
 */
export function inspectReviewTaskDescriptorUniquenessCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewTaskDescriptorsCandidate(bindingReference,objects,context);
  const {readObject}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const task=readObject(projection.taskInput).value as RecordValue;
  bundleUnique(task.contextCandidates.map((descriptor:RecordValue)=>descriptor.path),'context candidate paths');
  return Object.freeze({...candidate,localSuppliedContextPathsUnique:true as const,
    changedPathCollisionsVerified:false as const,contextDescriptorProvenanceVerified:false as const,repositoryScopeVerified:false as const});
}

/** Original path containment against task-declared prefixes only. The supplied
 * task is not an authenticated repository scope or changed/deleted-path proof.
 */
export function inspectReviewTaskDeclaredContextScopeCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewTaskDescriptorUniquenessCandidate(bindingReference,objects,context);
  const {readObject}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const task=readObject(projection.taskInput).value as RecordValue;
  task.contextCandidates.forEach((descriptor:unknown,index:number)=>
    assertReviewContextDescriptorAllowedScope(parseReviewContextDescriptor(descriptor,index),task.scope.allowedPrefixes));
  return Object.freeze({...candidate,localDeclaredContextPathScopeVerified:true as const,
    repositoryScopeVerified:false as const,contextDescriptorProvenanceVerified:false as const});
}

/** Task-declared relational source containment only. A same-prefix source may
 * still be absent, deleted, deeper, or unrelated to the genuine frozen revision.
 */
export function inspectReviewTaskDeclaredReasonScopeCandidate(bindingReference:unknown,objects:ReadonlyMap<string,Uint8Array>,
  context:ReviewClosureInspectionContext&{runId:string;groupId:string}) {
  const candidate=inspectReviewTaskDeclaredContextScopeCandidate(bindingReference,objects,context);
  const {readObject}=objectReader(objects);
  const binding=readObject(JSON.parse(portableJson(bindingReference))).value as RecordValue;
  const projection=binding.consumerProjections.find((row:RecordValue)=>row.stageId===context.stageId);
  const task=readObject(projection.taskInput).value as RecordValue;
  task.contextCandidates.forEach((value:unknown,index:number)=>{
    const descriptor=parseReviewContextDescriptor(value,index);
    descriptor.reasons.forEach(reason=>assertReviewContextReasonAllowedScope(descriptor,reason,task.scope.allowedPrefixes));
  });
  return Object.freeze({...candidate,localDeclaredReasonSourceScopeVerified:true as const,
    repositoryScopeVerified:false as const,contextDescriptorProvenanceVerified:false as const});
}
