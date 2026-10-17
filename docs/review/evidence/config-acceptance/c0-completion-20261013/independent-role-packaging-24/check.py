"""Independent read-only bounded package conservation/pin checker; no author imports."""
from pathlib import Path
import hashlib,json,subprocess,collections
R=Path.cwd(); O=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/independent-role-packaging-24'
P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery'; B=P/'batch-32'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
d=json.loads((B/'source-field-definitions.json').read_text()); rows=d['rows']; ids=[r['candidateId'] for r in rows]
originals={r['id']:r for r in json.loads((P/'candidate-dispositions.json').read_text())['candidates']}
q=json.loads((P/'batch-24/remaining-batches.json').read_text()); sources={r['sourceRef']['path'] for r in rows}
expected=set().union(*(set(x['candidateIds']) for x in q['bySource'] if x['source'] in sources))
assert len(ids)==len(set(ids))==28 and set(ids)==expected
pins=[]
for row in rows:
 assert row['originalCandidate']==originals[row['candidateId']]
 assert row['runtimeResult']=='not-run' and row['definitionAccepted'] is False
 for ref in [row['sourceRef'],row['actualReaderRef'],*row['productiveCallerRefs']]:
  p=R/ref['path']; lines=p.read_text().splitlines()
  assert sha(p)==ref['sha256'] and lines[ref['line']-1]==ref['expression'] and ref['expression'].strip()
  pins.append(ref)
 assert row['sourceRef']['sha256']==row['originalCandidate']['sourceSha256']
manifest=json.loads((B/'package-manifest.json').read_text())
for f in manifest['files']: assert sha(R/f['path'])==f['sha256']
assert manifest['acceptance'] is None
assert sha(R/d['priorQueueRef']['path'])==d['priorQueueRef']['sha256']
assert d['remainingQueueUnchanged'] is True and d['globalC0Accepted'] is False
extra=['docs/review/remediation/GOAL-START.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md','packaging/runtime/roles/nova.json','packaging/runtime/roles/prism.json','packaging/runtime/external-capabilities.json','skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs','skills/buster/plugins/coverage-budget/plugin.json','skills/buster/plugins/size-budget/plugin.json','package.json','scripts/updates/runtime-inputs.mjs','scripts/updates/code-release.mjs','tests/verification/contracts/check-prism-runtime-role.mts']
paths=sorted({ref['path'] for ref in pins}|set(extra)|{str(f.relative_to(R)) for f in B.iterdir() if f.is_file()}|{str((P/'candidate-dispositions.json').relative_to(R)),d['priorQueueRef']['path']})
result={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'originalBodiesPreserved':28,'exactExpectedIdsMatched':True,'pinsMatched':len(pins),'sourceCounts':dict(collections.Counter(r['sourceRef']['path'] for r in rows)),'candidateIds':ids,'identities':[{'path':p,'sha256':sha(R/p)} for p in paths],'scope':'static bounded source inventory review only','materialFindings':[],'verdict':'accepted at bounded source-definition scope only','globalC0Accepted':False,'runtimeResult':'not-run','implementationAuthorization':None}
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
(O/'worktree-status.txt').write_text(subprocess.check_output(['git','status','--porcelain=v1'],text=True))
(O/'tracked.patch').write_bytes(subprocess.check_output(['git','diff','--binary']))
print(json.dumps({k:result[k] for k in ['head','tree','originalBodiesPreserved','exactExpectedIdsMatched','pinsMatched','sourceCounts','verdict']}))
