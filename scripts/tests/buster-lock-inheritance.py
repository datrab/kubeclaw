"""Exercise actual native-parent launch inheritance against Linux OFD flock lifetime."""
import fcntl
import os
from pathlib import Path
import subprocess
import tempfile


def contender(lock_path):
    command = "import fcntl,sys; f=open(sys.argv[1]); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)"
    return subprocess.run(["python3", "-c", command, lock_path], capture_output=True).returncode


source = Path("docker/buster-runtime-entrypoint.sh").read_text()
launches = [line.strip() for line in source.splitlines()
            if "node /app/skills/buster/engine/native-parent.ts" in line]
assert len(launches) == 2
with tempfile.TemporaryDirectory(prefix="buster-parent-lock-") as directory:
    lock_path = os.path.join(directory, "lifetime.lock")
    for launch in launches:
        assert launch.endswith(" &") and "9>&-" not in launch, launch
        opened = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        if opened != 9:
            os.dup2(opened, 9)
            os.close(opened)
        try:
            fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert contender(lock_path) != 0
            redirection = launch.removesuffix(" &").split('node /app/skills/buster/engine/native-parent.ts', 1)[1]
            # Closing one inherited descriptor must not unlock another holder's OFD.
            child = subprocess.run(["sh", "-c", 'python3 -c "$1"' + redirection,
                                    "child", "import os; os.close(9)"], pass_fds=(9,), capture_output=True)
            assert child.returncode == 0, child.stderr
            assert contender(lock_path) != 0, "child close released the live parent's lock"
            survivor = subprocess.Popen(["sh", "-c", 'exec python3 -c "$1"' + redirection, "survivor",
                                         "import sys; print('held',flush=True); sys.stdin.read()"],
                                        pass_fds=(9,), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True)
            try:
                assert survivor.stdout.readline().strip() == "held"
                os.close(9)
                assert contender(lock_path) != 0, "parent loss released surviving child's lock"
            finally:
                survivor.communicate(input="", timeout=10)
            assert survivor.returncode == 0
            assert contender(lock_path) == 0, "last-holder close did not release the lock"
        finally:
            try:
                os.close(9)
            except OSError:
                pass
print("Both actual parent launch branches inherit fd9; child close and parent-loss survivor controls pass.")
