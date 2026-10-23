"""Actual pure coordinate/TOML controls; no native vendor or Kubernetes semantic validation."""
import pathlib,json,hashlib,tomllib
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for source in ['codex-target-case-specifications-20261013.json','chart-kubernetes-target-case-specifications-20261013.json','chart-secret-target-case-specifications-20261013.json','ops-supervisor-target-case-specifications-20261013.json']:
 spec=json.loads((out/source).read_text())
 for field in spec['fields']:
  profiles=field.get('profileFiles',field.get('completeProfiles'))
  for name,p in profiles.items():
   path=repo/p['path'];raw=path.read_bytes();value=tomllib.loads(raw.decode()) if path.suffix=='.toml' else json.loads(raw);found=True
   try:
    for key in field.get('profileCoordinate',field['field']).split('.'):value=value[key]
   except (KeyError,TypeError):found=False;value=None
   result='passed' if found and sha(path)==p['sha256'] else 'failed'
   records.append({'id':field['settingId']+'-'+name,'settingId':field['settingId'],'result':result,'scope':'pure full definition profile parses and exact authored coordinate exists, SHA matches; NOT native/API quantity/domain/effect or physical/credential/provider acceptance','profilePath':p['path'],'profileSha256':sha(path),'sourceSpecPath':str((out/source).relative_to(repo)),'sourceSpecSha256':sha(out/source),'field':field['field'],'valueType':type(value).__name__,'firstBoundary':None})
artifact={'method':'Python standard tomllib/json exact field coordinate+SHA checks, no sockets/native/API/host/business commands','program':{'path':str(pathlib.Path(__file__).relative_to(repo)),'sha256':sha(pathlib.Path(__file__))},'records':records,'result':'passed' if all(x['result']=='passed' for x in records) else 'failed','acceptance':'NOT ACCEPTED; shape/coordinate only'}
(out/'target-profile-coordinate-controls-20261013.json').write_text(json.dumps(artifact,indent=2)+'\n');print(json.dumps({'observations':len(records),'failed':[r['id'] for r in records if r['result']!='passed'],'scope':artifact['method']}));raise SystemExit(artifact['result']!='passed')
