from pathlib import Path
import json,hashlib,gzip,subprocess
root=Path.cwd();out=Path(__file__).parent;old=root/'docs/review/evidence/config-acceptance/independent-historical-mapping-guard-recheck-6606';f=json.loads((old/'input-freeze.json').read_text());a='docs/review/evidence/config-acceptance/author/';prep=a+'historical-projection-preparation-6606.json';j=json.loads((root/prep).read_text());sha=lambda b:hashlib.sha256(b).hexdigest();canon=lambda v:sha(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode());paths={a+'historical_mapping.py',prep,j['guardRecheck']['path']}|{x['path'] for x in j['currentInputs']}|{x['path'] for x in f['rawInputs'] if not x['path'].startswith(a)}|{j['priorScripts']+'/'+name for name in ['consolidate.py','check-matrix.py','check-native-case-integration.py']};raw=[]
for x in j['currentInputs']:assert sha((root/x['path']).read_bytes())==x['sha256']
for path in sorted(paths):
 b=(root/path).read_bytes();q=out/'inputs'/path;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);raw.append({'path':path,'sha256':sha(b),'snapshot':str(q.relative_to(root))})
sel=[]
for x in f['selectedInputs']:
 v=json.loads((root/x['path']).read_text());key='rows' if x['path'].endswith('inventory-fragment.json') else 'cases';v=v if isinstance(v,list) else v[key];v=[z for z in v if z['id'] in set(x['selectionIds'])];assert canon(v)==x['selectedCanonicalSha256'];q=out/Path(x['snapshot']).name;q.write_text(json.dumps(v,indent=2)+'\n');sel.append({**x,'snapshot':str(q.relative_to(root))})
bas=[]
for path in ['docs/review/remediation/config-acceptance-matrix.json','docs/review/remediation/config-semantic-inventory.json','docs/review/evidence/config-acceptance/runtime/case-proposals.json']:
 b=subprocess.check_output(['git','show',f['baselineCommit']+':'+path]);q=out/'baseline'/path;q=q.with_suffix(q.suffix+'.gz');q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(gzip.compress(b,mtime=0));bas.append({'path':path,'sha256':sha(b),'snapshot':str(q.relative_to(root)),'immutableCommit':f['baselineCommit'],'currentLiveSha256':sha((root/path).read_bytes())})
(out/'input-freeze.json').write_text(json.dumps({'scope':'NONAUTHORED historical projection preparation code/guards; ungenerated final root excluded','baselineCommit':f['baselineCommit'],'rawInputs':raw,'selectedInputs':sel,'immutableBaselineInputs':bas,'priorGuardReportSha256':j['guardRecheck']['sha256']},indent=2)+'\n');print('raw',len(raw),'baseline',len(bas))
