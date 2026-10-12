"""Default: print the exact command. Execution requires explicit coordinator scope/resource review."""
import argparse, ctypes, hashlib, json, os, pathlib, resource, signal, subprocess, time, selectors, stat
parser = argparse.ArgumentParser()
parser.add_argument('--execute-reviewed-proposal', action='store_true')
parser.add_argument('--confirm-no-heavy-tests', action='store_true')
parser.add_argument('--verify-only', action='store_true')
args = parser.parse_args()
# Fixed reviewed pair, preserving the original 2560 MiB additive envelope.
INITIAL_MEMORY_LIMIT = 768 * 1024**2
QEMU_AS_LIMIT = 1792 * 1024**2
assert INITIAL_MEMORY_LIMIT + QEMU_AS_LIMIT == 2560 * 1024**2
repo = pathlib.Path.cwd()
cache = repo / 'node_modules/.cache/buster-legacy-seal-vm-20260921/generation5'
# Existing authenticated emulator/tool closure is reused read-only. Guest disks and export are independent.
root = repo / 'node_modules/.cache/systemd-native-vm-20260921/root'
export = cache / 'repo-snapshot'
for value in [cache, root, export]:
    if ',' in str(value):
        raise SystemExit('Comma in QEMU option path requires separately reviewed escaping.')
command = [str(root / 'usr/bin/qemu-system-x86_64'),
    '-name', 'buster-legacy-seal-generation5-20260921', '-no-user-config', '-nodefaults', '-machine', 'q35,usb=off,dump-guest-core=off',
    '-accel', 'tcg,thread=multi,tb-size=64', '-cpu', 'max', '-smp', '2', '-m', '1024',
    '-L', str(root / 'usr/share/qemu'), '-display', 'none', '-serial', 'stdio',
    '-monitor', 'none', '-nic', 'none', '-no-reboot',
    '-kernel', str(cache / 'vmlinuz-virt'), '-initrd', str(cache / 'initrd.cpio.gz'),
    '-append', 'console=ttyS0,115200 rdinit=/init panic=-1 cgroup_no_v1=all',
    '-drive', 'file=' + str(cache / 'guest-root.ext4') + ',format=raw,if=none,id=guestroot,cache=none',
    '-device', 'virtio-blk-pci,drive=guestroot',
    '-drive', 'file=' + str(cache / 'second.ext4') + ',format=raw,if=none,id=second,cache=none',
    '-device', 'virtio-blk-pci,drive=second',
    '-fsdev', 'local,id=repo,path=' + str(export) + ',security_model=none,readonly=on',
    '-device', 'virtio-9p-pci,fsdev=repo,mount_tag=repo',
    '-object', 'rng-builtin,id=rng0', '-device', 'virtio-rng-pci,rng=rng0']
if not args.execute_reviewed_proposal and not args.verify_only:
    print(json.dumps({'notExecuted': True, 'command': command}, indent=2))
    raise SystemExit(0)
if os.geteuid() != 1000:
    raise SystemExit('Run only as the existing unprivileged workspace uid 1000.')
if args.execute_reviewed_proposal and not args.confirm_no_heavy_tests:
    raise SystemExit('Coordinate completion of all other heavy workspace runs before execution.')
# These flags do not establish authorization. The coordinator must first review
# whether execution is covered by the user task and approve this exact bounded plan.
maximum = int(pathlib.Path('/sys/fs/cgroup/memory.max').read_text())
statistics = dict(line.split() for line in pathlib.Path('/sys/fs/cgroup/memory.stat').read_text().splitlines())
if not all(key in statistics and int(statistics[key]) >= 0 for key in ['anon', 'kernel', 'shmem']):
    raise SystemExit('Required charged-memory observations unavailable.')
charged_baseline = sum(int(statistics[key]) for key in ['anon', 'kernel', 'shmem'])
if maximum < 3 * 1024**3 or charged_baseline > INITIAL_MEMORY_LIMIT:
    raise SystemExit('Fixed host memory envelope unavailable; do not raise guest budget automatically.')
def checksum_file(file):
    with file.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        # These are this fixture's cache files, not live repository files. Avoid
        # retaining a whole sparse-disk read in the shared container page cache.
        if file.resolve().is_relative_to(cache.resolve()):
            os.posix_fadvise(stream.fileno(), 0, 0, os.POSIX_FADV_DONTNEED)
        return checksum
