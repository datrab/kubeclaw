import json,pathlib,hashlib,gzip,datetime
R=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0'); B=R/'docs/review/evidence/config-acceptance/c0-completion-20261013'; P=B/'native-host-profile-01'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return json.loads(p.read_text())
def emit(n,d): (P/n).write_text(json.dumps(d,indent=2)+'\n')
checks=[]
def check(n,v,detail=None): checks.append({'name':n,'pass':bool(v),'detail':detail})
inputs=load(P/'read-identities.json')['inputs']; end=[]
canonical={'docs/review/remediation/config-semantic-inventory.json','docs/review/remediation/config-acceptance-matrix.json'}
for x in inputs:
 p=R/x['path']; now=sha(p); end.append(dict(x,endSha256=now,unchanged=now==x['sha256']))
 if x['path'] not in canonical: check('frozen read '+x['path'],now==x['sha256'])
I=load(R/'docs/review/remediation/config-semantic-inventory.json'); M=load(R/'docs/review/remediation/config-acceptance-matrix.json')
check('original19 complete row equality', [x for x in I['rows'] if x.get('owner')=='native-host']==load(P/'original19-field-bodies.json')['rows'])
caseBy={x['id']:x for x in M['cases']}
for x in load(P/'original-shared-case-bodies.json')['cases']:
 check('original shared case whole equality '+x['id'],caseBy[x['id']]==x['originalBody'])
 check('complete outside scope disposition '+x['id'],x['outsideScopeSettingIds']==[s for s in x['originalBody']['settingIds'] if s not in {r['id'] for r in load(P/'original19-field-bodies.json')['rows']}])
base=B/'gateway-openclaw-profile-01/frozen-inputs'
for n,oldid,current,arrs in [('inventory','c6316b87f87b292db0ae1165eb3178ae0a32bf8db3111294398139c3f112be63',I,['rows']),('matrix','ab559aee906e4f72085031a84bb618c01941bc6e2d613175f235af0a18289227',M,['cases','requirements'])]:
 old=json.loads(gzip.decompress((base/(oldid+'.gz')).read_bytes()))
 for key in arrs: check('whole original '+n+' '+key+' full object preservation',old[key]==current[key],len(current[key]))
 check('whole non-generation root '+n,{k:v for k,v in old.items() if k!='currentCombinedDefinitionGeneration'}=={k:v for k,v in current.items() if k!='currentCombinedDefinitionGeneration'})
for n in ['c3-buster-complete-profile-03/package-manifest.json','buster-remote-plan-profile-01/manifest.json','same-entry-role-browser-binding-01/manifest.json']:
 p=B/n; count=0
 for f in load(p)['files']:
  q=f.get('relativePath',f.get('path')); file=R/q if q.startswith('docs/') else p.parent/q
  check('prior frozen member '+n+' '+q,sha(file)==f['sha256']);count+=1
 check('nonempty prior manifest '+n,count>0,count)
metadata=load(P/'shared-v8-native-host-extension.proposed.json')['frozenCurrentV8']['currentCanonicalMetadata']
for name,current in [('inventory',I),('matrix',M)]: check('start/end adopted v8 metadata '+name,metadata==current['currentCombinedDefinitionGeneration'])
report={'qualification':'read-only original full-object/source/prior-member preservation, not semantic/native acceptance','timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'observations':checks,'failures':[x for x in checks if not x['pass']],'readPinsBeforeAndEnd':end,'canonicalMetadataAtStart':metadata,'canonicalMetadataAtEnd':I['currentCombinedDefinitionGeneration'],'originalCounts':{'fields':len(I['rows']),'cases':len(M['cases']),'requirements':len(M['requirements'])},'activationAllowed':False,'globalC0Accepted':False}
emit('conservation-and-end-identities.json',report)
print(json.dumps({'observations':len(checks),'failures':len(report['failures']),'sourceReadPins':len(inputs),'wholeOriginalCounts':report['originalCounts']}))
raise SystemExit(bool(report['failures']))
