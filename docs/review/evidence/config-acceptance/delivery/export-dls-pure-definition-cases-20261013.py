"""Export frozen actual pure observations; future implementation cases remain not-run."""
import pathlib,json,hashlib
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(repo))
result=[]
inputs=[('gateway-target-primitive-controls-20261013.json','node check-gateway-target-primitives-20261013.cjs','gateway-target-primitive-controls-20261013-observer2'),('native-host-target-definition-controls-20261013.json','node check-native-host-target-definition-20261013.cjs','native-host-target-definition-controls-20261013'),('ops-pure-reader-controls-20261013.json','node check-ops-pure-readers-20261013.mjs','ops-pure-reader-controls-20261013'),('target-profile-coordinate-controls-20261013.json','python3 check-target-profile-coordinates-20261013.py','target-profile-coordinate-controls-20261013-final-milestone')]
for name,cmd,prefix in inputs:
 d=json.loads((out/name).read_text())
 for r in d['records']:
  ident=r['id'];sid=r.get('settingId');sources=dict(d.get('sourceDigests',{}));sources[rel(out/name)]=sha(out/name)
  if 'program' in d:sources[d['program']['path']]=d['program']['sha256']
  for key,hkey in [('profilePath','profileSha256'),('sourceSpecPath','sourceSpecSha256')]:
   if key in r:sources[r[key]]=r[hkey]
  raw=[rel(out/name),rel(out/(prefix+'.stdout')),rel(out/(prefix+'.stderr'))]
  result.append({'id':'DLV-C0-DLS-OBS-'+ident,'settingIds':[sid] if sid else [],'requirementIds':['C0-A','C0-C'],'command':cmd+' (cwd evidence directory; actual recorded pure observation, not future harness)','result':r['result'],'scope':r.get('scope',d.get('scope',d.get('method'))),'sourceDigests':sources,'testDigests':{},'rawEvidencePath':raw,'observation':r,'reviewerConfirmation':'pending','acceptance':'NOT ACCEPTED; own primitive/type/coordinate/current pure constructor only, no native model/account/API/host/image/process effects'})
failed=out/'snapshots/dls-chart-timezone-coordinate-attempt1/target-profile-coordinate-controls-20261013.json';d=json.loads(failed.read_text())
for r in d['records']:
 if r['result']!='failed':continue
 result.append({'id':'DLV-C0-DLS-INITIAL-COORD-'+r['id'],'settingIds':[r['settingId']],'requirementIds':['C0-C'],'command':'python3 check-target-profile-coordinates-20261013.py (retained first failed source/profile descriptor control)','result':'failed','scope':'wrong ambient timezone mapped as authored coordinate/family; diagnostic collection failure, NOT semantic negative kill; corrected proposed backup.timeZone remains current Chart unsupported','sourceDigests':{rel(failed):sha(failed)},'testDigests':{},'rawEvidencePath':[rel(failed),rel(failed.parent/'target-profile-coordinate-controls-20261013-attempt1.stdout'),rel(failed.parent/'target-profile-coordinate-controls-20261013-attempt1.stderr')],'observation':r,'reviewerConfirmation':'pending','acceptance':'NOT ACCEPTED; historical failure retained'})
f=out/'c0-dls-pure-definition-cases-20261013.json';f.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'actualPureObservations':len(result),'passed':sum(r['result']=='passed' for r in result),'failed':sum(r['result']=='failed' for r in result),'scope':'pure primitive/constructor/coordinate only; no runtime or independent acceptance'}))
