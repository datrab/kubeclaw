// Original admitted component/contextRequest value; seeded output, not a model-success claim.
import assert from 'node:assert/strict';
import {canonicalJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {parseEchoReviewOutput} from '../../../skills/nova/plugins/review/src/echo-review-parser.ts';
import {ECHO_REVIEW_SCHEMA_VERSION} from '../../../skills/nova/plugins/review/src/echo-review-contract.ts';
import {reusableReviewResult} from '../../../skills/nova/plugins/review/src/review-completion.ts';
import {assertEchoContextRequestRequirements} from '../../../skills/nova/plugins/review/src/echo-context-request-parser.ts';
import {parseReviewRuntimeAttestation, assertReviewRuntimeIdentity} from '../../../skills/nova/plugins/review/src/review-runtime-attestation.ts';
import {buildReviewGraph} from '../../../skills/nova/plugins/review/src/review-graph.ts';
import {buildScalableReviewPlan} from '../../../skills/nova/plugins/review/src/review-scale-slicing.ts';
import {parseReviewSnapshotInventory} from '../../../skills/nova/plugins/review/src/review-snapshot-inventory.ts';
import {buildScalableReviewJobs} from '../../../skills/nova/plugins/review/src/scalable-review-jobs.ts';

export function admittedCacheValue(){
  const documents=[{path:'a.ts',content:'export const a = 1;\n'}];
  const files=documents.map(x=>({path:x.path,objectId:'1'.repeat(40),mode:'100644',sizeBytes:Buffer.byteLength(x.content)}));
  const snapshot=parseReviewSnapshotInventory({head:'a'.repeat(40),files,inventoryDigest:sha256Text(canonicalJson(files))});
  const graph=buildReviewGraph(snapshot,[]),tokenCounts=new Map([['a.ts',10]]),budget={maxFiles:1,maxBytes:1000,maxTokens:1000};
  const plan=buildScalableReviewPlan(snapshot,graph,tokenCounts,budget);
  const job=buildScalableReviewJobs({plan,graph,documents,tokenCounts,budget}).find(x=>x.kind==='component');
  assert.ok(job);
  const unverified={assessment:'unverified',explanation:'The requested supporting file is needed.',evidence:[]};
  const output={schemaVersion:ECHO_REVIEW_SCHEMA_VERSION,summary:'Request supporting context.',inspectedEvidence:[{kind:'reviewed-source',digest:job.source[0].digest}],
    requirementAssessments:{...Object.fromEntries(job.requirements.map(x=>[x.id,unverified])),I:unverified,i:unverified},
    proposedFindings:[],contextRequest:{paths:['support.ts'],requirementIds:[job.requirements[0].id],reason:'Inspect supporting source.'}};
  const parsed=parseEchoReviewOutput(output);assert.equal(parsed.ok,true);
  assertEchoContextRequestRequirements(parsed.value.contextRequest,job.requirements.map(x=>x.id));
  const runtimeIdentity={targetId:'echo',runtime:'subagent',agentId:'codex',model:'declared/model',thinking:'high'};
  const runtime={schemaVersion:'runtime-agent-attestation.v1',...runtimeIdentity,identityDigest:sha256Text(canonicalJson(runtimeIdentity))};
  assertReviewRuntimeIdentity(parseReviewRuntimeAttestation(runtime),runtimeIdentity);
  const value={jobId:job.id,jobDigest:job.digest,parsed,runtime};assert.equal(reusableReviewResult(job,value,true),true);
  const identity={policyDigest:`sha256:${'b'.repeat(64)}`,reviewerProtocol:'review.v1',reviewerModel:runtime.model,
    reviewerRuntimeIdentityDigest:runtime.identityDigest,evidenceVersion:'repository-review-evidence.v2'};
  return {job,identity,value};
}
