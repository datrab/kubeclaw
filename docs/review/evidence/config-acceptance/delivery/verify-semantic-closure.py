"""Evidence consistency only; cannot accept C0 or implementation cases."""
import pathlib,json,hashlib,collections,sys
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4]
v=json.loads((out/'inventory-fragment.json').read_text());cases=json.loads((out/'proposed-cases.json').read_text());ids=[r['id'] for r in v['rows']];caseids=[c['id'] for c in cases]
def digest(f):return hashlib.sha256((repo/f).read_bytes()).hexdigest()
issues=[]
for kind,allids in [('setting',ids),('case',caseids)]:
 for id,n in collections.Counter(allids).items():
  if n>1:issues.append({'kind':'duplicate-'+kind,'id':id,'count':n})
for r in v['rows']:
 for id in r['caseIds']:
  if id not in caseids:issues.append({'kind':'dangling-row-case','setting':r['id'],'case':id})
 for f,h in [(r['source']['path'],r['source']['sha256'])]:
  if not (repo/f).is_file() or digest(f)!=h:issues.append({'kind':'row-source-digest-mismatch','id':r['id'],'path':f})
for s in v['sources']:
 if not (repo/s['path']).is_file() or digest(s['path'])!=s['sha256']:issues.append({'kind':'source-digest-mismatch','path':s['path']})
for c in cases:
 for id in c['settingIds']:
  if id not in ids:issues.append({'kind':'dangling-case-row','case':c['id'],'setting':id})
  else:
   row=next(r for r in v['rows'] if r['id']==id)
   if c['id'] not in row['caseIds']:issues.append({'kind':'asymmetric-case-link','case':c['id'],'setting':id})
 for group in ['sourceDigests','testDigests','specDigests']:
  for f,h in c.get(group,{}).items():
   if not (repo/f).is_file() or digest(f)!=h:issues.append({'kind':group+'-mismatch','case':c['id'],'path':f})
 if c['result']!='not-run':issues.append({'kind':'unexpected-implementation-result','case':c['id'],'result':c['result']})
definitionCases=json.loads((out/'c0-definition-cases.json').read_text()) if (out/'c0-definition-cases.json').exists() else []
if (out/'c0-kubernetes-boundary-cases.json').exists():definitionCases+=json.loads((out/'c0-kubernetes-boundary-cases.json').read_text())
if (out/'c0-buster-build-definition-cases.json').exists():definitionCases+=json.loads((out/'c0-buster-build-definition-cases.json').read_text())
if (out/'c0-residual-definition-cases-bce3f075.json').exists():definitionCases+=json.loads((out/'c0-residual-definition-cases-bce3f075.json').read_text())
if (out/'c0-dls-pure-definition-cases-20261013.json').exists():definitionCases+=json.loads((out/'c0-dls-pure-definition-cases-20261013.json').read_text())
if (out/'c0-controller-definition-cases-6606af9-20261013.json').exists():definitionCases+=json.loads((out/'c0-controller-definition-cases-6606af9-20261013.json').read_text())
for id,n in collections.Counter(c['id'] for c in definitionCases).items():
 if n>1:issues.append({'kind':'duplicate-definition-case','id':id,'count':n})
for r in v['rows']:
 if r['class'] not in {'operator-setting','protocol-invariant','version','secret-reference','generated-binding','task-data'}:issues.append({'kind':'invalid-setting-class','id':r['id'],'class':r['class']})
for c in definitionCases:
 for f,h in c['sourceDigests'].items():
  if not (repo/f).is_file() or digest(f)!=h:issues.append({'kind':'definition-source-digest-mismatch','case':c['id'],'path':f})
 for f,h in c.get('testDigests',{}).items():
  if not (repo/f).is_file() or digest(f)!=h:issues.append({'kind':'definition-test-digest-mismatch','case':c['id'],'path':f})
 for id in c.get('settingIds',[]):
  if id not in ids:issues.append({'kind':'dangling-definition-case-setting','case':c['id'],'setting':id})
 for f in c['rawEvidencePath']:
  if not (repo/f).is_file():issues.append({'kind':'definition-raw-evidence-absent','case':c['id'],'path':f})
# Verify the alias has no independently authored schema constraints or fallback.
if (out/'pinned-schema-aliases.json').exists():
 a=json.loads((out/'pinned-schema-aliases.json').read_text());primary=repo/a['source']['localPath'];alias=repo/a['alias']['path'];key=a['definitionPointer'].removeprefix('#/definitions/');schema=json.loads(primary.read_text())['definitions'][key];body=json.loads(alias.read_text())
 canonical=hashlib.sha256(json.dumps(schema,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 expected={'$schema':'http://json-schema.org/draft-04/schema#','$ref':primary.resolve().as_uri()+a['definitionPointer']}
 if digest(a['source']['localPath'])!=a['source']['sha256'] or digest(a['alias']['path'])!=a['alias']['sha256'] or canonical!=a['definitionCanonicalSha256'] or body!=expected or body!=a['alias']['body'] or schema.get('additionalProperties') is not False or schema.get('required')!=['spec']:
  issues.append({'kind':'pinned-primary-ref-only-alias-identity-mismatch'})
closed={'source-traced','source-traced-pinned-consumer','source-traced-declared-unused'}
dispositions=[]
for s in v['sources']:
 linked=[r for r in v['rows'] if r['id'] in s.get('settingIds',[]) or r['source']['path']==s['path']]
 dispositions.append({'path':s['path'],'sha256':s['sha256'],'disposition':s.get('disposition'),'settingIds':sorted({r['id'] for r in linked}),'openSettingIds':[r['id'] for r in linked if r['status'] not in closed],'sourceCompleteness':'linked inspected fields only; no exhaustive non-setting disposition inferred from source hash or absent links','origin':s.get('origin')})
(out/'delivery-surface-dispositions.json').write_text(json.dumps(dispositions,indent=2)+'\n')
checks={'method':'static JSON/reference/SHA256 consistency checks; no production/test/package/cluster/host execution','verificationToolSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'settingRows':len(ids),'caseSpecifications':len(caseids),'issues':issues,'consistencyResult':'passed' if not issues else 'failed','c0Acceptance':'incomplete','remainingSourceRows':[r['id'] for r in v['rows'] if r['status'] not in closed],'unreviewedCases':[c['id'] for c in cases if c.get('reviewerConfirmation')!='confirmed'],'implementationResults':dict(collections.Counter(c['result'] for c in cases)),'requiredCaseHarnessGaps':[{'id':c['id'],'commandReadiness':c.get('commandReadiness'),'specificationStatus':c.get('specificationStatus')} for c in cases if c.get('commandReadiness') or c.get('specificationStatus')],'limit':'hash/link consistency is not semantic completeness; unresolved rows/unreviewed cases/absent field harnesses explicitly reject C0 acceptance. Historical execution logs remain unchanged.'}
(out/'semantic-closure-verification.json').write_text(json.dumps(checks,indent=2)+'\n')
raw='Command: python3 docs/review/evidence/config-acceptance/delivery/verify-semantic-closure.py\n'+json.dumps({k:checks[k] for k in ['method','settingRows','caseSpecifications','issues','consistencyResult','c0Acceptance','implementationResults']},indent=2)+'\nExit: '+('0' if not issues else '1')+'\n'
(out/'semantic-closure-verification.txt').write_text(raw);print(raw);sys.exit(bool(issues))
