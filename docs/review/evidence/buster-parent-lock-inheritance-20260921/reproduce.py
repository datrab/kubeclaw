"""Demonstrate shared flock authority using only an unprivileged temporary file."""
import fcntl
import json
import pathlib
import subprocess
import sys
import tempfile

CONTENDER = """import fcntl,sys
with open(sys.argv[1], 'a+') as stream:
    try: fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: sys.exit(7)
"""
with tempfile.TemporaryDirectory(prefix="buster-parent-lock-") as directory:
    file = pathlib.Path(directory) / "lifetime.lock"
    with file.open("w+") as parent:
        fcntl.flock(parent, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = subprocess.run([sys.executable, "-c", CONTENDER, str(file)]).returncode
        child = subprocess.run([
            sys.executable, "-c",
            "import fcntl,sys;fcntl.flock(int(sys.argv[1]),fcntl.LOCK_UN)",
            str(parent.fileno()),
        ], pass_fds=(parent.fileno(),)).returncode
        after = subprocess.run([sys.executable, "-c", CONTENDER, str(file)]).returncode
        assert (before, child, after) == (7, 0, 0)
        print(json.dumps({
            "model": "actual Linux flock shared inherited descriptor; unprivileged workspace temporary file",
            "parentLockStillOpen": not parent.closed,
            "contenderBeforeChildUnlock": before,
            "childUnlockExit": child,
            "contenderAfterChildUnlock": after,
        }, indent=2))
