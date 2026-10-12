"""Run after integration and exclusive test-slot assignment, never as an acceptance shortcut."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


root = pathlib.Path.cwd()
child_path = root / 'skills/buster/engine/test-gates/provider-child.mjs'
test_path = root / 'tests/verification/contracts/provider-child-session.test.mjs'
output = pathlib.Path(sys.argv[1]).resolve()
output.mkdir(parents=True, exist_ok=False)
child = child_path.read_text()
tests = test_path.read_text()
before = {str(p.relative_to(root)): digest(p.read_bytes()) for p in [child_path, test_path]}
(output / 'before.json').write_text(json.dumps(before, indent=2) + '\n')
cases = [
    ('fixed-interval', '    }, interval);', '    }, 10);',
     'real child uses authored sample interval 40'),
    ('missing-policy-default', "    if (!observation || typeof observation !== 'object'",
     "    observation ??= { resourceSampleIntervalMs: 10 };\n"
     "    if (!observation || typeof observation !== 'object'",
     'real child rejects invalid observation before provider import: undefined'),
]
results = []
try:
    for name, needle, replacement, oracle in cases:
        if child.count(needle) != 1:
            raise RuntimeError(f'CONTROL_TARGET_NOT_UNIQUE:{name}')
        mutated = child.replace(needle, replacement, 1)
        original_test_target = "path.resolve('skills/buster/engine/test-gates/provider-child.mjs')"
        if tests.count(original_test_target) != 1:
            raise RuntimeError('CONTROL_CHILD_LAUNCH_TARGET_NOT_UNIQUE')
        with tempfile.TemporaryDirectory(prefix='child-observation-control-') as directory:
            private = pathlib.Path(directory)
            private_child = private / 'provider-child.mjs'
            private_test = private / 'provider-child-session.test.mjs'
            private_child.write_text(mutated)
            adjusted_tests = tests.replace(original_test_target, json.dumps(str(private_child)), 1)
            private_test.write_text(adjusted_tests)
            command = ['node', '--test', '--test-reporter=tap', str(private_test)]
            # Preserve the actual test and changed child bytes after the temporary directory closes.
            (output / f'{name}.child.mjs').write_text(mutated)
            (output / f'{name}.test.mjs').write_text(adjusted_tests)
            try:
                result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=90)
                log = result.stdout + result.stderr
                exit_code = result.returncode
            except subprocess.TimeoutExpired as error:
                log = str(error)
                exit_code = 'timeout'
            (output / f'{name}.log').write_text(log)
            # A failed process alone is insufficient: require the named consumer's assertion failure.
            detected = (isinstance(exit_code, int) and exit_code != 0
                        and any(line.startswith('not ok ') and oracle in line for line in log.splitlines())
                        and 'ERR_ASSERTION' in log)
            results.append({'name': name, 'command': command, 'exitCode': exit_code,
                            'candidateSemanticDetection': detected,
                            'originalChildSha256': digest(child.encode()),
                            'mutatedChildSha256': digest(mutated.encode()),
                            'requiredManualReview': 'Inspect exact actual/expected values and rule out unrelated failures.'})
finally:
    after = {str(p.relative_to(root)): digest(p.read_bytes()) for p in [child_path, test_path]}
    (output / 'after.json').write_text(json.dumps(after, indent=2) + '\n')
    drift = [name for name in before if before[name] != after[name]]
    (output / 'results.json').write_text(json.dumps({'controls': results, 'sourceDrift': drift}, indent=2) + '\n')

if drift or len(results) != len(cases) or not all(row['candidateSemanticDetection'] for row in results):
    raise SystemExit(1)
