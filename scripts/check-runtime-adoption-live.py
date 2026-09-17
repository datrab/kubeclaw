#!/usr/bin/env python3
"""Read-only Secret prerequisite check and API dry-run of an exported bundle."""
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
directory = root / sys.argv[1]
bundle = json.loads((directory / 'bundle.receipt').read_text())
kubectl = ['kubectl']
if os.environ.get('KUBE_CONTEXT'):
    kubectl += ['--context', os.environ['KUBE_CONTEXT']]
failed = False
for group in bundle['groups']:
    print(f"=== {group['role']} ===", flush=True)
    for secret in group['requiredSecrets']:
        result = subprocess.run(kubectl + ['get', 'secret', secret['name'], '-n',
                                group['namespace'], '--ignore-not-found', '-o', 'json'],
                                capture_output=True, text=True)
        if result.returncode:
            # Do not forward command output: only report the requested object.
            print(f"ERROR reading Secret {secret['name']}", flush=True)
            failed = True
            continue
        data = json.loads(result.stdout).get('data', {}) if result.stdout.strip() else None
        missing = [key for key in secret['keys'] if not (data or {}).get(key)]
        if data is None or missing:
            print(f"MISSING Secret {secret['name']}: " + (', '.join(missing) or 'object'), flush=True)
            failed = True
        else:
            print(f"OK Secret {secret['name']} (contents not printed)", flush=True)
    result = subprocess.run(kubectl + ['apply', '--dry-run=server', '-f',
                            str(root / group['path'] / 'resources.yaml')])
    failed |= result.returncode != 0
print('No resources applied. This check does not prove scheduling, ownership transfer or runtime health.')
sys.exit(1 if failed else 0)
