from pathlib import Path
import json,hashlib,gzip
r=Path.cwd();b=r/'docs/review/evidence/config-acceptance';d=b/'independent-checkpoint6-crosslink-recheck';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();paths=set()
for name in ['check-matrix.py','check-native-case-integration.py','observation_references.py','consolidate.py','checkpoint-6-crosslink-corrections.json','structural-checkpoint-6-attempt4.log','strict-checkpoint-6-attempt4.log','native-case-integration-checkpoint-6-attempt2.log']:paths.add(b/'author'/name)
paths.update(p for p in (b/'author/checkpoint6-before-crosslink-corrections').rglob('*') if p.is_file())
for name in ['config-semantic-inventory.json','config-acceptance-matrix.json']:paths.add(r/'docs/review/remediation'/name)
paths.add(b/'runtime/case-proposals.json');m=json.loads((r/'docs/review/remediation/config-acceptance-matrix.json').read_text())
for x in m['immutableObservationReferences']['artifacts']:paths.add(r/x['path'])
prior=b/'independent-checkpoint6-integration-recheck';priorids={str(p.relative_to(r)):sha(p) for p in prior.rglob('*') if p.is_file()};paths.update(prior/x for x in ['input-freeze.json','independent-integration-recheck.json','stable-independent-integration-recheck-receipt.json','matrix-negative-controls.json'])
entries=[]
for p in sorted(paths):
 raw=p.read_bytes();dst=d/'inputs'/p.relative_to(r);dst.parent.mkdir(parents=True,exist_ok=True)
 if len(raw)>1000000:dst=Path(str(dst)+'.gz');dst.write_bytes(gzip.compress(raw,mtime=0))
 else:dst.write_bytes(raw)
 entries.append({'path':str(p.relative_to(r)),'sha256':sha(p),'bytes':len(raw),'snapshot':str(dst.relative_to(r))})
(d/'input-freeze.json').write_text(json.dumps({'scope':'parent cross-link documentation guards only','inputs':entries,'prior1005FreezeAndReportArtifacts':priorids},indent=2)+'\n');print(len(entries))
