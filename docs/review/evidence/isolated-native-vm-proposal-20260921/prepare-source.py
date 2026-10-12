"""Create a readonly-export snapshot without ignored caches, git metadata, or host directories."""
import hashlib, json, os, pathlib, shutil, subprocess
repo = pathlib.Path.cwd()
cache = repo / 'node_modules/.cache/native-test-vm-20260921'
target = cache / 'repo-snapshot'
target.mkdir(exist_ok=False)
files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).split(b'\0')
for raw in files:
    if not raw:
        continue
    relative = pathlib.Path(os.fsdecode(raw))
    source = repo / relative
    if not source.exists() and not source.is_symlink():
        continue
    destination = target / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_symlink():
        link = os.readlink(source)
        if pathlib.Path(link).is_absolute():
            raise RuntimeError('Absolute source symlink needs explicit review: ' + str(relative))
        destination.symlink_to(link)
    else:
        shutil.copy2(source, destination)
shutil.copytree(repo / 'node_modules', target / 'node_modules', symlinks=True,
                ignore=lambda directory, names: [name for name in names if name == '.cache'])
records = []
for directory, directories, names in os.walk(target, followlinks=False):
    if pathlib.Path(directory) != target:
        records.append({'path': str(pathlib.Path(directory).relative_to(target)), 'type': 'directory'})
    for name in names + [name for name in directories if (pathlib.Path(directory) / name).is_symlink()]:
        file = pathlib.Path(directory) / name
        relative = str(file.relative_to(target))
        if file.is_symlink():
            link = os.readlink(file)
            resolved = (file.parent / link).resolve()
            if not resolved.is_relative_to(target):
                raise RuntimeError('Export-escaping dependency symlink needs explicit review: ' + relative)
            records.append({'path': relative, 'type': 'symlink', 'symlink': link})
        elif file.is_file():
            with file.open('rb') as stream:
                checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
            records.append({'path': relative, 'type': 'file', 'bytes': file.stat().st_size, 'sha256': checksum})
records.sort(key=lambda item: item['path'])
manifest = cache / 'repo-snapshot-manifest.json'
manifest.write_text(json.dumps(records, separators=(',', ':')) + '\n')
print(json.dumps({'entries': len(records), 'bytes': sum(row.get('bytes', 0) for row in records),
                  'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest()}, indent=2))
