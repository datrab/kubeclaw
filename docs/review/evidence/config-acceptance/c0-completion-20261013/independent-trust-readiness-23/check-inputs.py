"""Independent static JSON/source identity audit; never invokes author tooling."""
import hashlib,json,pathlib,subprocess,shutil
root=pathlib.Path.cwd(); out=root/'docs/review/evidence/config-acceptance/c0-completion-20261013/independent-trust-readiness-23'
base='docs/review/evidence/config-acceptance/c0-completion-20261013/'
p=base+'delivery/batch-31/source-field-definitions.json'; j=json.loads((root/p).read_text()); rows=j['rows']
ledgerp='docs/review/evidence/config-acceptance/author/candidate-ledger.json'; ledger=json.loads((root/ledgerp).read_text())['candidates']; indexed={r['id']:r for r in ledger}
dispositionp=base+'delivery/candidate-dispositions.json'; original={r['id']:r for r in json.loads((root/dispositionp).read_text())['candidates']}
qp=j['priorQueueRef']['path']; queue=json.loads((root/qp).read_text()); paths={r['sourceRef']['path'] for r in rows}
expected={r['id'] for r in ledger if r['source'] in paths}; queueids={i for s in queue['bySource'] if s['source'] in paths for i in s['candidateIds']}; ids=[r['candidateId'] for r in rows]
checks=[]; inputs={p,ledgerp,dispositionp,qp,base+'delivery/batch-31/package-manifest.json',base+'delivery/batch-31/README.md',base+'delivery/batch-31/local-check.json','docs/review/remediation/GOAL-START.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md'}
def sha(p):return hashlib.sha256((root/p).read_bytes()).hexdigest()
def check(name,ok,**more):checks.append(dict(check=name,passed=bool(ok),**more))
check('24 unique original IDs; exhaustive exact four-source ledger and queue set',len(ids)==len(set(ids))==24 and set(ids)==expected==queueids,ids=ids,ledgerCount=len(expected),queueCount=len(queueids))
check('queue digest pin',sha(qp)==j['priorQueueRef']['sha256'])
refs=0
for r in rows:
 check('original full candidate body '+r['candidateId'],r['originalCandidate']==original[r['candidateId']])
 check('ledger discovery fields conserved '+r['candidateId'],all(r['originalCandidate'][k]==v for k,v in indexed[r['candidateId']].items() if k!='reason'))
 check('original source digest '+r['candidateId'],sha(r['originalCandidate']['source'])==r['originalCandidate']['sourceSha256'])
 for ref in [r['sourceRef'],r['actualRendererReaderRef']]+r['deliveryOrHelperCallerRefs']:
  inputs.add(ref['path']); lines=(root/ref['path']).read_text().splitlines(); ok=sha(ref['path'])==ref['sha256'] and lines[ref['line']-1]==ref['expression']; refs+=1
  check('expression/digest pin',ok,candidateId=r['candidateId'],path=ref['path'],line=ref['line'])
 check('no native/definition acceptance '+r['candidateId'],r['definitionAccepted'] is False and r['nativeConsumerProven'] is False and r['runtimeResult']=='not-run')
man=json.loads((root/(base+'delivery/batch-31/package-manifest.json')).read_text())
for ref in man['files']:
 inputs.add(ref['path']);check('manifest pin '+ref['path'],sha(ref['path'])==ref['sha256'])
inputs.update(['charts/kubeclaw/templates/_helpers.tpl','charts/kubeclaw/values.yaml','charts/prism/values.yaml','charts/prism/values.schema.json','charts/prism/templates/serviceaccounts.yaml','charts/kubeclaw/templates/service.yaml','charts/prism/templates/services.yaml'])
check('global acceptance remains false/null',j['globalC0Accepted'] is False and man['acceptance'] is None)
result={'scope':'Independent static source/body/queue/pin review of batch-31 only','command':'python3 '+str(out.relative_to(root))+'/check-inputs.py','expressionPinsChecked':refs,'checks':checks,'allPassed':all(c['passed'] for c in checks),'runtimeResult':'not-run','globalC0Accepted':False}
(out/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
identity={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),'inputs':[{'path':x,'sha256':sha(x),'bytes':(root/x).stat().st_size} for x in sorted(inputs)],'note':'Dirty/untracked inputs are identified by exact file digests; no acceptance derived from HEAD alone.'}
for path in sorted(inputs):
 target=out/'inputs'/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/path,target)
(out/'tracked-input.patch').write_text(subprocess.check_output(['git','diff','HEAD','--']+sorted(inputs),text=True))
(out/'input-status.txt').write_text(subprocess.check_output(['git','status','--short','--']+sorted(inputs),text=True))
(out/'input-identities.json').write_text(json.dumps(identity,indent=2)+'\n')
print(json.dumps({'allPassed':result['allPassed'],'checks':len(checks),'expressionPinsChecked':refs,'candidates':len(ids)}))
