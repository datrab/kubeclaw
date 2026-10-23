#!/usr/bin/env python3
"""Original-loss, classification, required owner/schema and full roster controls."""
import copy
import importlib.util
import json
import runpy
import contextlib
import io
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'docs/review/remediation/config-final-reconciliation-20261016'
spec=importlib.util.spec_from_file_location('core_platform',OUT/'reconcile-core-platform.py')
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
reject('duplicate original',m.FIELDS,lambda x:x.append(copy.deepcopy(selected[0])))
for leaf in ['stageMemoryBytes','observerMemoryBytes']:
    reject('missing central '+leaf,m.CORE,lambda x,k=leaf:x['profiles']['standard']['settings'].pop(k))
    reject('missing central schema '+leaf,m.POLICY_SCHEMA,lambda x,k=leaf:x['properties'].pop(k))
for r in baseline['rows']:
    if r['owner']=='nova-platform':
        leaf=r['originalSource']['field'].removeprefix('properties.')
        reject('missing platform schema '+leaf,m.SCHEMA,lambda x,k=leaf:x['properties'].pop(k))
reject('wrong protocol identity',m.SCHEMA,lambda x:x['properties']['schemaVersion'].__setitem__('const','foreign.v9'))
for group in ['fields','cases','requirements']:
    reject('full roster '+group+' loss',m.p.ROSTER,lambda x,g=group:x[g].pop(),True)
restored=m.build();assert restored==baseline
assert len(baseline['rows'])==54
assert baseline['counts']=={'EXACT_EXISTING_CENTRAL_LEASE_MEMORY_SOURCE_JOIN':2,'PROTOCOL_SCHEMA_VERSION_NOT_OPERATOR_GAP':1,'SUPPLIED_PLATFORM_CENTRAL_RECEIVING_OPEN':14,'SUPPLIED_GRANT_VALUES_CENTRAL_RECEIVING_OPEN':36,'FIXED_RESOLVER_RETRY_CENTRAL_RECEIVING_OPEN':1}
# The real composition must reject a corrupt supplement before publishing output.
original_text=Path.read_text
supplement=OUT/'core-platform-successors.json'
for name,mutate in [
    ('supplement duplicate',lambda x:x['rows'].append(copy.deepcopy(x['rows'][0]))),
    ('supplement missing',lambda x:x['rows'].pop()),
    ('supplement original',lambda x:x['rows'][0].__setitem__('original','foreign')),
    ('supplement classification',lambda x:x['rows'][0].__setitem__('class','protocol-only')),
    ('supplement cases',lambda x:x['rows'][0].__setitem__('caseIds',[])),
    ('supplement acceptance',lambda x:x['rows'][0].__setitem__('runtimeAcceptance','PASS')),
    ('supplement fabricated author',lambda x:next(r for r in x['rows'] if r['status']=='SUPPLIED_GRANT_VALUES_CENTRAL_RECEIVING_OPEN').__setitem__('centralPhysicalAuthor',{'path':m.CORE})),
]:
    document=copy.deepcopy(baseline);mutate(document)
    def altered_text(path,*args,**kwargs):return json.dumps(document) if path==supplement else original_text(path,*args,**kwargs)
    with patch.object(Path,'read_text',altered_text),contextlib.redirect_stdout(io.StringIO()):
        try:runpy.run_path(str(OUT/'reconcile-successors.py'))
        except (ValueError,KeyError) as e:results.append({'name':name,'rejected':True,'error':str(e)[:180]})
        else:raise AssertionError('Accepted corrupt composition: '+name)
result={'passed':len(results)+1,'total':len(results)+1,'negativeControls':results,'restoredDeterministic':True,'originalFields':54,'existingCentralLeaseMemoryJoins':2,'originalProtocolInvariants':1,'centralReceivingResiduals':51,'fullRoster':baseline['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author controls only'}
Path(__file__).with_name('checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='negativeControls'}))
