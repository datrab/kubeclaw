from pathlib import Path
import json
import shutil
import subprocess
import tempfile

root = Path.cwd()
evidence = root / 'docs/review/evidence/inventory-digest-guard-20260921'
with tempfile.TemporaryDirectory(prefix='inventory-old-guard-') as directory:
    private = Path(directory)
    module = private / 'scripts/observability-retirement/files.mjs'
    test = private / 'tests/verification/reliability/inventory-digest-guard.test.mjs'
    module.parent.mkdir(parents=True)
    test.parent.mkdir(parents=True)
    shutil.copy2(evidence / 'files.mjs.before', module)
    shutil.copy2(root / test.relative_to(private), test)
    command = ['/usr/local/bin/node', '--test', str(test)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    output = result.stdout + result.stderr
    (evidence / 'mutant.txt').write_text(output)
    detected = result.returncode != 0 and 'final inventory verification rejects changed real bytes despite colliding metadata' in output and 'AssertionError' in output and 'fail 1' in output and 'pass 7' in output
    (evidence / 'mutant.json').write_text(json.dumps({'command': command, 'returnCode': result.returncode, 'oldStatOnlyGuardDetected': detected}, indent=2)+'\n')
    assert detected, 'Expected only the content-collision assertion to fail'
