"""Focused strict history authentication and no-other-change conservation check."""
import ast
import copy
import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from repair import ROOT, OUT, BATCH, INVENTORY, BASE, canonical, digest, file_digest

candidate_path = Path(sys.argv[1]) if len(sys.argv) > 1 else INVENTORY
candidate_bytes = candidate_path.read_bytes()
candidate = json.loads(gzip.decompress(candidate_bytes) if candidate_path.suffix == '.gz' else candidate_bytes)
before_bytes = gzip.decompress((OUT / 'inventory-before.json.gz').read_bytes())
before = json.loads(before_bytes)
inputs = json.loads((OUT / 'input-digests.json').read_text())
corrections = json.loads((OUT / 'corrections.json').read_text())['records']
snapshot = json.loads(gzip.decompress((BATCH / 'changed-rows-before.json.gz').read_bytes()))
baseline = json.loads(subprocess.check_output(['git', 'show', BASE + ':' + str(INVENTORY)]))
base_rows = {r['id']: r for r in baseline['rows']}
rows = {r['id']: r for r in candidate['rows']}
assert len(rows) == len(candidate['rows']), 'Duplicate setting IDs'
assert hashlib.sha256(before_bytes).hexdigest() == inputs['inventoryBeforeSHA256']
assert file_digest(OUT / 'inventory-before.json.gz') == inputs['inventoryBeforeSnapshotSHA256']
assert file_digest(BATCH / 'changed-rows-before.json.gz') == inputs['preservedOriginalSnapshotSHA256']
assert file_digest(BATCH / 'integrate.py') == inputs['integrateAfterSHA256']
assert file_digest(OUT / 'repair.py') == inputs['repairScriptSHA256']
assert file_digest(OUT / 'integrate-before.py.snapshot') == inputs['integrateBeforeSHA256']
for path, expected in inputs['historicalArtifactsUnchanged'].items():
    assert file_digest(Path(path)) == expected, 'Historical evidence changed: ' + path
assert len(snapshot) == len(corrections) == 17
records = {r['settingID']: r for r in corrections}
assert set(records) == {r['id'] for r in snapshot}
restored = copy.deepcopy(candidate)
restored_rows = {r['id']: r for r in restored['rows']}
for old in snapshot:
    setting = old['id']
    assert old == base_rows[setting], 'Original snapshot drift: ' + setting
    history = [h for h in rows[setting]['sourceDefinitionHistory'] if h['batch'] == 'standalone-remote-19']
    assert len(history) == 1
    history = history[0]
    assert history['oldRowSHA256'] == digest(old), 'Original row digest mismatch: ' + setting
    record = records[setting]
    assert history['oldRowSHA256Correction'] == record['correction']
    enriched = copy.deepcopy(old)
    enriched.setdefault('sourceDefinitionHistory', [])
    assert record['originalHistoryRecord']['oldRowSHA256'] == digest(enriched)
    assert record['correction']['previousIncorrectOldRowSHA256'] == digest(enriched)
    assert record['correction']['correctedOldRowSHA256'] == digest(old)
    assert record['correction']['originalRowID'] == setting
    assert record['correction']['originalSnapshotSHA256'] == inputs['preservedOriginalSnapshotSHA256']
    h = next(h for h in restored_rows[setting]['sourceDefinitionHistory'] if h['batch'] == 'standalone-remote-19')
    del h['oldRowSHA256Correction']
    h['oldRowSHA256'] = record['originalHistoryRecord']['oldRowSHA256']
    assert h == record['originalHistoryRecord'], 'Other history fields changed'
assert restored == before, 'Non-provenance inventory content changed'
# Execute only the four integration AST statements that capture/append history,
# against throwaway in-memory rows. No integration/file writes or cases touched.
source = ast.parse((BATCH / 'integrate.py').read_text())
loop = next(n for n in source.body if isinstance(n, ast.For))
assert len(loop.body) >= 4
assert isinstance(loop.body[1], ast.Assign) and loop.body[1].targets[0].id == 'oldRowSHA256'
prefix = ast.Module(body=loop.body[:4], type_ignores=[])
for old in snapshot:
    row = copy.deepcopy(old)
    scope = {'rows': {old['id']: row}, 'e': {'setting': old['id']}, 'hashlib': hashlib,
             'copy': copy, 'can': canonical, 'B': BATCH}
    exec(compile(prefix, '<integration-history-prefix>', 'exec'), scope)
    assert row['sourceDefinitionHistory'][-1]['oldRowSHA256'] == digest(old)
result = {'status': 'passed', 'findingID': 'URUNTIME-001', 'exactOriginalRowDigests': 17,
          'retainedIncorrectDigestsAndOriginalHistoryRecords': 17,
          'preservedOriginalsMatchFrozenCheckpoint': True,
          'nonProvenanceInventoryUnchanged': True,
          'historicalArtifactsUnchanged': len(inputs['historicalArtifactsUnchanged']),
          'integrationHistoryPrefixRegressionRows': 17,
          'integrateRerun': False, 'scope': 'C0 integrity only; no C1/runtime acceptance',
          'candidateSHA256': file_digest(candidate_path),
          'verificationScriptSHA256': file_digest(Path(__file__)),
          'correctionsSHA256': file_digest(OUT / 'corrections.json'),
          'inputDigestsSHA256': file_digest(OUT / 'input-digests.json')}
print(json.dumps(result, indent=2))
