#!/usr/bin/env python3
"""Trace original Kubeclaw chart fields to current projections, without runtime acceptance."""
import copy,importlib.util,json,re
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
LOCATOR='config/deployment/kubeclaw/<profile>.json'
CONSTRAINT='All191 original Kubeclaw chart fields retain Helm values, role release values, explicit private overlays and generated image/code-bundle override lanes. Existing component-generated pipeline projections are not sole-root deployment receiving for these fields. Actual direct or ancestor-object references are source navigation only, not proof every descendant is consumed. Sole-root deployment/profile/schema/file-set/original-history receiving remains OPEN. Resources are not native scheduling/cgroup proof; Secret references are not secret bytes. No authority change, deployment, denied-v10 activation or independent/native acceptance.'
KEYS=['id','original','originalObjectSha256','caseIds','class','owner']
def build():
 full=h.build(); roster=h.read(h.ROSTER); refs={r['id']:r for r in roster['fields']}; cache={}; rows=[]
 for row in h.read(str((OUT/'fields.json').relative_to(h.ROOT))):
  if not any(x['path']==LOCATOR for x in row['explicitConfigLocatorObservations']):continue
  ref=refs[row['id']];doc,loc=ref['original'].split('#',1)
  if doc not in cache:cache[doc]=h.read(roster['documents'][doc]['path'])
  original=h.pointer(cache[doc],loc)
  if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Original identity drift')
  field=original['source']['field']; projections=[]
  for file in sorted((h.ROOT/'charts/kubeclaw/templates').glob('*')):
   if not file.is_file():continue
   for line in file.read_text().splitlines():
    for match in re.finditer(r'(?:\$|\.)Values\.([A-Za-z0-9_.]+)',line):
     selected=match.group(1).rstrip('.')
     if selected==field or field.startswith(selected+'.'):
      projections.append({**h.anchor(str(file.relative_to(h.ROOT)),line.strip()),'selectedValuePath':selected,'projectionKind':'DIRECT' if selected==field else 'ANCESTOR_OBJECT_PROJECTION'})
  if not projections:raise ValueError('No actual projection: '+field)
  r={k:row[k] for k in KEYS}
  r.update(originalSource=original['source'],currentValuePath=field,currentValues=h.pin('charts/kubeclaw/values.yaml'),centralPhysicalAuthor=None,actualProjections=projections,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN',status='EXACT_KUBECLAW_CHART_VALUES_PROJECTION_CENTRAL_RECEIVING_OPEN')
  if '.resources.' in field:
   r['effectQualification']='Full container resources object projection; actual Kubernetes scheduling/cgroup effect NOT VERIFIED.'
  if row['class']=='secret-reference':r['secretQualification']='Reference only; external Secret bytes and real kubelet/provider receipt are not central config or locally proved.'
  if field in ['auth.token','litellm.apiKey','discord.token']:
   r['secretQualification']='Historical inline secret value lane still present in Helm; no secret values copied into this matrix, no externalization or Secret delivery acceptance inferred.'
  rows.append(r)
 if len(rows)!=191 or len({r['id'] for r in rows})!=191:raise ValueError('Kubeclaw191 roster drift')
 route=[h.anchor('scripts/deploy.sh',x) for x in ['local values_file="$REPO_DIR/releases/values/${role}.yaml"','private_values="${NOVA_VALUES_FILE:-}"','helm_args=(--values "$values_file")','helm_args+=(--values "$private_values")','append_image_override_file "$override_file"','append_code_bundle_override_file "$override_file"','render_selected_role "$role" "agent-${role}"','helm_args=(upgrade --install "agent-${role}"']]
 return {'scope':'Exact original Kubeclaw191 chart source lanes only; no production implementation or runtime acceptance','constraint':CONSTRAINT,'rows':rows,'deliveryRoute':route,'preservedCounts':full['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}

def validate(result,expected):
 if result!=expected:raise ValueError('Original/source/acceptance matrix drift')
 return True
def controls(result):
 checks=[]
 def reject(name,mutate):
  d=copy.deepcopy(result);mutate(d)
  try:validate(d,result)
  except ValueError:checks.append({'name':name,'rejected':True});return
  raise AssertionError(name)
 for key in KEYS+['currentValuePath','centralPhysicalAuthor','runtimeAcceptance','actualProjections','status']:
  reject('alter '+key,lambda d,k=key:d['rows'][0].__setitem__(k,'changed'))
 reject('missing row',lambda d:d['rows'].pop())
 reject('duplicate row',lambda d:d['rows'].append(d['rows'][0]))
 reject('false full acceptance',lambda d:d.__setitem__('fullC0C6Complete',True))
 reject('false original pass',lambda d:d.__setitem__('originalCasesNewlyAccepted',1))
 for row in result['rows']:
  reject('source identity '+row['id'],lambda d,i=row['id']:next(r for r in d['rows'] if r['id']==i)['actualProjections'][0].__setitem__('sha256','0'*64))
 assert build()==result
 return {'passed':len(checks),'total':len(checks),'negativeControls':checks,'restoredDeterministic':True,'preservedCounts':result['preservedCounts'],'fullC0C6Complete':False,'originalCasesNewlyAccepted':0}
if __name__=='__main__':
 result=build(); checks=controls(result)
 (OUT/'kubeclaw-chart-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 (OUT/'kubeclaw-chart-controls.json').write_text(json.dumps(checks,indent=2)+'\n')
 print(json.dumps({'fields':len(result['rows']),'checks':checks['passed'],'preservedCounts':result['preservedCounts']}))
