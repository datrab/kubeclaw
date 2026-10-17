#!/usr/bin/env python3
"""Author-run identity/schema/manifest controls; never runtime acceptance."""
import copy
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
BASE=ROOT/'docs/review/remediation/config-final-reconciliation-20261016'
spec=importlib.util.spec_from_file_location('notifications',BASE/'reconcile-notifications.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
read=m.read
baseline=m.build()
# Non-platform mutations cannot affect the unchanged platform/whole-roster inputs.
# Validate that expensive closure once; each authoritative-roster mutant still revalidates it.
platform_build=m.p.build
platform_baseline=platform_build()
m.p.build=lambda:copy.deepcopy(platform_baseline)
assert len(baseline['rows'])==26
assert sum(r['effectDisposition']=='SCHEMA_ACCEPTED_BUT_UNUSED_BY_DELIVER_PREVIEW' for r in baseline['rows'])==7
assert sum(r['status']=='EXACT_CORE_NOTIFICATION_SOURCE_JOIN' for r in baseline['rows'])==2
assert all(r['runtimeAcceptance']=='OPEN; original results unchanged' for r in baseline['rows'])
fields=read(m.FIELDS)
index=next(i for i,r in enumerate(fields) if r['id']==baseline['rows'][0]['id'])
controls=[]
def reject(name,path,mutate):
    changed=copy.deepcopy(read(path));mutate(changed)
    replacement=lambda p:copy.deepcopy(changed) if p==path else read(p)
    m.read=replacement;m.p.read=replacement
    if path==m.p.ROSTER: m.p.build=platform_build
    try: m.build()
    except (ValueError,KeyError,IndexError,StopIteration) as e: controls.append({'name':name,'rejected':True,'error':str(e)})
    else: raise AssertionError('Accepted mutant: '+name)
    finally:
        m.read=read;m.p.read=read
        m.p.build=lambda:copy.deepcopy(platform_baseline)
for field,value in [('id','foreign'),('original','D228#/rows/0'),('originalObjectSha256','0'*64),('class','protocol-only'),('caseIds',[]),('owner','foreign')]:
    reject('original '+field,m.FIELDS,lambda d,f=field,v=value:d[index].__setitem__(f,v))
reject('missing original field',m.FIELDS,lambda d:d.pop(index))
reject('duplicate original field',m.FIELDS,lambda d:d.append(copy.deepcopy(d[index])))
for group in ['fields','cases','requirements']:
    reject('full roster '+group+' loss',m.p.ROSTER,lambda d,g=group:d[g].pop())
for field in ['target','pipelineLabel','modelLabel','stageLabels','maxMessageChars','suppressEventTypes']:
    reject('missing schema '+field,m.SCHEMA,lambda d,f=field:d['properties'].pop(f))
for i in [0,1]:
    reject('missing observer '+str(i),m.MANIFEST,lambda d,i=i:d['observers'].pop(i))
    reject('wrong observer export '+str(i),m.MANIFEST,lambda d,i=i:d['observers'][i].__setitem__('export','wrong'))
    reject('missing subscriptions '+str(i),m.MANIFEST,lambda d,i=i:d['observers'][i].pop('subscriptions'))
    for field in ['mode','maxAttempts','backoffMs','timeoutMs']:
        reject('missing observer '+str(i)+' '+field,m.MANIFEST,lambda d,i=i,f=field:d['observers'][i]['failurePolicy'].pop(f))
for name in read(m.CORE)['profiles']:
    reject('missing Core maxMessageChars '+name,m.CORE,lambda d,n=name:d['profiles'][n]['settings']['notificationPresentation'].pop('maxMessageChars'))
m.p.build=platform_build
assert m.build()==baseline
composed=json.loads((BASE/'semantic-successors.json').read_text())
g=next(g for g in composed['groups'] if 'notification-observer/default' in g['historicalLocator'])
assert len(g['remainingFieldIds'])==24 and g['candidateSuccessors']==[]
assert len(g['exactNotificationCoreMappings'])==2 and len(g['explicitNotificationResiduals'])==24
assert set(g['remainingFieldIds'])=={r['id'] for r in g['explicitNotificationResiduals']}
assert set(g['originalFieldIds'])=={r['id'] for r in baseline['rows']}
result={'negativeControls':controls,'passed':len(controls),'total':len(controls),'restoredDeterministic':True,'composedOriginalFields':26,'exactCoreSourceJoins':2,'centralReceivingResiduals':24,'previewSchemaOnlyOriginalFields':7,'fullRoster':baseline['preservedCounts'],'integrityFailures':[],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author-run controls only'}
(Path(__file__).parent/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='negativeControls'}))
