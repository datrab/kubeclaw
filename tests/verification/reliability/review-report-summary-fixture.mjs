import assert from 'node:assert/strict';
import {canonicalJson,sha256Text,PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {gateCoverageDigest} from '@kubeclaw/pipeline-test-gate-contract';
import {buildSummary} from '../../../skills/nova/plugins/project-summary/src/summary.ts';
import {storeReviewReport,storeReviewBundle} from '../../../skills/nova/plugins/review/src/review-report-storage.ts';
import {reportFixture} from './review-report-locale-fixture.mjs';

// Strict report builder/schema + actual CAS and summary consumer. Other gate
// evidence is explicitly an artifact-contract fixture, not native provider proof.
export async function strictReportSummary(contextFactory,saved){
 if(saved){
  const summary=await buildSummary(saved.input,contextFactory({runId:'run:report-hex',stageId:'summary',attemptId:'summary:1',attemptNumber:1},saved.artifacts));
  assert.equal(summary.sourceRevision,'2'.repeat(40));assert(summary.evidence.some(ref=>ref.digest===saved.reportDigest));
  return {summaryDigest:summary.digest,reportDigest:saved.reportDigest,reportStrict:true,providerExecution:false};
 }
 const artifacts=[],revision='2'.repeat(40),runId='run:report-hex';
 const context=stageId=>contextFactory({runId,stageId,attemptId:stageId==='review'?'attempt-hex':`${stageId}:1`,attemptNumber:1},artifacts);
 async function put(stageId,namespace,id,value){
  const result=await context(stageId).invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:id},payload:{namespace,mediaType:'application/json',value}});
  artifacts.push(result.artifact);return result.artifact;
 }
 function coverage(kind){const value={schemaVersion:'gate-coverage.v1',projectId:'app',kind,baseRevision:'1'.repeat(40),
  modules:[{moduleId:'app',ownedPaths:['src'],requirements:[{id:'works',statement:'Application works.'}]}],integrationRequirements:[],requiredChecks:[{checkId:'works',requirementRefs:[{moduleId:'app',requirementId:'works'}],nodeIds:['unit']}]};
  return {...value,policyDigest:gateCoverageDigest(value)};
 }
 const moduleCoverage=coverage('module'),finalCoverage=coverage('cumulative');
 await put('forge','kubeclaw.implementation-agent','implementation:app',{status:'ready_for_testing',sourceRevision:revision});
 await put('lint','kubeclaw.lint','lint:app',{sourceRevision:revision,summary:{tools_failed:0,total_blocking:0}});
 for(const [stageId,policy] of [['test',moduleCoverage],['final-test',finalCoverage]]){
  const unsignedCoverage={schemaVersion:'gate-coverage-result.v1',policy,planDigest:sha256Text('contract-vector-plan'),pipelineStageId:stageId,
   sourceRevision:`git:${revision}`,sourceTree:`git:${'b'.repeat(40)}`,archiveContentDigest:sha256Text('contract-vector-archive'),checks:[{checkId:'works',declarationId:'unit',nodeId:'unit',state:'passed'}]};
  const coverage={...unsignedCoverage,coverageDigest:sha256Text(canonicalJson(unsignedCoverage))};
  const unsigned={schemaVersion:'test-gate-decision.v2',coverage,runId,state:'passed',jobId:`job:${stageId}`,planId:`plan:${stageId}`,resultDigest:sha256Text('stored-result'),reviews:[],nodes:[{nodeId:'unit',kind:'test',mode:'blocking',effect:'passed',reason:'Artifact contract fixture only.'}]};
  const decisionDigest=sha256Text(canonicalJson(unsigned));
  await put(stageId,'kubeclaw.buster-quality-gate',`buster-quality:${stageId}:decision:1`,{...unsigned,decisionDigest});
  await put(stageId,'kubeclaw.buster-quality-gate',`buster-quality:${stageId}:1`,{sourceRevision:revision,testAgent:{enabled:false},nativeOutcome:'passed',decisionDigest});
 }
 const {value,snapshot}=reportFixture(finalCoverage),review=context('review');
 artifacts.push(await storeReviewBundle(snapshot,review));
 const artifact=await storeReviewReport(value,review,PORTABLE_JSON_ENCODING);artifacts.push(artifact);
 const input={projectId:'app',modules:[{moduleId:'app',sourceStageId:'forge',testStageId:'test',expectedCoverage:moduleCoverage}],
  final:{sourceStageId:'forge',testStageId:'final-test',lintStageId:'lint',reviewStageId:'review',expectedCoverage:finalCoverage}};
 const summary=await buildSummary(input,context('summary'));
 assert.equal(summary.sourceRevision,revision);assert(summary.evidence.some(ref=>ref.digest===artifact.digest));
 return {summaryDigest:summary.digest,reportDigest:artifact.digest,reportStrict:true,providerExecution:false,input,artifacts};
}
