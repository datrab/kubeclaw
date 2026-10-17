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
assert len(baseline['rows']) == 50
new = [r for r in baseline['rows'] if r['plugin'] in ['kubeclaw.command-runner','kubeclaw.git-workspace']]
assert len(new) == 18 and len({r['id'] for r in new}) == 18
assert all(r['centralPhysicalAuthor'] is None and r['runtimeAcceptance'].startswith('OPEN') for r in new)
assert sum(r['schema']['pointer'].endswith('/items') for r in new) == 3
assert sum(r['schema']['pointer'].endswith('/additionalProperties') for r in new) == 1
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
for plugin,field in [('command-runner','allowedExecutables'),('command-runner','executableCatalog'),('git-workspace','authorEmail')]:
    schema='skills/common/plugins/'+plugin+'/schemas/config.schema.json'
    reject('missing '+plugin+' schema '+field,schema,lambda doc,f=field:doc['properties'].pop(f))
reject('missing command items schema','skills/common/plugins/command-runner/schemas/config.schema.json',lambda doc:doc['properties']['allowedExecutables'].pop('items'))
reject('missing catalog child schema','skills/common/plugins/command-runner/schemas/config.schema.json',lambda doc:doc['properties']['executableCatalog'].pop('additionalProperties'))
assert m.build()==baseline
composed=json.loads((BASE/'semantic-successors.json').read_text())
joined=[r for g in composed['groups'] for r in g.get('explicitPlatformResiduals',[])]
assert {r['id'] for r in joined}=={r['id'] for r in baseline['rows']} and len(joined)==50
for group in composed['groups']:
    if group['status']=='EXACT_PLATFORM_SOURCE_JOIN_CENTRAL_RECEIVING_OPEN':
        assert len(group['remainingFieldIds'])==9 and group['candidateSuccessors']==[]
        assert set(group['remainingFieldIds'])=={r['id'] for r in group['explicitPlatformResiduals']}

original32=json.loads(__import__('subprocess').check_output(['git','show','8ed1a319a2cd9363b48b30e57269ac620fa19405:docs/review/remediation/config-final-reconciliation-20261016/platform-boundary-successors.json'],cwd=ROOT))
# The only added annotation on the prior32 is the explicit existing platform lane.
for old in original32['rows']:
    now=next(r for r in baseline['rows'] if r['id']==old['id'])
    assert all(now[k]==v for k,v in old.items()), old['id']
result={'negativeControls':controls,'passed':len(controls),'total':16,'restoredDeterministic':True,'prior32RowsPreserved':True,'newOriginalFields':18,'composedRows':50,'fullRoster':baseline['preservedCounts'],'integrityFailures':[],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author-run matrix controls, not independent review or original runtime proof'}
assert len(controls)==16
(Path(__file__).parent/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='negativeControls'}))
