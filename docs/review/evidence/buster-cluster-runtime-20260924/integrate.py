"""Integrate an explicitly selected frozen candidate after its independent source review."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', required=True)
parser.add_argument('--snapshot', required=True)
parser.add_argument('--review', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path.cwd()
manifest_path = root / args.manifest
snapshot = root / args.snapshot
review = root / args.review
output = root / args.output
manifest = json.loads(manifest_path.read_text())
assert review.is_file() and review.stat().st_size > 0
assert not output.exists()

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

# Validate every source and destination before changing any repository source.
for row in manifest['files']:
    relative = Path(row['path'])
    assert not relative.is_absolute() and '..' not in relative.parts
    source, target = snapshot / relative, root / relative
    assert digest(source) == row['sha256'], f'SNAPSHOT_MISMATCH:{relative}'
    if row['kind'] == 'symlink':
        assert source.is_symlink() and str(source.readlink()) == row['linkTarget']
    else:
        assert row['kind'] == 'file' and source.is_file() and not source.is_symlink()
    actual = digest(target) if target.exists() else None
    assert actual == row['beforeSha256'], f'BASELINE_DRIFT:{relative}'
    assert not target.is_symlink() or source.is_symlink(), f'UNEXPECTED_EXISTING_ALIAS:{relative}'
    assert target.exists() or not target.is_symlink(), f'DANGLING_DESTINATION:{relative}'

output.mkdir(parents=True)
rows = []
for row in manifest['files']:
    relative = Path(row['path'])
    source, target = snapshot / relative, root / relative
    backup = output / 'before' / relative
    if target.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, backup, follow_symlinks=False)
    target.parent.mkdir(parents=True, exist_ok=True)
    if row['kind'] == 'symlink':
        if target.exists() or target.is_symlink():
            target.unlink()
        os.symlink(row['linkTarget'], target)
    else:
        shutil.copy2(source, target)
    assert digest(target) == row['sha256']
    rows.append(row)
(output / 'result.json').write_text(json.dumps({
    'manifest': str(manifest_path), 'manifestSha256': digest(manifest_path),
    'review': str(review), 'reviewSha256': digest(review),
    'status': 'integrated; verification pending', 'files': rows,
}, indent=2) + '\n')
print(f'Integrated {len(rows)} files; verification pending.')
