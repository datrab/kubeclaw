"""Verify archived branch documents and the cleanup checkpoint, read-only."""
import base64
import collections
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[2]
summary = json.loads((root / 'summary.json').read_text())
branches = json.loads((root / 'branches.json').read_text())
assert len(branches) == 262
assert len({b['name'] for b in branches}) == 262
assert dict(collections.Counter(b['classification'] for b in branches)) == summary['classificationCounts']
assert sum(b.get('deleteEligibleAfterPublishedCheckpointAndFreshRefCheck', False) for b in branches) == 261
assert all(not b.get('deleted', False) for b in branches)
for artifact in summary['artifacts']:
    data = (root / artifact['file']).read_bytes()
    assert len(data) == artifact['bytes']
    assert hashlib.sha256(data).hexdigest() == artifact['sha256']
    assert len(gzip.decompress(data)) == artifact['rawBytes']
archive = json.loads(gzip.decompress((root / 'historical-documents.json.gz').read_bytes()))
def git_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
for sha, encoded in archive['blobs'].items():
    assert git_sha(base64.b64decode(encoded, validate=True)) == sha
assert len(archive['blobs']) == summary['archivedUniqueDocumentBlobs']
assert len(archive['entries']) == summary['archivedBranchPathEntries']
by_name = {b['name']: b for b in branches}
for entry in archive['entries']:
    assert entry['sha'] in archive['blobs']
    assert entry['path'].startswith('docs/') and '..' not in Path(entry['path']).parts
    assert entry['commit'] == by_name[entry['branch']]['sha']
restored = json.loads((root / 'restored-documents.json').read_text())
assert len(restored) == summary['restoredDocuments']
for entry in restored:
    assert entry['path'].startswith('docs/') and '..' not in Path(entry['path']).parts
    assert git_sha((repo / entry['path']).read_bytes()) == entry['blob'].split(':')[1]
decisions = json.loads(gzip.decompress((root / 'path-decisions.json.gz').read_bytes()))
assert len(decisions['branches']) == 190
assert not any(f['verdict'] == 'blob-unavailable' for b in decisions['branches'] for f in b['files'])
archived_refs = {(e['branch'], e['path'], e['sha']) for e in archive['entries']}
for branch in decisions['branches']:
    for f in branch['files']:
        if f['verdict'] == 'historical-document-archived':
            assert (branch['name'], f['path'], f['archiveBlob']) in archived_refs
print(json.dumps({'ok': True, 'branches': len(branches), 'reviewedRemaining': 190,
                  'eligibleAfterFreshRefCheck': 261, 'retained': 0,
                  'restoredDocuments': len(restored), 'verifiedArchivedBlobs': len(archive['blobs'])}))

for name in ["candidate-merge-log.json", "historical-test-imports.json", "residual-resolutions.json"]:
    for item in json.loads((root / name).read_text()):
        target = repo / item.get("destination", item["path"])
        expected = item["consolidatedBlob"]
        assert (git_sha(target.read_bytes()) if target.exists() else None) == expected, str(target)
print("Integrated source and harness hashes verified")
