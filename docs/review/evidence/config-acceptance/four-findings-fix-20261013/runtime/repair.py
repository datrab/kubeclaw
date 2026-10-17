"""One-time C0 provenance repair; never rerun historical integration."""
import copy
import gzip
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path('docs/review/evidence/config-acceptance')
OUT = ROOT / 'four-findings-fix-20261013/runtime'
BATCH = ROOT / 'runtime/batches/21bf51b-standalone-remote-19'
INVENTORY = ROOT / 'runtime/inventory-fragment.json'
BASE = '21bf51bc2075abec1191fdc091952492b6cb484e'

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()

def file_digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

if __name__ == '__main__':
    assert not (OUT / 'corrections.json').exists(), 'Repair already recorded; use verify.py'
    original_bytes = INVENTORY.read_bytes()
    inventory = json.loads(original_bytes)
    original = copy.deepcopy(inventory)
    before_path = BATCH / 'changed-rows-before.json.gz'
    preserved = json.loads(gzip.decompress(before_path.read_bytes()))
    baseline = json.loads(subprocess.check_output(['git', 'show', BASE + ':' + str(INVENTORY)]))
    base_rows = {row['id']: row for row in baseline['rows']}
    current_rows = {row['id']: row for row in inventory['rows']}
    assert len(preserved) == 17 and len({r['id'] for r in preserved}) == 17
    contracts = json.loads((BATCH / 'contracts-captured-content-corrected.json').read_text())
    assert {r['id'] for r in preserved} == {e['setting'] for e in contracts['entries']}
    # Preserve every historical batch artifact except the intentionally repaired author script.
    protected = {str(p): file_digest(p) for p in sorted(BATCH.iterdir()) if p.is_file() and p.name != 'integrate.py'}
    protected.update({str(p): file_digest(p) for p in sorted((ROOT / 'independent-user-review-21bf-20261013').rglob('*')) if p.is_file()})
    (OUT / 'inventory-before.json.gz').write_bytes(gzip.compress(original_bytes, mtime=0))
    records = []
    for old in preserved:
        assert old == base_rows[old['id']], 'Preserved original differs from frozen checkpoint'
        row = current_rows[old['id']]
        matches = [h for h in row['sourceDefinitionHistory'] if h['batch'] == 'standalone-remote-19']
        assert len(matches) == 1
        history = matches[0]
        original_history = copy.deepcopy(history)
        enriched = copy.deepcopy(old)
        enriched.setdefault('sourceDefinitionHistory', [])
        incorrect = history['oldRowSHA256']
        correct = digest(old)
        assert incorrect == digest(enriched) and incorrect != correct
        correction = {
            'findingID': 'URUNTIME-001',
            'reason': 'Historical digest included sourceDefinitionHistory=[] inserted by setdefault before hashing; corrected from the immutable original snapshot.',
            'previousIncorrectOldRowSHA256': incorrect,
            'correctedOldRowSHA256': correct,
            'originalSnapshotPath': str(before_path),
            'originalSnapshotSHA256': file_digest(before_path),
            'originalRowID': old['id'],
            'originalBaselineCommit': BASE,
            'canonicalization': 'UTF-8 JSON; sort_keys=True; separators=(comma,colon); ensure_ascii=False',
            'evidencePath': str(OUT / 'corrections.json'),
        }
        history['oldRowSHA256'] = correct
        history['oldRowSHA256Correction'] = correction
        records.append({'settingID': old['id'], 'originalHistoryRecord': original_history, 'correction': correction})
    assert len(records) == 17
    INVENTORY.write_text(json.dumps(inventory, indent=2) + '\n')
    (OUT / 'corrections.json').write_text(json.dumps({'findingID': 'URUNTIME-001', 'scope': 'C0 provenance repair only; no runtime acceptance', 'records': records}, indent=2) + '\n')
    (OUT / 'input-digests.json').write_text(json.dumps({
        'baselineCommit': BASE,
        'inventoryBeforeSHA256': hashlib.sha256(original_bytes).hexdigest(),
        'inventoryBeforeSnapshotSHA256': file_digest(OUT / 'inventory-before.json.gz'),
        'preservedOriginalSnapshotSHA256': file_digest(before_path),
        'historicalArtifactsUnchanged': protected,
        'repairScriptSHA256': file_digest(Path(__file__)),
        'integrateBeforeSHA256': file_digest(OUT / 'integrate-before.py.snapshot'),
        'integrateAfterSHA256': file_digest(BATCH / 'integrate.py'),
    }, indent=2) + '\n')
    print(json.dumps({'repairedRows': len(records), 'historicalArtifactsProtected': len(protected), 'integrateRerun': False, 'productionChanges': False}))
