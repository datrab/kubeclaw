"""Run unchanged native test selection; bound this runner's own process group on unavailable-host hangs."""
import json
import os
import pathlib
import signal
import subprocess
import time
out = pathlib.Path('docs/review/evidence/prism-native-test-quality-20260921')
command = ['npm', 'run', 'verify:prism:native-worker']
started = time.monotonic()
with (out / 'native-suite.txt').open('w') as stream:
    child = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
    timed_out = False
    try:
        status = child.wait(timeout=35)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGTERM)
        try:
            status = child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            status = child.wait()
(out / 'native-suite-run.json').write_text(json.dumps({'command': command, 'returnCode': status,
    'elapsedSeconds': time.monotonic() - started, 'runnerDeadlineSeconds': 35,
    'terminatedOwnProcessGroupAfterDeadline': timed_out,
    'nativeHostConfigured': os.environ.get('PRISM_NATIVE_ISOLATED_TEST_POOL') == 'true'}, indent=2)+'\n')
print((out / 'native-suite-run.json').read_text())
