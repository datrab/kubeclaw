import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson,sha256Text,type AdapterActivationContext,type AdapterInstance,type AdapterInvocation,type ArtifactRef } from '@kubeclaw/plugin-sdk';
import { FileNovaGateImportStore } from '@kubeclaw/nova-core';
import { assertCoverageDecision,coveragePassed,parseGateDecision } from '@kubeclaw/pipeline-test-gate-contract';
import { projectDemoEvidence } from './demo-evidence.ts';

type ObjectValue = Record<string,any>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DEMO_EVIDENCE_INVALID');
  return value as ObjectValue;
}
function text(value:unknown):string {
  if(typeof value!=='string'||!value||value.length>2048)throw new Error('DEMO_EVIDENCE_INVALID');
  return value;
}
async function read(context:AdapterActivationContext,ref:ArtifactRef,runId:string,stageId:string,namespace:string) {
  if(ref.namespace!==namespace || ref.mediaType!=='application/json' || ref.producer?.runId!==runId || ref.producer.stageId!==stageId
    || !Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes<1 || ref.sizeBytes>8*1024*1024)throw new Error('DEMO_EVIDENCE_ARTIFACT_OWNER_INVALID');
  const response=await context.invoke('artifacts.read',{operation:'get_latest_json',resource:{type:'artifact.object',canonicalId:ref.artifactId},payload:{namespace,digest:ref.digest}});
  const bytes=canonicalJson(response.value);
  if(canonicalJson(response.artifact)!==canonicalJson(ref) || response.digest!==ref.digest || sha256Text(bytes)!==ref.digest
    || response.sizeBytes!==ref.sizeBytes || Buffer.byteLength(bytes)!==ref.sizeBytes)throw new Error('DEMO_EVIDENCE_ARTIFACT_INTEGRITY_INVALID');
  return object(response.value);
}
async function project(context:AdapterActivationContext,invocation:AdapterInvocation,store:FileNovaGateImportStore) {
  const {request}=invocation;
  if(request.capability!=='test.plan.evidence'||request.operation!=='demo'||request.resource.type!=='test.plan.evidence')throw new Error('DEMO_EVIDENCE_OPERATION_INVALID');
  const runId=request.attempt.runId;
  const manifestRef=object(request.payload.manifest) as ArtifactRef;
  if(request.resource.canonicalId!==manifestRef.artifactId || request.payload.namespace!==manifestRef.namespace)throw new Error('DEMO_EVIDENCE_MANIFEST_INVALID');
  const manifest=await read(context,manifestRef,runId,text(context.config.manifestStageId),'kubeclaw.project-summary');
  const {digest,...unsigned}=manifest;
  const final=object(manifest.final);
  assertManifest(manifest,final,runId,context.config.gateStageId,digest,unsigned);
  const refs=manifest.evidence.filter((ref:ArtifactRef)=>ref.namespace==='kubeclaw.buster-quality-gate'&&ref.producer?.stageId===context.config.gateStageId&&ref.artifactId.includes(':decision:'));
  if(refs.length!==1)throw new Error('DEMO_EVIDENCE_GATE_REFERENCE_INVALID');
  const decision=parseGateDecision(await read(context,refs[0],runId,text(context.config.gateStageId),'kubeclaw.buster-quality-gate'));
  assertCoverageDecision(decision,final.expectedCoverage,manifest.sourceRevision,text(context.config.gateStageId));
  if(decision.state!=='passed'||!decision.coverage||!coveragePassed(decision.coverage)||decision.decisionDigest!==final.decisionDigest
    || decision.resultDigest!==final.resultDigest || canonicalJson(decision.coverage)!==canonicalJson(final.coverage))throw new Error('DEMO_EVIDENCE_GATE_NOT_PASSED');
  const verified=await store.readVerifiedResult({jobId:decision.jobId,runId,pipelineStageId:text(context.config.gateStageId),
    sourceRevision:decision.coverage.sourceRevision,decisionDigest:decision.decisionDigest,resultDigest:text(decision.resultDigest)});
  if(invocation.signal.aborted)throw new Error('DEMO_EVIDENCE_CANCELLED');
  return Object.freeze({...projectDemoEvidence(verified,text(request.payload.authNodeId)),manifest:manifestRef,decision:refs[0]});
}

export function activate(context:AdapterActivationContext):AdapterInstance {
  const root=text(context.config.stateRoot);
  if(!path.isAbsolute(root)||path.normalize(root)!==root)throw new Error('DEMO_EVIDENCE_STORE_INVALID');
  text(context.config.manifestStageId);text(context.config.gateStageId);
  const store=new FileNovaGateImportStore(path.join(root,'imports'),{recordLimits:{maximumRecords:10000,maximumBytes:1024**3,maximumRecordBytes:64*1024**2},maximumEvidenceStoreBytes:1024**3});
  let stopping=false;
  return {async ready(){if(stopping)throw new Error('ADAPTER_SHUTTING_DOWN');},async invoke(invocation){
    if(!invocation.confidential)invocation.fence.assertCurrent();
    if(stopping||invocation.signal.aborted)throw new Error('DEMO_EVIDENCE_CANCELLED');
    if(fs.realpathSync(root)!==root)throw new Error('DEMO_EVIDENCE_STORE_INVALID');
    return project(context,invocation,store);
  },async shutdown(){stopping=true;}};
}

function assertManifest(manifest:ObjectValue,final:ObjectValue,runId:string,gateStageId:unknown,digest:unknown,unsigned:ObjectValue) {
  if(manifest.schemaVersion!=='delivery-manifest.v2'||manifest.runId!==runId||digest!==sha256Text(canonicalJson(unsigned))
    || manifest.sourceRevision!==final.sourceRevision || final.testStageId!==gateStageId || !Array.isArray(manifest.evidence))throw new Error('DEMO_EVIDENCE_MANIFEST_INVALID');
}
