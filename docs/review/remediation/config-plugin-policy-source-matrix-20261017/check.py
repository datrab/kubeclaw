#!/usr/bin/env python3
"""In-memory corrupted-input controls; productive authors and original objects untouched."""
import copy
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'docs/review/remediation/config-final-reconciliation-20261016'
spec=importlib.util.spec_from_file_location('matrix',OUT/'reconcile-plugin-policies.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original_read=m.read; original_full=m.p.build
baseline=m.build();results=[]
def reject(name,path,mutate,full=False):
    document=copy.deepcopy(original_read(path));mutate(document)
    def altered(p):return copy.deepcopy(document) if p==path else original_read(p)
    m.read=m.p.read=altered
    if not full:m.p.build=lambda:{'preservedCounts':baseline['preservedCounts']}
    try:
        try:m.build()
        except (ValueError,KeyError,IndexError) as e:results.append({'name':name,'rejected':True,'error':str(e)[:180]})
        else:raise AssertionError('Accepted corrupt input: '+name)
    finally:m.read=m.p.read=original_read;m.p.build=original_full
fields=original_read(m.FIELDS)
selected=[r for r in fields if r['owner'] in m.OWNERS and r['explicitConfigLocatorObservations']]
for row in selected:
    reject('missing '+row['id'],m.FIELDS,lambda x,i=row['id']:x.__setitem__(slice(None),[r for r in x if r['id']!=i]))
for key,value in [('id','foreign'),('original','D228#/rows/0'),('originalObjectSha256','bad'),('class','protocol-only'),('caseIds',[]),('owner','foreign')]:
    reject('original '+key,m.FIELDS,lambda x,k=key,v=value:x[next(i for i,r in enumerate(x) if r['id']==selected[0]['id'])].__setitem__(k,v))
reject('duplicate field',m.FIELDS,lambda x:x.append(copy.deepcopy(selected[0])))
for plugin,count in m.OWNERS.items():
    manifest='skills/common/plugins/'+plugin.removeprefix('kubeclaw.')+'/plugin.json';kind='adapters' if plugin=='kubeclaw.secret-resolver' else 'observers'
    for index in range(1 if kind=='adapters' else count//5):
        reject('wrong export '+plugin+str(index),manifest,lambda x,i=index,k=kind:x[k][i].__setitem__('export','foreign'))
        if kind=='observers':
            reject('missing subscriptions '+plugin+str(index),manifest,lambda x,i=index:x['observers'][i].pop('subscriptions'))
            for field in ['mode','maxAttempts','backoffMs','timeoutMs']:
                reject('missing '+plugin+str(index)+field,manifest,lambda x,i=index,f=field:x['observers'][i]['failurePolicy'].pop(f))
schema='skills/common/plugins/secret-resolver/schemas/config.schema.json'
reject('missing environment schema',schema,lambda x:x['properties'].pop('environment'))
reject('missing environment name schema',schema,lambda x:x['properties']['environment'].pop('additionalProperties'))
for group in ['fields','cases','requirements']:
    reject('full roster '+group+' loss',m.p.ROSTER,lambda x,g=group:x[g].pop(),True)
restored=m.build()
assert baseline==restored
assert len(baseline['rows'])==17 and len({r['id'] for r in baseline['rows']})==17
assert all(r['centralPhysicalAuthor'] is None and r['runtimeAcceptance']=='OPEN; original results unchanged' for r in baseline['rows'])
result={'passed':len(results)+1,'total':len(results)+1,'negativeControls':results,'restoredDeterministic':True,'sourceRows':17,'centralReceivingResiduals':17,'fullRoster':baseline['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author controls only'}
Path(__file__).with_name('checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='negativeControls'}))
