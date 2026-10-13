"""Independent bounded case/phase checks. Synthetic metadata never consumer proof."""
import collections, copy, hashlib, json, sys, tempfile
from pathlib import Path
root=Path.cwd()
sys.path.insert(0,str(root/'docs/review/evidence/config-acceptance/author'))
from definition_baseline import DefinitionBaseline, REGISTERED_BASELINES, strict_json
from definition_generation import DefinitionGeneration
from definition_cases import validate_case
from review_receipts import ReviewReceipts, canonical_sha
results=[]
def reject(name, fn, expected):
    try: fn()
    except ValueError as error:
        assert expected in str(error),(name,str(error))
        results.append({'id':name,'boundary':str(error),'result':'passed'})
    else: raise AssertionError('No rejection: '+name)
baseline=DefinitionBaseline(root,{k:REGISTERED_BASELINES[0][k] for k in ('path','sha256')})
originals={key[1]:value for key,value in baseline.bodies.items() if key[0]=='case'}
print(json.dumps({'actualBaseline':{'sourceRevision':baseline.manifest['sourceRevision'],'caseCount':len(originals),
 'phases':dict(collections.Counter(v.get('phase','ABSENT') for v in originals.values())),
 'scopeCategories':{'local':sum(v.get('scope')=='local' for v in originals.values()),'live':sum(v.get('scope')=='live' for v in originals.values()),
 'descriptive':sum('scope' in v and v['scope'] not in ('local','live') for v in originals.values()),'absent':sum('scope' not in v for v in originals.values())},
 'results':dict(collections.Counter(v.get('result','ABSENT') for v in originals.values()))}},indent=2))
