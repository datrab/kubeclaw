"""Fetch signed extract-only guest prerequisites; never install or boot anything."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import urllib.request

repo = Path.cwd()
cache = repo / 'node_modules/.cache/buster-legacy-strace-20260921'
evidence = repo / 'docs/review/evidence/buster-legacy-strace-20260921'
cache.mkdir()  # Never overwrite a previous preparation or failed attempt.
packages = cache / 'packages'
runtime = cache / 'runtime'
packages.mkdir()
runtime.mkdir()
commands = []

def run(command):
    result = subprocess.run(command, text=True, capture_output=True, timeout=60)
    commands.append({'command': command, 'exitCode': result.returncode,
                     'stdout': result.stdout, 'stderr': result.stderr})
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
    result.check_returncode()
    return result.stdout

urls = run(['apk', 'fetch', '--simulate', '--recursive', '--url', 'strace=6.19-r1']).splitlines()
prefix = 'https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/'
assert 0 < len(urls) <= 32 and len(set(urls)) == len(urls)
compressed = 0
regular = 0
archives = []
for url in urls:
    assert url.startswith(prefix) and url.endswith('.apk')
    filename = url[len(prefix):]
    assert '/' not in filename and filename not in ('', '.', '..')
    target = packages / filename
    with urllib.request.urlopen(url, timeout=30) as source, target.open('xb') as destination:
        assert source.url == url
        while chunk := source.read(65536):
            compressed += len(chunk)
            if compressed > 64 * 1024**2:
                raise RuntimeError('compressed prerequisite ceiling exceeded')
            destination.write(chunk)
    run(['apk', 'verify', str(target)])
    # APK concatenated gzip/tar members include signed metadata and payload.
    with tarfile.open(target, 'r:gz', ignore_zeros=True) as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            assert not name.is_absolute() and '..' not in name.parts
            assert member.isdir() or member.isfile() or member.issym()
            if member.isfile():
                regular += member.size
                if regular > 192 * 1024**2:
                    raise RuntimeError('extracted prerequisite ceiling exceeded')
            if member.issym():
                assert not PurePosixPath(member.linkname).is_absolute()
                resolved = (runtime / name.parent / member.linkname).resolve()
                assert resolved.is_relative_to(runtime)
    archives.append({'url': url, 'bytes': target.stat().st_size,
                     'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
(evidence / 'archives.json').write_text(json.dumps({'archives': archives,
    'compressedBytes': compressed, 'headerRegularBytes': regular}, indent=2) + '\n')
for archive in archives:
    run(['apk', 'extract', '--destination', str(runtime), '--no-chown',
         str(packages / archive['url'].rsplit('/', 1)[1])])
identities = []
for directory, children, names in os.walk(runtime, followlinks=False):
    for name in sorted(children + names):
        file = Path(directory) / name
        item = {'path': str(file.relative_to(runtime)), 'mode': file.lstat().st_mode & 0o7777}
        if file.is_symlink():
            assert file.resolve().is_relative_to(runtime)
            item.update(type='symlink', target=os.readlink(file))
        elif file.is_file():
            item.update(type='file', bytes=file.stat().st_size,
                        sha256=hashlib.sha256(file.read_bytes()).hexdigest())
        elif file.is_dir():
            item.update(type='directory')
        else:
            raise RuntimeError('unsupported extracted entry')
        identities.append(item)
(evidence / 'runtime-identities.json').write_text(json.dumps(identities, indent=2) + '\n')
run([str(runtime / 'lib/ld-musl-x86_64.so.1'), '--library-path',
     str(runtime / 'lib') + ':' + str(runtime / 'usr/lib'), str(runtime / 'usr/bin/strace'), '-V'])
print(json.dumps({'packages': len(archives), 'compressedBytes': compressed,
                  'headerRegularBytes': regular, 'entries': len(identities)}))
