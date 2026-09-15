#!/usr/bin/env python3
"""Keep onboarding available before login; supervise the pairable Codex daemon.

The status file describes process state, never successful pairing or relay health.
Authentication is completed interactively via kubectl exec, on the same PVC.
"""
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import threading
import time

stop = threading.Event()
child = None
state_file = Path('/tmp/codex-ops-status.json')

def status(phase, **extra):
    data = {'phase': phase, 'observedAt': time.time(), 'pairingVerified': False, **extra}
    temp = state_file.with_suffix('.tmp')
    temp.write_text(json.dumps(data) + '\n')
    temp.replace(state_file)

def shutdown(*_):
    stop.set()
    if child and child.poll() is None:
        child.terminate()

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

def control_ready(address):
    """A live local listener is required; a stale socket file is insufficient."""
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(0.5)
            connection.connect(str(address))
        return True
    except OSError:
        return False

def wait_for_control(address, timeout=20):
    deadline = time.monotonic() + timeout
    while not stop.is_set() and time.monotonic() < deadline:
        if control_ready(address):
            return True
        stop.wait(0.2)
    return False

def run_control(command, env, timeout=20):
    global child
    child = subprocess.Popen(command, env=env)
    try:
        return child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
        return 124
    finally:
        child = None

def main():
    home = Path.home()
    config_dir = home / '.codex'
    config_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    config = config_dir / 'config.toml'
    if not config.exists():
        shutil.copyfile('/opt/codex/config.toml', config)
        config.chmod(0o600)
    # Static helper only: no token is stored in the remote URL or Git config.
    subprocess.run(['git', 'config', '--global', 'credential.https://github.com.helper', '!gh auth git-credential'], check=True)
    env = os.environ.copy()
    env['KUBECLAW_MCP_TOKEN'] = Path('/var/run/kubeclaw-ops/bearer/token').read_text().strip()
    if len(env['KUBECLAW_MCP_TOKEN']) < 32:
        raise RuntimeError('MCP bearer token must contain at least 32 characters')
    control_socket = config_dir / 'app-server-control' / 'app-server-control.sock'
    # Both start and stop address the same persistent home as remote-control pair.
    command = ['codex', '-c', 'mcp_servers.kubeclaw_ops.url="http://127.0.0.1:8080/mcp"',
               '-c', 'mcp_servers.kubeclaw_ops.bearer_token_env_var="KUBECLAW_MCP_TOKEN"',
               'remote-control']
    while not stop.is_set():
        status('waiting-for-login')
        try:
            logged_in = subprocess.run(['codex', 'login', 'status'], stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, timeout=15, env=env).returncode == 0
        except subprocess.TimeoutExpired:
            logged_in = False
        if not logged_in:
            stop.wait(5)
            continue
        if stop.is_set():
            break
        status('remote-process-starting', controlSocketReady=False)
        try:
            code = run_control([*command, 'start'], env)
            if code == 0 and wait_for_control(control_socket):
                print('Codex daemon control socket is reachable; pairing is available.', flush=True)
                while not stop.is_set() and control_ready(control_socket):
                    status('remote-process-running', controlSocketReady=True)
                    stop.wait(2)
            else:
                print(f'Codex daemon failed to become ready (start exit {code}).', flush=True)
        finally:
            status('remote-process-stopping', controlSocketReady=False)
            # Stop the daemon, not merely the short-lived start command. If it
            # cannot be stopped, fail so Kubernetes disposes of the entire container.
            if run_control([*command, 'stop'], env, timeout=10) != 0:
                raise RuntimeError('Codex daemon stop failed')
        status('remote-process-exited', controlSocketReady=False)
        stop.wait(10)
    status('stopped')

if __name__ == '__main__':
    main()
