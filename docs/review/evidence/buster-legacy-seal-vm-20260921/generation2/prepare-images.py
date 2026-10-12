"""Create new guest-only ext4 files and readonly-source export; never mount or boot."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import stat
import subprocess
import uuid

repo = Path.cwd()
cache = repo / 'node_modules/.cache/buster-legacy-seal-vm-20260921/generation2'
guest = cache / 'guest-root'
evidence = repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921/generation2'
old_evidence = repo / 'docs/review/evidence/systemd-native-guest-proposal-20260921'
tool_root = repo / 'node_modules/.cache/systemd-native-vm-20260921/root'
assert os.geteuid() == 1000, 'Unprivileged preparation only'

def identity(file):
    row = {'mode': stat.S_IMODE(file.lstat().st_mode)}
    if file.is_symlink(): row.update(type='symlink', target=os.readlink(file))
    elif file.is_dir(): row.update(type='directory')
    elif file.is_file():
        with file.open('rb') as stream: checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        row.update(type='file', bytes=file.stat().st_size, sha256=checksum)
    else: raise RuntimeError('Unexpected entry: ' + str(file))
    return row

def capture(root):
    result = {'.': identity(root)}
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            file = Path(directory) / name
            result[str(file.relative_to(root))] = identity(file)
    return result

assert capture(guest) == json.loads((evidence / 'runtime-identities.json').read_text())
# Bind the complete existing tool closure, including its external loader, before
# using mke2fs. This is a read-only tool input, not a shared guest writable disk.
binding = runpy.run_path(str(old_evidence / 'runtime-binding.py'))
expected_tools = json.loads((old_evidence / 'tool-runtime-identities.json').read_text())
assert binding['capture'](tool_root) == expected_tools, 'Tool runtime drift'
export = cache / 'repo-snapshot'
export.mkdir()
source_rows = json.loads((repo / 'docs/review/evidence/buster-legacy-seal-driver-20260921/source-identities.json').read_text())
source_paths = {}
for row in source_rows:
    source = repo / row['path']
    assert identity(source)['sha256'] == row['sha256'], 'Driver source drift'
    target = export / row['path']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    assert target.stat().st_ino != source.stat().st_ino
    source_paths[source.name] = ('/repo/' + row['path'], row['sha256'])
command = ['/usr/bin/python3', '-I', source_paths['legacy-seal-guest.py'][0]]
for key, name in [('driver', 'legacy-seal-guest.py'), ('capability-child', 'legacy-seal-capabilities.py'),
                  ('verifier', 'buster-legacy-store-verify.py')]:
    filename, checksum = source_paths[name]
    command += ['--' + key, filename, '--' + key + '-sha256', checksum]
command += ['--ext4-device', '/dev/vda', '--second-ext4-device', '/dev/vdb']
# The frozen runner launches the unchanged driver; every selected case remains
# inside its own existing driver watchdog. No command or UID substitution.
(export / 'run.py').write_text('import os\ncommand = ' + repr(command) + '\nos.execv(command[0], command)\n')
boot = guest / 'guest-init'
assert not boot.exists()
shutil.copy2(evidence / 'guest-init.sh', boot)
boot.chmod(0o755)
old_manifest = json.loads((old_evidence / 'artifact-manifest.json').read_text())
for relative, output in [('node_modules/.cache/systemd-native-vm-20260921/initrd.cpio.gz', 'initrd.cpio.gz'),
                         ('node_modules/.cache/systemd-native-vm-20260921/root/boot/vmlinuz-virt', 'vmlinuz-virt')]:
    source = repo / relative
    expected = next(row for row in old_manifest['files'] if row['path'] == relative)
    actual = identity(source)
    assert actual['sha256'] == expected['sha256'] and actual['bytes'] == expected['bytes']
    target = cache / output
    assert not target.exists()
    shutil.copy2(source, target)
    assert target.stat().st_ino != source.stat().st_ino

images = []
environment = {'PATH': '/usr/bin:/bin', 'LD_LIBRARY_PATH': str(tool_root / 'usr/lib') + ':' + str(tool_root / 'lib')}
for name, size, populated in [('guest-root.ext4', 256 * 1024**2, True),
                              ('second.ext4', 16 * 1024**2, False)]:
    image = cache / name
    with image.open('xb') as stream: stream.truncate(size)
    fsuuid = str(uuid.uuid4())
    argv = [str(tool_root / 'sbin/mke2fs'), '-q', '-t', 'ext4', '-F', '-U', fsuuid,
            '-E', 'root_owner=0:0']
    if populated: argv += ['-d', str(guest)]
    argv.append(str(image))
    result = subprocess.run(argv, env=environment, text=True, capture_output=True, timeout=60)
    record = {'command': argv, 'exitCode': result.returncode, 'stdout': result.stdout,
              'stderr': result.stderr, 'filesystemUuid': fsuuid, 'logicalBytes': size,
              'allocatedBytes': image.stat().st_blocks * 512, 'identity': identity(image)}
    images.append(record)
    (evidence / 'image-build.json').write_text(json.dumps(images, indent=2) + '\n')
    result.check_returncode()
assert binding['capture'](tool_root) == expected_tools, 'Tool runtime changed during preparation'
for row in source_rows: assert identity(repo / row['path'])['sha256'] == row['sha256']
(evidence / 'guest-payload-identities.json').write_text(json.dumps(capture(guest), indent=2) + '\n')
(evidence / 'source-export-identities.json').write_text(json.dumps(capture(export), indent=2) + '\n')
artifacts = {name: identity(cache / name) for name in ('guest-root.ext4', 'second.ext4', 'initrd.cpio.gz', 'vmlinuz-virt')}
(evidence / 'prepared-artifacts.json').write_text(json.dumps(artifacts, indent=2) + '\n')
print(json.dumps({'images': len(images), 'logicalDiskBytes': sum(row['logicalBytes'] for row in images),
                  'sourceFiles': len(source_rows), 'vmBooted': False, 'hostMounts': False}))
