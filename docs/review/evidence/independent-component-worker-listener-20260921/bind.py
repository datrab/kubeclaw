"""Prepared review binder; import alone performs no filesystem scans or tests."""
import hashlib
import json
import os
import pathlib
import stat


def digest(file):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def describe(file):
    info = file.lstat()
    row = {'mode': stat.S_IMODE(info.st_mode), 'device': info.st_dev, 'inode': info.st_ino}
    if stat.S_ISLNK(info.st_mode):
        target = file.resolve(strict=False)
        row.update(kind='symlink', link=os.readlink(file), resolved=str(target), targetExists=target.exists())
        if target.is_file():
            row.update(targetSha256=digest(target), targetMode=stat.S_IMODE(target.stat().st_mode))
    elif stat.S_ISREG(info.st_mode):
        row.update(kind='file', bytes=info.st_size, sha256=digest(file))
    elif stat.S_ISDIR(info.st_mode):
        row.update(kind='directory')
    else:
        raise RuntimeError(f'REVIEW_UNEXPECTED_SOURCE_TYPE:{file}')
    return row


def files_under(root, relative):
    start = root / relative
    for directory, names, files in os.walk(start, followlinks=False):
        names[:] = sorted(name for name in names if not (
            pathlib.Path(directory) == root / 'node_modules' and name == '.cache'))
        for name in sorted(names + files):
            file = pathlib.Path(directory) / name
            if file.is_symlink() or file.is_file():
                yield file


def capture(root, plan, extra_files=()):
    files = set(root / name for name in plan['rootFiles'])
    for relative in plan['sourceRoots'] + plan['dependencyRoots'] + [plan['toolRoot']]:
        files.update(files_under(root, relative))
    files.update(pathlib.Path(file) for file in extra_files)
    return {str(file): describe(file) for file in sorted(files)}


def write_json(file, value):
    file.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
