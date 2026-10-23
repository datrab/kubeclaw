from pathlib import Path
import json,hashlib,subprocess,struct,datetime
R=Path('.').resolve();B=R/'docs/review/evidence/config-acceptance/c0-completion-20261013';A=B/'combined-generation-current-integration-02';O=B/'independent-combined-generation-current-integration-review-02';V=B/'same-entry-role-browser-binding-01';KEY='currentCombinedDefinitionGeneration';raws={};docs={};errors=[]
def raw(p):
 p=Path(p);p=p if p.is_absolute() else R/p;p=str(p)
 if p not in raws:raws[p]=Path(p).read_bytes()
 return raws[p]
def h(p):return hashlib.sha256(raw(p)).hexdigest()
def load(p):
 p=str(p)
 if p not in docs:docs[p]=json.loads(raw(p))
 return docs[p]
def point(x,p):
 for k in p.split('/')[1:]:x=x[int(k)] if isinstance(x,list) else x[k.replace('~1','/').replace('~0','~')]
 return x
def ref(r):
 if h(r['path'])!=r['sha256']:errors.append({'refHash':r['path']})
 return point(load(r['path']),r['pointer']) if r.get('pointer') else load(r['path'])
receipt=load(A/'root-integration-receipt.json');contract=load(A/'adoption-contract.json');rootResults=[];roots=[];history=[]
for r in receipt['roots']:
 before=subprocess.check_output(['git','show',receipt['headBefore']+':'+r['path']],cwd=R);after=raw(r['path']);old=json.loads(before);new=load(r['path']);idx=before.rfind(b'\n  "currentCombinedDefinitionGeneration": ');equal={k:v for k,v in old.items() if k!=KEY}=={k:v for k,v in new.items() if k!=KEY};prefix=idx>=0 and before[:idx]==after[:idx];historical=new[KEY]['supersession']['previousDescriptor']==old[KEY]
 if not equal or not prefix or not historical or hashlib.sha256(before).hexdigest()!=r['beforeSha256'] or h(r['path'])!=r['afterSha256']:errors.append({'rootConservation':r['path']})
 rootResults.append({'path':r['path'],'beforeRawSha256':hashlib.sha256(before).hexdigest(),'afterRawSha256':h(r['path']),'completeNonMetadataObjectEquality':equal,'originalRawPrefixExactlyEqual':prefix,'preservedRawPrefixBytes':idx,'priorMetadataExactlyHistorical':historical,'allPreviousKeyNames':list(old),'ProviderFieldAdoptionExactlyEqual':new['currentProviderFieldAdoption']==old['currentProviderFieldAdoption']});roots.append(new)
d=roots[0][KEY]
if d!=roots[1][KEY] or {k:v for k,v in d.items() if k!='integrationContract'}!=contract['descriptor']:errors.append('StableDescriptorConcordance')
refs=[]
def visit(v):
 if isinstance(v,dict):
  if isinstance(v.get('path'),str) and isinstance(v.get('sha256'),str):
   if 'immutableRawBefore' in v:
    g=v['immutableRawBefore'];before=subprocess.check_output(['git','show',g['gitObjectRef']],cwd=R);oid=subprocess.check_output(['git','rev-parse',g['gitObjectRef']],cwd=R,text=True).strip();good=hashlib.sha256(before).hexdigest()==v['sha256']==g['rawSha256'] and oid==g['gitBlobOid'] and g['gitRevision']==receipt['headBefore'] and g['gitObjectRef']==g['gitRevision']+':'+v['path'];history.append({'path':v['path'],'gitObjectRef':g['gitObjectRef'],'gitBlobOid':oid,'rawSha256':hashlib.sha256(before).hexdigest(),'matches':good});
    if not good:errors.append({'historicalGitRef':v['path']})
   else:
    good=h(v['path'])==v['sha256'];refs.append({'path':v['path'],'sha256':v['sha256'],'matches':good})
    if not good:errors.append({'currentFileRef':v['path']})
  for x in v.values():visit(x)
 elif isinstance(v,list):
  for x in v:visit(x)
