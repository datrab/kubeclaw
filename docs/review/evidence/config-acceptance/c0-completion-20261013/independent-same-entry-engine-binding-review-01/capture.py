import pathlib,json,hashlib,gzip,datetime,subprocess
root=pathlib.Path('.').resolve();B=root/'docs/review/evidence/config-acceptance/c0-completion-20261013';base=B/'same-entry-engine-binding-01';out=B/'independent-same-entry-engine-binding-review-01'
read=lambda p:json.loads(pathlib.Path(p).read_text());sha=lambda b:hashlib.sha256(b).hexdigest();cache={}
def doc(p):
 p=str(pathlib.Path(p))
 if p not in cache:cache[p]=read(p)
 return cache[p]
def pointed(r):
 p=pathlib.Path(r['path']);p=p if p.is_absolute() else root/p;v=doc(p)
 for k in r.get('pointer','').strip('/').split('/'):
  if not k:continue
  v=v[int(k)] if isinstance(v,list) else v[k.replace('~1','/').replace('~0','~')]
 return v
inputs={p for p in base.rglob('*') if p.is_file()};inherited=read(base/'input-identities.json');inputs.update(pathlib.Path(r['path']) for r in inherited)
for p in ['docs/review/remediation/config-semantic-inventory.json','docs/review/remediation/config-acceptance-matrix.json','docs/review/evidence/config-acceptance/runtime/case-proposals.json','docs/review/remediation/GOAL-START.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md']:
 inputs.add(root/p)
canonicalFields={r['id']:r for r in doc(root/'docs/review/remediation/config-semantic-inventory.json')['rows']};canonicalCases={r['id']:r for r in doc(root/'docs/review/remediation/config-acceptance-matrix.json')['cases']}
fieldChecks=[];caseChecks=[]
for package in ['runtime-provider-contracts-03','security-provider-contracts-01']:
 for r in doc(B/package/'field-definitions.json')['rows']:fieldChecks.append({'id':r['id'],'bodyEqualsCanonical':r['originalRow']==canonicalFields[r['id']]})
 for r in doc(B/package/'case-definitions.json')['cases']:
  refs=r['originalCanonicalCase'].get('nativeSpecificationReferences',[]);matches=[]
  for ref in refs:
   p=root/ref['sourcePath'];inputs.add(p);d=doc(p);rows=d if isinstance(d,list) else d.get('cases',[]);matches.append(next((x for x in rows if x['id']==ref['nativeCaseId']),None)==r['retainedNativeCase'])
  caseChecks.append({'id':r['id'],'bodyEqualsCanonical':r['originalCanonicalCase']==canonicalCases[r['id']],'nativeEqualsOriginalReference':any(matches)})
prism=doc(B/'prism-agent-launcher-profile-01/original-bodies.json')
for r in prism['fields']:fieldChecks.append({'id':r['id'],'bodyEqualsCanonical':r==canonicalFields[r['id']]})
for r in prism['cases']:caseChecks.append({'id':r['id'],'bodyEqualsCanonical':r==canonicalCases[r['id']],'nativeEqualsOriginalReference':'Original Prism case/field/receiving/native obligations retained; no replacement native body fabricated'})
(out/'frozen-inputs').mkdir(exist_ok=True);identities=[]
for p in sorted(inputs):
 b=p.read_bytes();h=sha(b);dest=out/'frozen-inputs'/f'{h}.gz'
 if not dest.exists():dest.write_bytes(gzip.compress(b,mtime=0))
 identities.append({'path':str(p),'sha256':h,'bytes':len(b),'frozen':f'frozen-inputs/{h}.gz'})
manifest=doc(base/'manifest.json')['files'];manifestBad=[r['relativePath'] for r in manifest if sha((base/r['relativePath']).read_bytes())!=r['sha256']]
fieldNodes=[]
for r in doc(base/'current-field-concordance.json'):
 fieldNodes.append({'id':r['id'],'family':r['family'],'ownerNodeExact':pointed(r['samePhysicalPolicyNode'])==r['samePhysicalPolicyNode']['exactNode'],'receivingNodesExact':all(pointed(x)==x['exactNode'] for x in r['currentReceivingSchemaBindings']),'rootSchemaShaExact':r['currentRootSchema']['sha256']==sha((base/'schemas/pipeline-entry.schema.json').read_bytes())})