manifest = json.loads((repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921/generation5/artifact-manifest-smaller-as.json').read_text())
expected_artifacts = {item['path']: item for item in manifest['files']}
def verify_artifacts(after=False):
    verified = {}
    for relative, expected in expected_artifacts.items():
        file = repo / relative
        if after and file in (cache / 'guest-root.ext4', cache / 'second.ext4'):
            continue
        if not stat.S_ISREG(file.lstat().st_mode) or stat.S_IMODE(file.lstat().st_mode) != expected['mode']:
            raise SystemExit('Prepared artifact type/mode changed: ' + relative)
        actual = checksum_file(file)
        if file.stat().st_size != expected['bytes'] or actual != expected['sha256']:
            raise SystemExit('Prepared artifact changed: ' + relative)
        verified[relative] = actual
    return verified
verified_artifacts = verify_artifacts()
import runpy
runtime_binding = runpy.run_path(str(repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921/generation5/runtime-binding.py'))
def verify_tool_runtime():
    expected = json.loads((repo / 'docs/review/evidence/buster-legacy-seal-vm-20260921/generation5/tool-runtime-identities.json').read_text())
    if runtime_binding['capture'](root) != expected:
        raise SystemExit('QEMU tool runtime identities changed.')
verify_tool_runtime()
initial_disk_sha256 = verified_artifacts[str((cache / 'guest-root.ext4').relative_to(repo))]
def verify_snapshot():
    expected_entries = {item['path']: item for item in json.loads((cache / 'repo-snapshot-manifest.json').read_text())}
    actual_entries = {'.': 'directory'}
    for directory, directories, names in os.walk(export, followlinks=False):
        directory = pathlib.Path(directory)
        if directory != export:
            actual_entries[str(directory.relative_to(export))] = 'directory'
        for name in names + [name for name in directories if (directory / name).is_symlink()]:
            file = directory / name
            mode = file.lstat().st_mode
            kind = 'symlink' if stat.S_ISLNK(mode) else 'file' if stat.S_ISREG(mode) else 'unsupported'
            actual_entries[str(file.relative_to(export))] = kind
    if set(actual_entries) != set(expected_entries):
        raise SystemExit('Snapshot entry set changed (extra or missing files/directories).')
    for relative, item in expected_entries.items():
        file = export / relative
        if stat.S_IMODE(file.lstat().st_mode) != item['mode']:
            raise SystemExit('Snapshot mode changed: ' + relative)
        if actual_entries[relative] != item['type']:
            raise SystemExit('Snapshot entry type changed: ' + relative)
        if item['type'] == 'symlink':
            if os.readlink(file) != item['symlink'] or not file.resolve().is_relative_to(export.resolve()):
                raise SystemExit('Snapshot symlink changed or escapes export: ' + relative)
        elif item['type'] == 'file':
            if checksum_file(file) != item['sha256']:
                raise SystemExit('Snapshot bytes changed: ' + relative)
verify_snapshot()
# Drop only this newly created fixture's own file-cache pages after verification.
# No global cache control, live source tree, or unrelated cache is touched.
for directory, directories, names in os.walk(cache, followlinks=False):
    for name in names:
        file = pathlib.Path(directory) / name
        if file.is_symlink() or not file.is_file():
            continue
        with file.open('rb') as stream:
            os.posix_fadvise(stream.fileno(), 0, 0, os.POSIX_FADV_DONTNEED)
if args.verify_only:
    print(json.dumps({'verified': True, 'vmBooted': False, 'initialArtifacts': verified_artifacts,
        'memoryCurrentAfterOwnCacheHints': pathlib.Path('/sys/fs/cgroup/memory.current').read_text().strip()}, indent=2))
    raise SystemExit(0)
coordinator_pid = os.getpid()
def limits():
    # Stop the newly created emulator if this watchdog process disappears.
    if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
        os._exit(125)
    if os.getppid() != coordinator_pid:
        os._exit(125)
    resource.setrlimit(resource.RLIMIT_AS, (QEMU_AS_LIMIT, QEMU_AS_LIMIT))
    resource.setrlimit(resource.RLIMIT_CPU, (1200, 1210))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.nice(10)
environment = {'PATH': '/usr/bin:/bin', 'LD_LIBRARY_PATH': str(root / 'usr/lib') + ':' + str(root / 'lib')}
log = cache / 'logs-smaller-as/vm-console.txt'
start = time.monotonic()
reason = None
with log.open('xb') as stream:
    process = subprocess.Popen(command, env=environment, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=limits)
    print('Started isolated QEMU pid', process.pid, flush=True)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    os.set_blocking(process.stdout.fileno(), False)
    booted = False
    tail = b''
    written = 0
    def consume(chunk):
        global booted, tail, written, reason
        remaining = 64 * 1024**2 - written
        stream.write(chunk[:remaining])
        stream.flush()
        written += min(len(chunk), remaining)
        tail = (tail + chunk)[-8192:]
        booted = booted or b'VM_BOOTED=1' in tail
        if len(chunk) > remaining:
            reason = '64 MiB console output cap reached'
    while process.poll() is None:
        for key, _mask in selector.select(timeout=0.25):
            chunk = os.read(key.fd, 65536)
            if chunk:
                consume(chunk)
        current = int(pathlib.Path('/sys/fs/cgroup/memory.current').read_text())
        if current > 2816 * 1024**2:
            reason = 'shared workspace memory exceeded 2.75 GiB conservative stop threshold'
        elapsed = time.monotonic() - start
        if not booted and elapsed > 120:
            reason = '120-second VM boot/readonly-export watchdog expired'
        if elapsed > 900:
            reason = '900-second outer wall-clock budget expired'
        if reason:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
            break
    returncode = process.wait()
    while True:
        try:
            chunk = os.read(process.stdout.fileno(), 65536)
        except BlockingIOError:
            break
        if not chunk:
            break
        consume(chunk)
    selector.close()
text = log.read_text(errors='replace')
try:
    verify_snapshot()
    verify_artifacts(after=True)
    verify_tool_runtime()
except (OSError, SystemExit) as error:
    reason = 'post-run source snapshot verification failed: ' + str(error)
passed = returncode == 0 and reason is None and 'VM_REVIEW_EXIT=0' in text
(cache / 'logs-smaller-as/vm-result.json').write_text(json.dumps({'qemuExitCode': returncode,
    'elapsedSeconds': time.monotonic() - start, 'stoppedReason': reason, 'passed': passed,
    'verifiedInitialArtifacts': verified_artifacts, 'initialDiskSha256': initial_disk_sha256,
    'finalMutableDiskSha256': checksum_file(cache / 'guest-root.ext4'),
    'finalSecondDiskSha256': checksum_file(cache / 'second.ext4')}, indent=2) + '\n')
raise SystemExit(0 if passed else 1)
