import pathlib,json,hashlib,gzip,datetime,subprocess
root=pathlib.Path('.')
B=root/'docs/review/evidence/config-acceptance/c0-completion-20261013'
base=B/'runtime-provider-contracts-02';old=B/'runtime-provider-contracts-01';out=B/'independent-runtime-provider-contract-review-02'
read=lambda p:json.loads(pathlib.Path(p).read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
inputs={p for p in base.rglob('*') if p.is_file()}
frozen=read(base/'frozen-input-identities.json')['inputs']
inputs.update(root/r['path'] for r in frozen)
inputs.update(root/p for p in read(old/'source-identities.json'))
for p in ['docs/review/remediation/config-semantic-inventory.json','docs/review/remediation/config-acceptance-matrix.json','docs/review/evidence/config-acceptance/author/candidate-ledger.json','skills/common/plugin-runtime/foundation/registry/configuration.ts','skills/common/plugin-runtime/foundation/registry/schema.ts','skills/common/plugin-runtime/foundation/registry/build.ts','skills/nova/core/test-gates/resolver.ts','skills/nova/core/execution/engine-runtime.ts','skills/nova/core/execution/adapter-startup.ts','skills/buster/engine/test-gates/runner.ts','skills/buster/engine/test-gates/runner-values.ts','skills/buster/engine/test-gates/runner-attempt-evidence.ts','docs/review/evidence/config-acceptance/c0-completion-20261013/independent-c3-buster-complete-profile-review-03/README.md']:
 inputs.add(root/p)
(out/'frozen-inputs').mkdir(exist_ok=True);identities=[]
for p in sorted(inputs):
 b=p.read_bytes();h=sha(b);(out/'frozen-inputs'/f'{h}.gz').write_bytes(gzip.compress(b,mtime=0));identities.append({'path':str(p),'bytes':len(b),'sha256':h,'frozen':f'frozen-inputs/{h}.gz'})
fields=read(base/'field-definitions.json')['rows'];cases=read(base/'case-definitions.json')['cases'];oldfields=read(old/'field-definitions.json')['rows'];oldcases=read(old/'case-definitions.json')['cases']
canonicalfields={r['id']:r for r in read(root/'docs/review/remediation/config-semantic-inventory.json')['rows']};canonicalcases={r['id']:r for r in read(root/'docs/review/remediation/config-acceptance-matrix.json')['cases']}
fieldmap={r['id']:r for r in fields};caseRefs=[]
for r in cases:
 for c in r.get('perMemberFieldContracts',[]):
  ref=c.get('completeOwnerSchemaRef');active=fieldmap[c['settingId']].get('targetSchemaBinding')
  if ref:caseRefs.append({'caseId':r['id'],'settingId':c['settingId'],'casePath':ref['path'],'fieldPath':active['path'] if active else None,'pathMatchesActiveField':bool(active and ref['path']==active['path']),'exactNodeMatchesActiveField':bool(active and ref['exactNode']==active['exactNode'])})
coords=read(base/'current-source-coordinates.json');badcoords=[r for r in coords if (root/r['path']).read_text().splitlines()[r['line']-1]!=r['text']]
ledger=read(root/'docs/review/evidence/config-acceptance/author/candidate-ledger.json')['candidates'];members=[]
for m in read(base/'source-processing-adjudication.json')['members']:
 s=m['source'];raw=(root/s['path']).read_bytes();found=[r for r in ledger if r['source']==s['path'] and r['line']==s['line']]
 joins=[]
 for ref in m['applicationCaseArtifactRefs']:
  doc=read(base/'case-definitions.json');pointer=ref['pointer'].split('#',1)[1]
  for segment in pointer.strip('/').split('/'):doc=doc[int(segment)] if isinstance(doc,list) else doc[segment]
  joins.append({'originalCaseId':ref['originalCaseId'],'pointer':ref['pointer'],'exactCaseIdMatch':doc['id']==ref['originalCaseId']})
 members.append({'profileField':m['profileField'],'sourceShaMatches':sha(raw)==s['sha256'],'lineTextMatches':raw.decode().splitlines()[s['line']-1]==s['lineText'],'candidateBodiesEqualActualLedger':found==m['exactOriginalCandidateRecords'],'candidateIds':[r['id'] for r in found],'joins':joins,'domain':m['domain'],'applicationContract':m['applicationContract'],'wholeEntries':m['wholeEntries']})
pins=read(base/'artifact-identities.json')['files'];pinchanges=[r['path'] for r in pins if sha((root/r['path']).read_bytes())!=r['sha256']]
frozenchanges=[r['path'] for r in frozen if sha((root/r['path']).read_bytes())!=r['sha256']]
receipt={'qualification':'Independent complete input/body/pointer navigation; preservation does not imply semantic acceptance','head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentArtifactPins':len(pins),'artifactPinChanges':pinchanges,'historicalFrozenInputs':len(frozen),'historicalFrozenInputChanges':frozenchanges,'originalFields':len(fields),'originalRowsEqual01AndCurrent':all(r['originalRow']==oldfields[i]['originalRow']==canonicalfields[r['id']] for i,r in enumerate(fields)),'originalCases':len(cases),'originalCanonicalBodiesEqual01AndCurrent':all(r['originalCanonicalCase']==oldcases[i]['originalCanonicalCase']==canonicalcases[r['id']] for i,r in enumerate(cases)),'nativeBodiesEqual01':all(r['retainedNativeCase']==oldcases[i]['retainedNativeCase'] for i,r in enumerate(cases)),'sourceCoordinates':len(coords),'sourceCoordinateMismatches':badcoords,'caseRefs':caseRefs,'sourceMembers':members,'toolIdentities':{'nodeExecutableSha256':sha(pathlib.Path('/usr/local/bin/node').read_bytes()),'ajvEntrySha256':sha(pathlib.Path('node_modules/ajv/dist/2020.js').read_bytes()),'ajvVersion':read('node_modules/ajv/package.json')['version']}}
(out/'read-identities.json').write_text(json.dumps({'head':receipt['head'],'at':receipt['at'],'inputs':identities},indent=2)+'\n');(out/'independent-conservation-and-joins.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['caseRefs','sourceMembers']}));print(json.dumps({'memberContracts':len(members),'caseRefs':len(caseRefs),'pathMismatches':sum(not r['pathMatchesActiveField'] for r in caseRefs),'nodeMismatches':sum(not r['exactNodeMatchesActiveField'] for r in caseRefs)}))
