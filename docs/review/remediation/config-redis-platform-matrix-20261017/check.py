#!/usr/bin/env python3
"""Exact original/schema loss controls for the newly composed platform matrix."""
import copy
import importlib.util
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/review/remediation/config-final-reconciliation-20261016'
spec = importlib.util.spec_from_file_location('platform_matrix', BASE/'reconcile-platform-boundaries.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
read = m.read
baseline = m.build()
assert len(baseline['rows']) == 62
new = [r for r in baseline['rows'] if r['plugin']=='kubeclaw.redis-transport']
assert len(new) == 12 and len({r['id'] for r in new}) == 12
assert all(r['centralPhysicalAuthor'] is None and r['runtimeAcceptance'].startswith('OPEN') for r in new)
assert {r['registration'] for r in new}=={'kubeclaw.redis-transport:publisher','kubeclaw.redis-transport:telemetry'}
assert all(len(r['actualEffects'])==2 for r in new)
assert len({(r['registration'],r['originalField']) for r in new})==12
fields_path = str((BASE/'fields.json').relative_to(ROOT))
fields = read(fields_path)
index = next(i for i,r in enumerate(fields) if r['id']==new[0]['id'])
controls=[]
def reject(name,path,mutate):
    changed=copy.deepcopy(read(path)); mutate(changed)
    m.read=lambda p: copy.deepcopy(changed) if p==path else read(p)
    try:
        m.build()
    except (ValueError,KeyError,IndexError,StopIteration) as error:
        controls.append({'name':name,'rejected':True,'error':str(error)})
    else:
        raise AssertionError('Accepted mutant: '+name)
    finally:
        m.read=read
for field,value in [('id','foreign'),('original','D228#/rows/0'),('originalObjectSha256','0'*64),('class','not-a-setting'),('owner','kubeclaw.state-store'),('caseIds',[])]:
    reject('original '+field,fields_path,lambda doc,f=field,v=value:doc[index].__setitem__(f,v))
reject('omitted original field',fields_path,lambda doc:doc.pop(index))
reject('duplicate original field',fields_path,lambda doc:doc.append(copy.deepcopy(doc[index])))
for group in ['fields','cases','requirements']:
    reject('full roster '+group+' loss',m.ROSTER,lambda doc,g=group:doc[g].pop())
schema='skills/common/plugins/redis-transport/schemas/config.schema.json'
for field in ['url','passwordSecret','streamPrefix','maxLen','dedupTtlMs','timeoutMs']:
    reject('missing Redis schema '+field,schema,lambda doc,f=field:doc['properties'].pop(f))
manifest='skills/common/plugins/redis-transport/plugin.json'
for index in [0,1]:
    reject('missing Redis registration '+str(index),manifest,lambda doc,i=index:doc['adapters'].pop(i))
    reject('wrong Redis receiver '+str(index),manifest,lambda doc,i=index:doc['adapters'][i].__setitem__('export','activateWrong'))
assert m.build()==baseline
composed=json.loads((BASE/'semantic-successors.json').read_text())
joined=[r for g in composed['groups'] for r in g.get('explicitPlatformResiduals',[])]
assert {r['id'] for r in joined}=={r['id'] for r in baseline['rows']} and len(joined)==62
for group in composed['groups']:
    if group['status']=='EXACT_PLATFORM_SOURCE_JOIN_CENTRAL_RECEIVING_OPEN':
        assert len(group['remainingFieldIds']) in [9,12] and group['candidateSuccessors']==[]
        assert set(group['remainingFieldIds'])=={r['id'] for r in group['explicitPlatformResiduals']}

original50=json.loads(__import__('subprocess').check_output(['git','show','33fd11ab73c44ad8babb31c8aaf80cd2f9c9d469:docs/review/remediation/config-final-reconciliation-20261016/platform-boundary-successors.json'],cwd=ROOT))
# The only added annotation on the prior32 is the explicit existing platform lane.
for old in original50['rows']:
    now=next(r for r in baseline['rows'] if r['id']==old['id'])
    assert all(now[k]==v for k,v in old.items()), old['id']
result={'negativeControls':controls,'passed':len(controls),'total':21,'restoredDeterministic':True,'prior50RowsPreserved':True,'newOriginalFields':12,'composedRows':62,'fullRoster':baseline['preservedCounts'],'integrityFailures':[],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author-run matrix controls, not independent review or original runtime proof'}
assert len(controls)==21
(Path(__file__).parent/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='negativeControls'}))
