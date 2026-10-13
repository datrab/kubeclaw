import json, pathlib, hashlib, subprocess
ROOT=pathlib.Path.cwd(); B=pathlib.Path('docs/review/evidence/config-acceptance/c0-completion-20261013'); OUT=B/'independent-ops-pagination-correction-28'
def read(p):return json.loads(pathlib.Path(p).read_text())
def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(n,v):(OUT/n).write_text(json.dumps(v,indent=2)+'\n')
a=read(B/'delivery/batch-35/source-field-definitions.json'); c=read(B/'delivery/batch-36/source-field-definitions.json'); old={r['candidateId']:r for r in a['rows']}; new={r['candidateId']:r for r in c['rows']}; errors=[]; pins=[]
paths=set([pathlib.Path('docs/review/remediation/GOAL-START.md'),pathlib.Path('docs/review/remediation/OPENCLAW-CONFIG-GOAL.md')]);paths.update((B/'delivery/batch-35').glob('*'));paths.update((B/'delivery/batch-36').glob('*'));paths.update((B/'independent-ops-source-inventory-27').glob('*'))
def walk(v,cid):
 if isinstance(v,dict):
  if {'path','line','expression','sha256'} <= v.keys():
   p=pathlib.Path(v['path']);paths.add(p);lines=p.read_text().splitlines(); ok=digest(p)==v['sha256'] and isinstance(v['line'],int) and 1<=v['line']<=len(lines) and lines[v['line']-1]==v['expression'] and bool(v['expression'].strip());pins.append({'candidateId':cid,**v,'matched':ok})
   if not ok:errors.append('bad pin '+cid+':'+str(v))
  for x in v.values():walk(x,cid)
 elif isinstance(v,list):
  for x in v:walk(x,cid)
for r in c['rows']:walk(r,r['candidateId'])
ids=list(new); kube=[i for i in ids if new[i]['sourceRef']['path']=='tools/ops-mcp/src/kubernetes.mjs']; other=[i for i in ids if i not in kube]
conservation={'counts':[len(a['rows']),len(c['rows']),len(old),len(new)],'sameIdsAndOrder':list(old)==list(new),'all33OriginalBodiesPreserved':all(new[i]['originalCandidate']==old[i]['originalCandidate'] for i in ids),'other24RowsIdentical':len(other)==24 and all(new[i]==old[i] for i in other),'kubernetesRowCount':len(kube),'changedFields':{i:[k for k in new[i] if new[i][k]!=old[i].get(k)] for i in kube},'originalRefsPreserved':all(all(x in new[i]['productiveCallerRefs'] for x in old[i]['productiveCallerRefs']) for i in kube)}
required={107,113,117,118,119,127,128,129,131,283,289,298,300,301,302,303,304,313,321,333,334,335,336,337,338,396,397}
conservation['requiredCallerLinesAll9']=all(required <= {x['line'] for x in new[i]['productiveCallerRefs'] if x['path']=='tools/ops-mcp/src/server.mjs'} for i in kube)
conservation['contractsAll9Identical']=all(new[i]['currentPaginationCallerContracts']==new[kube[0]]['currentPaginationCallerContracts'] for i in kube)
comparisons=[]
for entry in read(B/'independent-ops-source-inventory-27/input-identities.json'):
 p=pathlib.Path(entry['path']);paths.add(p); comparisons.append({'kind':'review27-original-input','path':str(p),'expected':entry['sha256'],'actual':digest(p),'matched':digest(p)==entry['sha256']})
for batch in ['batch-35','batch-36']:
 for entry in read(B/('delivery/'+batch+'/package-manifest.json'))['files']:
  p=pathlib.Path(entry['path']);paths.add(p);comparisons.append({'kind':batch+'-manifest','path':str(p),'expected':entry['sha256'],'actual':digest(p),'matched':digest(p)==entry['sha256']})
for key in ['priorQueueRef','supersedesDefinitionRef']:
 entry=c[key];p=pathlib.Path(entry['path']);paths.add(p);comparisons.append({'kind':key,'path':str(p),'expected':entry['sha256'],'actual':digest(p),'matched':digest(p)==entry['sha256']})
identities=[{'path':str(p),'bytes':p.stat().st_size,'sha256':digest(p)} for p in sorted(paths) if p.is_file()];write('input-identities.json',identities);write('pin-comparisons.json',pins);write('original-and-manifest-comparisons.json',comparisons)
checkout={k:subprocess.check_output(['git',*args],text=True).strip() for k,args in {'head':['rev-parse','HEAD'],'tree':['rev-parse','HEAD^{tree}'],'branch':['branch','--show-current']}.items()};checkout['trackedPatchSha256']=hashlib.sha256(subprocess.check_output(['git','diff','HEAD','--binary'])).hexdigest();write('checkout.json',checkout)
checks={'reviewer':'/root/ops_pagination_caller_recheck_28','conservation':conservation,'exactSourcePinCount':len(pins),'allSourcePinsMatched':all(x['matched'] for x in pins),'allOriginalAndManifestPinsMatched':all(x['matched'] for x in comparisons),'noApprovalPromotion':c['globalC0Accepted'] is False and all(r['definitionAccepted'] is False and r['runtimeResult']=='not-run' for r in c['rows']),'errors':errors,'runtimeResult':'not-run'};write('checks.json',checks)
assert conservation['counts']==[33,33,33,33] and all(conservation[k] for k in ['sameIdsAndOrder','all33OriginalBodiesPreserved','other24RowsIdentical','originalRefsPreserved','requiredCallerLinesAll9','contractsAll9Identical']) and len(kube)==9
assert all(set(v)=={'currentDomainAndPrecedence','productiveCallerRefs','currentPaginationCallerContracts'} for v in conservation['changedFields'].values())
assert checks['allSourcePinsMatched'] and checks['allOriginalAndManifestPinsMatched'] and checks['noApprovalPromotion'] and not errors
print(json.dumps({'checks':'PASS','pins':len(pins),'comparisons':len(comparisons),'checkout':checkout},indent=2))
