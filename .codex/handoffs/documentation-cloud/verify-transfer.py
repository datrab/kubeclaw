#!/usr/bin/env python3
"""Verify the portable transfer, optionally the restored working-tree bytes."""
from pathlib import Path
import hashlib, json, sys, tarfile
root = Path(__file__).resolve().parents[3]
here = Path(__file__).resolve().parent
manifest = json.loads((here / 'transfer-manifest.json').read_text())
for row in manifest['files']:
    data = (here / row['path']).read_bytes()
    assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
index = json.loads((here / 'evidence-index.json').read_text())
with tarfile.open(here / 'evidence.tar.gz', 'r:gz') as archive:
    assert set(archive.getnames()) == {row['path'] for row in index['files']}
    for row in index['files']:
        assert not Path(row['path']).is_absolute() and '..' not in Path(row['path']).parts
        data = archive.extractfile(row['path']).read()
        assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
if '--worktree' in sys.argv:
    state = json.loads((here / 'worktree-files.json').read_text())
    for row in state['files']:
        data = (root / row['path']).read_bytes()
        assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
print('PASS: transfer hashes and archived evidence' + ('; exact restored WIP bytes' if '--worktree' in sys.argv else ''))
