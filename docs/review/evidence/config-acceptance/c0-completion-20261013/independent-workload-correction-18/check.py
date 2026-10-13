import hashlib,json,re,subprocess
from pathlib import Path
R=Path.cwd(); E=Path('docs/review/evidence/config-acceptance/c0-completion-20261013'); O=R/E/'independent-workload-correction-18'; inputs=set()
def read(p):
 p=Path(p); inputs.add(str(p)); return (R/p).read_bytes()
def load(p):return json.loads(read(p))
def digest(b):return hashlib.sha256(b).hexdigest()
def put(n,v):(O/n).write_text(json.dumps(v,indent=2)+'\n')
a=load(E/'delivery/batch-25/source-field-definitions.json'); b=load(E/'delivery/batch-26/source-field-definitions.json')
report=read(E/'independent-workload-inventory-17/REPORT.md').decode(); read('docs/review/remediation/GOAL-START.md'); read('docs/review/remediation/OPENCLAW-CONFIG-GOAL.md')
expected=re.findall(r'SRC-[0-9a-f]{16}',report.split('All 23 expected IDs are retained verbatim as bodies and IDs: ')[1].split('\n')[0])
checks={}; checks['expected23IdsUnique']=len(expected)==len(set(expected))==23
checks['idsExactlyPreserved']=[x['candidateId'] for x in a['rows']]==[x['candidateId'] for x in b['rows']]==expected
checks['original23BodiesPreserved']=all(x['originalCandidate']==y['originalCandidate'] and x['originalCandidateSha256']==y['originalCandidateSha256']==digest(json.dumps(y['originalCandidate'],sort_keys=True,separators=(',',':')).encode()) for x,y in zip(a['rows'],b['rows']))
checks['sixOldManifestPinsMatch']=[]
for pin in load(E/'delivery/batch-25/package-manifest.json')['files']:
 current=read(pin['path']); frozen=read(E/'independent-workload-inventory-17/reviewed-package'/Path(pin['path']).name)
 checks['sixOldManifestPinsMatch'].append({'path':pin['path'],'matches':digest(current)==pin['sha256']==digest(frozen)})
checks['oldManifestItselfUnchanged']=read(E/'delivery/batch-25/package-manifest.json')==read(E/'independent-workload-inventory-17/reviewed-package/package-manifest.json')
checks['review17FrozenPinsMatch']=[{'path':p['path'],'matches':digest(read(p['path']))==p['sha256']} for p in load(E/'independent-workload-inventory-17/frozen-identities.json')]
checks['batch26ManifestPinsMatch']=[{'path':p['path'],'matches':digest(read(p['path']))==p['sha256']} for p in load(E/'delivery/batch-26/package-manifest.json')['files']]
checks['supersedesDefinitionPinMatches']=b['supersedesDefinitionRef']=={'path':str(E/'delivery/batch-25/source-field-definitions.json'),'sha256':digest(read(E/'delivery/batch-25/source-field-definitions.json'))}
changed=[y['candidateId'] for x,y in zip(a['rows'],b['rows']) if x!=y]
checks['onlyFourExpectedRowsChanged']=changed==['SRC-61a34b698eb6c0ba','SRC-4c6b76f7a12d287c','SRC-336010687eecb339','SRC-031d2d94167393f9']
checks['changedRows']=changed
refs=[]
def visit(v):
 if isinstance(v,dict):
  if {'path','line','expression','sha256'}<=v.keys() and v['path'].startswith('charts/'):
   data=read(v['path']); refs.append({'path':v['path'],'line':v['line'],'wholeFileMatches':digest(data)==v['sha256'],'expressionMatches':data.decode().splitlines()[v['line']-1]==v['expression']})
  for item in v.values():visit(item)
 elif isinstance(v,list):
  for item in v:visit(item)
visit(b); checks['chartSourceAndReaderRefs']=refs
rows={r['candidateId']:r for r in b['rows']}
checks['correctReaderLines']=all(rows[i]['actualReaderRef']['line']==line and rows[i]['actualReaderRef']['path']=='charts/prism/templates/workloads.yaml' and rows[i]['nativeConsumptionProven'] is False for i,line in [('SRC-4c6b76f7a12d287c',138),('SRC-336010687eecb339',166),('SRC-031d2d94167393f9',167)])
checks['runtimeResultsRemainNotRun']=all(r['runtimeResult']=='not-run' and r['definitionAccepted'] is False for r in b['rows']) and b['globalC0Accepted'] is False
checks['annotationEnvelopeTruthTable']=[{'role':role,'spiffeEnabled':enabled,'envelope':(enabled and role in ('control','worker')) or role in ('control','worker','studio'),'swarmChecksum':True,'workerPolicy':role=='worker','trustChecksum':enabled and role in ('control','worker')} for role in ('control','studio','worker') for enabled in (False,True)]
# Derived Boolean evaluation supplements, but does not replace, the read template expressions.
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip()
put('checks.json',checks)
put('input-identities.json',{'reviewer':'/root/workload_correction_recheck_18','head':head,'tree':tree,'identityScope':'Exact bounded file bytes; no full dirty-tree identity claimed','inputs':[{'path':p,'sha256':digest((R/p).read_bytes())} for p in sorted(inputs)]})
print(json.dumps(checks,indent=2))
