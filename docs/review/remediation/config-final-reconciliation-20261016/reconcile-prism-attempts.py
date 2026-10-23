#!/usr/bin/env python3
"""Exact engine source joins; literal rendering/provider residuals are never closed."""
import copy
import importlib.util
import json
from pathlib import Path
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('helpers', OUT / 'reconcile-adapters.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OWNER = 'config/components/prism-control.config.json'
LEGACIES = {'config/engines/prism-agent.config.json', 'config/engines/prism-execution.config.json'}
ENVELOPE = 'skills/prism/engine/worker-envelope.ts'
AGENT = 'skills/prism/server/agent-attempt.ts'
RUNNER = 'skills/prism/server/agent-job-runner.mjs'
NATIVE = 'skills/prism/control/native-operation.ts'
SPECS = {}
for leaf, suffix in [('timeoutMs','TimeoutMs'),('cleanupTimeoutMs','CleanupTimeoutMs'),('logBytes','LogBytes'),('resultBytes','ResultBytes'),('evidenceBytes','EvidenceBytes'),('evidenceFiles','EvidenceFiles')]:
 SPECS['AUTH-PRISM-ATTEMPT-'+leaf] = ('nativeAttempt'+suffix, 'limits.'+leaf, ENVELOPE, 'limits: { timeoutMs, cleanupTimeoutMs, logBytes, resultBytes, evidenceBytes, evidenceFiles }')
 SPECS['AUTH-PRISM-AGENT-LIMIT-'+leaf] = ('agentLauncher/limits/'+leaf, 'limits.'+leaf, AGENT, 'limits:{...limits}')
SPECS.update({
 'AUTH-PRISM-CLAIM-LIFETIME': ('nativeAttemptLifetimeMs','expires',ENVELOPE,'now.getTime() + lifetimeMs'),
 'AUTH-PRISM-AGENT-CLAIM-LIFETIME': ('agentLauncher/attemptLifetimeMs','claimLifetimeMs','skills/prism/control/agent-jobs.ts','[config.agentLauncher.attemptLifetimeMs]'),
 'AUTH-PRISM-AGENT-KILL-GRACE': ('agentLauncher/terminationGraceMs','terminationGraceMs','skills/prism/server/agent-process.ts',"setTimeout(()=>kill('SIGKILL'),this.terminationGraceMs)"),
 'AUTH-PRISM-AGENT-CLAIM-HTTP': ('agentBridge/controlRequestTimeoutMs','claimHttpTimeoutMs',RUNNER,"'/v1/agent/jobs/claim',{runnerId:this.runnerId},AbortSignal.timeout(this.config.controlRequestTimeoutMs)"),
 'AUTH-PRISM-AGENT-FINISH-HTTP': ('agentBridge/controlRequestTimeoutMs','finishHttpTimeoutMs',RUNNER,'/finish`,{fence:job.fence,outcome},AbortSignal.timeout(this.config.controlRequestTimeoutMs)'),
})
RESIDUALS = {
 'AUTH-PRISM-AGENT-CLI-OWNER': ('agentId',RUNNER,"'agent','--agent','main'",'CLI target main remains literal; do not confuse random bridge runnerId/claim owner with selected OpenClaw agent target. Needs selected target receiving and original launch identity capture/delivery; no agent authority redesign.'),
 'AUTH-PRISM-NATIVE-COMPLETION-PHASE-ALLOWANCE': ('timeoutMs: envelope.limits.timeoutMs + 8 * envelope.limits.cleanupTimeoutMs','skills/prism/server/native-worker-execution.ts','timeoutMs: envelope.limits.timeoutMs + 8 * envelope.limits.cleanupTimeoutMs','Multiplier8 remains literal. Existing selected cleanupTimeoutMs is not an authored completion-phase count. Versioned native supervisor receiving and original attempt/history binding required; do not change deadline semantics or weaken native gate.'),
}
def build(ledgers=None, owner=None):
 roster=h.read(h.ROSTER);refs={r['id']:r for r in roster['fields']}
 ledgers=h.read(str((OUT/'fields.json').relative_to(h.ROOT))) if ledgers is None else ledgers
 owner=h.read(OWNER) if owner is None else owner
 if owner['owner']!='prism-control' or owner['schemaVersion']!='pipeline-component.v2':raise ValueError('Owner/version drift')
 rows=[];seen=set();cache={}
 for row in ledgers:
  locators=[x['path'] for x in row['explicitConfigLocatorObservations'] if x['path'] in LEGACIES]
  if not locators:continue
  identity=row['id']
  if identity not in set(SPECS)|set(RESIDUALS) or identity in seen:raise ValueError('Unknown/duplicate attempt field: '+identity)
  seen.add(identity);ref=refs[identity]
  if row['original']!=ref['original'] or row['originalObjectSha256']!=ref['sha256'] or row['caseIds']!=ref['caseIds']:raise ValueError('Original identity/hash/cases drift')
  doc,ptr=ref['original'].split('#',1);source=roster['documents'][doc]['path']
  if source not in cache:cache[source]=h.read(source)
  original=h.pointer(cache[source],ptr)
  if h.digest(original)!=ref['sha256'] or row['owner']!=original['owner'] or row['class']!=original['class']:raise ValueError('Original object/class/owner drift')
  expected=SPECS[identity][1] if identity in SPECS else RESIDUALS[identity][0]
  if original['source']['field']!=expected:raise ValueError('Original source coordinate drift')
  common={k:row[k] for k in ['id','original','originalObjectSha256','class','owner','caseIds']}
  common.update(historicalLocator=locators[0],originalSource=original['source'],originalHistoryObligation=original['recoveryRetryClaimDeadlineBudgetEffects'],runtimeAcceptance='NOT_INFERRED; zero original cases executed; original results unchanged',historyAcceptance='OPEN; source envelope/storage anchors are not executed original recovery proof')
  if identity in SPECS:
   leaf,_,effect,text=SPECS[identity];leaves=[]
   for profile in sorted(owner['profiles']):
    ptr='/profiles/'+profile.replace('~','~0').replace('/','~1')+'/settings/'+leaf
    leaves.append({'profile':profile,'pointer':ptr,'valueSha256':h.digest(h.pointer(owner,ptr))})
   if not leaves:raise ValueError('No profiles')
   common.update(status='EXACT_PRISM_ATTEMPT_SOURCE_JOIN',selectedOwner=h.pin(OWNER),selectedPointerTemplate='/profiles/<original-selected>/settings/'+leaf,authoredProfileLeaves=leaves,actualReceivingEffect=h.anchor(effect,text),startupCapture=h.anchor('skills/common/plugin-runtime/foundation/config/pipeline-boot.mjs','verifiedCaptures.add(result)'))
   if identity.startswith('AUTH-PRISM-ATTEMPT-') or identity=='AUTH-PRISM-CLAIM-LIFETIME':
    common.update(actualCaller=h.anchor(NATIVE,'config.'+leaf),composition=h.anchor('skills/prism/server/control-config.ts',leaf+': control.'+leaf),envelopeDigest=h.anchor(ENVELOPE,'attemptSpecDigest: workerAttemptSpecDigest(unsigned)'),originalReservation=h.anchor(NATIVE,'requestWorkerResult(config, reserved.attempt)'))
    common['ownerCorrection']='Actual attempt limits/lifetime are Control-owned; adjacent prism-execution.resourcePolicy owns CPU/memory/tasks, not these original limits.'
   elif leaf.startswith('agentBridge/'):
    common.update(composition=h.anchor('skills/common/plugin-runtime/foundation/config/pipeline-composition.ts',"assertPipelineBootCapture(capture, 'prism-agent-bridge')"),serviceEntry=h.anchor('skills/prism/server/agent-bridge.mjs','new AgentJobRunner(config)'),qualification='Both HTTP timeouts use the same selected bridge request timeout; startup policy, not original per-job HTTP-policy recovery proof')
   else:
    common.update(composition=h.anchor('skills/prism/server/control-config.ts','agentLauncher: control.agentLauncher'),envelopeDigest=h.anchor(AGENT,'attemptSpecDigest:workerAttemptSpecDigest(unsigned)'),durableCapture=h.anchor('skills/prism/control/agent-jobs.ts','attempt_envelope=$5::jsonb'),originalClaimReceiver=h.anchor(RUNNER,'const envelope=job.attempt_envelope;'))
    if leaf=='agentLauncher/terminationGraceMs':common['originalOperationCapture']=h.anchor(AGENT,'terminationGraceMs:config.agentLauncher.terminationGraceMs')
  else:
   _,path,text,constraint=RESIDUALS[identity];common.update(status='PRISM_ATTEMPT_RECEIVING_IMPLEMENTATION_OPEN',selectedOwner=None,actualLiteral=h.anchor(path,text),constraint=constraint)
  rows.append(common)
 if seen!=set(SPECS)|set(RESIDUALS):raise ValueError('Missing original attempt fields')
 return {'scope':'19 original native/agent fields;17 exact existing source mappings and2 explicit residuals, no new settings or runtime passes','inputs':[h.pin(h.ROSTER),h.pin(str((OUT/'fields.json').relative_to(h.ROOT)))],'counts':{'originalFields':len(rows),'exactSourceJoins':len(SPECS),'remainingOriginalFields':len(RESIDUALS)},'rows':rows,'independentReview':'OPEN; native spawn unavailable; unchanged direct reviewer EROFS not retried','fullAcceptance':'OPEN; all2409/6845/50/fullC0-C6 and original history/native/archive mandatory'}
def controls():
 baseline = build()
 ledger = h.read(str((OUT/'fields.json').relative_to(h.ROOT)))
 i = next(i for i,r in enumerate(ledger) if r['id']=='AUTH-PRISM-ATTEMPT-timeoutMs')
 results=[]
 for key,value in [('id','FOREIGN'),('original','FOREIGN#/0'),('originalObjectSha256','0'*64),('caseIds',[]),('class','protocol'),('owner','wrong')]:
  mutant=copy.deepcopy(ledger);mutant[i][key]=value
  try: build(ledgers=mutant)
  except (ValueError,KeyError) as error: results.append({'control':key+'-drift','rejected':True,'error':str(error)})
  else: raise AssertionError('Accepted mutant: '+key)
 mutant=copy.deepcopy(ledger);mutant.append(copy.deepcopy(ledger[i]))
 try: build(ledgers=mutant)
 except ValueError as error: results.append({'control':'duplicate-id','rejected':True,'error':str(error)})
 else: raise AssertionError('Accepted duplicate')
 owner=h.read(OWNER);del owner['profiles']['standard']['settings']['nativeAttemptTimeoutMs']
 try: build(owner=owner)
 except KeyError as error: results.append({'control':'missing-selected-leaf','rejected':True,'error':str(error)})
 else: raise AssertionError('Accepted missing leaf')
 if baseline != build(): raise AssertionError('Restored nondeterminism')
 return {'controls':results,'restoredPositive':'PASS','qualification':'Matrix controls only; zero original runtime/native/history cases executed'}
if __name__=='__main__':
 result,checked=build(),controls()
 (OUT/'prism-attempt-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 (OUT/'prism-attempt-controls.json').write_text(json.dumps(checked,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'counts':result['counts'],'rejectedControls':len(checked['controls']),'fullAcceptance':'OPEN'}))
