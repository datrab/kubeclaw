"""Real Linux OFD/O_PATH/guardian controls, execution UID0, not UID1000 acceptance."""
import errno
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile

repo = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='buster-guardian-') as directory:
    root = Path(directory)
    binary = root / 'guardian'
    subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-O2',
                    str(repo / 'scripts/buster-lifetime-guardian.c'), '-o', str(binary)], check=True)
    lock = root / 'lifetime.lock'
    opened = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
    if opened != 9:
        os.dup2(opened, 9)
        os.close(opened)
    fcntl.flock(9, fcntl.LOCK_EX)
    child = root / 'service.py'
    child.write_text("""import errno,fcntl,os,sys
assert fcntl.fcntl(9,fcntl.F_GETFL) & os.O_PATH
try:
 fcntl.flock(9,fcntl.LOCK_UN)
except OSError as failure:
 assert failure.errno == errno.EBADF
else:
 raise AssertionError('witness unlocked the root OFD')
print('witness-denied-unlock',flush=True)
sys.stdin.read()
""")
    guardian = subprocess.Popen([str(binary), str(lock), '1000', str(os.getpid()), '/usr/bin/setpriv', '--', sys.executable, str(child)],
                                pass_fds=(9,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert guardian.stdout.readline().strip() == 'witness-denied-unlock'
        # Root parent loss of its own copy cannot release the guardian's OFD.
        os.close(9)
        probe = os.open(lock, os.O_RDONLY)
        try:
            try:
                fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                pass
            else:
                raise AssertionError('guardian failed to retain lock for live service')
        finally:
            os.close(probe)
        guardian.communicate(input='', timeout=10)
        assert guardian.returncode == 0
        probe = os.open(lock, os.O_RDONLY)
        try:
            fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            os.close(probe)
    finally:
        if guardian.poll() is None:
            guardian.kill()
            guardian.wait(timeout=10)

    # A real parent SIGKILL makes the root guardian terminate a stopped service
    # within its configured grace; no held lock or live service is inferred away.
    receipt = root / 'pids'
    blocked = root / 'stopped-service.py'
    blocked.write_text("""import os,signal,sys
from pathlib import Path
Path(sys.argv[1]).write_text(str(os.getpid()))
signal.signal(signal.SIGTERM,signal.SIG_IGN)
os.kill(os.getpid(),signal.SIGSTOP)
signal.pause()
""")
    parent = root / 'parent.py'
    parent.write_text("""import fcntl,os,subprocess,sys
fd=os.open(sys.argv[2],os.O_RDWR)
os.dup2(fd,9)
if fd != 9: os.close(fd)
fcntl.flock(9,fcntl.LOCK_EX)
p=subprocess.Popen([sys.argv[1],sys.argv[2],'250',str(os.getpid()),'/usr/bin/setpriv','--',sys.executable,sys.argv[3],sys.argv[4]],pass_fds=(9,))
print(p.pid,flush=True)
sys.stdin.read()
""")
    owner = subprocess.Popen([sys.executable, str(parent), str(binary), str(lock), str(blocked), str(receipt)],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        guard_pid = int(owner.stdout.readline())
        # Wait on actual service creation, not a sampled sleep-as-success.
        import time
        limit = time.monotonic() + 10
        while not receipt.exists():
            if time.monotonic() >= limit:
                raise AssertionError('stopped service did not start')
            time.sleep(0.01)
        service_pid = int(receipt.read_text())
        while '\nState:\tT' not in Path(f'/proc/{service_pid}/status').read_text():
            if time.monotonic() >= limit:
                raise AssertionError('service did not actually enter stopped state')
            time.sleep(0.01)
        owner.kill()
        owner.wait(timeout=10)
        probe = os.open(lock, os.O_RDONLY)
        try:
            while True:
                try:
                    fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= limit:
                        raise AssertionError('parent death left guardian lock held')
                    time.sleep(0.01)
        finally:
            os.close(probe)
        try:
            os.kill(service_pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError('guardian released before its service was actually reaped')
    finally:
        if owner.poll() is None:
            owner.kill()
            owner.wait(timeout=10)
print('Real guardian O_PATH unlock-denial, parent-close retention, last-close release and parent-SIGKILL/stopped-service controls PASS (UID0 only).')
