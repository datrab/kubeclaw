"""Bind already materialized generation6 artifacts; never boot or mount."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

repo = Path.cwd()
evidence = repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921/generation6'
cache = repo / 'node_modules/.cache/buster-legacy-seal-vm-20260921/generation6'
assert os.geteuid() == 1000

def write_new(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')

export = json.loads((evidence / 'source-export-identities.json').read_text())
write_new(cache / 'repo-snapshot-manifest.json', [{'path': name, **row} for name, row in export.items()])
old = repo / 'docs/review/evidence/systemd-native-guest-proposal-20260921/tool-runtime-identities.json'
with (evidence / 'tool-runtime-identities.json').open('xb') as output:
    output.write(old.read_bytes())
command = subprocess.run([sys.executable, str(evidence / 'launch-smaller-as.py')],
                         capture_output=True, text=True, check=True, timeout=10)
launch = json.loads(command.stdout)
assert launch['notExecuted'] is True
write_new(evidence / 'launch-command-smaller-as.json', launch)
(cache / 'logs-smaller-as').mkdir()
previous = json.loads((evidence.parent / 'generation5/artifact-manifest-smaller-as.json').read_text())
paths = [row['path'].replace('generation5', 'generation6') for row in previous['files']]
paths += [str((evidence / name).relative_to(repo)) for name in ('driver-source-identities.json', 'bind-artifacts.py')]
rows = []
for name in paths:
    path = repo / name
    assert path.resolve() == path
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid == 1000 and info.st_nlink == 1
    def stamp(value):
        return (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                value.st_nlink, value.st_uid, value.st_mtime_ns, value.st_ctime_ns)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(descriptor, 'rb') as stream:
        assert stamp(os.fstat(stream.fileno())) == stamp(info)
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        assert stamp(os.fstat(stream.fileno())) == stamp(info)
        assert path.resolve() == path and stamp(path.lstat()) == stamp(info)
        if path.is_relative_to(cache):
            os.posix_fadvise(stream.fileno(), 0, 0, os.POSIX_FADV_DONTNEED)
    rows.append({'path': name, 'mode': stat.S_IMODE(info.st_mode),
                 'bytes': info.st_size, 'sha256': checksum})
write_new(evidence / 'artifact-manifest-smaller-as.json', {'status': 'prepared; not executed', 'files': rows})
print(json.dumps({'artifacts': len(rows), 'vmBooted': False}))
