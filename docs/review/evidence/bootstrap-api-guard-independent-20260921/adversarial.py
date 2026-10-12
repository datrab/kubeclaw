"""Independent shell-orchestration probes. CLI fixtures, not a Kubernetes cluster."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path.cwd()
SOURCE = ROOT / 'scripts/deploy.sh'
text = SOURCE.read_text()
empty = {'apiVersion': 'v1', 'kind': 'List', 'items': []}
namespace = {'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': 'guard-test'}}

def scenario(source, body, status=0):
    with tempfile.TemporaryDirectory(prefix='independent-bootstrap-') as temporary:
        directory = Path(temporary)
        (directory / 'scripts').mkdir()
        script = directory / 'scripts/deploy.sh'
        script.write_text(source)
        calls = directory / 'calls'
        calls.write_text('')
        for command in ['kubectl', 'helm']:
            cli = directory / command
            cli.write_text('''#!/bin/sh
printf '%s %s\\n' "$(basename "$0")" "$*" >> "$CALLS"
if [ "$(basename "$0")" = helm ]; then exit 0; fi
case "$1 $2" in
 'get namespaces') printf '%s' "$BODY"; exit "$STATUS" ;;
 'create namespace') exit 0 ;;
 *) exit 92 ;;
esac
''')
            cli.chmod(0o755)
        env = dict(os.environ, PATH=str(directory) + ':' + os.environ['PATH'],
                   NAMESPACE='guard-test', KUBECLAW_WORKSPACE_PROMPT='false',
                   KUBECLAW_RUN_SECRET_SETUP='false', CALLS=str(calls),
                   BODY=json.dumps(body), STATUS=str(status))
        result = subprocess.run(['bash', str(script), 'setup'], env=env,
                                capture_output=True, text=True, timeout=10)
        return {'exit': result.returncode, 'calls': calls.read_text().splitlines(),
                'stdout': result.stdout, 'stderr': result.stderr}

cases = [
 ('nonzero-with-valid-empty-stdout', empty, 1),
 ('nonzero-with-valid-present-stdout', dict(empty, items=[namespace]), 42),
 ('wrong-identity', dict(empty, items=[dict(namespace, metadata={'name': 'other'})]), 0),
 ('duplicate-identity', dict(empty, items=[namespace, namespace]), 0),
 ('wrong-collection-kind', dict(empty, kind='Status'), 0),
 ('wrong-api-version', dict(empty, apiVersion='v2'), 0),
 ('wrong-item-kind', dict(empty, items=[dict(namespace, kind='Pod')]), 0),
 ('non-array-items', dict(empty, items={}), 0),
 ('null-root', None, 0),
]
for name, body, status in cases:
    result = scenario(text, body, status)
    print(json.dumps({'case': name, **result}), flush=True)
    assert result['exit'] != 0 and result['calls'] == [
        'kubectl get namespaces --field-selector metadata.name=guard-test -o json'], name
for kind in ['List', 'NamespaceList']:
    result = scenario(text, dict(empty, kind=kind, items=[namespace]))
    print(json.dumps({'case': 'existing-' + kind, **result}), flush=True)
    assert result['exit'] == 0 and len(result['calls']) == 4
    assert not any('create namespace' in call for call in result['calls'])

mutations = [
 ('ignore-command-status',
  'if ! namespace_output=$(kubectl get namespaces --field-selector "metadata.name=$NAMESPACE" -o json); then',
  'if ! namespace_output=$(kubectl get namespaces --field-selector "metadata.name=$NAMESPACE" -o json || true); then',
  empty, 1),
 ('accept-wrong-identity', 'item?.metadata?.name !== process.argv[1]', 'false',
  dict(empty, items=[dict(namespace, metadata={'name': 'other'})]), 0),
 ('accept-duplicate-identities', 'value.items.length > 1', 'false',
  dict(empty, items=[namespace, namespace]), 0),
 ('accept-wrong-kind', '!["List", "NamespaceList"].includes(value.kind)', 'false',
  dict(empty, kind='Status'), 0),
]
for name, old, new, body, status in mutations:
    assert text.count(old) == 1, name
    mutant = text.replace(old, new)
    result = scenario(mutant, body, status)
    print(json.dumps({'mutant': name, 'sha256': hashlib.sha256(mutant.encode()).hexdigest(),
                      'caught_by_no_mutation_oracle': result['exit'] == 0 and len(result['calls']) > 1,
                      **result}), flush=True)
    # A mutant surviving the production checks must demonstrably violate our oracle.
    assert result['exit'] == 0 and len(result['calls']) > 1, name
print('PASS: 11 original adversarial/identity scenarios; 4 mutants detected by no-mutation oracle')
