"""Read-only ext4 immutable-tree verification; NOT an old-writer stop proof."""

import argparse
import array
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import struct
import uuid


IMMUTABLE = 0x10
# Linux FS_IOC_GETFLAGS uses sizeof(long), including on 64-bit architectures.
GETFLAGS = 0x80000000 | (array.array("l").itemsize << 16) | (ord("f") << 8) | 1
# Linux ext4 UAPI: _IOR('f', 44, struct fsuuid), whose fixed header is two u32s.
GETUUID = 0x80000000 | (8 << 16) | (ord("f") << 8) | 44
READ = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK


def require(condition, reason):
    if not condition:
        raise ValueError("BUSTER_LEGACY_SEAL_" + reason)


def mount_id(fd):
    rows = Path(f"/proc/self/fdinfo/{fd}").read_text().splitlines()
    values = [row.split()[1] for row in rows if row.startswith("mnt_id:")]
    require(len(values) == 1, "MOUNT_ID_REQUIRED")
    return int(values[0])


def trusted(value):
    require(value.st_uid == 0 and value.st_mode & 0o022 == 0, "AUTHORITY_INVALID")


def same(left, right):
    return (left.st_dev, left.st_ino, left.st_mode, left.st_uid, left.st_gid,
            left.st_nlink, left.st_size, left.st_mtime_ns, left.st_ctime_ns) == (
                right.st_dev, right.st_ino, right.st_mode, right.st_uid, right.st_gid,
                right.st_nlink, right.st_size, right.st_mtime_ns, right.st_ctime_ns)


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def filesystem_uuid(fd):
    value = bytearray(struct.pack("=II", 16, 0) + bytes(16))
    fcntl.ioctl(fd, GETUUID, value, True)
    require(struct.unpack_from("=II", value) == (16, 0) and any(value[8:]), "UUID_INVALID")
    return str(uuid.UUID(bytes=bytes(value[8:])))


