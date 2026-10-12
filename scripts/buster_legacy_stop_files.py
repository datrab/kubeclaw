"""Real filesystem primitives; callers must establish stop authority first."""
import array
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import time
from buster_legacy_stop_policy import encode, require, trusted_path

READ = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
IMMUTABLE = 0x10
GETFLAGS = 0x80000000 | (array.array('l').itemsize << 16) | (ord('f') << 8) | 1
SETFLAGS = 0x40000000 | (array.array('l').itemsize << 16) | (ord('f') << 8) | 2


def sync_directory(path):
    fd = os.open(path, READ | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_bytes(path, data, maximum, mode=0o600):
    require(len(data) <= maximum, 'METADATA_QUOTA')
    path = Path(path)
    temporary = path.with_name(path.name + '.new')
    try:
        stale = temporary.lstat()
    except FileNotFoundError:
        stale = None
    if stale is not None:
        # Only an uncommitted, private scratch inode can be discarded. The
        # producer lock excludes another active transaction writer.
        require(stat.S_ISREG(stale.st_mode) and stale.st_nlink == 1
                and stale.st_uid == os.geteuid() and stale.st_mode & 0o022 == 0
                and stale.st_size <= maximum, 'SCRATCH_UNTRUSTED')
        temporary.unlink()
        sync_directory(path.parent)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def ensure_directory(path):
    path = Path(path)
    try:
        path.mkdir(mode=0o700)
        sync_directory(path.parent)
    except FileExistsError:
        pass
    return trusted_path(path, directory=True)


def inode(fd):
    value = os.fstat(fd)
    return {'device': value.st_dev, 'inode': value.st_ino}


def acquire_original_locks(root, timeout):
    """Called only after positive writer stop, while restart exclusion remains."""
    handles, created = [], []
    try:
        for relative in ['.write-lock', 'records/.write-lock', 'results/.write-lock']:
            path = Path(root) / relative
            if not path.parent.exists():
                require(relative == 'results/.write-lock', 'RECORDS_REQUIRED')
                path.parent.mkdir(mode=0o700)
                sync_directory(root)
                created.append('results')
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
            except FileNotFoundError:
                fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
                os.fsync(fd)
                sync_directory(path.parent)
                created.append(relative)
            handles.append(fd)
            value = os.fstat(fd)
            require(stat.S_ISREG(value.st_mode) and value.st_nlink == 1, 'LOCK_INODE_INVALID')
            deadline = time.monotonic() + timeout
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, 'LOCK_TIMEOUT')
                    time.sleep(0.05)
        return handles, created
    except BaseException:
        for fd in handles:
            os.close(fd)
        raise


def mount_identity(fd):
    values = [line.split()[1] for line in Path(f'/proc/self/fdinfo/{fd}').read_text().splitlines()
              if line.startswith('mnt_id:')]
    require(len(values) == 1, 'MOUNT_ID_REQUIRED')
    matches = [line.split(' - ', 1)[1].split()[0] for line in Path('/proc/self/mountinfo').read_text().splitlines()
               if line.split()[0] == values[0]]
    require(len(matches) == 1, 'MOUNT_REQUIRED')
    return {'mountId': int(values[0]), 'filesystem': matches[0]}


