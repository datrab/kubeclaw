"""Immutable historical changed-input refs plus exact current controller definition-case links."""
import pathlib,json,hashlib,subprocess
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(repo));write=lambda p,v:p.write_text(json.dumps(v,indent=2)+'\n')
oldPath=rel(out/'controller-target-case-specifications-20261013.json');baseline='6606af9e590032f328f330ecb3d953b1eef027e3';blob=subprocess.check_output(['git','show',baseline+':'+oldPath],cwd=repo);folder=out/'snapshots/controller-committed-changed-input-6606af9-20261013';folder.mkdir(exist_ok=True);old=folder/'controller-target-case-specifications-20261013.json'
if not old.exists():old.write_bytes(blob)
assert old.read_bytes()==blob
write(folder/'identity.json',{'scope':'exact committed changed input only, not repeated entire fragments; SHA verified git blob source for historical coordinate controls','commit':baseline,'originalPath':oldPath,'localPath':rel(old),'sha256':sha(old)})
cs=json.loads((out/'proposed-cases.json').read_text());names=['controller-original-epoch-fixture-identities-6606af9-20261013.json','controller-original-epoch-serialization-schema-6606af9-20261013.json'];ident=json.loads((out/names[0]).read_text());names+=[str(pathlib.Path(x['path']).relative_to(out.relative_to(repo))) for x in ident['files']]
for c in cs:
 if c['id']=='DLV-CASE-CONTROLLER-RESPONSE-EPOCH-CONTRACT':
  for name in names:c['specDigests'][rel(out/name)]=sha(out/name)
  c['fieldSpecificationRefs']=sorted(set(c['fieldSpecificationRefs']+[rel(out/names[0])]))
write(out/'proposed-cases.json',cs)
# Raw controls are immutable when source hashes drift; export never silently blesses a different input.
records=[];rows=json.loads((out/'inventory-fragment.json').read_text())['rows'];settingIds=[r['id'] for r in rows if r['source']['path'].startswith('cmd/buster-namespace-controller/')]
for control,prefix,command in [('controller-domain-response-controls-6606af9-20261013.json','controller-domain-response-controls-6606af9-20261013-frozen-scope','node check-controller-domain-response-6606af9-20261013.cjs'),('controller-epoch-serialization-controls-6606af9-20261013.json','controller-epoch-serialization-controls-6606af9-20261013-final','node check-controller-epoch-serialization-6606af9-20261013.cjs')]:
 p=out/control;v=json.loads(p.read_text());digests=v['sourceDigests']
 for file,h in digests.items():assert sha(repo/file)==h,'Changed control input: '+file
 for r in v['records']:records.append({'id':r['id'],'settingIds':settingIds,'requirementIds':['C0-A','C0-C'],'command':command+' (actual pure control, no native effects)','result':r['result'],'scope':v['scope'],'sourceDigests':{**digests,rel(p):sha(p)},'testDigests':{},'rawEvidencePath':[rel(p),rel(out/(prefix+'.stdout')),rel(out/(prefix+'.stderr'))],'observation':r,'reviewerConfirmation':'pending','acceptance':'NOT ACCEPTED; own definition/committed defect detection/serialization/coordinate controls only; not native/authentication/API/grant/capacity/activation proof'})
write(out/'c0-controller-definition-cases-6606af9-20261013.json',records)
print(json.dumps({'actualPureControllerObservations':len(records),'results':{s:sum(r['result']==s for r in records) for s in ['passed','failed']},'meaning':'source/type/schema/serialized-synthetic arithmetic only; no native acceptance'}))
