import { parseGateDecision,remotePlanResultDigest,remotePlanResultReceipt,remotePlanDigest,
  validatePipelineTestGateContract,type RemotePlanJobV1,type RemotePlanResultV1,type GateDecisionV1 } from '@kubeclaw/pipeline-test-gate-contract';
export interface VerifiedOutputBinding {
  readonly jobId:string;readonly runId:string;readonly pipelineStageId:string;readonly sourceRevision:string;
  readonly decisionDigest:string;readonly resultDigest:string;
}
interface Stored {
  readonly schemaVersion:string;readonly state:string;readonly jobId:string;readonly remoteResultDigest:string|null;
  readonly source:Pick<RemotePlanJobV1,'jobId'|'pipelineStageId'|'plan'>&{readonly sourceRevision:string};
  readonly remoteResult:RemotePlanResultV1|null;readonly decision:GateDecisionV1;
}
/** The store owns admission. This checks a completed stored result, never creates an execution receipt. */
export function validateVerifiedOutput(stored:Stored|undefined,binding:VerifiedOutputBinding) {
  if(!stored||stored.schemaVersion!=='nova-test-gate-import.v2'||stored.state!=='complete'||!stored.remoteResult)throw new Error('NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED');
  const {source,remoteResult:result}=stored;
  const decision=parseGateDecision(stored.decision);
  const actual={jobId:source.jobId,runId:source.plan.runId,pipelineStageId:source.pipelineStageId,sourceRevision:source.sourceRevision,
    decisionDigest:decision.decisionDigest,resultDigest:result.resultDigest};
  if(remotePlanDigest(actual)!==remotePlanDigest(binding)||decision.state!=='passed')throw new Error('NOVA_VERIFIED_OUTPUT_BINDING_MISMATCH');
  const relations=[
    [stored.jobId,source.jobId],[result.jobId,source.jobId],[decision.jobId,source.jobId],
    [result.runId,source.plan.runId],[decision.runId,source.plan.runId],
    [result.planId,source.plan.planId],[decision.planId,source.plan.planId],[result.planDigest,source.plan.planDigest],
    [stored.remoteResultDigest,result.resultDigest],[decision.resultDigest,result.resultDigest],
    [remotePlanResultDigest(result),result.resultDigest],
    [remotePlanDigest(result.receipt),remotePlanDigest(remotePlanResultReceipt(source.jobId,result.resultDigest))],
  ];
  if(relations.some(([a,b])=>a!==b))throw new Error('NOVA_VERIFIED_OUTPUT_BINDING_MISMATCH');
  validatePipelineTestGateContract('remotePlanResult',result);
  return structuredClone({source,result,decision});
}