def plan_tree(root, limits, *, inert_links=False):
    """Bounded same-mount inventory; no symlink traversal or mutation."""
    root = Path(root)
    require(root.resolve() == root, 'TREE_LINK_UNSUPPORTED')
    root_fd = os.open(root, READ | os.O_DIRECTORY)
    try:
        device = os.fstat(root_fd).st_dev
        mount = mount_identity(root_fd)
    finally:
        os.close(root_fd)
    rows, total = [], 0
    for directory, dirs, names in os.walk(root, followlinks=False):
        links = [name for name in dirs if (Path(directory) / name).is_symlink()]
        require(inert_links or not links, 'TREE_LINK_UNSUPPORTED')
        dirs[:] = [name for name in dirs if name not in links]
        for path in [Path(directory), *[Path(directory) / name for name in names + links]]:
            value = path.lstat()
            require(value.st_dev == device and (stat.S_ISDIR(value.st_mode) or
                    (stat.S_ISREG(value.st_mode) or inert_links and stat.S_ISLNK(value.st_mode))
                    and value.st_nlink == 1), 'TREE_ENTRY_UNSUPPORTED')
            require(len(rows) < limits['maximumEntries'], 'ENTRY_QUOTA')
            row = {'path': str(path.relative_to(root)), 'device': value.st_dev, 'inode': value.st_ino,
                   'directory': stat.S_ISDIR(value.st_mode), 'bytes': 0 if stat.S_ISDIR(value.st_mode) else value.st_size}
            if stat.S_ISLNK(value.st_mode):
                fd = os.open(path, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC)
                try:
                    require(inode(fd) == {k: row[k] for k in ['device', 'inode']}
                            and mount_identity(fd) == mount, 'TREE_CHANGED')
                    target = os.readlink('', dir_fd=fd)
                    row.update(linkTarget=target, bytes=len(os.fsencode(target)))
                finally:
                    os.close(fd)
                total += row['bytes']
                require(total <= limits['maximumBytes'], 'BYTE_QUOTA')
                rows.append(row)
                continue
            total += row['bytes']
            require(total <= limits['maximumBytes'], 'BYTE_QUOTA')
            fd = os.open(path, READ | (os.O_DIRECTORY if row['directory'] else 0))
            try:
                require(inode(fd) == {k: row[k] for k in ['device', 'inode']}
                        and mount_identity(fd) == mount, 'TREE_CHANGED')
                if not row['directory']:
                    h = hashlib.sha256(); remaining = value.st_size
                    while remaining:
                        data = os.read(fd, min(65536, remaining))
                        require(bool(data), 'TREE_CHANGED'); h.update(data); remaining -= len(data)
                    require(os.read(fd, 1) == b'', 'TREE_CHANGED')
                    row['digest'] = 'sha256:' + h.hexdigest()
                    after = os.fstat(fd)
                    require((after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
                            (value.st_size, value.st_mtime_ns, value.st_ctime_ns), 'TREE_CHANGED')
            finally:
                os.close(fd)
            rows.append(row)
    return {'rows': sorted(rows, key=lambda row: row['path']), 'bytes': total, 'entries': len(rows)}


def seal_tree(root, planned):
    for row in sorted(planned['rows'], key=lambda item: (item['path'] != '.', item['path'].count('/')), reverse=True):
        path = Path(root) / row['path']
        if 'linkTarget' in row:
            fd = os.open(path, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC)
            try:
                require(inode(fd) == {key: row[key] for key in ['device', 'inode']}
                        and os.readlink('', dir_fd=fd) == row['linkTarget'], 'TREE_REPLACED')
                if (os.fstat(fd).st_uid, os.fstat(fd).st_gid) != (0, 1000):
                    os.chown(path, 0, 1000, follow_symlinks=False)
                require(path.lstat().st_ino == row['inode'], 'TREE_REPLACED')
            finally:
                os.close(fd)
            continue
        fd = os.open(path, READ | (os.O_DIRECTORY if row['directory'] else 0))
        try:
            require(inode(fd) == {key: row[key] for key in ['device', 'inode']}, 'TREE_REPLACED')
            flags = array.array('l', [0])
            fcntl.ioctl(fd, GETFLAGS, flags, True)
            if flags[0] & IMMUTABLE == 0:
                os.fchown(fd, 0, 1000)
                os.fchmod(fd, 0o750 if row['directory'] else 0o640)
                flags[0] |= IMMUTABLE
                fcntl.ioctl(fd, SETFLAGS, flags)
                os.fsync(fd)
            fcntl.ioctl(fd, GETFLAGS, flags, True)
            require(flags[0] & IMMUTABLE, 'IMMUTABLE_NOT_SET')
        finally:
            os.close(fd)
