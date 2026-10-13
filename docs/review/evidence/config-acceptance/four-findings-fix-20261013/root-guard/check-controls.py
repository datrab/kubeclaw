"""Persisted root Runtime conservation controls; no acceptance promotion."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root=Path.cwd()
out=root/'docs/review/evidence/config-acceptance/four-findings-fix-20261013/root-guard'
inventory=root/'docs/review/remediation/config-semantic-inventory.json'
matrix=root/'docs/review/remediation/config-acceptance-matrix.json'
checker=root/'docs/review/evidence/config-acceptance/author/check-matrix.py'
original=json.loads(inventory.read_text())
before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (inventory,matrix)}
results=[]
for label in ['positive-before','history-digest','correction-loss','non-provenance-drift','row-loss','extra-row','positive-recovery']:
    data=copy.deepcopy(original)
    target=next(r for r in data['rows'] if r['id']=='RT-NOVA-REMOTE-SCHEMAVERSION')
    if label=='history-digest': target['sourceDefinitionHistory'][0]['oldRowSHA256']='0'*64
    if label=='correction-loss': target['sourceDefinitionHistory'][0].pop('oldRowSHA256Correction')
    if label=='non-provenance-drift': target['semanticStatus']='accepted'
    if label=='row-loss': data['rows'].remove(target)
    if label=='extra-row':
        extra=copy.deepcopy(target);extra['id']='RT-UNAUTHORIZED-EXTRA';data['rows'].append(extra)
    raw=(json.dumps(data)+'\n').encode()
    if not label.startswith('positive'):
        with gzip.open(out/(label+'.inventory.json.gz'),'wb') as f:f.write(raw)
    with tempfile.TemporaryDirectory(prefix='runtime-root-control-') as temp:
        path=Path(temp)/'inventory.json';path.write_bytes(raw)
        cmd=[sys.executable,str(checker),'--structural','--inventory',str(path),'--matrix',str(matrix)]
        result=subprocess.run(cmd,cwd=root,capture_output=True)
    (out/(label+'.stdout')).write_bytes(result.stdout)
    (out/(label+'.stderr')).write_bytes(result.stderr)
    parsed=json.loads(result.stdout)
    positive=label.startswith('positive')
    assert result.returncode == (0 if positive else 1), (label,parsed)
    if not positive: assert any('Runtime' in e and 'conservation drift' in e for e in parsed['errors']),parsed
    results.append({'control':label,'exitCode':result.returncode,'errorCount':parsed['errorCount'],
                    'inputSHA256':hashlib.sha256(raw).hexdigest(),'command':cmd})
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in before.items())
(out/'verification.json').write_text(json.dumps({'controls':results,'rootByteDrift':False,
    'checkerSHA256':hashlib.sha256(checker.read_bytes()).hexdigest(),'globalC0Accepted':False},indent=2)+'\n')
print('5 persisted root negatives rejected; 2 positives passed; root bytes unchanged')
