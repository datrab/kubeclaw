"""Verify preserved private VM images and request eviction of only their clean pages."""
import hashlib
import json
import os
from pathlib import Path
import stat

repo = Path.cwd().resolve()
base = repo / 'node_modules/.cache/buster-legacy-seal-vm-20260921'
evidence = repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921'
assert os.geteuid() == 1000
output = evidence / 'run4/own-image-cache-hints-result.json'
assert not output.exists(), 'Preserve prior observations'


def memory():
    return {'current': int(Path('/sys/fs/cgroup/memory.current').read_text()),
            'stat': {k: int(v) for k, v in
                     (line.split() for line in Path('/sys/fs/cgroup/memory.stat').read_text().splitlines())}}


def stamp(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


report = {'before': memory(), 'images': [], 'guestLaunched': False,
          'limitsChanged': False, 'globalCacheOperation': False}
try:
    for run, directory in ((1, base), (2, base / 'generation2'),
                           (3, base / 'generation3'), (4, base / 'generation4')):
        terminal = json.loads((evidence / f'run{run}/vm-result.json').read_text())
        for name, key, size in (('guest-root.ext4', 'finalMutableDiskSha256', 256 * 1024**2),
                                ('second.ext4', 'finalSecondDiskSha256', 16 * 1024**2)):
            file = directory / name
            assert file.resolve() == file and file.is_relative_to(base)
            before = file.lstat()
            assert stat.S_ISREG(before.st_mode) and before.st_uid == 1000
            assert stat.S_IMODE(before.st_mode) == 0o644
            assert before.st_nlink == 1 and before.st_size == size
            descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
            try:
                assert stamp(os.fstat(descriptor)) == stamp(before)
                with os.fdopen(os.dup(descriptor), 'rb') as stream:
                    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
                assert digest == terminal[key], 'Preserved image changed'
                assert stamp(os.fstat(descriptor)) == stamp(before) == stamp(file.lstat())
                os.posix_fadvise(descriptor, 0, 0, os.POSIX_FADV_DONTNEED)
                assert stamp(os.fstat(descriptor)) == stamp(before) == stamp(file.lstat())
                report['images'].append({'path': str(file.relative_to(repo)), 'bytes': size,
                                         'sha256': digest, 'hintReturned': True, 'after': memory()})
            finally:
                os.close(descriptor)
    report['completed'] = True
except Exception as error:
    report['completed'] = False
    report['error'] = f'{type(error).__name__}: {error}'
    raise
finally:
    report['after'] = memory()
    with output.open('x') as stream:
        json.dump(report, stream, indent=2)
        stream.write('\n')
