#!/usr/bin/env python3
"""Collect the unchanged whole original oracle beyond the exec transport lifetime."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

here = Path(__file__).resolve().parent
repo = here.parents[3]
lock_path = repo.parent / "tmp/config-c1-c6-kubeclaw-config-c0.writer.lock"
command = ["node", "tests/verification/contracts/check-pipeline-test-plan-runner.mts"]
source = repo / command[1]
with lock_path.open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    started = time.monotonic()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    source_digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with (here / "verified-original-runner.txt").open("w") as output:
        child = subprocess.Popen(command, cwd=repo, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            exit_code = child.wait(timeout=210)
        except subprocess.TimeoutExpired:
            # Only this verifier-owned command/session, never shared runtime work.
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            exit_code = 124
    receipt = {"command": command, "exitCode": exit_code,
        "elapsedSeconds": round(time.monotonic() - started, 2), "timeoutSeconds": 210,
        "sourceCommit": commit, "oracleSha256": source_digest,
        "oracleUnchanged": hashlib.sha256(source.read_bytes()).hexdigest() == source_digest,
        "wholeOriginalCommand": True, "nativeAcceptance": False,
        "independentAcceptance": False, "fullC0C6Complete": False}
    temporary = here / "verified-original-result.json.tmp"
    temporary.write_text(json.dumps(receipt, indent=2) + "\n")
    temporary.replace(here / "verified-original-result.json")
    fcntl.flock(lock, fcntl.LOCK_UN)
raise SystemExit(exit_code)
