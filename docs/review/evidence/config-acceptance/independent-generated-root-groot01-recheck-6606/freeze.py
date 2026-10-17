from pathlib import Path
import json,hashlib,gzip
root=Path.cwd();p=Path(__file__).parent;prev=root/'docs/review/evidence/config-acceptance/independent-generated-root-projection-6606';old=json.loads((prev/'input-freeze.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest();a='docs/review/evidence/config-acceptance/author/';receipt=a+'groot-01-core-body-correction-6606-freeze.json';c=json.loads((root/receipt).read_text());paths={x['path'] for x in old['rawInputs']}|{receipt,c['originalIndependentReport']['path']}|{x['path'] for x in c['currentFrozenFiles']};pres=[]
for name in ['check-matrix.py','check-generated-projection-negatives-6606.py','generated-root-historical-core-6606-freeze.json']:
 original=a+name;saved=a+'before-groot-01-core-body-conservation-6606/'+name;x=next(x for x in old['rawInputs'] if x['path']==original);assert sha((root/saved).read_bytes())==x['logicalSha256'];pres.append({'original':original,'saved':saved,'sha256':x['logicalSha256']});paths.add(saved)
for x in c['currentFrozenFiles']+c['unchangedRootFiles']:assert sha((root/x['path']).read_bytes())==x['sha256']
assert sha((root/c['originalIndependentReport']['path']).read_bytes())==c['originalIndependentReport']['sha256'];entries=[]
for path in sorted(paths):
 b=(root/path).read_bytes();q=p/'inputs'/path;q.parent.mkdir(parents=True,exist_ok=True);encoding='gzip' if len(b)>1000000 else 'identity';encoded=gzip.compress(b,mtime=0) if encoding=='gzip' else b
 if encoding=='gzip':q=q.with_suffix(q.suffix+'.gz')
 q.write_bytes(encoded);entries.append({'path':path,'logicalSha256':sha(b),'logicalBytes':len(b),'snapshot':str(q.relative_to(root)),'snapshotEncoding':encoding,'storedSha256':sha(encoded)})
priorDeps=json.loads((prev/'opened-input-union.json').read_text())['inputs'];changes=[]
for x in priorDeps:
 h=sha((root/x['path']).read_bytes())
 if h!=x['sha256']:changes.append({'path':x['path'],'old':x['sha256'],'new':h})
assert {x['path'] for x in changes}=={a+'check-matrix.py'}
(p/'input-freeze.json').write_text(json.dumps({'scope':'GROOT01 projection guard material correction only; no substantive Core semantics or global C0','rawInputs':entries,'preservedPreviousCodeVerified':pres,'priorDependencyChanges':changes,'unchangedRootFiles':c['unchangedRootFiles'],'originalReviewSha256':c['originalIndependentReport']['sha256']},indent=2)+'\n');print('raw',len(entries),'priorDependencyChanges',len(changes))
