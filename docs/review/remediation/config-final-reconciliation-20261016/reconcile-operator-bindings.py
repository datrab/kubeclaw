#!/usr/bin/env python3
"""Trace original deployment operator references, never secret bytes or runtime acceptance."""
import importlib.util,json
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
LOCATOR='config/deployment/operator.config.json'
DB='skills/prism/config/database-bootstrap.ts'
PRODUCT='skills/prism/control/product-decisions.ts'
TPL='charts/prism/templates/_product-decisions.tpl'
CONSTRAINT='All11 original operator deployment fields still use Helm values/environment or projected secret-file transport. Four product identity/endpoint/allowlist fields are ordinary operator settings, not secret bytes. Four database fields are external secret references; private key and CA are Kubernetes Secret file projections, controller token is a projected service-account token, not a static Secret. Central selected deployment author/profile/schema/delivery and original binding/history acceptance remain OPEN; no authority change, credential rotation, private policy root or denied-v10 promotion.'
def validate(result, originals):
 rows=result['rows']
 if len(rows)!=11 or {r['id'] for r in rows}!=set(originals):raise ValueError('Operator11 roster drift')
 for r in rows:
  o=originals[r['id']]
  if any(r[k]!=o[k] for k in ['original','originalObjectSha256','caseIds','class','owner']):raise ValueError('Operator original drift')
  if r['centralPhysicalAuthor'] is not None or r['runtimeAcceptance']!='OPEN; original results unchanged':raise ValueError('False operator closure')
  env=r['id'].removeprefix('AUTH-PRISM-DB-SECRET-').removeprefix('AUTH-PRISM-PRODUCT-SECRET-').removeprefix('AUTH-PRISM-PRODUCT-')
  if r['environmentName']!=env:raise ValueError('Environment source mismatch')
  expected=('EXTERNAL_DATABASE_SECRET_ENV_REFERENCE_CENTRAL_BINDING_OPEN' if r['id'].startswith('AUTH-PRISM-DB-SECRET-') else 'SERVICE_ACCOUNT_TOKEN_FILE_REFERENCE_CENTRAL_BINDING_OPEN' if env.endswith('TOKEN_FILE') else 'KUBERNETES_SECRET_FILE_REFERENCE_CENTRAL_BINDING_OPEN' if env.endswith('_FILE') else 'ORDINARY_PRODUCT_OPERATOR_ENV_CENTRAL_AUTHOR_OPEN')
  if r['status']!=expected:raise ValueError('Transport source classification drift')
 if result['originalCasesNewlyAccepted']!=0 or result['fullC0C6Complete'] is not False:raise ValueError('False acceptance')
 return True

