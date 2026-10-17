"""Endpoint and topology authority evidence; no settings implementation."""
import copy
import hashlib
import json
from pathlib import Path

root=Path.cwd(); base=root/'docs/review/evidence/config-acceptance/author'
path=base/'main-fragment.json'; data=json.loads(path.read_text())
files=['skills/prism/server/control-config.ts','skills/prism/server/worker-config.ts',
       'skills/prism/config/native-worker.ts','skills/prism/server/native-worker-execution.ts',
       'skills/prism/control/native-operation.ts','skills/prism/control/worker-operation-transport.ts',
       'skills/prism/server/corpus-routes.ts','charts/prism/templates/workloads.yaml',
       'charts/prism/templates/configmap-worker-trust.yaml','charts/prism/templates/networkpolicy.yaml',
       'tests/verification/live/prism-nova-production-e2e.mjs','scripts/deploy.sh']
sources=[{'path':name,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()} for name in files]
evidence=str((base/'prism-endpoint-source-read.log').relative_to(root))
with (root/evidence).open('w') as out:
    for source in sources:
        out.write(json.dumps(source)+'\n')
        text=(root/source['path']).read_text().splitlines()
        # Retain complete small productive sources; deploy only relevant code and
        # caller context, without confusing its other limits with these settings.
        for i,line in enumerate(text,1):
            if source['path']!='scripts/deploy.sh' or 1900<=i<=1990:
                out.write(f'{i}: {line}\n')

specs=[
 ('WORKER','PRISM_WORKER_URL','http://prism-worker:8080','http://127.0.0.1:18081',
  files[0],['Control composition snapshot','worker-operation-transport.sendWorkerAttempt','fetch /v1/attempts'],
  'Startup new URL; ENV has priority over service fallback. SPIFFE Chart emits loopback egress. Transport uses peer-auth headers from captured trust policy.',
  'Real admitted native attempt reaches selected worker egress and selected compatible peer, receipt checked against original envelope. Repointing started attempt or changing trusted peer is forbidden.'),
 ('CONTROL-INTERNAL','PRISM_CONTROL_INTERNAL_URL','http://prism-control:8080','http://127.0.0.1:18080',
  files[0],['Control native-operation artifact binding','Worker parent snapshot','nativePrismCommand closed child ENV','nativePrismHostConfig','WorkerArtifactClient'],
  'Control/worker startup new URL after ENV/service fallback; native child requires explicit assigned ENV with new URL, no fallback. Same topology is propagated, no independent child author.',
  'Upload/download through real internal artifact boundary, same artifact digest and grant. Both producer URL and worker receipt location change together; no fallback to old service or Latest on recovery.'),
 ('INGESTION','PRISM_INGESTION_URL','http://prism-ingestion:8080','http://prism-ingestion:8080',
  files[0],['Control composition snapshot','corpus-routes acquire /v1/acquisitions','cleanup DELETE quarantine digest'],
  'Startup URL parsing only; Chart supplies fixed service URL in both trust modes. Ingestion requires separate captured bearer secret; SPIFFE enablement does not remove this secret.',
  'Real controlled source acquisition and cleanup hit selected ingestion instance. Existing acquired quarantines retain original endpoint/identity for cleanup; no silent new endpoint recovery.'),
 ('AGENT-LIVE-RUNNER','PRISM_AGENT_URL',None,'http://127.0.0.1:18444',
  'tests/verification/live/prism-nova-production-e2e.mjs',
  ['scripts/deploy.sh packaged production verification Job ENV','required PRISM_AGENT_URL','real agent endpoint dispatch in production verification'],
  'Live verification requires explicit nonempty ENV; strips trailing slash. Control workload PRISM_AGENT_URL=18082 has no Control JS reader. Runner18444 is distinct Envoy role, not control18082.',
  'Real live production verifier uses selected runner egress and trusted agent. Missing ENV fails verifier before dispatch. No paid/live run during C0; image-packaged test remains in productive delivery closure.')]
