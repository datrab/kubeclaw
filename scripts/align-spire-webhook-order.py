#!/usr/bin/env python3
"""Align the existing webhook list with chart 0.30.0 without replacing entries."""
import argparse
import json
import os
import subprocess

NAME = "spire-server-spire-controller-manager-webhook"
ORDER = ["vclusterfederatedtrustdomain.kb.io", "vclusterspiffeid.kb.io"]


def order_patch(live):
    hooks = live.get("webhooks", [])
    names = [hook.get("name") for hook in hooks]
    if len(names) != 2 or set(names) != set(ORDER):
        raise ValueError("Unexpected webhook names; refusing to modify the list")
    if names == ORDER:
        return []
    # Reject a concurrent controller update instead of overwriting a CA rotation.
    return [
        {"op": "test", "path": "/metadata/resourceVersion", "value": live["metadata"]["resourceVersion"]},
        {"op": "test", "path": "/webhooks/0/name", "value": ORDER[1]},
        {"op": "test", "path": "/webhooks/1/name", "value": ORDER[0]},
        {"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply the guarded list move")
    args = parser.parse_args()
    context = os.environ.get("KUBE_CONTEXT")
    if not context:
        raise SystemExit("Set KUBE_CONTEXT first")
    command = ["kubectl", "--context", context]
    live = json.loads(subprocess.check_output(command + ["get", "validatingwebhookconfiguration", NAME, "-o", "json"], text=True))
    patch = order_patch(live)
    if not patch:
        print("PASS: webhook order already matches the chart; no change needed")
    elif not args.apply:
        print("Reorder required; rerun with --apply to move the existing entries without changing their contents")
    else:
        subprocess.run(command + ["patch", "validatingwebhookconfiguration", NAME, "--type=json", "-p", json.dumps(patch)], check=True)
        print("PASS: existing webhook entries reordered; contents unchanged")


if __name__ == "__main__":
    main()
