import pathlib,json,hashlib,subprocess,gzip,datetime
root=pathlib.Path('.').resolve();B=root/'docs/review/evidence/config-acceptance/c0-completion-20261013';a=B/'combined-generation-current-integration-01';out=B/'independent-combined-generation-current-integration-review-01';base=B/'same-entry-engine-binding-01';reads={};cache={};errors=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def raw(p):
 p=pathlib.Path(p);p=p if p.is_absolute() else root/p;b=p.read_bytes();reads[str(p)]=b;return b
def read(p):
 p=str(p)
 if p not in cache:cache[p]=json.loads(raw(p))
 return cache[p]
def ref(r):
 p=r['path'];b=raw(p);expected=r.get('sha256',r.get('schemaSha256'))
 if expected and sha(b)!=expected:errors.append({'refHash':p})
 v=json.loads(b)
 for k in r.get('pointer','').split('/')[1:]:v=v[int(k)] if isinstance(v,list) else v[k.replace('~1','/').replace('~0','~')]
 return v
contract=read(a/'adoption-contract.json');receipt=read(a/'root-integration-receipt.json');roots=[];current=[]
for row in receipt['roots']:
 p=row['path'];before=subprocess.check_output(['git','show','e42dab0fa474d8bf7c726db2d100efff1c825a65:'+p]);after=raw(p);old=json.loads(before);new=json.loads(after);d=new.pop('currentCombinedDefinitionGeneration');current.append(d);same=new==old
 if not same:errors.append({'wholeObjectConservation':p})
 if sha(before)!=row['beforeSha256'] or sha(after)!=row['afterSha256']:errors.append({'rootReceiptHash':p})
 (out/(pathlib.Path(p).stem+'.before.json.gz')).write_bytes(gzip.compress(before,mtime=0))
 roots.append({'path':p,'beforeSha256':sha(before),'afterSha256':sha(after),'onlyNewKey':'currentCombinedDefinitionGeneration','allPreviousObjectExactlyEqual':same,'priorKeys':list(old),'originalRowsOrCases':len(old.get('rows',old.get('cases',[]))),'requirements':len(old.get('requirements',[])),'currentProviderFieldAdoptionExactlyEqual':new.get('currentProviderFieldAdoption')==old.get('currentProviderFieldAdoption')})
d=current[0];descriptor={k:v for k,v in d.items() if k!='integrationContract'}
if current[0]!=current[1] or descriptor!=contract['descriptor']:errors.append('rootDescriptorsDiffer')
references=[]
for k in ['entry','entrySchema','admissionSupplement','independentDefinitionReview','fieldConcordance','caseMemberConcordance','originalCaseContexts','prismRejoin','integrationContract']:
 r=d[k];references.append({'kind':k,'path':r['path'],'sha256':sha(raw(r['path'])),'hashMatches':sha(raw(r['path']))==r['sha256']})
for p in d['pendingOutsideCurrentGeneration']:
 for k in ['definition','boundedReview']:
  r=p[k];references.append({'kind':p['scope']+'/'+k,'path':r['path'],'sha256':sha(raw(r['path'])),'hashMatches':sha(raw(r['path']))==r['sha256']})
