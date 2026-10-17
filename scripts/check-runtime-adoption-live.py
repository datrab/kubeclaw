#!/usr/bin/env python3
"""Read-only Secret prerequisite check and API dry-run of an exported bundle."""
import json
import os
from pathlib import Path
import subprocess
import sys


def dry_run_diagnostics(text):
    """Exclude giant serialized patches; retain API validation explanations."""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(('Warning: resource ', '{', 'to:', 'Resource:', 'Name:')):
            continue
        if stripped:
            print(line[:2000] + (' [truncated]' if len(line) > 2000 else ''), flush=True)


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
    for resource in group['resources']:
        if resource['kind'] != 'StatefulSet':
            continue
        current = subprocess.run(kubectl + ['get', 'statefulset', resource['name'],
                                 '-n', group['namespace'], '--ignore-not-found', '-o', 'json'],
                                 capture_output=True, text=True)
        if current.returncode:
            print(f"ERROR reading StatefulSet {resource['name']}", flush=True)
            failed = True
        elif current.stdout.strip():
            spec = json.loads(current.stdout)['spec']
            fields = ['serviceName', 'selector', 'podManagementPolicy', 'volumeClaimTemplates']
            print(f"LIVE immutable fields: StatefulSet/{resource['name']}", flush=True)
            print(json.dumps({key: spec.get(key) for key in fields}, indent=2), flush=True)
    result = subprocess.run(kubectl + ['apply', '--dry-run=server', '-f',
                            str(root / group['path'] / 'resources.yaml')],
                            capture_output=True, text=True)
    print(result.stdout, end='', flush=True)
    dry_run_diagnostics(result.stderr)
    failed |= result.returncode != 0
print('No resources applied. This check does not prove scheduling, ownership transfer or runtime health.')
sys.exit(1 if failed else 0)
