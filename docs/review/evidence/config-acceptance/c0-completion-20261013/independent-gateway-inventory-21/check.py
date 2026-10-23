from pathlib import Path
import hashlib,json,subprocess,shutil
R=Path.cwd(); E=R/'docs/review/evidence/config-acceptance/c0-completion-20261013'; O=E/'independent-gateway-inventory-21'; D=E/'delivery'; B=D/'batch-29'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
inputs=[R/'docs/review/remediation/GOAL-START.md',R/'docs/review/remediation/OPENCLAW-CONFIG-GOAL.md',R/'charts/kubeclaw/templates/configmap-gateway.yaml',R/'charts/kubeclaw/templates/deployment.yaml',D/'candidate-dispositions.json',D/'batch-24/remaining-batches.json',*sorted(B.iterdir())]
ident=[]
for p in inputs:
 t=O/'inputs'/p.relative_to(R); t.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,t);ident.append({'path':str(p.relative_to(R)),'sha256':sha(p)})
(O/'inputs.json').write_text(json.dumps(ident,indent=2)+'\n')
for name,args in [('head',['git','rev-parse','HEAD']),('tree',['git','rev-parse','HEAD^{tree}']),('status',['git','status','--porcelain=v1']),('diff',['git','diff','--binary'])]:
 (O/(name+'.txt')).write_bytes(subprocess.check_output(args))
j=json.loads((B/'source-field-definitions.json').read_text()); rows=j['rows']; originals=json.loads((D/'candidate-dispositions.json').read_text())['candidates']; originals={x['id']:x for x in originals};qpath=R/j['priorQueueRef']['path'];q=json.loads(qpath.read_text());qid=next(x['candidateIds'] for x in q['bySource'] if x['source']=='charts/kubeclaw/templates/configmap-gateway.yaml')
pins=[]
for row in rows:
 for key in ['sourceRef','actualRendererReaderRef','currentStartupReaderRefs','startupDeliveryRefs']:
  refs=row[key] if isinstance(row[key],list) else [row[key]]
  for r in refs:
   p=R/r['path'];lines=p.read_text().splitlines();pins.append({'candidateId':row['candidateId'],'kind':key,'path':r['path'],'line':r['line'],'hashMatches':sha(p)==r['sha256'],'expressionMatches':lines[r['line']-1]==r['expression']})
checks={'candidateCount':len(rows),'uniqueCandidateCount':len({r['candidateId'] for r in rows}),'queueIdsExactlyMatch':set(qid)=={r['candidateId'] for r in rows},'originalBodiesPreserved':sum(r['originalCandidate']==originals[r['candidateId']] for r in rows),'priorQueueDigestMatches':sha(qpath)==j['priorQueueRef']['sha256'],'pinCount':len(pins),'allPinsMatch':all(x['hashMatches'] and x['expressionMatches'] for x in pins),'manifestFiles':[{**r,'matches':sha(R/r['path'])==r['sha256']} for r in json.loads((B/'package-manifest.json').read_text())['files']],'allRowsUnaccepted':all(r['definitionAccepted'] is False and r['runtimeResult']=='not-run' for r in rows),'commandsReaderRefMeaning':{r['candidateId']:r['currentStartupReaderRefs'] for r in rows if r['sourceRef']['line'] in [190,192]}}
(O/'checks.json').write_text(json.dumps(checks,indent=2)+'\n');(O/'pins.json').write_text(json.dumps(pins,indent=2)+'\n');print(json.dumps({k:v for k,v in checks.items() if k not in ['commandsReaderRefMeaning','manifestFiles']},indent=2));print('manifest:',all(x['matches'] for x in checks['manifestFiles']))