visit(d);roster=ref(d['scopeRoster']);rows={r['id']:r for r in roots[0]['rows']};cases={r['id']:r for r in roots[1]['cases']};priorRoster=load(B/'independent-same-entry-role-browser-binding-review-01/original-ID-roster.json');controller=load(B/'controller-role-profile-01/original-case-refinements.json')['cases'];expectedFields=sorted({r['id'] for r in priorRoster if r['kind']=='field'});primaryCases={r['id'] for r in priorRoster if r['kind']=='case'};expectedCases=sorted(primaryCases|{r['id'] for r in controller});extra=sorted(set(expectedCases)-primaryCases)
if d['originalFieldIds']!=expectedFields or roster['uniqueFieldIds']!=expectedFields or d['originalCaseIds']!=expectedCases or roster['uniqueCaseIds']!=expectedCases:errors.append('ExactOriginalScopeRoster')
if any(i not in rows for i in expectedFields) or any(i not in cases for i in expectedCases):errors.append('UnresolvedActualCanonicalIds')
scopes=[];fieldSet=set(expectedFields)
for s in roster['caseFieldScope']:
 c=cases[s['id']];inside=sorted(set(c['settingIds'])&fieldSet);outside=sorted(set(c['settingIds'])-fieldSet)
 if s['scopedFieldIds']!=inside or s['originalFieldIdsOutsideCurrentScope']!=outside or s['wholeCaseClosureAccepted'] is not False or s['referenceOnly'] is not True:errors.append({'CaseFieldScope':s['id']})
 if outside:scopes.append({'id':s['id'],'insideCount':len(inside),'outsideCount':len(outside),'outsideFields':outside,'wholeCaseClosureAccepted':s['wholeCaseClosureAccepted']})
if [s['id'] for s in roster['caseFieldScope']]!=expectedCases:errors.append('ScopeCaseMembership')
fc=ref(d['fieldConcordance']);by={f['id']:f for f in fc};mc=ref(d['caseMemberConcordance'])
for f in fc:
 if ref(f['ownerNode'])!=f['ownerNode']['exactNode']:errors.append({'PhysicalOwnerNode':f['id']})
 for r in f['receivingNodes']:
  if ref(r)!=f['ownerNode']['exactNode'] or (f['family']=='Browser' and r['path']!=str(V/'schemas/provider-configuration.v2.schema.json')):errors.append({'PhysicalCurrentReceiver':f['id']})
for m in mc:
 if m['ownerNode']!=by[m['settingId']]['ownerNode'] or m['receivingNodes']!=by[m['settingId']]['receivingNodes'] or ref(m['originalRef'])['settingId']!=m['settingId']:errors.append({'SameFieldMember':m['caseId']})
set_=ref(d['fileSet']);parts=[b'kubeclaw.same-entry.input.v1\0']
for m in sorted(set_['inputMembers'],key=lambda m:m['relativePath'].encode()):
 p=V/m['relativePath'] if m['relativePath'].startswith('schemas/') else V/'stand'/m['relativePath'];b=raw(p);name=m['relativePath'].encode()
 if len(b)!=m['byteLength'] or h(p)!=m['sha256']:errors.append({'FileCodecMember':m['relativePath']})
 parts.extend([struct.pack('>I',len(name)),name,struct.pack('>Q',m['byteLength']),bytes.fromhex(m['sha256'])])
codec=hashlib.sha256(b''.join(parts)).hexdigest();entry=ref(d['entry']);generation=ref(d['generationReceipt'])
if codec!=set_['inputGenerationSha256'] or h(d['entry']['path'])!=set_['rootRawSha256'] or generation['inputMembers']!=set_['inputMembers'] or generation['rootRawSha256']!=set_['rootRawSha256'] or generation['inputGenerationSha256']!=codec:errors.append('FullInputRootReceiptCodec')
for o in generation['outputMembers']:
 p=V/'outputs'/('gateway' if o['logicalPath'].startswith('openclaw-gateway/') else 'prism')/Path(o['logicalPath']).name
 if h(p)!=o['sha256'] or len(raw(p))!=o['byteLength']:errors.append({'ReceiptOutput':o['logicalPath']})
