import json,pathlib,hashlib,collections
B=pathlib.Path('docs/review/evidence/config-acceptance/c0-completion-20261013'); O=B/'independent-case-fixture-definition-review-01'; C=B/'independent-c1-case-oracles'; F=C/'fixture-definition-01'
read=lambda p:json.loads(p.read_text())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''): h.update(chunk)
 return h.hexdigest()
checks=[]
def check(n,v):
 checks.append({'check':n,'passed':bool(v)})
 if not v: raise ValueError(n)
original={x['id']:x for x in read(C/'cases.json')['cases']}
for version in ['03','04']:
 cs=read(C/f'family-contracts-{version}/cases.json')['cases']; fs=read(C/f'family-contracts-{version}/families.json')
 check(version+' 229 IDs and 58 families',len(cs)==229 and set(x['id'] for x in cs)==set(original) and len(fs)==58)
 check(version+' original identity/requirements/lifecycle',all(all(c[k]==original[c['id']][k] for k in ['originalLifecycle','requirementIds','settingIds']) and c['nativeEffectAccepted']==False for c in cs))
 check(version+' original 28 historical passed / 201 future not-run',collections.Counter(c['originalLifecycle']['result'] for c in cs)=={'passed':28,'not-run':201})
for index in [C/'family-contracts-03/source-identities.json',F/'source-identities.json']:
 data=read(index); check(str(index)+' source pins',all(sha(pathlib.Path(p))==v for p,v in data.items()))
contexts=read(C/'family-contracts-03/source-contexts.json')
check('466 exact current source contexts',len(contexts)==466 and all(pathlib.Path(c['path']).read_text().splitlines()[c['contextStart']-1:c['contextStart']-1+len(c['context'])]==c['context'] for c in contexts.values()))
art=read(F/'artifact-identities.json')['artifacts'];check('all fixture artifact bytes and streamed hashes',all((F/p).stat().st_size==v['bytes'] and sha(F/p)==v['sha256'] for p,v in art.items()))
s=pathlib.Path('skills/buster/engine/test-gates/preparation-archive.ts').read_text(); expected=s.replace('export async function safeExtract(','export async function checkArchiveListingOnly(').replace("  await runTar(tarExecutable, ['--no-same-owner', '--no-same-permissions', '-xzf', archive, '-C', target], signal, limits);",'  // C0 evidence slice: stop after actual runTar LISTING phase; extraction deliberately excluded.')
check('archive evidence slice exact export rename and final extraction removal',expected==(F/'archive-listing-only-source.ts').read_text())
old=read(B/'c1-complete-profile-pairs-02/entry-selections.json')['rows']; new=read(B/'pair-entry-selection-translation-03/entry-selections.json')['rows']; roster=read(B/'pair-entry-selection-translation-03/caller-roster.json')['roster']
check('translation unchanged 148 case IDs',len(new)==148 and [r['caseId'] for r in new]==[r['caseId'] for r in old])
for a,b in zip(old,new):
 for side in ['A','B']:
  x,y=a[side],b[side]
  check(a['caseId']+' '+side+' original settings',x['selectedWholeSettingsSha256']==y['selectedWholeSettingsSha256'])
  check(a['caseId']+' '+side+' nonbinding entry', {k:v for k,v in x['entry'].items() if k!='bindings'}=={k:v for k,v in y['entry'].items() if k!='bindings'})
  bindings=y['entry']['bindings']; selections=y['callerSelections']
  check(a['caseId']+' '+side+' 9 root tuples 5 projections',len(bindings)==9 and len(selections)==5 and len({(z['role'],z['instanceId'],z['owner']) for z in bindings})==9)
  for r,sel in zip(roster,selections):
   check(a['caseId']+' '+side+' '+r['callerId']+' consumed owners',sel['callerId']==r['callerId'] and sel['role']==r['role'] and sel['serviceInstanceId']==r['serviceInstanceId'] and [z['owner'] for z in sel['bindings']]==r['owners'] and sel['bindings']==[z for z in bindings if z['role']==r['role'] and z['instanceId']==r['serviceInstanceId']] and all(sel['selectedWholeSettingsSha256'][o]==y['selectedWholeSettingsSha256'][o] for o in r['owners']))
  for z in bindings:
   original_binding=next(t for t in x['entry']['bindings'] if t['owner']==z['owner']);check(a['caseId']+' '+side+' '+z['owner']+' chosen profile conserved',z['profileId']==original_binding['profileId'])
(O/'observations.json').write_text(json.dumps({'qualification':'Independent read-only conservation/source-definition checks only, not native acceptance','checks':checks,'allPassed':True,'artifactCount':len(art),'artifactBytes':sum(v['bytes'] for v in art.values()),'sourceContextCount':len(contexts),'originalFamilies':58,'originalCases':229,'historicalPassed':28,'futureNotRun':201,'translatedCases':148,'translatedEntrySettings':296},indent=2)+'\n')
print(json.dumps({'allPassed':True,'checks':len(checks),'artifacts':len(art),'artifactBytes':sum(v['bytes'] for v in art.values())}))
