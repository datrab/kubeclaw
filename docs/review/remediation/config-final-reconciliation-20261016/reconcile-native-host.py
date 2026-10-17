#!/usr/bin/env python3
"""Trace the original native-host author; no installation or runtime acceptance."""
import copy
import importlib.util
import json
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
POLICY='scripts/native-worker-node-policy.mjs'
RENDER='scripts/render-native-worker-node.mjs'
PREPARE='scripts/prepare-native-worker-pools.mjs'
CONSTRAINT='Existing explicit POLICY_YAML author -> validator -> renderer -> trusted setup/pool projections. No selected native-host author on current pipeline root. Protocol version remains invariant; runtime containerdVersion remains YAML-authored (version authority migration OPEN), CPU period remains fixed100000us (adjustable original obligation OPEN). No install, D18 change, native acceptance or denied-v10 promotion.'
def build():
 full=h.build()
 roster=h.read(h.ROSTER);originals={r['id']:r for r in roster['fields']};cache={}
 fields=h.read(str((OUT/'fields.json').relative_to(h.ROOT)))
 rows=[]
 for row in fields:
  if not any(x['path']=='config/host/<profile>.json' for x in row['explicitConfigLocatorObservations']):continue
  ref=originals[row['id']];doc,loc=ref['original'].split('#',1)
  if doc not in cache:cache[doc]=h.read(roster['documents'][doc]['path'])
  original=h.pointer(cache[doc],loc)
  if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Original host identity drift')
  field=original['source']['field']
  r={k:row[k] for k in ['id','original','originalObjectSha256','caseIds','class','owner']}
  r.update(originalField=field,originalSource=original['source'],centralPhysicalAuthor=None,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN',currentAuthor=h.anchor(POLICY,"load(fs.readFileSync(file, 'utf8'))"),selectedInput=h.anchor(RENDER,'renderNativeWorkerNode(loadNativeNodePolicy(process.argv[2]))'),capture=h.anchor(POLICY,"createHash('sha256').update(JSON.stringify(selected))"))
  effects=[]
  if field=='schemaVersion':
   if r['class']!='protocol-invariant':raise ValueError('Protocol classification drift')
   status='ORIGINAL_PROTOCOL_INVARIANT_NOT_OPERATOR_GAP'
   effects=[h.anchor(POLICY,'policy?.schemaVersion !== 1')]
  elif field=='nodeName':
   status='EXPLICIT_YAML_AUTHOR_CENTRAL_SELECTION_OPEN'
   effects=[h.anchor(POLICY,'typeof policy.nodeName'),h.anchor(RENDER,'nodeName: selected.nodeName')]
  elif field.startswith(('systemReserve.','kubernetesReserve.')):
   status='EXPLICIT_YAML_AUTHOR_CENTRAL_SELECTION_OPEN'
   group,key=field.split('.')
   effects=[h.anchor(POLICY,'resources(policy.systemReserve); resources(policy.kubernetesReserve);'),h.anchor(POLICY,'positive(policy.systemReserve.tasks); positive(policy.kubernetesReserve.tasks);'),h.anchor(POLICY,'const system = { ...selected.systemReserve };' if group=='systemReserve' else 'kubeReserved: { cpu:')]
   if group=='systemReserve':effects.append(h.anchor(POLICY,'systemReserved: { cpu:'))
  elif field.startswith('pools.'):
   status='EXPLICIT_YAML_AUTHOR_CENTRAL_SELECTION_OPEN'
   _,role,key=field.split('.')
   if role not in ['buster','prism']:raise ValueError('Unexpected role')
   if key=='namespace':effects=[h.anchor(POLICY,'typeof pool.namespace'),h.anchor(RENDER,'namespace: selected.pools.'+role+'.namespace')]
   elif key=='maximumActiveScopes':effects=[h.anchor(POLICY,'positive(pool.maximumActiveScopes)'),h.anchor(POLICY,'maximumActiveScopes: pool.maximumActiveScopes')]
   elif key=='cpuMillicores':effects=[h.anchor(POLICY,'resources(pool);'),h.anchor(POLICY,'cpuQuotaMicroseconds: pool.cpuMillicores * 100'),h.anchor(PREPARE,"'cpu.max':")]
   elif key=='memoryBytes':effects=[h.anchor(POLICY,'resources(pool);'),h.anchor(POLICY,'limits: { memoryBytes: pool.memoryBytes'),h.anchor(PREPARE,"'memory.max': String(pool.memoryBytes)")]
   elif key=='tasks':effects=[h.anchor(POLICY,'positive(pool.tasks)'),h.anchor(POLICY,'tasks: pool.tasks'),h.anchor(PREPARE,"'pids.max': String(pool.tasks)")]
   else:raise ValueError('Unexpected pool field')
  elif field=='runtime.containerdVersion':
   if r['class']!='version':raise ValueError('Version classification drift')
   status='YAML_RUNTIME_VERSION_SOLE_VERSION_AUTHORITY_MIGRATION_OPEN'
   effects=[h.anchor(RENDER,'const containerdVersion = selected.runtime?.containerdVersion;'),h.anchor(RENDER,'return { schemaVersion: 1, containerdVersion, roles };'),h.anchor('scripts/native-worker-node-capacity.mjs','const runtime = policy.runtime?.containerdVersion;')]
  elif field=='pool CPU period / quota relation':
   status='FIXED_CPU_PERIOD_ORIGINAL_TUNING_OBLIGATION_OPEN'
   r['currentAuthor']=h.anchor(POLICY,'cpuPeriodMicroseconds: 100000')
   effects=[h.anchor(POLICY,'cpuQuotaMicroseconds: pool.cpuMillicores * 100'),h.anchor(PREPARE,'pool.cpuPeriodMicroseconds < 1000'),h.anchor(PREPARE,"'cpu.max':")]
  else:raise ValueError('Unexpected host field: '+field)
  r.update(status=status,actualEffects=effects)
  rows.append(r)
 if len(rows)!=20 or len({r['id'] for r in rows})!=20:raise ValueError('Native host20 roster drift')
 return {'scope':'Exact original native-host20 source lanes, not productive source changes or acceptance','rows':rows,'preservedCounts':full['preservedCounts'],'constraint':CONSTRAINT,'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}
def validate(candidate,expected):
 if candidate!=expected:raise ValueError('Native source/identity/acceptance drift')
 return True
if __name__=='__main__':
 result=build();validate(result,result)
 controls=[]
 for index in range(20):
  for key,value in [('originalObjectSha256','false'),('caseIds',[]),('runtimeAcceptance','PASS'),('centralPhysicalAuthor',{'path':'invented'}),('actualEffects',[])]:
   bad=copy.deepcopy(result);bad['rows'][index][key]=value
   try:validate(bad,result)
   except ValueError:controls.append(str(index)+':'+key)
   else:raise ValueError('Accepted matrix corruption')
 for name,mutate in [('missing',lambda d:d['rows'].pop()),('duplicate',lambda d:d['rows'].append(d['rows'][0])),('roster loss',lambda d:d['preservedCounts'].update(fields=2390))]:
  bad=copy.deepcopy(result);mutate(bad)
  try:validate(bad,result)
  except ValueError:controls.append(name)
  else:raise ValueError('Accepted roster corruption')
 (OUT/'native-host-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 checks={'negativeControlsRejected':len(controls),'controls':controls,'nativeHostFields':20,'protocolInvariants':1,'explicitYAMLReceivingResiduals':17,'versionAuthorityResiduals':1,'fixedPeriodResiduals':1,'preservedCounts':result['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; author-run matrix controls only'}
 (OUT/'native-host-controls.json').write_text(json.dumps(checks,indent=2)+'\n')
 print(json.dumps({k:v for k,v in checks.items() if k!='controls'}))
