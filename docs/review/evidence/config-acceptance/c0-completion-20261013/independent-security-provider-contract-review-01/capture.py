import pathlib,json,hashlib,gzip,datetime,subprocess
root=pathlib.Path('.');B=root/'docs/review/evidence/config-acceptance/c0-completion-20261013';base=B/'security-provider-contracts-01';out=B/'independent-security-provider-contract-review-01'
read=lambda p:json.loads(pathlib.Path(p).read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
pins=read(base/'artifact-identities.json')['files'];frozen=read(base/'frozen-input-identities.json')['inputs'];sources=read(base/'source-pins.json')['files']
inputs={p for p in base.rglob('*') if p.is_file()};inputs.update(root/r['path'] for r in frozen+sources)
for p in ['docs/review/remediation/config-semantic-inventory.json','docs/review/remediation/config-acceptance-matrix.json','docs/review/evidence/config-acceptance/author/candidate-ledger.json','docs/review/remediation/GOAL-START.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md','skills/common/plugin-runtime/foundation/registry/schema.ts','skills/common/plugin-runtime/foundation/registry/build.ts','skills/common/plugin-runtime/foundation/registry/configuration.ts','skills/nova/core/test-gates/resolver.ts','skills/buster/engine/test-gates/runner-log-capture.ts','skills/buster/engine/test-gates/runner-attempt-evidence.ts']:
 inputs.add(root/p)
fields=read(base/'field-definitions.json')['rows'];cases=read(base/'case-definitions.json')['cases'];nativeMaps={}
for c in cases:
 for r in c['originalCanonicalCase'].get('nativeSpecificationReferences',[]):
  inputs.add(root/r['sourcePath'])
  if r['sourcePath'] not in nativeMaps:
   d=read(root/r['sourcePath']);rows=d if isinstance(d,list) else d.get('cases',[]);nativeMaps[r['sourcePath']]={x['id']:x for x in rows}
(out/'frozen-inputs').mkdir(exist_ok=True);identities=[]
for p in sorted(inputs):
 b=p.read_bytes();h=sha(b);target=out/'frozen-inputs'/f'{h}.gz'
 if not target.exists():target.write_bytes(gzip.compress(b,mtime=0))
 identities.append({'path':str(p),'bytes':len(b),'sha256':h,'frozen':f'frozen-inputs/{h}.gz'})
inventory={r['id']:r for r in read(root/'docs/review/remediation/config-semantic-inventory.json')['rows']};matrix={r['id']:r for r in read(root/'docs/review/remediation/config-acceptance-matrix.json')['cases']}
def pointer(b):
 d=read(b['path'])
 for segment in b['pointer'].strip('/').split('/'):d=d[int(segment)] if isinstance(d,list) else d[segment.replace('~1','/').replace('~0','~')]
 return d
fieldMap={r['id']:r for r in fields};memberChecks=[];receiverChecks=[]
for c in cases:
 for m in c['perMemberFieldContracts']:
  ref=m['completeOwnerSchemaRef'];memberChecks.append({'case':c['id'],'field':m['settingId'],'actualSchemaShaMatches':sha(pathlib.Path(ref['path']).read_bytes())==ref['sha256'],'pointedNodeEqualsField':pointer(ref)==fieldMap[m['settingId']]['targetSchemaBinding']['exactNode']})
for row in read(base/'active-concordance-index.json'):
 for ref in row['receivingSchemaBindings']:receiverChecks.append({'field':row['id'],'registration':ref['registrationId'],'schemaShaMatches':sha(pathlib.Path(ref['path']).read_bytes())==ref['sha256'],'actualPointedNodeEqualsField':pointer(ref)==fieldMap[row['id']]['targetSchemaBinding']['exactNode']})
nativeChecks=[]
for c in cases:
 refs=c['originalCanonicalCase'].get('nativeSpecificationReferences',[]);matches=[nativeMaps[r['sourcePath']].get(r['nativeCaseId'])==c['retainedNativeCase'] for r in refs];nativeChecks.append({'case':c['id'],'equalsAtLeastOneOriginalNativeBody':any(matches)})
ledger=read(root/'docs/review/evidence/config-acceptance/author/candidate-ledger.json')['candidates'];processing=[]
for m in read(base/'source-processing-contracts.json')['members']:
 s=m['immutableSourceIdentity'];raw=(root/s['path']).read_bytes();found=[r for r in ledger if r['source']==s['path'] and r['line']==s['line']];joins=[]
 for r in m['originalCaseArtifactRefs']:
  doc=read(base/'case-definitions.json')
  for segment in r['pointer'].split('#',1)[1].strip('/').split('/'):doc=doc[int(segment)] if isinstance(doc,list) else doc[segment]
  joins.append(doc['id']==r['id'])
 processing.append({'name':m['name'],'sourceShaMatches':sha(raw)==s['sourceSha256'],'lineMatches':raw.decode().splitlines()[s['line']-1]==s['text'],'candidateBodiesEqualActual':found==m['exactOriginalCandidateRecords'],'originalCaseJoinsMatch':all(joins),'candidateIds':[r['id'] for r in found]})
receipt={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'qualification':'Independent full body/source/schema join conservation, not semantic/native acceptance','currentArtifactPins':len(pins),'changedCurrentPins':[r['path'] for r in pins if sha((root/r['path']).read_bytes())!=r['sha256']],'historicalPins':len(frozen),'changedHistoricalPins':[r['path'] for r in frozen if sha((root/r['path']).read_bytes())!=r['sha256']],'sourcePins':len(sources),'changedSourcePins':[r['path'] for r in sources if sha((root/r['path']).read_bytes())!=r['sha256']],'originalFields':len(fields),'originalRowsEqualCanonical':all(r['originalRow']==inventory[r['id']] for r in fields),'originalCases':len(cases),'canonicalBodiesAndLifecyclesEqual':all(r['originalCanonicalCase']==matrix[r['id']] for r in cases),'nativeBodyMismatches':[r for r in nativeChecks if not r['equalsAtLeastOneOriginalNativeBody']],'memberChecks':memberChecks,'receiverChecks':receiverChecks,'processing':processing,'nodeExecutableSha256':sha(pathlib.Path('/usr/local/bin/node').read_bytes()),'ajvEntrySha256':sha(pathlib.Path('node_modules/ajv/dist/2020.js').read_bytes()),'ajvVersion':read('node_modules/ajv/package.json')['version']}
(out/'read-identities.json').write_text(json.dumps({'head':receipt['head'],'at':receipt['at'],'inputs':identities},indent=2)+'\n');(out/'conservation-and-joins.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['memberChecks','receiverChecks','processing']}));print(json.dumps({'activeMemberChecks':len(memberChecks),'receivingNodeChecks':len(receiverChecks),'badMembers':[r for r in memberChecks if not r['actualSchemaShaMatches'] or not r['pointedNodeEqualsField']],'badReceivers':[r for r in receiverChecks if not r['schemaShaMatches'] or not r['actualPointedNodeEqualsField']],'processingContracts':processing}))
