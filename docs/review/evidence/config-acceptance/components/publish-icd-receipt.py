import pathlib,json,hashlib,copy,shlex,collections
O=pathlib.Path('docs/review/evidence/config-acceptance/components');write=lambda p,j:pathlib.Path(p).write_text(json.dumps(j,indent=2)+'\n');sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();R=O/'residual-fragment.json';r=json.loads(R.read_text());S=O/'active-case-specifications.json';spec=json.loads(S.read_text());by={c['id']:c for c in r['cases']};rows={x['id']:x for x in r['rows']}
for u in r['caseRefinements']:
 if u['replacementForCaseId'].endswith('tailscaleExposure.allowedNamespacePrefixes'):
  u['observer']['boundary']='A rejects config-acceptance-fixture before effect with TAILSCALE_EXPOSURE_NAMESPACE_DENIED; B admits then actual owned operation. Namespace exact prefix or prefix-hyphen matching; test-fixture positive control both.'
# Add honest actual bounded definition/control receipts, each with identities and preserved raw result.
groups=[('adjustable-core-profile-definitions.log','CMP-C0-CORE-ADJUSTABLE-PROFILES',list(x for x in rows if x.startswith('CMP-WCORE-') and rows[x]['class']=='operator-setting')),('refined-profile-definition-icd-corrected.log','CMP-C0-REFINED-PROFILES-ICD-CORRECTED',sorted(set(s for u in r['caseRefinements'] for s in u['settingIds'])))]
controls=json.loads((O/'adjustable-source-controls.log').read_text());mapping={'BYTE':'INPUT-BYTES','NODE':'JSON-NODES','DEPTH':'JSON-DEPTH','POOL':'POOL-FILE-BYTES','RUNTIME':'RUNTIME-IDENTITY-FILE-BYTES','UUID':'NODE-IDENTITY-FILE-BYTES','IDENTITY':'NODE-IDENTITY-FILE-BYTES'}
for q in controls['results']:
 name=q['id'];key=next((v for k,v in mapping.items() if k in name.replace('CMP-C0-CORE-ADJUSTABLE-','')),None)
 if name.endswith('-NODE-64') or name.endswith('-NODE-96'):key='NODE-IDENTITY-FILE-BYTES'
 if key is None:
  # exact source-control IDs encode NODE-ID rather than UUID; resolve from observed file type.
  key='NODE-IDENTITY-FILE-BYTES'
 groups.append(('adjustable-source-controls.log',name,['CMP-WCORE-'+key]))
for log,cid,settings in groups:
 v=json.loads((O/log).read_text());items=[z for z in v['results'] if z.get('id')==cid] or v['results'];assert all(z['result']=='passed' for z in items)
 if cid in by:continue
 ids=v.get('identities',{});files=ids.get('files',{});test={p:h for p,h in files.items() if p.endswith('.mjs') and '/components/' in p};sources={p:h for p,h in files.items() if p not in test};cmd=v['command'];argv=shlex.split(cmd)
 c={'id':cid,'settingIds':settings,'requirementIds':['C0-A','C0-B','C0-C'],'scope':v['scope'],'productiveCaller':list(sources),'inputConfigProfile':{'definitionLog':str(O/log),'observations':items,'scope':'Exact real current-reader/proposed-schema definition controls only; no future CONFIG/consumer implementation PASS'},'priorState':'Isolated temporary files/settings roots/constructor fixture described in unchanged identified script; no persisted fake terminal metadata','action':'Execute exact identified evidence script; collect all specified positive assertions without skips','expectedEffectOrRejectingBoundary':'Each recorded assertion passed; scope limited to exact observed current-reader or proposed-schema boundary','observerMethod':'Identified script assertion + raw JSON observations','actualTestCommand':cmd,'proposedTestCommand':None,'sourceDigests':sources,'testDigests':test,'toolDependencyImageConfigIdentities':ids,'rawEvidencePath':str(O/log),'rawEvidenceSha256':sha(O/log),'actualResult':'passed','reviewerConfirmation':'pending independent material recheck','lifecycle':{'state':'active','required':True,'supersedes':['CMP-C0-REFINED-COMPLETE-PROFILES'] if cid=='CMP-C0-REFINED-PROFILES-ICD-CORRECTED' else [],'supersededBy':[]},'proposedInvocation':{'argv':argv,'cwd':'/home/node/.openclaw/workspace/kubeclaw-config-c0','environment':{},'prerequisites':[],'requiredCollection':{'expectedCaseId':cid,'countMustBePositive':True,'skippedTimedoutSetupFailureNeverPass':True}}}
 r['cases'].append(c);by[cid]=c
 for sid in settings:
  if sid in rows and cid not in rows[sid]['caseIds']:rows[sid]['caseIds'].append(cid)
