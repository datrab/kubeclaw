import json,hashlib
from pathlib import Path
b=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');s1=b/'c1-complete-profile-pairs-01';s2=b/'c1-complete-profile-pairs-02';o=b/'independent-c1-case-oracles/complete-pair-correction-recheck-02';load=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();canon=lambda d:hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
p1={p['caseId']:p for p in load(s1/'pairs.json')['pairs']};p2={p['caseId']:p for p in load(s2/'pairs.json')['pairs']};e1={p['caseId']:p for p in load(s1/'entry-selections.json')['rows']};e2={p['caseId']:p for p in load(s2/'entry-selections.json')['rows']};changed={'CMP-C1-EFFECT-buster-engine-execution.reports.maximumTimeoutMs':15000,'CMP-C1-EFFECT-buster-engine-execution.reports.minimumCpuTimeMs':40000};assert set(p1)==set(p2)==set(e1)==set(e2) and len(p1)==148
owners=list(next(iter(p1.values()))['ASelection']);d1={owner:load(s1/'config/components'/f'{owner}.config.json') for owner in owners};d2={owner:load(s2/'config/components'/f'{owner}.config.json') for owner in owners};actualChanges=[];entries=0
for cid,p in p2.items():
 before=p1[cid];assert p['ASelection']==before['ASelection'];assert p['BSelection']==before['BSelection'];assert p['ownerSettingsSha256A']==before['ownerSettingsSha256A'];assert p['implementationResult']==before['implementationResult']=='not-run'
 if cid not in changed:assert p==before
 for side in ['A','B']:
  for owner in owners:
   sel=p[side+'Selection'][owner];a=d1[owner]['profiles'][sel]['settings'];z=d2[owner]['profiles'][sel]['settings'];assert canon(z)==p['ownerSettingsSha256'+side][owner]
   if cid in changed and side=='B' and owner=='buster-engine':
    import copy
    want=copy.deepcopy(a);leaf=p['delta']['field'].split('/')[-1];want['execution']['reports'][leaf]=changed[cid];assert z==want;assert p['delta']['B']==changed[cid];assert p['delta']['A']==before['delta']['A'];actualChanges.append({'caseId':cid,'field':p['delta']['field'],'priorB':before['delta']['B'],'B':changed[cid]})
   else:assert z==a
  row=e2[cid][side];entry=row['entry'];assert canon(entry)==row['entryCanonicalSha256'];assert row['entryContentToMaterializeAt']=='config/pipeline.config.json';assert entry['schemaVersion']=='pipeline-entry.v3';assert len(entry['bindings'])==6;assert set(entry['components'])==set(owners)
  for binding in entry['bindings']:
   owner=binding['owner'];assert binding['role']==('buster' if owner=='buster-engine' else 'prism');assert binding['instanceId']=='fixture.'+owner;assert binding['profileId']==p[side+'Selection'][owner];assert entry['components'][owner]==f'components/{owner}.config.json';assert (s2/'config'/entry['components'][owner]).resolve().is_relative_to((s2/'config').resolve());assert row['selectedWholeSettingsSha256'][owner]==canon(d2[owner]['profiles'][binding['profileId']]['settings'])
  assert entry==e1[cid][side]['entry'];assert row['entryCanonicalSha256']==e1[cid][side]['entryCanonicalSha256']
  if cid not in changed or side=='A':assert row==e1[cid][side]
  else:
   prior=e1[cid][side];keys=[k for k in row if row[k]!=prior[k]];assert keys==['selectedWholeSettingsSha256'];assert [owner for owner in owners if row['selectedWholeSettingsSha256'][owner]!=prior['selectedWholeSettingsSha256'][owner]]==['buster-engine']
  entries+=1
assert len(actualChanges)==2
# Verify each owner document is unchanged except those two complete profile leaves.
import copy
for owner in owners:
 expected=copy.deepcopy(d1[owner])
 if owner=='buster-engine':
  for cid,new in changed.items():expected['profiles'][p2[cid]['BSelection'][owner]]['settings']['execution']['reports'][p2[cid]['delta']['field'].split('/')[-1]]=new
 assert d2[owner]==expected
formula=[]
for cid in changed:
 p=p2[cid];r={side:d2['buster-engine']['profiles'][p[side+'Selection']['buster-engine']]['settings'] for side in ['A','B']};requested={}
 for side in ['A','B']:
  settings=r[side];reports=settings['execution']['reports'];cleanup=settings['execution']['provider']['cleanupTimeoutMs'];timeout=min(reports['maximumTimeoutMs'],cleanup);cpu=max(reports['minimumCpuTimeMs'],timeout//1000*1000);assert cpu%1000==0;requested[side]={'cleanupTimeoutMs':cleanup,'adapterTimeoutMs':timeout,'requestedCpuMillis':cpu,'sandboxCpuSecondsArgument':cpu//1000}
 assert requested['A']!=requested['B'];formula.append({'caseId':cid,'actualCallerFormula':'specialist-report-finalization.ts:60-71, report-adapter-runtime.ts:225-230','requestedPolicy':requested,'notClaimed':'native enforcement, measured CPU consumption, walltime extension or successful report result'})
original=load(b/'independent-c1-case-oracles/cases.json');matrix={c['id']:c for c in load('docs/review/remediation/config-acceptance-matrix.json')['cases']}
for c in original['cases']:assert c['originalLifecycle']['phase']==matrix[c['id']]['phase'] and c['originalLifecycle']['result']==matrix[c['id']]['result'] and c['requirementIds']==matrix[c['id']]['requirementIds']
inputs=[s1/'pairs.json',s1/'entry-selections.json',s2/'pairs.json',s2/'entry-selections.json',s2/'validation.json']+list((s1/'config').rglob('*.json'))+list((s2/'config').rglob('*.json'))+[Path('skills/buster/engine/test-gates/specialist-report-finalization.ts'),Path('skills/buster/engine/test-gates/report-adapter-runtime.ts'),Path('skills/common/plugin-runtime/foundation/config/buster-execution.ts')]
result={'qualification':'Independent focused C0 definition correction, not native/F-EFFECT/global acceptance','pairs':148,'exactCorrectedPairs':actualChanges,'otherPairsExactUnchanged':146,'allAUnchanged':True,'fullEntrySelectionsChecked':entries,'allEntryContentHashesUnchanged':True,'onlyTwoBSelectedSettingsHashesChanged':True,'canonical229LifecycleRequirementsConserved':True,'callerFormulaObservations':formula,'residualOriginalCasesOpen':['CMP-C1-EFFECT-buster-engine-execution.reports.minimumOpenFiles','CMP-C1-EFFECT-buster-engine-execution.reports.runtimeMemoryReserveBytes'],'inputs':{str(p):sha(p) for p in inputs}}
(o/'independent-observations.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='inputs'},indent=2))