with tempfile.TemporaryDirectory(prefix='independent-case-phase-15-') as temp:
    private=Path(temp)
    def write(path,value):
        data=json.dumps(value,sort_keys=True,allow_nan=False).encode()
        (private/path).write_bytes(data)
        return {'path':path,'sha256':hashlib.sha256(data).hexdigest()}
    proposed={'id':'synthetic-plan','targetTestPath':'proposed/check.test.ts','command':'synthetic-not-executed',
      'proposedSource':'synthetic metadata only; no runtime proof','assertions':{'effect':'synthetic oracle description'},
      'mutations':{'mutant':'synthetic mutation description'},'restorationAssertions':{'restore':'synthetic restoration description'}}
    ref=write('proposal.json',proposed)
    pins=ReviewReceipts(private)
    def finalized(original=None,identifier=None):
        identifier=identifier or original['id']
        return {'schemaVersion':'config-finalized-case.v1','id':identifier,'originalCase':copy.deepcopy(original),
          'requirementIds':copy.deepcopy(original['requirementIds']) if original else ['C0-A'],
          'settingIds':copy.deepcopy(original.get('settingIds',[])) if original else [],
          'applicability':'applicable','replacementCaseIds':[],'executionPhase':'implementation',
          'implementationSlice':'C3','scope':original.get('scope') if original and original.get('scope') in ('local','live') else 'local',
          'scopeDerivation':{'originalValue':original.get('scope') if original else None,'reason':'Synthetic metadata derivation; not scope semantic proof','evidenceRefs':[ref]},
          'specification':{'productiveCaller':'synthetic metadata checker','inputProfile':{'id':'synthetic'},'priorState':'synthetic',
           'expectedEffectOrRejectingBoundary':'synthetic','observerMethod':'metadata only','command':proposed['command'],
           'identities':{k:[{'id':k,'revision':'synthetic'}] for k in ('software','tools','dependencies','images','config')},
           'reason':'not productive proof','definitionSourceRefs':[ref]},'result':'not-run',
          'plannedTests':[{'id':proposed['id'],'targetTestPath':proposed['targetTestPath'],'command':proposed['command'],
           'specificationRef':ref,'assertionIds':['effect'],'mutationIds':['mutant'],'restorationAssertionIds':['restore']}],
          'executedEvidence':None}
    def integration(body, original):
        instance=DefinitionGeneration.__new__(DefinitionGeneration)
        instance.baseline=baseline
        instance.pins=pins
        instance.bodies={key:value for key,value in baseline.bodies.items() if key[0]!='case'}
        instance.bodies[('case',body['id'])]=body
        instance.records={('case',body['id']):{'origin':{'tag':'baseline'} if original else {'tag':'discovered','requirementIds':['C0-A']}}}
        return instance
    selected=next(v for v in originals.values() if v['phase']=='implementation-proposal' and v.get('scope')=='local')
    body=finalized(selected)
    integration(body,selected).validate_cases()
    results.append({'id':'integration uses actual immutable original body','caseId':selected['id'],'originalBodySha256':canonical_sha(selected),'result':'passed'})
    for field,value in [('phase','C0'),('result','passed')]:
        changed=copy.deepcopy(body); changed['originalCase'][field]=value
        reject('integrated actual history '+field+' cannot be forged',lambda:integration(changed,selected).validate_cases(),'HISTORY_CHANGED')
    changed=copy.deepcopy(body); changed['scope']='live'
    reject('integrated actual local scope cannot become live',lambda:integration(changed,selected).validate_cases(),'ORIGINAL_SCOPE_CHANGED')
    changed=copy.deepcopy(body); changed['executionPhase']='C0-definition'
    reject('actual implementation-proposal cannot become C0',lambda:integration(changed,selected).validate_cases(),'ORIGINAL_RUNTIME_CASE_RECLASSIFIED')
    for phase in ('C0','current-source-definition'):
        actual=next(v for v in originals.values() if v['phase']==phase)
        reject('actual '+phase+' cannot become future implementation',lambda:integration(finalized(actual),actual).validate_cases(),'ORIGINAL_DEFINITION_PHASE_LOST')
    discovered=finalized(identifier='DISCOVERED-SYNTHETIC')
    integration(discovered,None).validate_cases()
    results.append({'id':'discovered null original accepted as metadata only','result':'passed'})
    discovered['originalCase']={}
    reject('discovered history cannot be fabricated',lambda:integration(discovered,None).validate_cases(),'HISTORY_CHANGED')
    discovered=finalized(identifier='DISCOVERED-SYNTHETIC');discovered['requirementIds']=['F-VAL']
    reject('discovered origin requirements conserved',lambda:integration(discovered,None).validate_cases(),'DISCOVERY_REQUIREMENTS_LOST')
    reject('valid actual-original case metadata still cannot close unimplemented gates',integration(body,selected).require_acceptance,'SEMANTIC_ACCEPTANCE_NOT_IMPLEMENTED')
    # Original registry has no explicit C1-C6 cases or failed outcomes; do not invent productive proof.
    synthetic={'id':'SYNTHETIC','requirementIds':['C0-A'],'settingIds':[],'scope':'live','phase':'C1','result':'failed','nativeMapping':{'id':'synthetic-native'}}
    for phase in ('C1','C2','C3','C4','C5','C6'):
        original={**synthetic,'phase':phase}; active=finalized(original);active['implementationSlice']=phase
        catalog={('case','SYNTHETIC'):active,('requirement','C0-A'):{}}
        validate_case(active,original,catalog,pins,{'SYNTHETIC':original})
        results.append({'id':'synthetic '+phase+' failed/native history separated','result':'passed'})
        active['implementationSlice']='C2' if phase!='C2' else 'C1'
        reject('synthetic '+phase+' slice conserved',lambda:validate_case(active,original,catalog,pins),'ORIGINAL_IMPLEMENTATION_SLICE_CHANGED')
        active['implementationSlice']=phase; active['originalCase'].pop('nativeMapping')
        reject('synthetic '+phase+' native history conserved',lambda:validate_case(active,original,catalog,pins),'HISTORY_CHANGED')
    # Corrected actual descriptive scope now representable without historical rewrite.
    unusual=next(v for v in originals.values() if v['phase']=='implementation-proposal' and v.get('scope') not in ('local','live') and 'scope' in v)
    normalized=finalized(unusual)
    integration(normalized,unusual).validate_cases()
    results.append({'id':'actual descriptive scope preserved plus explicit typed metadata derivation','result':'passed'})
    for name,edit,boundary in (
      ('wrong originalValue',lambda v:v['scopeDerivation'].update(originalValue='local'),'SCOPE_HISTORY_CHANGED'),
      ('missing pinned evidence',lambda v:v['scopeDerivation'].update(evidenceRefs=[]),'SCOPE_EVIDENCE_MISSING'),
      ('empty reason',lambda v:v['scopeDerivation'].update(reason=' '),'SCOPE_REASON_MISSING'),
      ('descriptive scope cannot remain typed active discriminator',lambda v:v.update(scope=unusual['scope']),'SCOPE_OR_REQUIREMENTS_INVALID'),
      ('descriptive history cannot be rewritten',lambda v:v['originalCase'].update(scope='local'),'HISTORY_CHANGED')):
        changed=copy.deepcopy(normalized); edit(changed)
        reject('corrected scope '+name,lambda:integration(changed,unusual).validate_cases(),boundary)
    absent=next(v for v in originals.values() if 'scope' not in v)
    absent_body=finalized(absent)
    if absent['phase'] in ('C0','current-source-definition'):
        absent_body.update(executionPhase='C0-definition',implementationSlice=None,plannedTests=[],result='passed',
          executedEvidence={'command':proposed['command'],'exitCode':0,'sourceRefs':[ref],'testRefs':[ref],
           'stdoutRef':ref,'stderrRef':ref,'toolIdentities':{'synthetic':'metadata-only'},'observedAssertions':['Synthetic metadata identity; not real consumer proof']})
    integration(absent_body,absent).validate_cases()
    results.append({'id':'actual absent scope explicitly derived with null historical value','result':'passed'})
    print(json.dumps({'correctedScopeExample':{'id':unusual['id'],'phase':unusual['phase'],'scope':unusual['scope'],'originalBodySha256':canonical_sha(unusual)},
      'absentScopeExample':{'id':absent['id'],'originalBodySha256':canonical_sha(absent)}},indent=2))
    pins.assert_no_drift()
for numeric in ('1e309','-1e309','NaN','Infinity','-Infinity'):
    reject('nonfinite JSON '+numeric,lambda:strict_json('{"nested":['+numeric+']}'),'JSON_NONFINITE')
assert strict_json('{"nested":[1e308,-1e308,1e3]}')['nested'][2]==1000.0
baseline.assert_no_drift()
print(json.dumps({'controls':results,'passed':len(results),'failed':0,'blockingFindings':0,'correctedFindings':1,'globalC0Accepted':False,
 'qualification':'Actual immutable baseline integration plus synthetic metadata controls; no consumer effects or whole C0 approval.'},indent=2))
