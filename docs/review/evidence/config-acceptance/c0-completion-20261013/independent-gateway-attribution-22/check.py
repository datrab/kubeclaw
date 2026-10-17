from pathlib import Path
import json, hashlib, subprocess, shutil
R=Path.cwd(); E=R/'docs/review/evidence/config-acceptance/c0-completion-20261013'; D=E/'delivery'; P=E/'independent-gateway-inventory-21'; O=E/'independent-gateway-attribution-22'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return json.loads(p.read_text())
def write(name,value): (O/name).write_text(json.dumps(value,indent=2)+'\n')
inputs=[R/'docs/review/remediation/GOAL-START.md',R/'docs/review/remediation/OPENCLAW-CONFIG-GOAL.md',R/'charts/kubeclaw/templates/deployment.yaml',R/'charts/kubeclaw/templates/configmap-gateway.yaml',D/'candidate-dispositions.json',D/'batch-24/remaining-batches.json',*sorted((D/'batch-29').iterdir()),*sorted((D/'batch-30').iterdir()),*sorted(p for p in P.rglob('*') if p.is_file())]
ident=[]
for p in inputs:
 t=O/'inputs'/p.relative_to(R);t.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,t);ident.append({'path':str(p.relative_to(R)),'sha256':sha(p)})
write('inputs.json',ident)
for name,args in [('head',['git','rev-parse','HEAD']),('tree',['git','rev-parse','HEAD^{tree}']),('status',['git','status','--porcelain=v1']),('diff',['git','diff','--binary'])]: (O/(name+'.txt')).write_bytes(subprocess.check_output(args))
old=load(D/'batch-29/source-field-definitions.json');new=load(D/'batch-30/source-field-definitions.json');rows=new['rows'];byline={r['sourceRef']['line']:r for r in rows};originals={r['id']:r for r in load(D/'candidate-dispositions.json')['candidates']}
pins=[]
def visit(v,candidate,key=''):
 if isinstance(v,dict):
  if {'path','line','expression','sha256'}<=v.keys():
   p=R/v['path'];pins.append({'candidateId':candidate,'kind':key,'line':v['line'],'path':v['path'],'hashMatches':sha(p)==v['sha256'],'expressionMatches':p.read_text().splitlines()[v['line']-1]==v['expression'],'nonblank':bool(v['expression'].strip())})
  else:
   for k,x in v.items(): visit(x,candidate,k)
 elif isinstance(v,list):
  for x in v:visit(x,candidate,key)
for r in rows:visit(r,r['candidateId'])
changes=[]
for a,b in zip(old['rows'],rows):
 changes.append({'candidateId':b['candidateId'],'sourceLine':b['sourceRef']['line'],'changedKeys':[k for k in set(a)|set(b) if a.get(k)!=b.get(k)]})
allowed={'currentStartupReaderRefs','startupDeliveryRefs','persistentFileParseRef','additionalDeliveryProjectionRefs','startupFieldRefresh'}
def manifest(p):return [{**x,'matches':sha(R/x['path'])==x['sha256']} for x in load(p)['files']]
frozen=[{**x,'liveMatches':sha(R/x['path'])==x['sha256'],'frozenMatches':sha(P/'inputs'/x['path'])==x['sha256'],'liveEqualsFrozen':(R/x['path']).read_bytes()==(P/'inputs'/x['path']).read_bytes()} for x in load(P/'inputs.json')]
expected={2:[490,491,494,497],67:[528,530,531],84:[510,513],157:[546,547,548,549,555,567],190:[490,491],192:[490,491],217:[494,497],240:[494,497],246:[]}
attribution=[{'line':line,'expected':lines,'actual':[r['line'] for r in byline[line]['currentStartupReaderRefs']],'matches':lines==[r['line'] for r in byline[line]['currentStartupReaderRefs']]} for line,lines in expected.items()]
queue=load(R/new['priorQueueRef']['path']);qids=next(x['candidateIds'] for x in queue['bySource'] if x['source']=='charts/kubeclaw/templates/configmap-gateway.yaml')
checks={'candidateCount':len(rows),'uniqueCount':len({r['candidateId'] for r in rows}),'oldIdsInSameOrder':[r['candidateId'] for r in old['rows']]==[r['candidateId'] for r in rows],'queueIdsExactlyMatch':set(qids)=={r['candidateId'] for r in rows},'originalBodiesPreserved':sum(r['originalCandidate']==originals[r['candidateId']]==a['originalCandidate'] for r,a in zip(rows,old['rows'])),'onlyAllowedAttributionKeysChanged':all(set(x['changedKeys'])<=allowed for x in changes),'allOldNonAttributionFieldsEqual':all(all(b.get(k)==v for k,v in a.items() if k not in allowed) for a,b in zip(old['rows'],rows)),'priorQueueIdentityUnchanged':old['priorQueueRef']==new['priorQueueRef'] and sha(R/new['priorQueueRef']['path'])==new['priorQueueRef']['sha256'],'allPinsMatchNonblank':all(x['hashMatches'] and x['expressionMatches'] and x['nonblank'] for x in pins),'pinCount':len(pins),'allExpectedAttributionMatches':all(x['matches'] for x in attribution),'allCommonParsePins460':all(460 in [x['line'] for x in r['startupDeliveryRefs']] and 461 not in [x['line'] for x in r['startupDeliveryRefs']] for r in rows),'gatewayPersistentParse460':byline[246]['persistentFileParseRef']['line']==460,'gatewayProjectionPins':[x['line'] for x in byline[246]['additionalDeliveryProjectionRefs']],'allFrozenInputsPreserved':all(x['liveMatches'] and x['frozenMatches'] and x['liveEqualsFrozen'] for x in frozen),'oldManifest':manifest(D/'batch-29/package-manifest.json'),'newManifest':manifest(D/'batch-30/package-manifest.json'),'review21Manifest':manifest(P/'review-manifest.json'),'allRowsUnacceptedNotRun':all(r['definitionAccepted'] is False and r['runtimeResult']=='not-run' for r in rows),'globalC0Accepted':new['globalC0Accepted']}
write('pins.json',pins);write('changes.json',changes);write('frozen-checks.json',frozen);write('attribution.json',attribution);write('checks.json',checks)
print(json.dumps(checks,indent=2))