def verify(root, maximum_bytes, maximum_entries, kind="plan"):
    require(os.geteuid() == 0, "ROOT_REQUIRED")
    require(maximum_bytes > 0 and maximum_entries > 0, "LIMIT_INVALID")
    require(kind in ("plan", "runtime"), "KIND_INVALID")
    # Match the narrow parent authority: reject extra authority, including
    # immutable-flag changes, mounts, raw I/O, ptrace and kernel module loading.
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines()
                  if ":" in line)
    allowed = sum(1 << bit for bit in (0, 5, 6, 7, 8))  # CHOWN, KILL, SETGID, SETUID, SETPCAP
    for field in ("CapBnd", "CapEff", "CapPrm", "CapInh", "CapAmb"):
        require(field in status and int(status[field].strip(), 16) & ~allowed == 0,
                "CAPABILITY_BOUND_INVALID")
    require(root.startswith("/") and os.path.normpath(root) == root and root != "/",
            "PATH_INVALID")

    # Open the ancestry one component at a time, retaining the final descriptor.
    fd = os.open("/", READ | os.O_DIRECTORY)
    try:
        trusted(os.fstat(fd))
        for component in root.split("/")[1:]:
            next_fd = os.open(component, READ | os.O_DIRECTORY, dir_fd=fd)
            os.close(fd)
            fd = next_fd
            trusted(os.fstat(fd))
        root_stat = os.fstat(fd)
        expected_mount = mount_id(fd)
        mounts = [line.split(" - ", 1) for line in Path("/proc/self/mountinfo").read_text().splitlines()]
        selected = [right.split()[0] for left, right in mounts
                    if int(left.split()[0]) == expected_mount]
        require(selected == ["ext4"], "EXT4_REQUIRED")
        filesystem = filesystem_uuid(fd)
        inventory = hashlib.sha256()
        inventory.update(encode({"filesystemUuid": filesystem}) + b"\n")
        counts = {"bytes": 0, "entries": 0, "resultBytes": 0, "resultEntries": 0}
        original = None

        def visit(handle, relative):
            nonlocal original
            before = os.fstat(handle)
            trusted(before)
            require(mount_id(handle) == expected_mount and before.st_dev == root_stat.st_dev,
                    "MOUNT_CHANGED")
            directory = stat.S_ISDIR(before.st_mode)
            require(directory or (stat.S_ISREG(before.st_mode) and before.st_nlink == 1),
                    "ENTRY_INVALID")
            flags = array.array("l", [0])
            fcntl.ioctl(handle, GETFLAGS, flags, True)
            require(flags[0] & IMMUTABLE != 0, "IMMUTABLE_REQUIRED")
            counts["entries"] += 1
            require(counts["entries"] <= maximum_entries, "ENTRY_LIMIT")
            entry = {"path": relative, "inode": before.st_ino,
                     "mode": stat.S_IMODE(before.st_mode), "uid": before.st_uid,
                     "gid": before.st_gid, "kind": "directory" if directory else "file"}
            if directory:
                # Bound allocation before sorting directory entries.
                names = []
                with os.scandir(handle) as stream:
                    for item in stream:
                        require(len(names) < maximum_entries - counts["entries"], "ENTRY_LIMIT")
                        names.append(item.name)
                inventory.update(encode(entry) + b"\n")
                for name in sorted(names):
                    # O_PATH inspects identity/type without invoking a device's
                    # open operation. Reopen only an allowed, held inode through
                    # procfs; never follow the original directory entry again.
                    identity_fd = os.open(name, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC,
                                          dir_fd=handle)
                    try:
                        child_stat = os.fstat(identity_fd)
                        child_path = name if relative == "." else relative + "/" + name
                        require(mount_id(identity_fd) == expected_mount
                                and child_stat.st_dev == root_stat.st_dev, "MOUNT_CHANGED")
                        if kind == "runtime" and stat.S_ISLNK(child_stat.st_mode):
                            # The already-verified immutable parent protects this
                            # directory entry. A link is metadata, never a claim
                            # that its target is immutable or inside this tree.
                            require(child_stat.st_uid == 0 and child_stat.st_nlink == 1,
                                    "AUTHORITY_INVALID")
                            target = os.readlink("", dir_fd=identity_fd)
                            target_bytes = len(os.fsencode(target))
                            require(target_bytes == child_stat.st_size, "SOURCE_CHANGED")
                            counts["entries"] += 1
                            counts["bytes"] += target_bytes
                            require(counts["entries"] <= maximum_entries, "ENTRY_LIMIT")
                            require(counts["bytes"] <= maximum_bytes, "BYTE_LIMIT")
                            inventory.update(encode({"path": child_path, "kind": "symlink",
                                "inode": child_stat.st_ino, "uid": child_stat.st_uid,
                                "gid": child_stat.st_gid, "mode": stat.S_IMODE(child_stat.st_mode),
                                "bytes": target_bytes, "target": target}) + b"\n")
                            require(same(child_stat, os.fstat(identity_fd)), "SOURCE_CHANGED")
                            continue
                        require(stat.S_ISDIR(child_stat.st_mode) or (
                            stat.S_ISREG(child_stat.st_mode) and child_stat.st_nlink == 1),
                            "ENTRY_INVALID")
                        trusted(child_stat)
                        child = os.open(f"/proc/self/fd/{identity_fd}",
                                        os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
                        try:
                            require(same(child_stat, os.fstat(child)), "SOURCE_CHANGED")
                            visit(child, child_path)
                        finally:
                            os.close(child)
                    finally:
                        os.close(identity_fd)
            else:
                counts["bytes"] += before.st_size
                require(counts["bytes"] <= maximum_bytes, "BYTE_LIMIT")
                digest = hashlib.sha256()
                remaining = before.st_size
                while remaining:
                    data = os.read(handle, min(65536, remaining))
                    require(bool(data), "SOURCE_CHANGED")
                    digest.update(data)
                    remaining -= len(data)
                require(os.read(handle, 1) == b"", "SOURCE_CHANGED")
                entry.update(bytes=before.st_size, digest="sha256:" + digest.hexdigest())
                inventory.update(encode(entry) + b"\n")
                if relative.startswith("results/"):
                    counts["resultBytes"] += before.st_size
                    counts["resultEntries"] += 1
                if relative == "records/store.json":
                    original = {"device": before.st_dev, "inode": before.st_ino,
                                "bytes": before.st_size, "digest": entry["digest"]}
            require(same(before, os.fstat(handle)), "SOURCE_CHANGED")

        visit(fd, ".")
        if kind == "plan":
            require(original is not None, "STORE_REQUIRED")
        require(same(root_stat, os.stat(root, follow_symlinks=False)), "SOURCE_CHANGED")
        require(filesystem_uuid(fd) == filesystem, "SOURCE_CHANGED")
        if kind == "runtime":
            return {"schemaVersion": "buster-legacy-immutable-runtime.v1", "filesystemUuid": filesystem, "device": root_stat.st_dev,
                    "inode": root_stat.st_ino, "mountId": expected_mount,
                    "inventoryDigest": "sha256:" + inventory.hexdigest(),
                    "bytes": counts["bytes"], "entries": counts["entries"]}
        return {"schemaVersion": "buster-legacy-immutable-tree.v1", "filesystemUuid": filesystem, "device": root_stat.st_dev,
                "inode": root_stat.st_ino, "mountId": expected_mount,
                "inventoryDigest": "sha256:" + inventory.hexdigest(), "store": original, **counts}
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="/var/lib/buster-v2/plan-jobs")
    parser.add_argument("--kind", choices=("plan", "runtime"), default="plan")
    parser.add_argument("--maximum-bytes", required=True, type=int)
    parser.add_argument("--maximum-entries", required=True, type=int)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.root, args.maximum_bytes, args.maximum_entries, args.kind), sort_keys=True))
    except (OSError, ValueError, RecursionError) as error:
        parser.exit(1, f"{type(error).__name__}: {error}\n")


if __name__ == "__main__":
    main()