def build():
 full=h.build();roster=h.read(h.ROSTER);refs={r['id']:r for r in roster['fields']};cache={};rows=[]
 originals={r['id']:r for r in h.read(str((OUT/'fields.json').relative_to(h.ROOT))) if any(x['path']==LOCATOR for x in r['explicitConfigLocatorObservations'])}
 for identity,row in originals.items():
  ref=refs[identity];doc,loc=ref['original'].split('#',1)
  if doc not in cache:cache[doc]=h.read(roster['documents'][doc]['path'])
  original=h.pointer(cache[doc],loc)
  if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Pinned original drift')
  r={k:row[k] for k in ['id','original','originalObjectSha256','caseIds','class','owner']}
  r.update(originalSource=original.get('source'),centralPhysicalAuthor=None,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
  if identity.startswith('AUTH-PRISM-DB-SECRET-'):
   env=identity.removeprefix('AUTH-PRISM-DB-SECRET-');key={'ADMIN_DATABASE_URL':'admin-url','PRISM_MIGRATOR_PASSWORD':'migrator-password','PRISM_RUNTIME_PASSWORD':'runtime-password','PRISM_READONLY_PASSWORD':'readonly-password'}[env]
   r.update(status='EXTERNAL_DATABASE_SECRET_ENV_REFERENCE_CENTRAL_BINDING_OPEN',environmentName=env,secretKey=key,sourceInputs=[h.anchor('charts/prism/templates/jobs.yaml','- name: '+env),h.anchor('charts/prism/templates/jobs.yaml','key: '+key+' }'),h.anchor(DB,"required('"+env+"')")],actualEffects=[h.anchor('skills/prism/server/database-bootstrap-runtime.ts','connectionString: config.adminUrl'),h.anchor('skills/prism/server/database-bootstrap-runtime.ts','bootstrapPrismDatabaseRoles(admin, config.adminUrl, config.passwords'),h.anchor('skills/prism/server/database-roles.ts','await verifyCredential(adminUrl,')],transport='Kubernetes Secret valueFrom; never credential bytes in central config',bootReceiving=h.anchor('skills/prism/server/bootstrap-database.ts',"verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-control')"),deliveryQualification='OPEN: bootstrap entrypoint requires authentic boot receipt; source mapping alone does not prove Job receipt materialization/mount')
  else:
   env=identity.removeprefix('AUTH-PRISM-PRODUCT-SECRET-').removeprefix('AUTH-PRISM-PRODUCT-')
   field={'PRISM_PRODUCT_ORIGIN':'origin','PRISM_PRODUCT_CONTROLLER_URL':'controllerUrl','PRISM_PRODUCT_OPERATORS':'operators','PRISM_PRODUCT_ISSUER':'issuer'}.get(env)
   if field:
    r.update(status='ORDINARY_PRODUCT_OPERATOR_ENV_CENTRAL_AUTHOR_OPEN',currentValuesPointer='/control/productDecisions/'+field,transport='Helm operator value -> ENV; not a secret',sourceInputs=[h.anchor(TPL,'name: '+env+', value:'),h.anchor(PRODUCT,"required('"+env+"')")])
   else:
    field={'PRISM_PRODUCT_PRIVATE_KEY_FILE':'signingSecretName','PRISM_PRODUCT_CONTROLLER_CA_FILE':'controllerCaSecretName','PRISM_PRODUCT_CONTROLLER_TOKEN_FILE':'tokenAudience'}[env]
    kind='SERVICE_ACCOUNT_TOKEN_FILE' if env.endswith('TOKEN_FILE') else 'KUBERNETES_SECRET_FILE'
    r.update(status=kind+'_REFERENCE_CENTRAL_BINDING_OPEN',currentValuesPointer='/control/productDecisions/'+field,transport=kind,sourceInputs=[h.anchor(TPL,'name: '+env+', value:'),h.anchor(TPL,{'signingSecretName':'secretName: {{ $config.signingSecretName','controllerCaSecretName':'name: {{ $config.controllerCaSecretName','tokenAudience':'audience: {{ $config.tokenAudience'}[field]),h.anchor(PRODUCT,"required('"+env+"')")])
   effectpath,effect={'PRISM_PRODUCT_ORIGIN':(PRODUCT,'headers.origin !== config.origin'),'PRISM_PRODUCT_CONTROLLER_URL':('skills/prism/server/product-controller.ts','new URL(path, config.controller)'),'PRISM_PRODUCT_OPERATORS':(PRODUCT,'!config.operators.has(session.user)'),'PRISM_PRODUCT_ISSUER':(PRODUCT,'issuer: config.issuer'),'PRISM_PRODUCT_PRIVATE_KEY_FILE':(PRODUCT,'config.privateKey).toString'),'PRISM_PRODUCT_CONTROLLER_CA_FILE':('skills/prism/server/product-controller.ts','readFile(config.caFile)'),'PRISM_PRODUCT_CONTROLLER_TOKEN_FILE':('skills/prism/server/product-controller.ts',"readFile(config.tokenFile, 'utf8')")}[env]
   r.update(environmentName=env,actualEffects=[h.anchor(effectpath,effect)],enableFence=h.anchor(PRODUCT,"env.PRISM_PRODUCT_DECISIONS_ENABLED !== 'true'"))
  rows.append(r)
 result={'scope':'Exact11 original deployment operator references; source matrix only, not implementation/acceptance','constraint':CONSTRAINT,'rows':rows,'preservedCounts':full['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}
 validate(result,originals)
 return result
if __name__=='__main__':
 result=build();(OUT/'operator-binding-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'fields':len(result['rows']),'preservedCounts':result['preservedCounts'],'originalCasesNewlyAccepted':0}))
