"""Apply only frozen, baseline-matching regular-file candidates; preserve aliases."""
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
BASE = Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None

def check(item, after=False):
    target = ROOT / item['path']
    source = ROOT / item['source']
    assert (target.readlink().as_posix() if target.is_symlink() else None) == item['targetLink'], f'alias drift: {target}'
    assert str(target.resolve().relative_to(ROOT)) == item['physicalPath'], f'physical target drift: {target}'
    assert not source.is_symlink() and source.is_file(), f'invalid staged source: {source}'
    assert digest(source) == item['afterSha256'], f'staged source drift: {source}'
    assert digest(target) == item['afterSha256' if after else 'beforeSha256'], f'live drift: {target}'

manifest = json.loads((BASE / 'integration-manifest.json').read_text())
items = manifest['files']
assert len(items) == 68 and len({i['path'] for i in items}) == len(items)
for item in items:
    check(item)
if '--apply' not in sys.argv:
    print(json.dumps({'preflight': 'passed', 'files': len(items), 'applied': False}))
    sys.exit(0)
result = {'files': [], 'complete': False}
try:
    for item in items:
        check(item)
        target = ROOT / item['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        # Write through the existing regular file to retain modes and chart aliases.
        with target.open('wb') as output:
            output.write((ROOT / item['source']).read_bytes())
            output.flush()
            os.fsync(output.fileno())
        check(item, after=True)
        result['files'].append({'path': item['path'], 'sha256': digest(target)})
    for item in items:
        check(item, after=True)
    result['complete'] = True
finally:
    (BASE / 'integration-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'integrated': len(result['files']), 'complete': result['complete']}))
