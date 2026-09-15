"""Start the real pinned server without credentials; verify the pairing transport."""
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time

with tempfile.TemporaryDirectory(prefix='ops-server-') as directory:
    env = {**os.environ, 'CODEX_HOME': directory}
    address = Path(directory) / 'app-server-control/app-server-control.sock'
    with tempfile.TemporaryFile() as log:
        server = subprocess.Popen(
            ['codex', 'app-server', '--remote-control', '--listen', 'unix://'],
            env=env, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 20
            while True:
                try:
                    with socket.socket(socket.AF_UNIX) as connection:
                        connection.settimeout(1)
                        connection.connect(str(address))
                    break
                except OSError:
                    if server.poll() is not None or time.monotonic() >= deadline:
                        log.seek(0)
                        raise AssertionError(log.read().decode(errors='replace'))
                    time.sleep(0.1)
            # No fake credentials or relay calls: the server must reject pairing
            # for the absent login, rather than fail to connect to its socket.
            pairing = subprocess.run(['codex', 'remote-control', 'pair'], env=env,
                                     capture_output=True, text=True, timeout=20)
            output = pairing.stdout + pairing.stderr
            assert pairing.returncode != 0, 'Unexpected unauthenticated pairing success'
            assert re.search(r'log.?in|authenticat|ChatGPT', output, re.I), output
            assert 'failed to connect' not in output.lower(), output
            assert server.poll() is None, 'Pairing failure terminated the app-server'
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
    print('PASS: real app-server exposes pairing socket; unauthenticated pairing is rejected')
