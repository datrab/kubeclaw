from pathlib import Path
root=Path('skills/common/plugin-runtime/foundation/observability')
p=root/'attempt-evidence.ts';s=p.read_text();start=s.index('    requireIdentity(',s.index('export async function storeEvidence'));end=s.index('    const content =',start);validation=s[start:end];s=s[:start]+'    validateEvidenceInput(snapshot);\n'+s[end:];start=s.index('      const state =',s.index('export async function storeEvidence'));end=s.index('\n    });',start);body=s[start:end];s=s[:start]+s[end:];s=s.replace('return store.serial(async () => {\n    });','return store.serial(() => persistEvidence(store,snapshot,content));');s+='\nfunction validateEvidenceInput(snapshot:DurableEvidenceInput):void {\n'+validation+'}\n';s+='\nasync function persistEvidence(store:AttemptState,snapshot:DurableEvidenceInput,content:Uint8Array):Promise<WorkerEvidenceRefV1> {\n'+body+'}\n';p.write_text(s)
p=root/'attempt-results.ts';s=p.read_text();start=s.index('      const generations =');end=s.index('      const existing =',start);generation=s[start:end];startExisting=end;endExisting=s.index('      if (existing) {',startExisting);lookup=s[startExisting:endExisting];endHandling=s.index('      const finalizedGeneration =',endExisting);handling=s[endExisting:endHandling];endFinal=s.index('      for (const evidence of',endHandling);finalized=s[endHandling:endFinal];endEvidence=s.index('      if (state.results.length',endFinal);evidence=s[endFinal:endEvidence];endCommit=s.index('\n    });',endEvidence);commit=s[endEvidence:endCommit];s=s[:start]+'''      const existing=findResult(state,pipelineRunId,snapshot);
      if(existing)return resumeResultCommit(store,state,existing,snapshot,intent,ownerSnapshot);
      requireUnfinalizedAttempt(state,pipelineRunId,snapshot);
      await verifyResultEvidence(state,pipelineRunId,snapshot);
      return commitResult(store,state,pipelineRunId,snapshot,intent,ownerSnapshot);
'''+s[endCommit:];s+='''
function findResult(state:DurableAttemptStoreSnapshot,pipelineRunId:string,snapshot:WorkerAttemptResultV1):DurableResultMetadata|undefined {
'''+generation+lookup.replace('      const existing =','      return')+'}\n';handling=handling[len('      if (existing) {\n'):].rsplit('      }',1)[0];s+='''
async function resumeResultCommit(store:AttemptState,state:DurableAttemptStoreSnapshot,existing:DurableResultMetadata,
  snapshot:WorkerAttemptResultV1,intent:DurableCompletionIntent|null,ownerSnapshot:DurableResultOwner|null):Promise<DurableResultMetadata> {
'''+handling+'}\n';s+='''
function requireUnfinalizedAttempt(state:DurableAttemptStoreSnapshot,pipelineRunId:string,snapshot:WorkerAttemptResultV1):void {
'''+finalized+'}\n';s+='''
async function verifyResultEvidence(state:DurableAttemptStoreSnapshot,pipelineRunId:string,snapshot:WorkerAttemptResultV1):Promise<void> {
'''+evidence+'}\n';s+='''
async function commitResult(store:AttemptState,state:DurableAttemptStoreSnapshot,pipelineRunId:string,snapshot:WorkerAttemptResultV1,
  intent:DurableCompletionIntent|null,ownerSnapshot:DurableResultOwner|null):Promise<DurableResultMetadata> {
'''+commit+'}\n';p.write_text(s)
p=root/'attempt-completeness.ts';s=p.read_text();start=s.index('      const requiredClosureIds =');end=s.index('\n    });',start);body=s[start:end];s=s[:start]+'''      return evaluateStoredClosures(state,{pipelineRunId,requirements,admittedRecords,rangeSnapshot,unresolvedSnapshot});
'''+s[end:];body=body.replace('      const requiredClosureIds =', '      const {pipelineRunId,requirements,admittedRecords,rangeSnapshot,unresolvedSnapshot}=request;\n      const requiredClosureIds =',1)
start=body.index('        const closure =');end=body.index('        if (valid) admittedClosureIds.push(requirement.closureId);',start)+len('        if (valid) admittedClosureIds.push(requirement.closureId);');closure=body[start:end];body=body[:start]+'''        const evaluated=await evaluateClosure(state,pipelineRunId,requirement,admittedRecords);
        evidenceItems.push(...evaluated.evidenceItems);
        if(evaluated.valid)admittedClosureIds.push(requirement.closureId);'''+body[end:]
# Extract the per-evidence IO/diagnostic responsibility while keeping its exact branches.
a=closure.index('          const metadata =');b=closure.index('          if (reasonCode) {',a);evidence=closure[a:b];itemStart=closure.index('            evidenceItems.push({',b);itemEnd=closure.index('            });',itemStart)+len('            });');item=closure[itemStart:itemEnd].replace('evidenceItems.push({','return {').replace('            });','            };');evidence+='          if(!reasonCode)return null;\n'+item+'\n'
loopStart=closure.index('        for (const evidenceId of closure.requiredEvidenceIds) {');loopEnd=closure.index('        if (valid) admittedClosureIds.push(requirement.closureId);')
closure=closure[:loopStart]+'''        for(const evidenceId of closure.requiredEvidenceIds) {
          const issue=await evidenceIssue(state,pipelineRunId,requirement,evidenceId);
          if(issue){valid=false;evidenceItems.push(issue);}
        }
'''+closure[loopEnd:]
# Replace loop's final admitted side-effect with its explicit result.
closure=closure.replace('        if (!closure) continue;','        if (!closure)return {valid:false,evidenceItems:[]};')
closure=closure.replace('        if (valid) admittedClosureIds.push(requirement.closureId);','        return {valid,evidenceItems};')
# The sliced close was the inner if; preserve the outer evidence iteration close.
closure=closure.replace('const issue=await evidenceIssue(state,pipelineRunId,requirement,evidenceId);','const issue=await evidenceIssue(state,pipelineRunId,requirement,evidenceId);')
s+='''
interface CompletenessRequest {
  pipelineRunId:string;requirements:RequiredProducerClosure[];admittedRecords:ReadonlyArray<AdmittedRecordView>;
  rangeSnapshot:ProducerGapReportV1[];unresolvedSnapshot:UnresolvedObservabilityItemV1[];
}
async function evaluateStoredClosures(state:DurableAttemptStoreSnapshot,request:CompletenessRequest):Promise<ObservabilityCompletenessV1> {
'''+body+'}\n'
s+='''
async function evaluateClosure(state:DurableAttemptStoreSnapshot,pipelineRunId:string,requirement:RequiredProducerClosure,
  admittedRecords:ReadonlyArray<AdmittedRecordView>):Promise<{valid:boolean;evidenceItems:UnresolvedObservabilityItemV1[]}> {
  const evidenceItems:UnresolvedObservabilityItemV1[]=[];
'''+closure+'\n}\n'
s+='''
async function evidenceIssue(state:DurableAttemptStoreSnapshot,pipelineRunId:string,requirement:RequiredProducerClosure,
  evidenceId:string):Promise<UnresolvedObservabilityItemV1|null> {
'''+evidence+'}\n';p.write_text(s)
