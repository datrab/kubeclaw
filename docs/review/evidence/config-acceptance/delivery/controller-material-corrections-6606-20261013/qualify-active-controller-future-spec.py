"""Explicit active supersession on future spec; historical old body never silently reactivated."""
import pathlib,json,hashlib
out=pathlib.Path(__file__).resolve().parent;delivery=out.parent;repo=delivery.parents[4];p=delivery/'future-case-invocation-specifications-20261013.json';spec=json.loads(p.read_text());cases=json.loads((delivery/'proposed-cases.json').read_text());byid={c['id']:c for c in cases};linked=[]
for r in spec['records']:
 c=byid[r['id']]
 if c.get('materialCorrectionSupersession'):
  r['activeControllerMaterialCorrection']=c['materialCorrectionSupersession'];r['activeControllerMaterialCorrection']['precedence']='new corrected contracts/schema and12native-case-contracts override ONLY named DCTRL01/02/03 defective prior instructions. Preserved older timestamp rebasing and old6native-complete summary characterization are HISTORICAL-INACTIVE, never executable setup or positive witness. Unaffected old34source-scoped obligations remain NOTRUN.';linked.append(r['id'])
p.write_text(json.dumps(spec,indent=2)+'\n');h=hashlib.sha256(p.read_bytes()).hexdigest();relative=str(p.relative_to(repo))
for c in cases:c['specDigests'][relative]=h
(delivery/'proposed-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print('Explicit active corrected definition precedence on',len(linked),'canonical future containers; all future NOTRUN')
