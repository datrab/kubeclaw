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

def run_control(command, env, timeout=20, quiet=False):
    global child
    child = subprocess.Popen(command, env=env,
                             stdout=subprocess.DEVNULL if quiet else None,
                             stderr=subprocess.DEVNULL if quiet else None)
    try:
        return child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
        return 124
    finally:
        child = None

def main():
    global child
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
    # Use the daemon's app-server transport directly under container supervision.
    # remote-control start requires a standalone install and launches an updater.
    command = ['codex', '-c', 'mcp_servers.kubeclaw_ops.url="http://127.0.0.1:8080/mcp"',
               '-c', 'mcp_servers.kubeclaw_ops.bearer_token_env_var="KUBECLAW_MCP_TOKEN"',
               'app-server', '--remote-control', '--listen', 'unix://']
    while not stop.is_set():
        status('waiting-for-login')
        try:
            logged_in = run_control(['codex', 'login', 'status'], env, timeout=15, quiet=True) == 0
        except subprocess.TimeoutExpired:
            logged_in = False
        if not logged_in:
            stop.wait(5)
            continue
        if stop.is_set():
            break
        status('remote-process-starting', controlSocketReady=False)
        try:
            child = subprocess.Popen(command, env=env)
            if wait_for_control(control_socket) and child.poll() is None:
                print('Codex app-server control socket is reachable; pairing can be attempted.', flush=True)
                while not stop.is_set() and child.poll() is None and control_ready(control_socket):
                    status('remote-process-running', controlSocketReady=True)
                    stop.wait(2)
            else:
                print(f'Codex app-server failed to become ready (exit {child.poll()}).', flush=True)
        finally:
            status('remote-process-stopping', controlSocketReady=False)
            if child is not None:
                if child.poll() is None:
                    child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
                child = None
        status('remote-process-exited', controlSocketReady=False)
        stop.wait(10)
    status('stopped')

if __name__ == '__main__':
    main()
