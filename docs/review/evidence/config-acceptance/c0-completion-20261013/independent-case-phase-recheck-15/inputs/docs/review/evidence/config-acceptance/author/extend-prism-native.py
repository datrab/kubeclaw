"""Prism parent completion headroom is not Buster policy or a claim renewal."""
import copy
import hashlib
import json
from pathlib import Path

root=Path.cwd();base=root/'docs/review/evidence/config-acceptance/author'
path=base/'main-fragment.json';data=json.loads(path.read_text())
names=['skills/prism/server/native-worker-execution.ts','skills/prism/server/native-worker-host.ts',
       'skills/prism/server/worker-operation.ts','skills/prism/engine/worker-envelope.ts',
       'skills/worker/core/worker/attempt-executor.ts','skills/worker/core/worker/native-attempt-executor.ts',
       'skills/worker/core/worker/native-worker-process.ts']
sources=[{'path':n,'sha256':hashlib.sha256((root/n).read_bytes()).hexdigest()} for n in names]
evidence=str((base/'prism-native-phase-source-read.log').relative_to(root))
with (root/evidence).open('w') as out:
    for source in sources:
        out.write(json.dumps(source)+'\n')
        out.writelines(f'{i}: {line}\n' for i,line in enumerate((root/source['path']).read_text().splitlines(),1))
sid='AUTH-PRISM-NATIVE-COMPLETION-PHASE-ALLOWANCE';row=copy.deepcopy(data['rows'][0])
row.update(id=sid,owner='prism-execution',scope={'instance':'prism-native-attempt','profile':'selected complete Prism execution profile'},
           source={**sources[0],'field':'timeoutMs: envelope.limits.timeoutMs + 8 * envelope.limits.cleanupTimeoutMs',
                   'lines':[i for i,line in enumerate((root/names[0]).read_text().splitlines(),1) if '+ 8 *' in line]},
           current={'valueOrDefault':8,'precedence':'fixed parent-process headroom literal; independent from producer fixed ten-minute claim'},
           typeUnitDomain={'current':'fixed literal 8 only; no central author',
                          'proposed':'integer>=4 for current native Prism hook roster; exact safe arithmetic 1<=timeoutMs+allowance*cleanupTimeoutMs<=2147483647',
                          'reason':'Core base3 + current storeFullLog1, no cleanup/collectEvidence/finalizeResult; real native process timer bound. Added hooks require recomputing relation.'},
           unit='completion-phase allowance count',reader='nativePrismExecution.execute parent process timeout projection',
           productiveCallerChain=['worker.ts nativePrismExecution composition','execute accepted envelope',
                                  'executeNativeWorkerAttempt acceptedLimits','NativeWorkerProcess validateLimits/run'],
           validation={'current':'parent timeout native validation safe integer/positive<=2147483647; acceptedLimits clips to original claimRemaining; Core separately checks current-hook minimum window',
                       'target':'strict required allowance; coupled integer/timer/hook relation before constructing process; no default or claim extension'},
           targetAuthorRef='config/engines/prism-execution.config.json#/profiles/<selected>/parentCompletionPhaseAllowance',
           activationScope={'current':'fixed per accepted envelope projection after captured native composition',
                            'target':'J bound complete execution projection; recover original allowance and claim, never Buster or current Latest'},
           recoveryRetryClaimDeadlineBudgetEffects='Does not create claim/queue expiry. AUTH-PRISM-CLAIM-LIFETIME owns ten-minute producer deadline; acceptedLimits clips parent timer to remaining original claim. Preserve original resource grant and stored attempt across recovery.',
           migrationAction='C3 strict sole Prism execution policy and simultaneous process projection; C5 durable generation including role hook/retention selection',
           caseIds=[sid+'-'+suffix for suffix in ['VAL','PROJECTION','RECOVERY']],
           verifiedSourceEvidence=[evidence],semanticStatus='source-traced')
for suffix in ['VAL','PROJECTION','RECOVERY']:
    case={'id':sid+'-'+suffix,'settingIds':[sid],'requirementIds':['C0-B','C0-C','C0-D','F-AUTH','F-VAL','F-BIND'],
          'phase':'implementation-proposal','scope':'local with genuine disposable native authority for process behavior',
          'productiveCaller':row['productiveCallerChain'],
          'inputProfile':{'A':8,'B':4,'fixedEnvelopeTimeoutMs':300000,'fixedCleanupTimeoutMs':10000,
                          'computedParentTimeoutA':380000,'computedParentTimeoutB':340000,
                          'claimLifetimeMs':600000,'status':'exact policy witness, future complete author/schema/harness pending'},
          'priorState':'new accepted native envelope; hook roster fixed; for recovery retain original bound A and original claim',
          'expectedEffectOrRejectingBoundary':'Required3+fullLog1 phases are preserved; missing/3/fraction/overflow coupled timer reject before process construction. Positive4/8 give exact parent timer; original claim clips both. PublishB never retargets boundA or extends claim; no assertion that dormant headroom changes child business output.',
          'observerMethod':'actual selected native process limit, acceptedLimits clipping and archived original claim/result; real kernel behavior only with genuine prerequisite',
          'command':None,'sourceIdentity':{'sources':sources},'testDigests':[],
          'toolDependencyImageConfigIdentities':None,'rawEvidencePath':None,'result':'not-run',
          'reason':'C3/C5 not approved; future complete author/harness specification still open','reviewerConfirmation':None,'specificationStatus':'incomplete'}
    data['cases']=[c for c in data['cases'] if c['id']!=case['id']]+[case]
data['rows']=[r for r in data['rows'] if r['id']!=sid]+[row]
for source in sources:
    data['sources']=[s for s in data['sources'] if s['path']!=source['path']]+[source]
path.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'rows':1,'phaseCount':4,'currentAllowance':8,'status':'definition proposed; runtime not-run'}))
