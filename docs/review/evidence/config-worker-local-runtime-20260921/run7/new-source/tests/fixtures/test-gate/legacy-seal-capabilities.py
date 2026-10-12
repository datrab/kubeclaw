"""Guest-only child: apply real Linux capabilities and invoke the unchanged verifier.

The disposable guest driver supplies fixtures and a watchdog. This child never
seals a tree or grants stop authority. Run using isolated Python (-I).
"""

import argparse
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import sys


ALLOWED = sum(1 << bit for bit in (0, 5, 6, 7, 8))
SYS_ADMIN = 21
PR_CAPBSET_DROP = 24
PR_CAP_AMBIENT = 47
PR_CAP_AMBIENT_CLEAR_ALL = 4


class Header(ctypes.Structure):
    _fields_ = [("version", ctypes.c_uint32), ("pid", ctypes.c_int)]


class Data(ctypes.Structure):
    _fields_ = [("effective", ctypes.c_uint32), ("permitted", ctypes.c_uint32),
                ("inheritable", ctypes.c_uint32)]


def checked(result):
    if result != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def capability_observation():
    status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines()
                  if ":" in line)
    fields = ("CapBnd", "CapEff", "CapPrm", "CapInh", "CapAmb")
    return {field: int(status[field].strip(), 16) for field in fields}


def apply_profile(retain_extra):
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.restype = ctypes.c_int
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong,
                          ctypes.c_ulong, ctypes.c_ulong]
    libc.capset.restype = ctypes.c_int
    libc.capset.argtypes = [ctypes.POINTER(Header), ctypes.POINTER(Data)]
    last = int(Path("/proc/sys/kernel/cap_last_cap").read_text())
    if last < SYS_ADMIN or last > 63:
        raise RuntimeError("unsupported capability ABI")
    checked(libc.prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0))
    for bit in range(last + 1):
        if not (ALLOWED & (1 << bit)):
            checked(libc.prctl(PR_CAPBSET_DROP, bit, 0, 0, 0))
    selected = ALLOWED | ((1 << SYS_ADMIN) if retain_extra else 0)
    header = Header(0x20080522, 0)  # Linux capability ABI v3, two u32 words.
    data = (Data * 2)()
    for index in range(2):
        data[index].effective = (selected >> (index * 32)) & 0xffffffff
        data[index].permitted = data[index].effective
    checked(libc.capset(ctypes.byref(header), data))
    actual = capability_observation()
    expected = {"CapBnd": ALLOWED, "CapEff": selected, "CapPrm": selected,
                "CapInh": 0, "CapAmb": 0}
    if actual != expected:
        raise RuntimeError(f"capability prerequisite mismatch: {actual}")
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verifier", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--kind", choices=("plan", "runtime"), required=True)
    parser.add_argument("--profile", choices=("parent", "retained-extra"), required=True)
    parser.add_argument("--maximum-bytes", type=int, required=True)
    parser.add_argument("--maximum-entries", type=int, required=True)
    args = parser.parse_args()
    if os.getuid() != 0 or os.geteuid() != 0 or os.getgid() != 0 or os.getegid() != 0:
        raise RuntimeError("guest root UID/GID prerequisite required")
    fixture = Path(args.root)
    if not fixture.is_absolute() or not fixture.is_relative_to("/var/lib/legacy-seal-tests"):
        raise RuntimeError("disposable guest fixture root required")
    if fixture.resolve() != fixture:
        raise RuntimeError("normalized no-symlink fixture root required")
    spec = importlib.util.spec_from_file_location("legacy_seal_verifier", args.verifier)
    if spec is None or spec.loader is None:
        raise RuntimeError("verifier module required")
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    actual = apply_profile(args.profile == "retained-extra")
    print(json.dumps({"phase": "capabilities", "uid": os.geteuid(), "gid": os.getegid(),
                      "sets": actual}, sort_keys=True), flush=True)
    # No exec here: retained-extra must keep effective SYS_ADMIN after dropping
    # its bounding bit. Exec could erase precisely the condition under test.
    result = verifier.verify(args.root, args.maximum_bytes, args.maximum_entries, args.kind)
    print(json.dumps({"phase": "verified", "observation": result}, sort_keys=True), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, RecursionError) as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
