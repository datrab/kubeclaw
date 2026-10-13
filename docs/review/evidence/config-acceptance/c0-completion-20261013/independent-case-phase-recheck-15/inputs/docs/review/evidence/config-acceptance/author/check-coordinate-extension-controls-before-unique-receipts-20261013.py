"""Documentation-integrity controls; not runtime mutants or acceptance."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path.cwd()
author = root/'docs/review/evidence/config-acceptance/author'
extension = author/'infra-coordinate-extension-20261013.json'
results = []
with tempfile.TemporaryDirectory(prefix='c0-coordinate-check-') as temporary:
    stage = Path(temporary)
    ledger = stage/'coordinates.json'
    original = json.loads(extension.read_text())
    ledger.write_text(json.dumps(original))
    (stage/'empty.json').write_text(json.dumps({'boundaries':[], 'sources':[], 'candidates':[]}))
    inventory = {'rows':[], 'coordinateCandidateLedgers':[str(ledger)],
                 'sourceBoundary':str(stage/'empty.json'),
                 'candidateLedger':str(stage/'empty.json')}
    (stage/'inventory.json').write_text(json.dumps(inventory))
    (stage/'matrix.json').write_text(json.dumps({'cases':[], 'requirements':[]}))
    argv = [sys.executable, '-B', str(author/'check-matrix.py'),
            '--inventory', str(stage/'inventory.json'), '--matrix', str(stage/'matrix.json')]
    def run(name, structural, expected):
        command = argv + (['--structural'] if structural else [])
        process = subprocess.run(command, capture_output=True, text=True)
        report = json.loads(process.stdout)
        assert expected(report, process.returncode), (name, process.stdout, process.stderr)
        results.append({'case':name, 'argv':command, 'exit':process.returncode,
                        'report':report, 'stderr':process.stderr})
    run('original-structural', True, lambda r,c: c==0 and r['errorCount']==0)
    broken = copy.deepcopy(original)
    broken['coordinateCandidates'].append(broken['coordinateCandidates'][0])
    ledger.write_text(json.dumps(broken))
    run('duplicate-coordinate-rejected', True,
        lambda r,c: c==1 and any('duplicate ID' in e for e in r['errors']))
    broken = copy.deepcopy(original)
    broken['coordinateCandidates'][0]['sourceSha256'] = '0'*64
    ledger.write_text(json.dumps(broken))
    run('coordinate-source-drift-rejected', True,
        lambda r,c: c==1 and any('content drift' in e for e in r['errors']))
    ledger.write_text(json.dumps(original))
    run('strict-open-coordinate-rejected', False,
        lambda r,c: c==1 and len(r['errors'])==1402
        and sum('unresolved field disposition' in e for e in r['errors'])==701
        and sum('no independent semantic review' in e for e in r['errors'])==701)
    run('restored-structural', True, lambda r,c: c==0 and r['errorCount']==0)
receipt = {'scope':__doc__, 'extensionSha256':hashlib.sha256(extension.read_bytes()).hexdigest(),
           'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'results':results}
(author/'coordinate-extension-controls-20261013.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'controlsPassed':len(results),'semanticAcceptance':False}))
