import json,hashlib,math
from pathlib import Path
R=Path.cwd();base=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');src=base/'c1-complete-profile-pairs-01';out=base/'independent-c1-case-oracles/complete-pair-recheck-01';load=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();canon=lambda d:hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
pairs=load(src/'pairs.json');entryrows={r['caseId']:r for r in load(src/'entry-selections.json')['rows']};old=load(pairs['legacySource']['path']);assert sha(pairs['legacySource']['path'])==pairs['legacySource']['sha256']
previous=load(base/'independent-c1-case-oracles/cases.json');pc={c['id']:c for c in previous['cases']};meta=load(base/'independent-c1-case-oracles/whole-profile-bindings.json');owners=list(pairs['pairs'][0]['ASelection']);docs={o:load(src/'config/components'/f'{o}.config.json') for o in owners};roles={o:'buster' if o=='buster-engine' else 'prism' for o in owners};observations=[];entrycount=0
expected={c['id'] for c in previous['cases'] if '-EFFECT-' in c['id'] and len(c['settingIds'])==1};assert len(expected)==148;assert {p['caseId'] for p in pairs['pairs']}==expected

def ptr(v,p):
 for s in p.strip('/').split('/'):v=v[s.replace('~1','/').replace('~0','~')]
 return v

def diffs(a,b,p=''):
 if type(a)!=type(b):return [p]
 if isinstance(a,dict):return [q for k in sorted(set(a)|set(b)) for q in (diffs(a[k],b[k],p+'/'+k) if k in a and k in b else [p+'/'+k])]
 return [] if a==b else [p]
