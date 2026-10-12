"""Materialize independent guest runtime copies; no image, mount, boot or host install."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

repo = Path.cwd()
cache = repo / 'node_modules/.cache/buster-legacy-seal-vm-20260921/generation6'
evidence = repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921/generation6'
if os.geteuid() != 1000:
    raise SystemExit('Preparation requires unprivileged workspace UID1000')
cache.mkdir()  # Preserve any prior preparation instead of silently replacing it.
guest = cache / 'guest-root'
guest.mkdir()
sources = []
copied = {}
total = 0

def identity(file):
    info = file.lstat()
    row = {'mode': stat.S_IMODE(info.st_mode)}
    if file.is_symlink():
        row.update(type='symlink', target=os.readlink(file))
    elif file.is_dir():
        row.update(type='directory')
    elif file.is_file():
        with file.open('rb') as stream:
            checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        row.update(type='file', bytes=info.st_size, sha256=checksum)
    else:
        raise RuntimeError('Unsupported runtime entry: ' + str(file))
    return row

def copy_entry(root, name, expected):
    global total
    source = root / name
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    actual = identity(source)
    assert actual == expected, ('Changed prerequisite', str(source))
    if actual['type'] == 'symlink':
        assert source.resolve().is_relative_to(root.resolve())
    sources.append({'source': str(source.relative_to(repo)), **actual})
    if name in copied:
        assert actual == copied[name], ('Conflicting guest package entries', name)
        return
    target = guest / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if actual['type'] == 'directory':
        target.mkdir(exist_ok=True)
        target.chmod(actual['mode'])
    elif actual['type'] == 'symlink':
        target.symlink_to(actual['target'])
    else:
        total += actual['bytes']
        assert total <= 192 * 1024**2, 'Guest runtime regular-byte ceiling'
        shutil.copy2(source, target)
        assert target.stat().st_ino != source.stat().st_ino, 'Independent copy required'
    copied[name] = actual

for package in ('buster-legacy-python-20260921', 'buster-legacy-strace-20260921'):
    root = repo / 'node_modules/.cache' / package / 'runtime'
    manifest = repo / 'docs/review/evidence' / package / 'runtime-identities.json'
    rows = json.loads(manifest.read_text())
    listed = {row['path'] for row in rows}
    observed = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        observed.update(str((Path(directory) / name).relative_to(root)) for name in dirs + files)
    assert observed == listed, ('Prerequisite entry-set drift', package)
    for row in sorted(rows, key=lambda row: (len(Path(row['path']).parts), row['path'])):
        expected = {key: value for key, value in row.items() if key != 'path'}
        if isinstance(expected['mode'], str):
            expected['mode'] = int(expected['mode'], 8)
        copy_entry(root, row['path'], expected)

tool_root = repo / 'node_modules/.cache/systemd-native-vm-20260921/root'
tool_manifest = json.loads((repo / 'docs/review/evidence/systemd-native-guest-proposal-20260921/tool-runtime-identities.json').read_text())
for name in ('bin/busybox', 'usr/bin/unshare', 'lib/ld-musl-x86_64.so.1'):
    copy_entry(tool_root, name, tool_manifest['entries'][name])
# Explicit guest applets needed by boot/driver; package files are never overwritten.
for name in ('sh', 'mount', 'umount', 'mkdir', 'chmod', 'chown', 'cat', 'sync', 'poweroff'):
    target = guest / 'bin' / name
    assert not target.exists() and not target.is_symlink()
    target.symlink_to('busybox')
for directory in ('proc', 'sys', 'dev', 'run', 'tmp', 'repo', 'var/lib', 'results'):
    (guest / directory).mkdir(parents=True, exist_ok=True)
(guest / 'tmp').chmod(0o1777)

commands = []
loader = guest / 'lib/ld-musl-x86_64.so.1'
for executable, arguments in [('usr/bin/python3', ['-I', '-c', 'import fcntl,ctypes; print("PYTHON_GUEST_IMPORTS_OK")']),
                              ('usr/bin/strace', ['-V']), ('usr/bin/unshare', ['--help']),
                              ('bin/busybox', ['mount', '--help'])]:
    command = [str(loader), '--library-path', str(guest / 'lib') + ':' + str(guest / 'usr/lib'),
               str(guest / executable), *arguments]
    result = subprocess.run(command, capture_output=True, text=True, timeout=10)
    commands.append({'command': command, 'exitCode': result.returncode,
                     'stdout': result.stdout, 'stderr': result.stderr})
    (evidence / 'runtime-probes.json').write_text(json.dumps(commands, indent=2) + '\n')
    result.check_returncode()
manifest = {'.': identity(guest)}
for directory, dirs, files in os.walk(guest, followlinks=False):
    for name in dirs + files:
        file = Path(directory) / name
        manifest[str(file.relative_to(guest))] = identity(file)
        if file.is_symlink():
            assert file.resolve().is_relative_to(guest.resolve())
for source in sources:
    assert identity(repo / source['source']) == {k: v for k, v in source.items() if k != 'source'}
(evidence / 'runtime-identities.json').write_text(json.dumps(manifest, indent=2) + '\n')
(evidence / 'runtime-sources.json').write_text(json.dumps(sources, indent=2) + '\n')
print(json.dumps({'regularBytes': total, 'entries': len(manifest), 'sourceDrift': False,
                  'independentCopies': True, 'vmBooted': False}))