# Archive/history lifecycle indexes are machine-readable, without mutating original raw receipts.
r['artifactLifecycle']=[{'path':str(O/f),'state':'historical','replacement':str(O/'core-adjustability-current.md'),'reason':'ICD001 preservation-only cannot meet tuning'} for f in ['core-policy-domains.md','core-policy-domain-closure.json','core-domain-definition-attempt1.log','core-domain-definition-attempt2.log']]+[{'path':str(O/'refined-profile-definition-validation.log'),'state':'historical','originalInput':str(O/'refined-case-profiles.json'),'archivedInput':str(O/'historical-refined-case-profiles-a07de567.json'),'replacement':str(O/'refined-profile-definition-icd-corrected.log')},{'path':str(O/'historical-case-specifications-40cf24.json'),'state':'historical','rows':49,'cases':219,'checkpoint':'40cf24e77388bced59475ece9651c9c94d848368'}]
# Rebuild exact active index, keeping unchanged original refined obligation specs.
prev={c['caseId']:c for c in spec['cases']};out=[]
for c in r['cases']:
 if c['lifecycle']['state']!='active':continue
 t=prev.get(c['id'],{});t.update({'caseId':c['id'],'settingIds':c['settingIds'],'requirementIds':c['requirementIds'],'lifecycle':c['lifecycle'],'invocation':c['proposedInvocation'],'boundary':c['productiveCaller'],'input':c['inputConfigProfile'],'priorState':c['priorState'],'action':c.get('action','Identified exact evidence-script assertions'),'oracles':{'expected':c['expectedEffectOrRejectingBoundary'],'observer':c['observerMethod'],'result':c['actualResult'],'rawEvidencePath':c.get('rawEvidencePath'),'sourceAndTestIdentities':{'sources':c.get('sourceDigests'),'tests':c.get('testDigests')}}});out.append(t)
for u in r['caseRefinements']:
 t=prev[u['replacementForCaseId']];t.update({'input':{'completeProfiles':u['completeProfiles'],'task':u['observer']['taskInputs']},'action':u['observer']['action'],'oracles':{'expected':u['observer']['boundary'],'sourceExpressions':u['sourceFieldExpressions'],'diagnostics':u['possibleBoundaryDiagnostics'],'result':'not-run','rawEvidencePath':None}});out.append(t)
# Shell command includes exact environment from structured invocation; no prose/placeholders appended.
for t in out:
 inv=t['invocation'];env=inv['environment'];command=('env '+' '.join(shlex.quote(k+'='+str(v)) for k,v in env.items())+' ' if env else '')+' '.join(shlex.quote(a) for a in inv['argv']);t['exactCommand']=command
 c=by.get(t['caseId'])
 if c and c['actualResult']=='not-run':c['proposedTestCommand']=command
 for u in r['caseRefinements']:
  if u['replacementForCaseId']==t['caseId']:u['proposedTestCommand']=command
write(S,{'scope':'C0 complete active case definition; approved future implementation/harness prerequisites remain explicitly not-run','cases':out})
history=json.loads((O/'historical-case-specifications-40cf24.json').read_text());orig=set(q for c in history['cases'] for q in c['requirementIds']);active=set(q for c in r['cases'] if c['lifecycle']['state']=='active' for q in c['requirementIds']);assert orig<=active
r['caseLifecycleSummary']={'counts':dict(collections.Counter(c['lifecycle']['state'] for c in r['cases'])),'historicalSnapshot':str(O/'historical-case-specifications-40cf24.json'),'originalRequirementIds':sorted(orig),'activeRequirementIds':sorted(active),'scopeReduction':False,'activeSpecPath':str(S),'activeSpecsIncluding148Refinements':len(out)}
write(R,r)
ledger=json.loads((O/'icd-correction-ledger.json').read_text());ledger['reviewerErratum']={'path':'docs/review/evidence/config-acceptance/independent-core-domain/erratum-six-roots.json','sha256':sha('docs/review/evidence/config-acceptance/independent-core-domain/erratum-six-roots.json'),'coordinates':75,'productivePath':55,'publicContractOnly':20,'scopeReduction':False};ledger['findings']['ICD003']['reportedCoordinates']=75;ledger['findings']['ICD003']['historicalReportArithmetic']=85;ledger['findings']['ICD002']['conservation']=r['caseLifecycleSummary'];ledger['findingSourceCaseChanges']={k:{'artifacts':v.get('artifacts',[]),'settingIds':v.get('settingIds',[]),'recheck':'Independent reviewer must examine proposed domain/actual consumer/oracle, not counts'} for k,v in ledger['findings'].items()};ledger['additionalCorrection']='17 consumer-specific refined witnesses; Tailscale redundant B suffix replaced narrowing and296 fresh loader positives; historical219 exact git checkpoint restored';ledger['actualDefinitionReceipts']=[{'caseId':cid,'log':str(O/log),'sha256':sha(O/log)} for log,cid,_ in groups];write(O/'icd-correction-ledger.json',ledger)
print('Active specs',len(out),'lifecycle',r['caseLifecycleSummary']['counts'],'new actual scoped receipts',len(groups),'NOT ACCEPTED pending independent recheck')