for pair in pairs['pairs']:
 cid=pair['caseId'];owner=pair['owner'];delta=pair['delta'];selected={side:{o:docs[o]['profiles'][pair[side+'Selection'][o]]['settings'] for o in owners} for side in ['A','B']};changed=diffs(selected['A'][owner],selected['B'][owner]);assert '/settings'+delta['field'][9:] == delta['field'];field=delta['field'].removeprefix('/settings')
 assert delta['A']!=delta['B'];assert ptr(selected['A'][owner],field)==delta['A'];assert ptr(selected['B'][owner],field)==delta['B'];assert field in changed
 for o in owners:
  for side in ['A','B']:assert selected[side][o]==old[cid][side][o]['settings'];assert canon(selected[side][o])==pair['ownerSettingsSha256'+side][o]
  if o!=owner:assert selected['A'][o]==selected['B'][o]
  # Independently compare original A with the actual active full owner settings, not just leaf values.
  sid=next(c['settingIds'][0] for c in previous['cases'] if len(c['settingIds'])==1 and c['settingIds'][0] in meta and meta[c['settingIds'][0]].get('activeA') and meta[c['settingIds'][0]]['activeA']['owner']==o)
  active=meta[sid]['activeA'];document=load(active['path']);assert selected['A'][o]==document['profiles'][active['selectedProfile']]['settings']
 for side in ['A','B']:
  row=entryrows[cid][side];e=row['entry'];assert row['entryContentToMaterializeAt']=='config/pipeline.config.json';assert e['schemaVersion']=='pipeline-entry.v3';assert canon(e)==row['entryCanonicalSha256'];assert set(e['components'])==set(owners);assert len(e['bindings'])==6
  seen=set()
  for bind in e['bindings']:
   o=bind['owner'];assert o in owners and o not in seen;seen.add(o);assert bind['role']==roles[o];assert bind['instanceId']=='fixture.'+o;assert bind['profileId']==pair[side+'Selection'][o];assert set(bind)=={'role','owner','instanceId','profileId'}
   assert e['components'][o]=='components/'+o+'.config.json';resolved=src/'config'/e['components'][o];assert resolved.resolve().is_relative_to((src/'config').resolve());assert load(resolved)==docs[o];assert row['selectedWholeSettingsSha256'][o]==canon(selected[side][o])
  entrycount+=1
 family=pc[cid]['caseFamily'];A=selected['A'][owner];B=selected['B'][owner];eligibility='Distinct supported values with source-family operation proposed; productive fixture/observer/competing-cap eligibility remains open, not F-EFFECT accepted.';witness=None
 if family=='listener-bind':witness={'ports':{'A':delta['A'],'B':delta['B']},'operation':'Actual listener+HTTP request at selected port;6061 is not a rejection witness.'}
 if family=='heap-floor-fraction':
  section='provider' if '/provider/' in field else 'reports';pa=A['execution'][section];pb=B['execution'][section];mem=512*1048576
  ha=max(pa['minimumHeapMiB'],math.floor(mem/1048576*pa['heapFraction']));hb=max(pb['minimumHeapMiB'],math.floor(mem/1048576*pb['heapFraction']));assert ha!=hb;witness={'taskMemoryBytes':mem,'heapArgMiBA':ha,'heapArgMiBB':hb,'precondition':'Real plan/provider or adapter invocation must admit512MiB and meet all actual source/result memory demands; actual sandbox/child not run.'}
 if family=='provider-openfiles-derived':
  files=0 if 'minimumOpenFiles' in field else 64;pa=A['execution']['provider'];pb=B['execution']['provider'];x=max(pa['minimumOpenFiles'],files+pa['artifactFileDescriptorReserve']);y=max(pb['minimumOpenFiles'],files+pb['artifactFileDescriptorReserve']);assert x!=y;witness={'artifactFiles':files,'openFilesA':x,'openFilesB':y,'precondition':'Actual plan schema must permit chosen artifactFiles and child baseline fd use; adjust minimum witness to1 if needed; no argv-only acceptance.'}
 if family=='report-cpu-derived':witness={'cpuMillis':1000,'A':'passes minimum check','B':'REPORT_ADAPTER_CPU_LIMIT_BELOW_POLICY','precondition':'Actual report invocation maximum/task/adapter constraints permit1000ms; no native execution.'}
 if family=='report-minimum-openfiles':witness={'openFiles':16,'A':'passes minimum','B':'REPORT_ADAPTER_OPEN_FILE_LIMIT_TOO_LOW','precondition':'Actual report invocation permits16 and all other selected limits; no native effect.'}
 if family=='report-memory-reserve' and 'runtimeMemoryReserveBytes' in field:
  pa=A['execution']['reports'];pb=B['execution']['reports'];s=1024;r=1024;mem=pb['runtimeMemoryReserveBytes']+3*s+2*r;assert mem<pa['runtimeMemoryReserveBytes']+3*s+2*r;witness={'maximumSourceBytes':s,'maximumResultBytes':r,'taskMemoryBytes':mem,'A':'REPORT_ADAPTER_MEMORY_LIMIT_INCOMPATIBLE','B':'passes this compatibility predicate','precondition':'Actual registry adapter, source encoding and result task admit1KiB limits; no effect claimed.'}
 if family=='ingress-probe-reserve':witness={'heldActiveWork':20,'capacityA':20,'capacityB':19,'operation':'Body-free actual GET probe; use19 heldwork to get A admit/Bdeny, all ordinary and socket deadlines admit.'}
 if family in ['identity-uid-gid','kubectl-executable','execution-search-path','service-account-subject','lease-protocol','host-suffix-policy','namespace-prefix-policy','pvc-storage-policy','registry-prefix-policy','secret-reference-policy']:eligibility='Value/domain definition passes; effect additionally requires actual permitted host identity/executable/role/RBAC/CRD/class/reference/endpoint fixture. Proposed fixture labels are not installed/live facts.'
 masked={
 'CMP-C1-EFFECT-buster-engine-execution.reports.maximumTimeoutMs':'Actual specialist-report-finalization selects min(report.maximumTimeoutMs,cleanupTimeoutMs=30000). Both300000/225000 yield30000; use genuinely lower supported complete B or admit original oracle incomplete.',
 'CMP-C1-EFFECT-buster-engine-execution.reports.minimumCpuTimeMs':'Actual caller computes max(minimumCpuTimeMs,floor(min(report.maximumTimeoutMs,cleanupTimeoutMs=30000)/1000)*1000). Both1000/2000 yield30000; direct runtime1000ms negative is unreachable from unchanged caller. A higher valid floor can change actual computed CPU; freeze completeB/source oracle explicitly.',
 'CMP-C1-EFFECT-buster-engine-execution.reports.minimumOpenFiles':'Actual caller always sends maximumOpenFiles=64. Valid loaded policy enforces minimum<=maximum. Min16/32 leaves same64 and both pass. No distinct native effect justified by this pair; direct runtime16 negative is not caller-produced. Do not invent a new caller or weaken field obligation.',
 'CMP-C1-EFFECT-buster-engine-execution.reports.runtimeMemoryReserveBytes':'Actual caller sends memoryBytes=512MiB; source<=64MiB,result<=16MiB. Required memory<=reserve+192MiB+32MiB, A288MiB/B272MiB, always admitted. Valid loader also enforces full policy memory compatibility; changing reserve is not a native bytequota test at this caller. Preserve relation-validation requirement without claiming invented runtime effect.'}
 if cid in masked:eligibility='SOURCE-SUPPORTED PRODUCTIVE-CALLER EFFECT GAP: '+masked[cid];witness={'qualification':'Runtime predicate-only witness above is NOT reachable same-task productive caller proof; no native effect accepted.','caller':'skills/buster/engine/test-gates/specialist-report-finalization.ts:60-71','maskedReason':masked[cid]}
 observations.append({'caseId':cid,'owner':owner,'delta':delta,'actualChangedPaths':changed,'wholeTranslationAndOrientation':'matched all6legacy whole settings and named activeA','supportedDomain':pc[cid].get('supportedDomain'),'validationRelations':pc[cid].get('validationBoundary'),'sourceFamilyRef':'../families.json#'+family,'sourceWitnessRefs':pc[cid]['sourceWitnessRefs'],'effectEligibility':eligibility,'derivedWitnessIfJustified':witness,'futureImplementationResult':'not-run'})
current=load('docs/review/remediation/config-acceptance-matrix.json');cc={c['id']:c for c in current['cases']}
for c in previous['cases']:assert c['originalLifecycle']['phase']==cc[c['id']]['phase'] and c['originalLifecycle']['result']==cc[c['id']]['result'] and c['requirementIds']==cc[c['id']]['requirementIds']
result={'qualification':'Independent whole-translation/tuple/source-formula assessment; not targetv3 runtime or native acceptance','casePairs':len(observations),'entriesChecked':entrycount,'ownerProfiles':sum(len(d['profiles']) for d in docs.values()),'allWholeLegacyTranslationsMatch':True,'allActiveBaselineOwnerSettingsMatch':True,'allDistinctIntendedFieldsMatchOrientation':True,'allRootRelativeFixtureTupleSelectionsMatch':True,'original229LifecycleRequirementsConserved':True,'perCase':observations,'inputs':{str(p):sha(p) for p in [src/'pairs.json',src/'entry-selections.json',src/'validation.json',base/'independent-c1-case-oracles/cases.json',Path('docs/review/remediation/config-acceptance-matrix.json')]+list((src/'config').rglob('*.json'))}}
(out/'independent-observations.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['perCase','inputs']}))