if not all(r['hashMatches'] for r in references):errors.append('descriptorRefHashMismatch')
inv=read('docs/review/remediation/config-semantic-inventory.json');matrix=read('docs/review/remediation/config-acceptance-matrix.json');fields={r['id']:r for r in inv['rows']};cases={r['id']:r for r in matrix['cases']};fc=read(d['fieldConcordance']['path']);mc=read(d['caseMemberConcordance']['path']);cc=read(d['originalCaseContexts']['path']);prism=read(d['prismRejoin']['path']);pb=ref(prism['original12Fields13Cases']);expectedFields=[r['id'] for r in fc]+[r['id'] for r in pb['fields']];expectedCases=[r['id'] for r in cc]+[r['id'] for r in pb['cases']]
if sorted(expectedFields)!=d['originalFieldIds'] or sorted(expectedCases)!=d['originalCaseIds']:errors.append('exactScopeRosterMismatch')
if any(i not in fields for i in d['originalFieldIds']) or any(i not in cases for i in d['originalCaseIds']):errors.append('unresolvedCanonicalId')
for f in fc:
 original=ref(f['originalFieldContext']);node=ref(f['samePhysicalPolicyNode'])
 if original['id']!=f['id'] or node!=f['samePhysicalPolicyNode']['exactNode']:errors.append({'fieldJoin':f['id']})
 for r in f['currentReceivingSchemaBindings']:
  if ref(r)!=r['exactNode']:errors.append({'fieldReceivingNode':f['id']})
 if f['currentRootSchema']['sha256']!=d['entrySchema']['sha256']:errors.append({'fieldRoot':f['id']})
 if any(t not in ref(d['entry'])['pluginSelections'] for t in f['currentSelections']):errors.append({'fieldTuple':f['id']})
for m in mc:
 if ref(m['originalMemberRef'])['settingId']!=m['settingId'] or ref(m['samePhysicalOwnerNode'])!=m['samePhysicalOwnerNode']['exactNode']:errors.append({'memberJoin':m['caseId']})
 for r in m['currentReceivingNodes']:
  if ref(r)!=r['exactNode']:errors.append({'memberNode':m['caseId']})
for c in cc:
 if ref(c['originalCanonicalCaseRef'])!=cases[c['id']]:errors.append({'originalCaseBody':c['id']})
for f in pb['fields']:
 if fields[f['id']]!=f:errors.append({'PrismFieldBody':f['id']})
for c in pb['cases']:
 if cases[c['id']]!=c:errors.append({'PrismCaseBody':c['id']})
for k in ['verifiedFieldContracts','verifiedCaseContracts','verifiedFullPairs','originalReceivingABI','currentRootSchema','currentOwner','ownerSchema','JReceivingSchema']:ref(prism[k])
if prism['currentRootRawSHA256']!=d['entry']['sha256'] or prism['currentEngineTuple'] not in ref(d['entry'])['engineSelections']:errors.append('PrismCurrentRootTuple')
for p in [base/'README.md',base/'RECEIVING-ABI.md',base/'inherited-definition-functions.mjs',B/'same-entry-engine-binding-02/check-correction.mjs',B/'same-entry-engine-binding-02/README.md',B/'independent-same-entry-engine-binding-review-02/README.md']:raw(p)
for p in a.iterdir():
 if p.is_file():raw(p)
command=read(a/'commands-and-exits.json');raw(command['command'][1])
if sha(raw(command['command'][1]))!=command['checkerSha256'] or sha(raw(a/'structural.stdout'))!=command['stdoutSha256'] or sha(raw(a/'structural.stderr'))!=command['stderrSha256']:errors.append('ExistingStructuralEvidenceHash')
(out/'frozen-inputs').mkdir();identities=[]
for p,b in sorted(reads.items()):
 h=sha(b);dest=out/'frozen-inputs'/(h+'.gz')
 if not dest.exists():dest.write_bytes(gzip.compress(b,mtime=0))
 identities.append({'path':p,'sha256':h,'bytes':len(b),'frozen':'frozen-inputs/'+h+'.gz'})
result={'scope':'Actual canonical reference-only integration inspection; no structural collector or provider execution','head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'roots':roots,'sameDescriptorBothRoots':current[0]==current[1],'descriptorMinusOnlyIntegrationContractEqualsStableContract':descriptor==contract['descriptor'],'references':references,'fieldScope':len(expectedFields),'caseScope':len(expectedCases),'physicalFieldNodes':len(fc),'physicalMemberEdges':len(mc),'PrismFields':len(pb['fields']),'PrismCases':len(pb['cases']),'readingRule':contract['readingRule'],'errors':errors}
(out/'read-identities.json').write_text(json.dumps({'inputs':identities,'head':result['head']},indent=2)+'\n');(out/'actual-root-conservation-and-reference-inspection.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