annotation=ref(d['sourceCoordinateAnnotation']);actual=raw(annotation['actualSource']['path']).decode()
if h(annotation['actualSource']['path'])!=annotation['actualSource']['sha256'] or not all(actual.splitlines()[x['line']-1]==x['text'] for x in annotation['sourceWitness']):errors.append('ActualSourceAnnotation')
manifest=load(A/'manifest.json');manifestBad=[f['relativePath'] if 'relativePath' in f else f['path'] for f in manifest['files'] if h(A/f.get('relativePath',f.get('path')))!=f['sha256']];pins=load(A/'input-identities.json');pinBad=[p['path'] for p in pins if h(p['path'])!=p['sha256'] or p['sha256']!=p['endSha256']]
if manifestBad or pinBad:errors.append('IntegrationPins')
commands=load(A/'commands-and-exits.json');cmd=commands['finalActualRawRootStructural']
for p in cmd['toolInputs']:
 if h(p['path'])!=p['sha256'] or p['sha256']!=p['endSha256']:errors.append({'StructuralToolInput':p['path']})
if h(A/'structural.stdout')!=cmd['stdoutSha256'] or h(A/'structural.stderr')!=cmd['stderrSha256'] or h(cmd['pythonExecutable'])!=cmd['pythonExecutableSha256']:errors.append('RecordedStructuralToolOrOutput')
for p in A.iterdir():
 if p.is_file():raw(p)
priorPins=load(B/'independent-same-entry-role-browser-binding-review-01/initial-input-identities.json')['inputs'];physical=[p for n in ['stand','schemas','entries','outputs'] for p in (V/n).rglob('*') if p.is_file()];known={p['path']:p['sha256'] for p in priorPins};physicalBad=[str(p) for p in physical if str(p) not in known or h(p)!=known[str(p)]]
if physicalBad:errors.append('PreviouslyReviewedPhysicalBytes')
result={'qualification':'Actual metadata/root/ref/ID/body/node inspection only; no collector execution or new generic validator','head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'roots':rootResults,'identicalCurrentDescriptor':d==roots[1][KEY],'stableDescriptorPlusOnlyIntegrationContract':{k:v for k,v in d.items() if k!='integrationContract'}==contract['descriptor'],'ordinaryCurrentFileReferences':len(refs),'uniqueCurrentFileReferences':len({r['path'] for r in refs}),'immutableGitBeforeReferences':history,'exactFields':len(expectedFields),'exactCases':len(expectedCases),'extraControllerCaseIds':extra,'partialFieldScopeCases':scopes,'actualCanonicalCounts':{'fields':len(rows),'cases':len(cases),'requirements':len(roots[1]['requirements'])},'currentFieldNodes':len(fc),'currentMemberEdges':len(mc),'typedProviderArms':len(ref(d['typedReceivingSchema'])['oneOf']),'codecInputs':len(set_['inputMembers']),'rootRawSha256':set_['rootRawSha256'],'fullInputGenerationSha256':codec,'receiptOutputs':len(generation['outputMembers']),'previouslyReviewedPhysicalMembers':len(physical),'physicalByteMismatches':physicalBad,'integrationManifestMembers':len(manifest['files']),'integrationManifestMismatches':manifestBad,'integrationReadPins':len(pins),'integrationReadPinMismatches':pinBad,'errors':errors};(O/'actual-root-inspection.json').write_text(json.dumps(result,indent=2)+'\n');(O/'read-identities.json').write_text(json.dumps({'head':result['head'],'inputs':[{'path':p,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)} for p,b in sorted(raws.items())]},indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['partialFieldScopeCases','roots']}))
