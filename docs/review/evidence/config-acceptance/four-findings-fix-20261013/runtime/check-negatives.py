"""Persisted bad-history negatives exercise the same strict checker."""
import copy
import hashlib
import gzip
import json
import subprocess
import sys
from pathlib import Path
from repair import OUT, INVENTORY, file_digest

inventory = json.loads(INVENTORY.read_bytes())
records = json.loads((OUT / 'corrections.json').read_text())['records']
setting = records[0]['settingID']
results = []
for name in ['restore-incorrect-hash', 'drop-correction-provenance', 'change-unrelated-row']:
    mutant = copy.deepcopy(inventory)
    row = next(r for r in mutant['rows'] if r['id'] == setting)
    history = next(h for h in row['sourceDefinitionHistory'] if h['batch'] == 'standalone-remote-19')
    if name == 'restore-incorrect-hash':
        history['oldRowSHA256'] = history['oldRowSHA256Correction']['previousIncorrectOldRowSHA256']
        expected = 'Original row digest mismatch'
    elif name == 'drop-correction-provenance':
        del history['oldRowSHA256Correction']
        expected = 'oldRowSHA256Correction'
    else:
        next(r for r in mutant['rows'] if r['id'] != setting)['owner'] = 'integrity-negative-owner'
        expected = 'Non-provenance inventory content changed'
    path = OUT / (name + '.json.gz')
    path.write_bytes(gzip.compress((json.dumps(mutant, indent=2) + '\n').encode(), mtime=0))
    process = subprocess.run([sys.executable, str(OUT / 'verify.py'), str(path)], capture_output=True, text=True)
    (OUT / (name + '.stdout')).write_text(process.stdout)
    (OUT / (name + '.stderr')).write_text(process.stderr)
    assert process.returncode != 0 and expected in process.stderr, name + ' did not reject for intended boundary'
    results.append({'name': name, 'command': [sys.executable, str(OUT / 'verify.py'), str(path)],
                    'inputSHA256': file_digest(path), 'exitCode': process.returncode,
                    'expectedRejectBoundary': expected, 'result': 'passed-negative-rejected',
                    'stdout': str(OUT / (name + '.stdout')), 'stderr': str(OUT / (name + '.stderr'))})
print(json.dumps({'status': 'passed', 'controls': results,
                  'negativeScriptSHA256': file_digest(Path(__file__))}, indent=2))
