"""Separate the real single-operation host from reusable library cache checks."""
import hashlib
import json
import subprocess
from pathlib import Path

root=Path.cwd();base=root/'docs/review/evidence/config-acceptance/author'
path=base/'main-fragment.json';data=json.loads(path.read_text())
log=base/'prism-cache-definition.log';records=[json.loads(x) for x in log.read_text().splitlines()]
identity=records[0];result=records[1]
for source in identity['sources']:
    if hashlib.sha256((root/source['path']).read_bytes()).hexdigest()!=source['sha256']:
        raise ValueError('material source drift after observation: '+source['path'])
sources=[s for s in identity['sources'] if s['path'].startswith('skills/')]
source_log=base/'prism-cache-source-read.log'
with source_log.open('w') as out:
    for s in sources:
        out.write(json.dumps(s)+'\n')
        out.writelines(f'{i}: {line}\n' for i,line in enumerate((root/s['path']).read_text().splitlines(),1))
patch=base/'prism-cache-definition-dirty.patch'
patch.write_bytes(subprocess.check_output(['git','diff','--binary','HEAD']))
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],text=True).split('\0')
identity['dirtyStand']={'patchPath':str(patch.relative_to(root)),
                       'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),
                       'capture':'post-command capture; every actually executed source/test above rechecked unchanged',
                       'untrackedInputs':[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()}
                                          for p in untracked if p]}
cid='AUTH-PRISM-CACHE-C0-TYPED-PROFILES'
rowids=['AUTH-PRISM-CACHE-'+name for name in result['profiles']['A']]
corrections=[]
for row in data['rows']:
    if row['id'] not in rowids:continue
    corrections.append({'settingId':row['id'],'previousActivation':row['activationScope'],
                        'correction':'Engine is created inside dedicated per-attempt native host, not a persistent multi-order HTTP service. Count/eviction witness at reusable library is not an observed productive host EFFECT.'})
    row['activationScope']={'current':'Dedicated host process created for one accepted native attempt; one guarded execute call. Process startup is J-scoped in actual composition, not a shared S cache service.',
                            'target':'J: explicit selected instance cache policy bound with accepted native operation; recover original generation. No cache-lifetime rearchitecture or shared service is inferred.'}
    row['currentOperationalApplicability']={
        'host':'native-worker-host.ts constructs one real PrismEngine; PrismWorkerOperation rejects repeated execute and calls engine once',
        'library':'Exported engine accepts complete explicit cache limits; constructor validates positive safe integers. Separate integration/library consumers can exercise multiple keys.',
        'distinctLimits':'maximumInFlight/maximumCompletedEntries have no multi-key saturation witness at the current single-operation application host; maximumCompletedBytes can affect retention of that one result but no current operator author exists.'}
    row['caseIds']=list(dict.fromkeys(row['caseIds']+[cid]))
    row['verifiedSourceEvidence']=list(dict.fromkeys(row['verifiedSourceEvidence']+[str(source_log.relative_to(root))]))
    row['semanticStatus']='source-traced-current-host-effect-applicability-open'
case={'id':cid,'settingIds':rowids,'requirementIds':['C0-A','C0-C','A2','A4','A5'],
      'phase':'C0','scope':'local typed-library definition, not service/native host dispatch',
      'productiveCaller':'Actual exported PrismEngine + DeterministicDesignProvider + EngineExecutionCache, direct explicit typed profile; application caller applicability independently retained',
      'inputProfile':result['profiles'],'priorState':'fresh real engine per complete typed profile; three distinct ingest keys queued before settlement, no mock provider',
      'expectedEffectOrRejectingBoundary':'A admits three queued library calls, B admits two and rejects third at PRISM_ENGINE_IN_FLIGHT_LIMIT; zero in each field rejected by actual constructor',
      'observerMethod':result['records'],'command':'node docs/review/evidence/config-acceptance/author/check-prism-cache-definition.mjs',
      'sourceIdentity':identity,'testDigests':[identity['sources'][0]],
      'toolDependencyImageConfigIdentities':{'node':identity['node'],'packageLock':identity['sources'][-1],
                                           'profilesSha256':hashlib.sha256(json.dumps(result['profiles'],sort_keys=True).encode()).hexdigest()},
      'rawEvidencePath':str(log.relative_to(root)),'rawEvidenceSha256':hashlib.sha256(log.read_bytes()).hexdigest(),
      'result':'passed','reason':result['limits'],'reviewerConfirmation':None,
      'specificationStatus':'executed-current-library-definition; productive host effect not accepted'}
data['cases']=[c for c in data['cases'] if c['id']!=cid]+[case]
data['cacheApplicabilityCorrections']=corrections
data['gaps']=[g for g in data['gaps'] if g.get('id')!='AUTH-PRISM-CACHE-APPLICABILITY']+[
    {'id':'AUTH-PRISM-CACHE-APPLICABILITY','reason':'Exact library domains/witnesses exist, but current application host executes one operation per dedicated engine. Cannot claim multi-key admission/eviction tunability at that productive caller or invent a shared-service migration. Resolve complete target owner/activation/case applicability with independent review; original required EFFECT IDs remain open.'}]
path.write_text(json.dumps(data,indent=2)+'\n')
(base/'prism-cache-applicability-corrections.json').write_text(json.dumps({'identity':identity,'corrections':corrections,'definitionCase':cid,'status':'C0 open, no host EFFECT proof'},indent=2)+'\n')
print(json.dumps({'rowsCorrected':len(corrections),'actualDefinitionRecords':len(result['records']),'hostEffectAccepted':False}))
