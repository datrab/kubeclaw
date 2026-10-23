#!/usr/bin/env python3
"""Trace original Ops chart fields to current projections, without runtime acceptance."""
import copy,importlib.util,json,re
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
LOCATOR='config/deployment/ops-pod/<profile>.json'
CONSTRAINT='All30 original Ops chart fields retain Helm values/release/discovery/explicit overlay inputs; the deployment-policy owner selects deployment invocation, not these30 values. Actual MCP namespace inputs now travel through captured policy.json, not the historical MCP ENV references; Codex still receives its own ENV/kubeconfig. Central sole-root deployment author/profile/schema/file-set/history receiving remains OPEN. Resource ancestor projection is not native scheduling/cgroup proof. Secret references never contain secret bytes. No live deployment, authority change, denied-v10 activation or independent/native acceptance.'
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
  for file in sorted((h.ROOT/'charts/ops-pod/templates').glob('*')):
   if not file.is_file():continue
   for line in file.read_text().splitlines():
    for match in re.finditer(r'(?:\$|\.)Values\.([A-Za-z0-9_.]+)',line):
     selected=match.group(1).rstrip('.')
     if selected==field or field.startswith(selected+'.'):
      projections.append({**h.anchor(str(file.relative_to(h.ROOT)),line.strip()),'selectedValuePath':selected,'projectionKind':'DIRECT' if selected==field else 'ANCESTOR_OBJECT_PROJECTION'})
  if not projections:raise ValueError('No actual projection: '+field)
  r={k:row[k] for k in KEYS}
  r.update(originalSource=original['source'],currentValuePath=field,currentValues=h.pin('charts/ops-pod/values.yaml'),centralPhysicalAuthor=None,actualProjections=projections,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN',status='EXACT_OPS_CHART_VALUES_PROJECTION_CENTRAL_RECEIVING_OPEN')
  if field in ['rbac.namespaces','defaultNamespace','argoNamespace']:
   r['currentMcpReceiving']=[h.anchor('charts/ops-pod/templates/mcp-policy.yaml','"server" $server'),h.anchor('tools/ops-mcp/src/config.mjs','const policy=loadOpsMcpPolicy(environment.OPS_MCP_POLICY_FILE);'),h.anchor('tools/ops-mcp/src/config.mjs','selectedPolicy:policy')]
   r['historicalMcpEnvQualification']='Original ENV reader is retained historical source, not current chart-selected MCP transport. Existing MCP file policy implementation is not sole-root deployment receiving.'
  if field.startswith('resources.') or field.startswith('tailscale.resources.'):
   r['effectQualification']='Full container resources object projection; actual Kubernetes scheduling/cgroup effect NOT VERIFIED.'
  if row['class']=='secret-reference':r['secretQualification']='Reference only; external Secret bytes and real kubelet/provider receipt are not central config or locally proved.'
  rows.append(r)
 if len(rows)!=30 or len({r['id'] for r in rows})!=30:raise ValueError('Ops30 roster drift')
 route=[h.anchor('scripts/deploy-ops-pod.sh',x) for x in ['policy_values=$(node','values=(-f "$temporary/discovered.json"','selected_overlay=${selected_policy[3]:-${OPS_POD_VALUES:-}}','render "$repo" ops ops "$release" "$namespace"','helm upgrade --install']]
 return {'scope':'Exact original Ops30 chart source lanes only; no production implementation or runtime acceptance','constraint':CONSTRAINT,'rows':rows,'deliveryRoute':route,'deploymentInvocationOwner':h.pin('charts/ops-pod/deployment-policy.json'),'preservedCounts':full['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}
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
 reject('stale MCP ENV receiving',lambda d:next(r for r in d['rows'] if r['currentValuePath']=='argoNamespace').__setitem__('currentMcpReceiving',[]))
 for row in result['rows']:
  reject('source identity '+row['id'],lambda d,i=row['id']:next(r for r in d['rows'] if r['id']==i)['actualProjections'][0].__setitem__('sha256','0'*64))
 assert build()==result
 return {'passed':len(checks),'total':len(checks),'negativeControls':checks,'restoredDeterministic':True,'preservedCounts':result['preservedCounts'],'fullC0C6Complete':False,'originalCasesNewlyAccepted':0}
if __name__=='__main__':
 result=build(); checks=controls(result)
 (OUT/'ops-chart-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 (OUT/'ops-chart-controls.json').write_text(json.dumps(checks,indent=2)+'\n')
 print(json.dumps({'fields':len(result['rows']),'checks':checks['passed'],'preservedCounts':result['preservedCounts']}))