prototype=data['rows'][0]
for label,field,fallback,projection,name,chain,validation,effect in specs:
    sid='AUTH-PRISM-ENDPOINT-'+label
    row=copy.deepcopy(prototype)
    source=next(s for s in sources if s['path']==name)
    row.update(id=sid,owner='prism-deployment',scope={'instance':label.lower(),'profile':'selected complete topology/trust route profile'},
               source={**source,'field':field,'lines':[i for i,l in enumerate((root/name).read_text().splitlines(),1) if field in l]},
               current={'valueOrDefault':fallback,'chartOrRunnerProjection':projection,
                        'precedence':'captured startup ENV then documented code fallback, except live runner requires ENV'},
               typeUnitDomain='current syntactic URL/nonempty ENV only; no inferred HTTP/trust/credential safety validator',unit='URL',
               reader=chain[-1],productiveCallerChain=chain,
               validation={'schema':'no current complete endpoint author; Helm literals and code fallback remain','semantic':validation},
               targetAuthorRef=f'config/deployment/prism.config.json#/profiles/<selected>/routes/{label.lower()}',
               activationScope={'current':'S: process/proxy startup; native child inherits immutable parent projection',
                                'target':'S for topology; durable J/R binding preserves accepted route/peer/grant'},
               recoveryRetryClaimDeadlineBudgetEffects=effect,
               classificationReason='Deployment transport route is operator policy; loopback port/service and emitted ENV are projections, not separate editable endpoints.',
               migrationAction='C3 route author plus real proxy/listener/Service/NetworkPolicy/ENV changes; C5 preserve accepted binding through retry/cleanup',
               caseIds=[sid+'-DELIVERY',sid+'-BOUNDARY'],verifiedSourceEvidence=[evidence],semanticStatus='source-traced')
    data['rows']=[r for r in data['rows'] if r['id']!=sid]+[row]
    for suffix in ['DELIVERY','BOUNDARY']:
        case={'id':sid+'-'+suffix,'settingIds':[sid], 'requirementIds':['C0-A','C0-B','C0-C','C0-D','F-DELIVERY','F-VAL','F-BIND'],
              'phase':'implementation-proposal','scope':'live' if label=='AGENT-LIVE-RUNNER' else 'local',
              'productiveCaller':chain,'inputProfile':{'current':row['current'],'alternative':'complete route/proxy/trust generation with matching safe listener/peer topology; target schema/harness pending'},
              'priorState':'new isolated process/proxy for A/B; started accepted attempt remains bound to A',
              'expectedEffectOrRejectingBoundary':effect,
              'observerMethod':'actual Helm route/ENV/proxy/Service/NetworkPolicy closure plus real authenticated selected request and durable receipt; no mock transport',
              'command':None,'sourceIdentity':{'sources':sources},'testDigests':[],
              'toolDependencyImageConfigIdentities':None,'rawEvidencePath':None,'result':'not-run',
              'reason':'C3/C5 unapproved; alternate complete author and intended early rejecting safety boundary pending definition',
              'reviewerConfirmation':None,'specificationStatus':'incomplete'}
        data['cases']=[c for c in data['cases'] if c['id']!=case['id']]+[case]
for source in sources:
    data['sources']=[s for s in data['sources'] if s['path']!=source['path']]+[source]
data['endpointProjectionDispositions']=[
 {'field':'Control workload PRISM_AGENT_URL','class':'generated-binding-unused-in-control',
  'source':files[7],'reason':'No Control JS reader; retained Envoy listener18082 is a separate actual proxy surface, while packaged production verifier reads its runner18444 ENV. Do not claim this variable activates agent integration.',
  'caseIds':['AUTH-PRISM-ENDPOINT-AGENT-LIVE-RUNNER-DELIVERY']},
 {'field':'WORKER_TRUST_SPIFFE_ENABLED','class':'generated-binding','authorId':'DLV-CHART-PRISM-WORKERTRUST-SPIFFE-ENABLED',
  'reason':'Exact string true enables server policy; absent/other strings select legacy secret mode today. Target explicit boolean required; not separate per-consumer mode author.'}]
data['gaps']=[g for g in data['gaps'] if g.get('id')!='AUTH-PRISM-ENDPOINT-TOPOLOGY']+[
 {'id':'AUTH-PRISM-ENDPOINT-TOPOLOGY','reason':'Early URL/peer/trust/credential constraints and complete single-author endpoint↔Envoy↔Service/NetworkPolicy topology generations require exact target definition. Current new URL is not a safety policy validator; replica startup and retained cleanup locations need C5 cases.'}]
path.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'endpointRows':len(specs),'status':'source-traced; complete topology/profile cases remain open'}))
