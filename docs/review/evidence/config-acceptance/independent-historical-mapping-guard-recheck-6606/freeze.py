from pathlib import Path
import json,hashlib
root=Path.cwd();out=root/'docs/review/evidence/config-acceptance/independent-historical-mapping-guard-recheck-6606';prior=root/'docs/review/evidence/config-acceptance/independent-historical-mapping-guard-6606';old=json.loads((prior/'input-freeze.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest();canon=lambda j:sha(json.dumps(j,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode());a='docs/review/evidence/config-acceptance/author/';cor=a+'historical-mapping-hmap-guard-01-correction-6606.json';c=json.loads((root/cor).read_text());preservation=[]
for x in c['preservedOriginalInputs']:
 b=(root/x['preservedPath']).read_bytes();assert sha(b)==x['sha256'];assert x['sha256']==next(v['sha256'] for v in old['rawInputs'] if v['path']==x['originalPath']);preservation.append(x)
prep=a+'historical-mapping-before-hmap-guard-01-6606/historical-mapping-guard-preparation-6606.json';assert sha((root/prep).read_bytes())==next(v['sha256'] for v in old['rawInputs'] if v['path']==a+'historical-mapping-guard-preparation-6606.json')
for x in c['currentInputs']:assert sha((root/x['path']).read_bytes())==x['sha256']
assert sha((root/c['priorIndependentReport']['path']).read_bytes())==c['priorIndependentReport']['sha256']
paths=sorted({v['path'] for v in old['rawInputs']}|{cor,prep,c['priorIndependentReport']['path']}|{x['preservedPath'] for x in c['preservedOriginalInputs']}|{x['path'] for x in c['currentInputs']});raw=[]
for path in paths:
 b=(root/path).read_bytes();q=out/'inputs'/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);raw.append({'path':path,'sha256':sha(b),'bytes':len(b),'snapshot':str(q.relative_to(root))})
selected=[]
for x in old['selectedInputs']:
 j=json.loads((root/x['path']).read_text());key='rows' if x['path'].endswith('inventory-fragment.json') else 'cases';items=j if isinstance(j,list) else j[key];v=[z for z in items if z['id'] in set(x['selectionIds'])];assert canon(v)==x['selectedCanonicalSha256'];q=out/Path(x['snapshot']).name;q.write_text(json.dumps(v,indent=2)+'\n');selected.append({**x,'snapshot':str(q.relative_to(root))})
ids=json.loads((root/'docs/review/remediation/config-acceptance-matrix.json').read_text())['cases'];assert canon(sorted(z['id'] for z in ids))==old['canonicalIdSetSha256'];(out/'canonical-ids.json').write_text(json.dumps([z['id'] for z in ids],indent=2)+'\n')
f={'scope':'Independent HMAP-GUARD-01 correction material recheck only; no root projection/Core selfreview','baselineCommit':old['baselineCommit'],'rawInputs':raw,'selectedInputs':selected,'canonicalIdSetSha256':old['canonicalIdSetSha256'],'historicalPreservationVerified':7,'priorReportSha256':c['priorIndependentReport']['sha256'],'selectedInputsEqualOriginalReview':True};(out/'input-freeze.json').write_text(json.dumps(f,indent=2)+'\n');print('raw',len(raw),'preserved',7)
