"""Unprivileged isolated-process comparison mutants; no production file mutation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
NAMES = ['test_completed_replaced_store_rejected_before_publication',
         'test_completed_changed_runtime_rejected_before_publication',
         'test_completed_matching_receipt_published_before_restore']
if len(sys.argv) == 2:
    spec = importlib.util.spec_from_file_location('stop_tests', REPO / 'scripts/tests/buster-legacy-stop.test.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original = module.transaction.same_seal
    mode = sys.argv[1]
    assert mode in ('plan', 'runtime')
    module.transaction.same_seal = lambda current, sealed: True if (('store' in current) == (mode == 'plan')) else original(current, sealed)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(module.StopProducerTests(name) for name in NAMES))
    failed_names = [case._testMethodName for case, _ in result.failures]
    expected = NAMES[0 if mode == 'plan' else 1]
    assert result.testsRun == 3 and failed_names == [expected] and not result.errors and not result.skipped, (failed_names, result.errors)
    print('MUTANT_DETECTED:' + mode)
else:
    identities = []
    for name in ['scripts/tests/buster-legacy-stop.test.py', 'scripts/buster_legacy_stop_transaction.py',
                 'scripts/buster_legacy_stop_policy.py', 'scripts/buster_legacy_stop_files.py',
                 'scripts/buster_legacy_stop_runtime.py']:
        identities.append({'path': name, 'sha256': hashlib.sha256((REPO / name).read_bytes()).hexdigest()})
    for mode in ('plan', 'runtime'):
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), mode], capture_output=True, text=True, timeout=15)
        with (HERE / ('mutant-' + mode + '.txt')).open('x') as output:
            output.write(result.stdout + result.stderr)
        assert result.returncode == 0, (mode, result.returncode)
    for entry in identities:
        assert hashlib.sha256((REPO / entry['path']).read_bytes()).hexdigest() == entry['sha256']
    with (HERE / 'identities.json').open('x') as output:
        json.dump(identities, output, indent=2)
    print('Both comparison mutants detected by their exact negative case; no source drift.')
