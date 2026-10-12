"""Build guest-only disk/initrd artifacts; this script never boots QEMU or mounts filesystems."""
import gzip, hashlib, json, os, pathlib, shutil, stat, subprocess, sys
repo = pathlib.Path.cwd()
cache = repo / 'node_modules/.cache/buster-helper-vm-20260921'
root = cache / 'root'
guest = cache / 'guest-root'
evidence = repo / 'docs/review/evidence/isolated-buster-helper-vm-proposal-20260921'
# The separately generated identity is persistent for this guest generation.
identity = json.loads((evidence / 'guest-identity.json').read_text())['uuid']
import uuid
assert str(uuid.UUID(identity, version=4)) == identity
machine_id = guest / 'etc/machine-id'
assert machine_id.read_text() == identity + '\n', 'Missing/mismatched persistent guest identity'
assert stat.S_IMODE(machine_id.stat().st_mode) == 0o444
version = '6.18.52-0-virt' 
env = {**os.environ, 'LD_LIBRARY_PATH': str(root / 'usr/lib') + ':' + str(root / 'lib')}
# Package extraction happened earlier after apk verify; no package install scripts run.
for directory in ['bin', 'etc', 'usr/local/bin', 'proc', 'sys', 'dev', 'run', 'tmp', 'repo', 'results']:
    (guest / directory).mkdir(parents=True, exist_ok=True)
shutil.copy2('/usr/local/bin/node', guest / 'usr/local/bin/node')
shutil.copy2(evidence / 'guest-init.sh', guest / 'guest-init')
os.chmod(guest / 'guest-init', 0o755)
os.chmod(guest / 'tmp', 0o1777)
(guest / 'etc/passwd').write_text('root:x:0:0:root:/root:/bin/sh\nnode:x:1000:1000:node:/tmp:/bin/sh\n')
(guest / 'etc/group').write_text('root:x:0:\nnode:x:1000:\n')
for name in subprocess.check_output([str(root / 'bin/busybox'), '--list'], env=env, text=True).splitlines():
    destination = guest / 'bin' / name
    if not destination.exists() and not destination.is_symlink():
        destination.symlink_to('busybox')
# Embed only modules needed to reach the disk and readonly 9p export.
module_root = root / 'lib/modules' / version
lines = (module_root / 'modules.dep').read_text().splitlines()
deps = {line.split(':')[0]: line.split(':', 1)[1].split() for line in lines}
ordered = []
def visit(name):
    for dependency in deps[name]:
        visit(dependency)
    if name not in ordered:
        ordered.append(name)
for basename in ['virtio_blk.ko.gz', 'ext4.ko.gz', '9p.ko.gz', '9pnet_virtio.ko.gz', 'virtio-rng.ko.gz']:
    matches = [name for name in deps if name.endswith('/' + basename)]
    assert len(matches) == 1, (basename, matches)
    visit(matches[0])
entries = []
def add(name, data=b'', mode=stat.S_IFREG | 0o644, rmajor=0, rminor=0):
    entries.append((name, data, mode, rmajor, rminor))
for directory in ['bin', 'lib', 'proc', 'sys', 'dev', 'newroot', 'modules']:
    add(directory, mode=stat.S_IFDIR | 0o755)
add('dev/console', mode=stat.S_IFCHR | 0o600, rmajor=5, rminor=1)
add('dev/null', mode=stat.S_IFCHR | 0o666, rmajor=1, rminor=3)
add('bin/busybox', (root / 'bin/busybox').read_bytes(), stat.S_IFREG | 0o755)
add('bin/sh', b'busybox', stat.S_IFLNK | 0o777)
add('lib/ld-musl-x86_64.so.1', (root / 'lib/ld-musl-x86_64.so.1').read_bytes(), stat.S_IFREG | 0o755)
module_names = []
for name in ordered:
    target = pathlib.Path(name).name.removesuffix('.gz')
    add('modules/' + target, gzip.decompress((module_root / name).read_bytes()))
    module_names.append(target)
init = '#!/bin/sh\nset -eu\n/bin/busybox mount -t proc proc /proc\n/bin/busybox mount -t sysfs sysfs /sys\n/bin/busybox mount -t devtmpfs devtmpfs /dev\n'
for name in module_names:
    init += '/bin/busybox insmod /modules/' + name + '\n'
init += 'for attempt in 1 2 3 4 5 6 7 8 9 10; do\n  [ -b /dev/vda ] && break\n  /bin/busybox sleep 1\ndone\n/bin/busybox mount -t ext4 /dev/vda /newroot\n/bin/busybox umount /proc\n/bin/busybox umount /sys\n/bin/busybox umount /dev\nexec /bin/busybox switch_root /newroot /guest-init\n'
add('init', init.encode(), stat.S_IFREG | 0o755)
archive = bytearray()
for inode, (name, data, mode, rmajor, rminor) in enumerate(entries + [('TRAILER!!!', b'', 0, 0, 0)], 1):
    encoded_name = name.encode() + b'\0'
    fields = [inode, mode, 0, 0, 1, 0, len(data), 0, 0, rmajor, rminor, len(encoded_name), 0]
    archive.extend(('070701' + ''.join(f'{value:08x}' for value in fields)).encode())
    archive.extend(encoded_name)
    archive.extend(b'\0' * (-len(archive) % 4))
    archive.extend(data)
    archive.extend(b'\0' * (-len(archive) % 4))
(cache / 'initrd.cpio.gz').write_bytes(gzip.compress(archive, mtime=0))
(cache / 'initrd-init.sh').write_text(init)
image = cache / 'guest-root.ext4'
cmd = [str(root / 'sbin/mke2fs'), '-q', '-t', 'ext4', '-F', '-d', str(guest), str(image)]
if '--initrd-only' not in sys.argv:
    if image.exists():
        raise SystemExit('Refusing to replace existing guest disk; preserve evidence and select a fresh cache directory.')
    with image.open('xb') as stream:
        stream.truncate(8 * 1024**3)
    with (cache / 'logs/mke2fs.txt').open('w') as log:
        subprocess.run(cmd, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
(cache / 'image-build.json').write_text(json.dumps({
    'command': cmd, 'initrdUncompressedBytes': len(archive),
    'initrdCompressedBytes': (cache / 'initrd.cpio.gz').stat().st_size,
    'modules': ordered, 'guestDiskLogicalBytes': image.stat().st_size,
    'guestDiskAllocatedBytes': image.stat().st_blocks * 512,
    'guestNodeVersion': subprocess.check_output(['/usr/local/bin/node', '--version'], text=True).strip(),
    'guestNodeSha256': hashlib.sha256((guest / 'usr/local/bin/node').read_bytes()).hexdigest(),
}, indent=2) + '\n')
print((cache / 'image-build.json').read_text())
