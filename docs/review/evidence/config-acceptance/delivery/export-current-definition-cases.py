"""Export actual source-definition observations; never implementation acceptance."""
import pathlib,json,hashlib,copy
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4]
def read(n):return json.loads((out/n).read_text())
def write(n,v):(out/n).write_text(json.dumps(v,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
obs=read('kubernetes-boundary-definition.json');rows=read('inventory-fragment.json')['rows'];old={c['id']:c for c in read('c0-kubernetes-boundary-cases.json')};base=next(iter(old.values()));cases=[]
overlay=[r['id'] for r in rows if r['id'].startswith('DLV-CHART-KUBECLAW-GATEWAY-RESOURCES')]
lease=['DLV-NAMESPACE-CONTROLLER-BUSTER-LEASE-API-GROUP','DLV-NAMESPACE-CONTROLLER-BUSTER-LEASE-API-VERSION']
for r in obs['records']:
 c=copy.deepcopy(old.get(r['id'],base));c.update(r)
 if r['id'] not in old:
  c['settingIds']=lease if 'CRD-ALIAS' in r['id'] else overlay
 if 'RESOURCE-PROJECTION' in r['id']:c['settingIds']=sorted({x['settingId'] for x in obs['resourceProjectionComparisons']})
 if 'BUSTER' in r['id'] and 'CRD-ALIAS' not in r['id']:c['settingIds']=sorted(set(c['settingIds'])|set(overlay))
 c.update(sourceDigests=obs['sourceAndCommandDigests'],inputProfile=obs['profileDigests'],testDigests={str((out/'run-kubernetes-boundary-definition.py').relative_to(repo)):sha(out/'run-kubernetes-boundary-definition.py')},toolDependencyImageConfigIdentities=obs['tools'],rawEvidencePath=r['rawEvidencePaths'],limits='Pinned releases are verification-reader identities, not deployed API/feature gates. Current whole Buster strict schema cases now collect all21 documents with zero skips using exact primary VAP/Binding and ref-only strict canonical CRD alias; historical missing-schema failures remain archived. API/defaulting/admission/CEL/runtime acceptance and all proposed implementation cases remain not-run.',productiveCaller='current Helm merged schema/helper/templates; offline exact selected primary standalone strict schema tree plus $ref-only canonical CRD alias; no network fallback',expectedEffectOrBoundary='exact recorded current-source exit/diagnostic; positive schema cases require all documents valid with no errors/skips; CRD negative cases require exactly one collected invalid document. Partial gateway map permissiveness is a current counterexample, not target acceptance.')
 if 'CRD-ALIAS' in r['id']:c['authorDisposition']='DLV lease group/version are reader aliases only; primary shared lease author belongs CMP buster-engine.'
 cases.append(c)
write('c0-kubernetes-boundary-cases.json',cases)
c=read('buster-build-version-projection-check.json');c.update(requirementIds=['C0-A','C0-B','C0-C'],settingIds=[r['id'] for r in rows if r['owner']=='image-buster-runtime'],rawEvidencePath=[c['rawEvidencePath']],reviewerConfirmation='pending',productiveCaller='scripts/versions.mjs --check verifies declared generated source/lock projections only',observerMethod='retained stdout and exit0; checked44/changed[] and inputs4/locks5; no Docker download/image/receipt observation',inputProfile='unchanged current versions.json and lock inputs; no build-arg overrides or source mutations',priorState='unchanged productive source and tests',expectedEffectOrBoundary='current generated declarations match source pins; real platform build/download/native receipts remain prerequisites')
write('c0-buster-build-definition-cases.json',[c])
print('Exported',len(cases),'current Kubernetes observations and one source version-projection observation; not acceptance')
