"""Task-local evidence writer, not a validator or productive implementation."""
import json,hashlib,re,collections
from pathlib import Path
ROOT=Path('.'); BASE=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');OUT=BASE/'independent-canonical-source-join'
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
idx=read(BASE/'source-supplement-index.json'); inv=read('docs/review/remediation/config-semantic-inventory.json');matrix=read('docs/review/remediation/config-acceptance-matrix.json');rows=inv['rows'];cases={r['id']:r for r in matrix['cases']};defs={};inputs={}
for p in dict.fromkeys(x['definitionPath'] for x in idx['latestDefinitions']):
 inputs[p]=sha(p)
 for r in read(p)['rows']:defs[r['candidateId']]=r
for p in ['docs/review/remediation/config-semantic-inventory.json','docs/review/remediation/config-acceptance-matrix.json','docs/review/remediation/config-definition-current.md','docs/review/remediation/config-source-supplement-current.md','docs/review/remediation/config-c1-package-current.md',str(BASE/'c1-package-draft/scope.json'),str(BASE/'source-supplement-index.json')]:inputs[p]=sha(p)
bykey={(r['source']['path'],r['source'].get('field')):r for r in rows}; textcache={}; hashcache={}
def witness(p,line):
 if p not in textcache:textcache[p]=Path(p).read_text().splitlines();hashcache[p]=sha(p);inputs[p]=hashcache[p]
 return {'path':p,'line':line,'expression':textcache[p][line-1],'sha256':hashcache[p]}
