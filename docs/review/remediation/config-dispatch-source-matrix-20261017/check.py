#!/usr/bin/env python3
"""Original-loss and corrupted dependency controls; never mutate productive authors."""
import copy
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'docs/review/remediation/config-final-reconciliation-20261016'
spec=importlib.util.spec_from_file_location('dispatch',OUT/'reconcile-dispatch.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original_read=m.read;original_full=m.p.build
baseline=m.build();results=[]
def reject(name,path,mutate,full=False):
    document=copy.deepcopy(original_read(path));mutate(document)
    def altered(p):return copy.deepcopy(document) if p==path else original_read(p)
    m.read=m.p.read=altered
    if not full:m.p.build=lambda:{'preservedCounts':baseline['preservedCounts']}
    try:
        try:m.build()
        except (ValueError,KeyError,IndexError,StopIteration) as e:results.append({'name':name,'rejected':True,'error':str(e)[:180]})
        else:raise AssertionError('Accepted corrupt input: '+name)
    finally:m.read=m.p.read=original_read;m.p.build=original_full
fields=original_read(m.FIELDS);selected=[r for r in fields if any(o['path']==m.LOCATOR for o in r['explicitConfigLocatorObservations'])]
for row in selected:
    reject('missing '+row['id'],m.FIELDS,lambda x,i=row['id']:x.__setitem__(slice(None),[r for r in x if r['id']!=i]))
for key,value in [('id','foreign'),('original','D228#/rows/0'),('originalObjectSha256','bad'),('class','protocol-only'),('caseIds',[]),('owner','foreign')]:
    reject('original '+key,m.FIELDS,lambda x,k=key,v=value:x[next(i for i,r in enumerate(x) if r['id']==selected[0]['id'])].__setitem__(k,v))
reject('duplicate field',m.FIELDS,lambda x:x.append(copy.deepcopy(selected[0])))
for kind,section,profiles,leaves in [('runtime','httpDispatch','targetByteProfiles',m.BYTES),('openclaw','openClawDispatch','targetTimingProfiles',m.TIMING)]:
    for leaf in sorted(leaves):
        reject('missing central '+kind+leaf,m.CORE,lambda x,s=section,p=profiles,k=leaf:x['profiles']['standard']['settings'][s][p]['standard'].pop(k))
    reject('empty central '+profiles,m.CORE,lambda x,s=section,p=profiles:x['profiles']['standard']['settings'][s].__setitem__(p,{}))
    manifest=m.BASE+'plugin.json';index=0 if kind=='runtime' else 1
    reject('wrong actual receiver '+kind,manifest,lambda x,i=index:x['adapters'][i].__setitem__('export','foreign'))
for schema in ['config.schema.json','openclaw-config.schema.json']:
    reject('missing targets schema '+schema,m.BASE+'schemas/'+schema,lambda x:x['properties'].pop('targets'))
for group in ['fields','cases','requirements']:
    reject('full roster '+group+' loss',m.p.ROSTER,lambda x,g=group:x[g].pop(),True)
restored=m.build();assert restored==baseline
counts=baseline['counts'];assert len(baseline['rows'])==42 and counts['ORIGINAL_TARGET_SELECTED_DISPATCH_PROFILE_SOURCE_JOIN']==7
assert sum(v for k,v in counts.items() if k.endswith('_OPEN'))==35
result={'passed':len(results)+1,'total':len(results)+1,'negativeControls':results,'restoredDeterministic':True,'originalFields':42,'exactExistingCentralProfileJoins':7,'centralReceivingResiduals':35,'fullRoster':baseline['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author controls only'}
Path(__file__).with_name('checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='negativeControls'}))
