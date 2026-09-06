#!/usr/bin/env python3
"""Keep onboarding available before login; supervise the real foreground CLI.

The status file describes process state, never successful pairing or relay health.
Authentication is completed interactively via kubectl exec, on the same PVC.
"""
import json
import os
from pathlib import Path
import shutil
import signal
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
        # Keep the installed MCP connection authoritative while preserving other
        # user preferences and connections in the persistent Codex config.
        command = ['codex', '-c', 'mcp_servers.kubeclaw_ops.url="http://127.0.0.1:8080/mcp"',
                   '-c', 'mcp_servers.kubeclaw_ops.bearer_token_env_var="KUBECLAW_MCP_TOKEN"',
                   'remote-control']
        child = subprocess.Popen(command, env=env)
        status('remote-process-running', pid=child.pid)
        while child.poll() is None and not stop.wait(2):
            status('remote-process-running', pid=child.pid)
        if stop.is_set() and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        code = child.wait()
        status('remote-process-exited', exitCode=code)
        child = None
        stop.wait(10)
    status('stopped')

if __name__ == '__main__':
    main()
