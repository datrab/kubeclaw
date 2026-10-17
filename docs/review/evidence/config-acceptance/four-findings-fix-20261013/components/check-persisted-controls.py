"""Exercise persisted candidate mutations in fresh validator processes."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path.cwd()
base = root / 'docs/review/evidence/config-acceptance'
out = base / 'four-findings-fix-20261013/components'
results = []
for batch, filename, profile_key in [('01', 'source-coordinate-definitions.json', 'completeABProfile'),
                                     ('02', 'schema-coordinate-definitions.json', 'completeAB')]:
    folder = base / ('components/checkpoint21bf-source-links-' + batch)
    source = folder / filename
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    candidate = json.loads(source.read_text())
    mutations = {}
    loss = copy.deepcopy(candidate)
    loss['records'][0]['members'].pop()
    loss['records'][0]['memberCount'] -= 1
    mutations['member-loss'] = loss
    duplicate = copy.deepcopy(candidate)
    duplicate['records'][0]['members'].append(copy.deepcopy(duplicate['records'][0]['members'][0]))
    duplicate['records'][0]['memberCount'] += 1
    mutations['member-duplicate'] = duplicate
    unrelated = copy.deepcopy(candidate)
    unrelated['records'][0]['members'][0][profile_key]['rfc6901Pointer'] = '/CMP-C1-EFFECT-prism-studio-port'
    mutations['wrong-profile'] = unrelated
    omitted = copy.deepcopy(candidate)
    omitted['records'].pop()
    mutations['coordinate-loss'] = omitted
    for label, value in [('positive-before', candidate), *mutations.items(), ('positive-recovery', candidate)]:
        with tempfile.TemporaryDirectory(prefix='c0-component-control-') as temp:
            path = Path(temp) / filename
            path.write_text(json.dumps(value, indent=2) + '\n')
            command = [sys.executable, str(folder / 'check-bindings.py'), '--input', str(path)]
            result = subprocess.run(command, capture_output=True, cwd=root)
            prefix = out / ('batch-' + batch + '-' + label)
            prefix.with_suffix('.stdout').write_bytes(result.stdout)
            prefix.with_suffix('.stderr').write_bytes(result.stderr)
            if label in mutations:
                prefix.with_suffix('.json').write_bytes(path.read_bytes())
            positive = label.startswith('positive')
            assert (result.returncode == 0) == positive, (batch, label, result.stderr.decode())
            if not positive:
                assert b'CANONICAL_BINDING:' in result.stderr
            results.append({'batch': batch, 'control': label, 'exitCode': result.returncode,
                            'expected': 'pass' if positive else 'reject',
                            'inputSHA256': hashlib.sha256(path.read_bytes()).hexdigest()})
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
(out / 'verification.json').write_text(json.dumps({'scope': 'document integrity only', 'controls': results,
    'canonicalInputDrift': False, 'globalC0Accepted': False}, indent=2) + '\n')
print('8 persisted negatives rejected; 4 positives passed; canonical candidate bytes unchanged')