def lookup(p,f):return bykey.get((p,f))
def target(r):return r.get('targetAuthorRef') or r.get('target',{}).get('author') or r.get('targetAuthor')
originalpath=BASE/'delivery/candidate-dispositions.json';inputs[str(originalpath)]=sha(originalpath)
originals={r['id']:r for r in read(originalpath)['candidates']}
results=[];badlinks=[]
for n,x in enumerate(idx['latestDefinitions']):
 d=defs[x['candidateId']];assert d['originalCandidate']==originals[x['candidateId']];s=d['sourceRef'];w=witness(s['path'],s['line']);assert w['expression']==s['expression'] and w['sha256']==s['sha256'];links={}
 def add(r,kind,ev):
  if r is None:return
  cid=r['id']; valid=[]
  for caseid in r['caseIds']:
   if caseid in cases and cid in cases[caseid].get('settingIds',[]):valid.append(caseid)
   else:badlinks.append({'settingId':cid,'caseId':caseid})
  entry=links.setdefault(cid,{'settingId':cid,'canonicalSource':r['source'],'relationship':kind,'witnesses':[],'caseIds':valid,'caseLinkMeaning':'Existing reciprocal specification association only; no execution/specification acceptance inferred.','existingTargetAuthor':target(r)})
  if ev not in entry['witnesses']:entry['witnesses'].append(ev)
 # Direct actual Helm expression resolves its own Chart values authority.
 chart=re.match(r'(charts/[^/]+)/',s['path'])
 if chart:
  vp=chart.group(1)+'/values.yaml'
  for field in re.findall(r'(?:\$[A-Za-z_]*\.|\.)Values\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)',w['expression']):
   r=lookup(vp,field)
   if r:add(r,'exact-authored-field-render-or-guard',w)
   else:
    # Composite arguments explicitly passed to JSON/YAML/range consume those named subtrees;
    # leaf association is aggregate, not independent proof of each productive leaf effect.
    for q in rows:
     if q['source']['path']==vp and q['source'].get('field','').startswith(field+'.'):
      add(q,'explicit-composite-field-reference; leaf effect not separately proved',w)
 # Component members are precise JSON author pointers, not a filename association.
 for member in d.get('members',[]):
  a=member.get('currentAuthor','')
  if '#/' in a:
   p,f=a.split('#',1);p='charts/kubeclaw/'+p if p.startswith('files/') else p
   add(lookup(p,f),'exact-component-field-validation-relation',w)
 # Dynamic three-role selectors, traced through actual fixed loop and helper.
 if n in [0,1,17]:
  ev=witness('charts/prism/templates/workloads.yaml',13)
  if n==0:
   for role in ['control','studio','worker']:
    for key in ['repository','digest','pullPolicy']:
     add(lookup('charts/prism/values.yaml',f'images.{role}.{key}'),'fixed-three-role-image-selection',ev)
     add(lookup('charts/prism/values.yaml',f'images.{role}.{key}'),'fixed-three-role-image-selection',witness('charts/prism/templates/workloads.yaml',78 if key!='pullPolicy' else 79))
     if key!='pullPolicy':add(lookup('charts/prism/values.yaml',f'images.{role}.{key}'),'fixed-three-role-image-selection',witness('charts/prism/templates/_helpers.tpl',3 if key=='repository' else 4))
  if n==1:
   for role in ['control','studio','worker']:add(lookup('charts/prism/values.yaml',role+'.replicas'),'fixed-three-role-replica-render',ev)
  if n==17:
   for role in ['control','studio','worker']:
    for sub in ['requests.cpu','requests.memory','limits.cpu','limits.memory']:add(lookup('charts/prism/values.yaml',role+'.resources.'+sub),'fixed-three-role-resource-object-render',ev)
 # Schema-only coordinates: supplied exact field name verified against actual named schema leaf below.
 if s['path']=='charts/prism/values.schema.json' and n in [317,318,319,320]:
  field=d['field'];schema=read(s['path']);node=schema
  for key in field.split('.'):node=node['properties'][key]
  assert node['maximum'] in [3600,2147483,86400000,86400]
  add(lookup('charts/prism/values.yaml',field),'exact-schema-leaf-domain',w)
 # Gateway model envelope/separators, not a model inferred from prose.
 if n in [45,48]:
  for f in (['agent.model.primary','agent.model.fallbacks'] if n==45 else ['agent.model.fallbacks']):add(lookup('charts/kubeclaw/values.yaml',f),'actual-model-object-render',witness(s['path'],85 if f.endswith('primary') else 87))
 if n==314:
  for f,line in [('agent.model.primary',212),('agent.model.fallbacks',213)]:add(lookup(s['path'],f),'exact-model-author-envelope',witness(s['path'],line))
 # Explicit namespace/helper call association; domain/default-membership is different from native grant.
 if n in [179,180]:
  fields=['OPS_ALLOWED_NAMESPACES','OPS_DEFAULT_NAMESPACE']+(['ARGOCD_NAMESPACE'] if n==180 else [])
  for f in fields:add(lookup(s['path'],f),'actual-namespace-parser-call-or-membership-validation',witness(s['path'],19))
 if n==181:
  for q in rows:
   if q['source']['path']==s['path']:add(q,'actual-loadOpsMcpConfig-returned-field',witness(s['path'],q['source']['line']))
 if n==182:add(lookup(s['path'],'PORT'),'actual-port-normalization-and-domain',witness(s['path'],11))
 # Exact ENV source field use in candidate expression.
 for q in rows:
  if q['source']['path']==s['path']:
   f=q['source'].get('field','')
   if re.fullmatch('[A-Z][A-Z0-9_]+',f) and re.search(r'\b'+re.escape(f)+r'\b',w['expression']):add(q,'exact-environment-field-read-or-projection',w)
 # Supervisor parameter use followed back to its actual default, not arbitrary timeout similarity.
 if n==174:add(lookup(s['path'],'controlStartupTimeoutSeconds'),'actual-default-parameter-to-deadline-use',witness(s['path'],45))
 if n==175:add(lookup(s['path'],'controlCommandTimeoutSeconds'),'actual-default-parameter-to-child-wait',witness(s['path'],53))
 # Buster role literal member in actual plugins array; no new permission inferred.
 if n in [87,88]:add(lookup('packaging/runtime/roles/buster.json','plugins'),'actual-selected-role-plugin-array-member',witness('packaging/runtime/roles/buster.json',23))
 # Observer helpers: trace actual returned fields through named function calls, retaining fallback/normalization distinction.
 if 345<=n<=356:
  p='skills/common/plugins/openclaw-agent-observer/src/config.ts';callerlines=list(range(95,112))
  funcs={345:'boolValue',346:'requiredBooleanValue',347:'stringValue',348:'stringValue',349:'positiveInteger',350:'positiveInteger',351:'positivePort',352:'positivePort',353:'integerValue',354:'configuredValue'}
  if n==355:fun=None
  elif n==356:fun='NO_FIELD_RETURN_ASSOCIATION'
  else:fun=funcs[n]
  for line in callerlines:
   ew=witness(p,line);field=ew['expression'].strip().split(':',1)[0]
   if fun is None or re.search(r'\b'+fun+r'\(',ew['expression']):add(lookup(p,field),'actual-resolver-helper-to-returned-field',ew)
 # Preparation relation names resolve the actual Buster author, not host pool settings with similar names.
 if n in [322,323]:
  for f in (['/settings/preparation/resourcePolicy/memoryBytes','/settings/preparation/resourcePolicy/tasks'] if n==322 else ['/settings/preparation/maximumActivePreparations']):
   add(lookup('charts/kubeclaw/files/config/buster-engine.config.json',f),'actual-preparation-setting-vs-native-pool-capacity',w)
 # Retirement error names exact original component authors.
 if n==316:
  for p,f in [('prism-execution','maximumResultBytes'),('prism-control','dispatchTimeoutMs')]:add(lookup(f'charts/kubeclaw/files/config/{p}.config.json','/settings/'+f),'exact-retired-author-error-to-authoritative-component-field',w)
 classification=d.get('classification','source-clause')
 relationship='verified-canonical-association' if links else 'unresolved-canonical-association'
 notes=[]
 if s['path'].endswith('NOTES.txt'):notes.append('Informational display only. Linked Values field is not a productive effect witness; retain as display/source boundary disposition.')
 if not links:
  notes.append(f"No exact canonical field association established for {d.get('field')} at {s['path']}:{s['line']}. Retain the observed clause as {classification}; explicitly decide nonsetting/generated boundary versus existing authority before assigning IDs. Path ownership alone is insufficient.")
 else:notes.append('These source-to-current-field links do not select/approve target owner profiles or close the linked acceptance cases.')
 obligations=['JOIN-AUTHOR: reconcile the cited actual current source/consumer against exactly one target-author or explicit nonsetting/generated-owner disposition.','JOIN-PROFILE: name the complete role/registration/instance/profile and effective schema/runtime/render domain; current source fallback facts are not approved target defaults.','JOIN-CASE: attach exact changed/missing/competing/fallback effect/rejection specifications at the cited boundary; existing case IDs alone do not satisfy this.']
 if 'readiness' in str(d.get('field','')).lower() or 'kubernetes' in s['path'] or 'hubble' in s['path']:obligations.append('Keep request/result/protocol/observation data separate from operator policies; do not convert informational or native-unexecuted evidence into execution acceptance.')
 results.append({'candidateId':x['candidateId'],'originalCandidateSha256':hashlib.sha256(json.dumps(d['originalCandidate'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'definitionPath':x['definitionPath'],'field':d.get('field'),'classification':classification,'sourceWitness':w,'disposition':relationship,'canonicalLinks':list(links.values()),'specificUnresolvedMatch':None if links else notes[0],'integrationObligations':obligations,'limits':notes})
assert len(results)==358 and len({r['candidateId'] for r in results})==358
counts={'originalCandidatesReconciled':len(results),'withVerifiedCurrentCanonicalAssociations':sum(bool(x['canonicalLinks']) for x in results),'withoutProvedCanonicalAssociation':sum(not x['canonicalLinks'] for x in results),'settingAssociations':sum(len(x['canonicalLinks']) for x in results),'distinctLinkedSettings':len({l['settingId'] for x in results for l in x['canonicalLinks']}),'reciprocalCaseAssociations':sum(len(l['caseIds']) for x in results for l in x['canonicalLinks']),'caseLinkMismatches':len(badlinks),'canonicalOriginalRows':len(rows),'canonicalOriginalCases':len(cases)}
out={'scope':'All358 original delivery batch24 source candidates; independent static source/canonical concordance, not all-project source completeness or C0 acceptance.','verdict':'NOT ACCEPTED: source-to-current-field associations are usable integration input; target-author/profile/module/full case closure remains open.','counts':counts,'relationshipRules':['Helm direct Values field and its exact canonical author; composite subtree links explicitly labeled aggregate.','Explicit component member JSON pointer and exact canonical author field.','Actual inspected function helper/default-to-call-site association, not name/path similarity.','Existing reciprocal case membership only; not executed or accepted.','No path-only, lexical-nearness or guessed setting IDs.'],'inputs':[{'path':p,'sha256':h} for p,h in sorted(inputs.items())],'rows':results,'caseLinkMismatches':badlinks,'globalC0Accepted':False,'implementationAuthorization':False}
# Compact navigation: original canonical records remain the authority, referenced rather than copied.
canonicalrefs={};witnesses={}
for item in results:
 item['integrationObligations']=['G2-AUTHOR','G3-WIRE-PROFILES','G5-CASES']
 for link in item['canonicalLinks']:
  sid=link['settingId'];r=next(r for r in rows if r['id']==sid)
  assert r['source']['sha256']==sha(r['source']['path']);inputs[r['source']['path']]=sha(r['source']['path'])
  canonicalrefs[sid]={'inventoryPointer':'/rows/'+str(rows.index(r)),'source':link['canonicalSource'],'caseIds':link['caseIds'],'targetRecordPointer':('/targetAuthorRef' if r.get('targetAuthorRef') else '/target/author')}
  link['witnessRefs']=[]
  for ew in link.pop('witnesses'):
   key=ew['path']+':'+str(ew['line']);witnesses[key]=ew;link['witnessRefs'].append(key)
  for key in ['canonicalSource','caseIds','caseLinkMeaning','existingTargetAuthor']:link.pop(key)
out['canonicalSettingReferences']=canonicalrefs;out['sourceWitnessReferences']=witnesses
out['inputs']=[{'path':p,'sha256':h} for p,h in sorted(inputs.items())]
out['caseLinkMeaning']='CanonicalSettingReferences caseIds are existing reciprocal specification associations only; not executed/accepted.'
out['originalCandidateHashEncoding']='SHA256 of canonical JSON, sort_keys=true, separators=(comma,colon); original bodies are still in named definition inputs.'
(OUT/'source-canonical-concordance.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps(counts,indent=2))
print('Unresolved:',dict(collections.Counter(x['sourceWitness']['path'] for x in results if not x['canonicalLinks'])))
