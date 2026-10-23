from pathlib import Path
import json,hashlib,subprocess,tarfile,gzip,io,datetime
R=Path.cwd();B=Path('docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions');D=Path('docs/review/evidence/config-acceptance/independent-core-canonical-question-6606');H=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();load=lambda p:json.loads(Path(p).read_text());assert H(B/'canonical-question-fragment.json')=='f4b51f0a738a51ae622de8af2b0db69282c25eb27a97b251bf0f1ed8f6c5344a';assert H(B/'stable-author-batch-summary.json')=='6f47c5f8fcffa43fa7bd25fad3a227d838bcfa42e6efeefc71b2ed80961c9b12'
files={str(p):H(p)for p in B.rglob('*')if p.is_file()};sources={x['path']:x['sha256']for x in load(B/'source-default-env-cli-projection.json')['sources']}
def scan(x):
 if isinstance(x,dict):
  if isinstance(x.get('path'),str)and isinstance(x.get('sha256'),str)and Path(x['path']).is_file():sources[x['path']]=x['sha256']
  for v in x.values():scan(v)
 elif isinstance(x,list):
  for v in x:scan(v)
for p in B.glob('*.json'):scan(load(p))
for p,h in sources.items():assert H(p)==h,(p,h,H(p))
protected=load(B/'protected-input-identities.json')['inputs'];base='6606af9e590032f328f330ecb3d953b1eef027e3'
for x in protected:assert H(x['path'])==x['sha256']==hashlib.sha256(subprocess.check_output(['git','show',base+':'+x['path']])).hexdigest()
owned={str(Path('docs/review/evidence/config-acceptance/runtime')/n):H(Path('docs/review/evidence/config-acceptance/runtime')/n)for n in ['README.md','inventory-fragment.json','case-proposals.json','runtime-case-dispositions.json']};buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w')as t:
 for p in sorted(set(files)|set(sources)):t.add(p,arcname=p,recursive=False)
raw=buf.getvalue();(D/'frozen-author-and-selected-inputs.tar.gz').write_bytes(gzip.compress(raw,mtime=0));r={'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'packageFiles':files,'selectedSourceAndReferenceFiles':sources,'protectedOriginalCoreInputs':protected,'pausedRuntimeInputs':owned,'archiveRawSHA256':hashlib.sha256(raw).hexdigest(),'archiveCompressedSHA256':H(D/'frozen-author-and-selected-inputs.tar.gz'),'scope':'independent non-authored Core canonical definitions only; historical Core/Runtime inputs untouched; external fixtures and root projection excluded'};(D/'frozen-input-identities.json').write_text(json.dumps(r,indent=2)+'\n');print('frozen',len(files),'package',len(sources),'source/reference',len(protected),'protected; Runtime4 identity read-only')
