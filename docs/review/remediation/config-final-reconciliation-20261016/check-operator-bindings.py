#!/usr/bin/env python3
"""Reproducible matrix identity and false-closure controls; not runtime acceptance."""
import copy,importlib.util,json
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('operator_bindings',OUT/'reconcile-operator-bindings.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=m.build()
originals={x['id']:x for x in m.h.read(str((OUT/'fields.json').relative_to(m.h.ROOT))) if any(y['path']==m.LOCATOR for y in x['explicitConfigLocatorObservations'])}
checks=[]
def reject(name,mutate):
 d=copy.deepcopy(r);mutate(d)
 try:m.validate(d,originals)
 except (ValueError,KeyError):checks.append({'name':name,'rejected':True});return
 raise AssertionError(name)
reject('missing original field',lambda d:d['rows'].pop())
reject('duplicate original field',lambda d:d['rows'].append(d['rows'][0]))
for key in ['original','originalObjectSha256','caseIds','class','owner']:
 reject('original '+key,lambda d,k=key:d['rows'][0].__setitem__(k,'changed'))
reject('foreign ID',lambda d:d['rows'][0].__setitem__('id','foreign'))
reject('invented central author',lambda d:d['rows'][0].__setitem__('centralPhysicalAuthor','invented.json'))
reject('false runtime PASS',lambda d:d['rows'][0].__setitem__('runtimeAcceptance','PASS'))
reject('false whole acceptance',lambda d:d.__setitem__('fullC0C6Complete',True))
reject('false original case acceptance',lambda d:d.__setitem__('originalCasesNewlyAccepted',1))
reject('wrong environment source',lambda d:d['rows'][0].__setitem__('environmentName','WRONG'))
reject('token file falsely static secret',lambda d:next(r for r in d['rows'] if r['environmentName']=='PRISM_PRODUCT_CONTROLLER_TOKEN_FILE').__setitem__('status','KUBERNETES_SECRET_FILE_REFERENCE_CENTRAL_BINDING_OPEN'))
reject('ordinary origin falsely secret',lambda d:next(r for r in d['rows'] if r['environmentName']=='PRISM_PRODUCT_ORIGIN').__setitem__('status','KUBERNETES_SECRET_FILE_REFERENCE_CENTRAL_BINDING_OPEN'))
assert m.build()==r
print(json.dumps({'negativeControls':checks,'passed':len(checks),'total':len(checks),'restoredDeterministic':True,'preservedCounts':r['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False}))
