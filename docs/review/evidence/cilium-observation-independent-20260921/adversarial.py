"""Independent extra cases and mutants; original shell orchestration, shared explicit fake CLI boundary."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile

ROOT = Path.cwd()
spec = importlib.util.spec_from_file_location('original_fixture', ROOT / 'scripts/tests/cilium-observation-guards.test.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
guard = fixture.Guards()
os.environ['PYTHONOPTIMIZE'] = '1'

def run(name, data, cleanup=False, rejection=True):
    result, calls = guard.run_script(data, 'migrate-kubeclaw-network-policies-to-cilium.sh' if cleanup else 'deploy-cilium.sh', 'cleanup' if cleanup else 'install')
    if cleanup:
        mutations = [cmd for cmd in calls if 'delete' in cmd]
    else:
        mutations = [cmd for cmd in calls if cmd[0] == 'helm' or any(word in cmd for word in ('create', 'apply', 'delete', 'rollout'))]
    print(json.dumps({'case': name, 'exit': result.returncode, 'mutations': mutations, 'stderr': result.stderr}), flush=True)
    if rejection:
        assert result.returncode != 0 and not mutations, name
    else:
        assert result.returncode == 0 and mutations, name

for value in ([], True, 'node'):
    data = fixture.observation(); data['nodes']['items'][0]['spec'] = value
    run('invalid-node-spec-' + repr(value), data)
for value in ('   ', 3, None):
    data = fixture.observation(); data['pods']['items'][0]['id'] = value
    run('invalid-sandbox-id-' + repr(value), data)
for value in ([], False, {'linux': []}):
    data = fixture.observation(); data['inspection']['status'] = value
    run('invalid-status-' + repr(value), data)
for endpoint in (None, [], {'status': None}, {'status': {'policy': []}}, {'status': {'policy': {'spec': None}}}):
    data = fixture.observation(); data['endpoints'] = [endpoint]
    run('malformed-endpoint-' + repr(endpoint), data, cleanup=True)
for value in (7.0, None):
    data = fixture.observation()
    for key in ('spec', 'realized'):
        data['endpoints'][0]['status']['policy'][key]['policy-revision'] = value
    run('invalid-revision-' + repr(value), data, cleanup=True)

original_fake = fixture.FAKE
for name, predicate, cleanup in (
 ('node-command-failure', "a[:2] == ['get', 'nodes']", False),
 ('cri-list-command-failure', "command[0] == 'k3s' and a[1] == 'pods'", False),
 ('cri-inspection-command-failure', "command[0] == 'k3s' and a[1] == 'inspectp'", False),
 ('endpoint-command-failure', "'exec' in a", True),
):
    fixture.FAKE = original_fake.replace("if a == ['apply', '-f', '-']: sys.stdin.read()", "if " + predicate + ": print('{}'); sys.exit(42)\nif a == ['apply', '-f', '-']: sys.stdin.read()")
    run(name, fixture.observation(), cleanup)
fixture.FAKE = original_fake

with tempfile.TemporaryDirectory(prefix='cilium-independent-mutants-') as temporary:
    directory = Path(temporary)
    (directory / 'scripts').mkdir()
    shutil.copytree(ROOT / 'my-values', directory / 'my-values')
    names = ['deploy-cilium.sh', 'verify-cilium-install-preflight.py', 'verify-cilium-policies.py', 'migrate-kubeclaw-network-policies-to-cilium.sh']
    originals = {name: (ROOT / 'scripts' / name).read_text() for name in names}
    fixture.ROOT = directory
    variants = []
    data = fixture.observation(); data['nodes']['items'][0]['spec']['unschedulable'] = 'false'
    variants.append(('truthy-cordon', 'verify-cilium-install-preflight.py', ".get('unschedulable') is True", ".get('unschedulable')", data, False))
    data = fixture.observation(); data['inspection']['status']['id'] = 'wrong-sandbox'
    variants.append(('ignore-inspection-identity', 'verify-cilium-install-preflight.py', "status.get('id') == identity and ", '', data, False))
    data = fixture.observation(); data['inspection']['status']['linux']['namespaces']['options']['network'] = 2.0
    variants.append(('allow-float-network-mode', 'verify-cilium-install-preflight.py', 'type(mode) is int and mode == 2', 'mode == 2', data, False))
    data = fixture.observation()
    for key in ('spec', 'realized'): data['endpoints'][0]['status']['policy'][key] = {}
    variants.append(('invent-missing-zero-revisions', 'verify-cilium-policies.py', ".get('policy-revision')", ".get('policy-revision', 0)", data, True))
    for name, filename, old, new, data, cleanup in variants:
        for target, source in originals.items(): (directory / 'scripts' / target).write_text(source)
        assert old in originals[filename]
        mutated = originals[filename].replace(old, new)
        (directory / 'scripts' / filename).write_text(mutated)
        print(json.dumps({'mutant': name, 'sha256': hashlib.sha256(mutated.encode()).hexdigest()}), flush=True)
        run(name, data, cleanup, rejection=False)
print('PASS: 20 independent rejection scenarios under PYTHONOPTIMIZE=1; 4 unsafe mutants detected')