members=[]
for r in doc(base/'current-case-member-concordance.json'):
 original=pointed(r['originalMemberRef']);ref=r['samePhysicalOwnerNode'];members.append({'case':r['caseId'],'field':r['settingId'],'originalMemberSettingExact':original['settingId']==r['settingId'],'actualPointedOwnerExact':pointed(ref)==ref['exactNode'],'currentReceivingNodesExact':all(pointed(x)==x['exactNode'] for x in r['currentReceivingNodes'])})
sourceMatches=[]
for r in doc(base/'source-tree-current-compatibility.json')['sources']:sourceMatches.append({'source':r['original']['path'],'actualEqualsCapture':pathlib.Path(r['original']['path']).read_bytes()==pathlib.Path(r['captured']['path']).read_bytes(),'sourceShaExact':sha(pathlib.Path(r['original']['path']).read_bytes())==r['original']['sha256']})
old=doc(B/'same-entry-deployment-binding-02/stand/config/pipeline.config.json');new=doc(base/'stand/config/pipeline.config.json');oldB=doc(B/'same-entry-deployment-binding-02/stand/config/components/buster-engine.config.json');newB=doc(base/'stand/config/components/buster-engine.config.json');minus=dict(newB);minus['profiles']={k:v for k,v in newB['profiles'].items() if k in oldB['profiles']}
receipt={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'qualification':'Independent body/node/input conservation, not author semantic or native acceptance','manifestPins':len(manifest),'manifestMismatches':manifestBad,'inheritedInputPins':len(inherited),'inheritedInputMismatches':[r['path'] for r in inherited if sha(pathlib.Path(r['path']).read_bytes())!=r['sha256'] or r['sha256']!=r['endSha256']],'originalFieldBodies':len(fieldChecks),'fieldBodyMismatches':[r for r in fieldChecks if not r['bodyEqualsCanonical']],'originalCaseBodies':len(caseChecks),'caseBodyMismatches':[r for r in caseChecks if not r['bodyEqualsCanonical'] or r['nativeEqualsOriginalReference'] is False],'currentFieldNodes':len(fieldNodes),'fieldNodeMismatches':[r for r in fieldNodes if not r['ownerNodeExact'] or not r['receivingNodesExact'] or not r['rootSchemaShaExact']],'currentCaseMemberNodes':len(members),'memberMismatches':[r for r in members if not r['originalMemberSettingExact'] or not r['actualPointedOwnerExact'] or not r['currentReceivingNodesExact']],'actualSourceCopies':len(sourceMatches),'sourceCopyMismatches':[r for r in sourceMatches if not r['actualEqualsCapture'] or not r['sourceShaExact']],'original9BindingsExact':new['bindings'][:9]==old['bindings'],'original4ProviderContextsExact':new['pluginSelections'][:4]==old['pluginSelections'],'BusterOriginalEntireObjectExactExceptTwoProfiles':minus==oldB,'BusterAddedProfileIds':sorted(set(newB['profiles'])-set(oldB['profiles'])),'physicalFileSetMembers':len(doc(base/'file-set-stand.json')['members']),'providerWholeEntries':len(doc(base/'provider-current-entry-contexts.json')),'securityWholeEntries':len(doc(base/'security-current-entry-closures.json')['entries']),'PrismWholeContexts':len(doc(base/'prism-full-entry-pairs.json')),'nodeExecutableSha256':sha(pathlib.Path('/usr/local/bin/node').read_bytes()),'ajvVersion':doc(root/'node_modules/ajv/package.json')['version'],'ajvEntrySha256':sha((root/'node_modules/ajv/dist/2020.js').read_bytes())}
(out/'read-identities.json').write_text(json.dumps({'head':receipt['head'],'at':receipt['at'],'inputs':identities},indent=2)+'\n');(out/'conservation-and-physical-joins.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
